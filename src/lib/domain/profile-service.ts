/**
 * Profile Service
 * Aggregates learning data and generates weak knowledge point analysis
 * Ref: TDG Section 6 (Profile Service), 12.4
 */

import { LearnerProfile } from '@/types/domain';
import { supabase } from '@/lib/supabase/client';

interface LearningStats {
  totalSessions: number;
  completedSessions: number;
  abandonedSessions: number;
  totalSteps: number;
  correctSteps: number;
  partialSteps: number;
  incorrectSteps: number;
  hintUsage: number;
}

interface AggregatedData {
  last7Days: LearningStats;
  last30Days: LearningStats;
  weakKnowledgePoints: Map<string, number>;
  frequentErrorTypes: Map<string, number>;
  hintDependencyScore: number;
  recentAccuracy: number | null;
}

/**
 * Profile Service for learner profile management
 */
export class ProfileService {
  /**
   * Get or create learner profile for a user
   * @param userId - User ID
   * @returns LearnerProfile
   */
  async getProfile(userId: string): Promise<LearnerProfile> {
    if (!supabase) {
      return this.createEmptyProfile(userId);
    }

    const { data, error } = await supabase
      .from('learner_profiles')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error || !data) {
      return this.createEmptyProfile(userId);
    }

    return {
      userId: data.user_id,
      weakKnowledgePoints: data.weak_knowledge_points || [],
      frequentErrorTypes: data.frequent_error_types || [],
      hintDependencyScore: data.hint_dependency_score || 0,
      recentAccuracy: data.recent_accuracy,
      profileVersion: data.profile_version || 1,
      updatedAt: new Date(data.updated_at),
    };
  }

  /**
   * Update or create learner profile
   * @param userId - User ID
   * @param updates - Profile fields to update
   */
  async updateProfile(
    userId: string,
    updates: Partial<Pick<LearnerProfile, 'weakKnowledgePoints' | 'frequentErrorTypes' | 'hintDependencyScore' | 'recentAccuracy'>>
  ): Promise<void> {
    if (!supabase) return;

    const dbUpdates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      profile_version: 1,
    };

    if (updates.weakKnowledgePoints !== undefined) {
      dbUpdates.weak_knowledge_points = updates.weakKnowledgePoints;
    }
    if (updates.frequentErrorTypes !== undefined) {
      dbUpdates.frequent_error_types = updates.frequentErrorTypes;
    }
    if (updates.hintDependencyScore !== undefined) {
      dbUpdates.hint_dependency_score = updates.hintDependencyScore;
    }
    if (updates.recentAccuracy !== undefined) {
      dbUpdates.recent_accuracy = updates.recentAccuracy;
    }

    const { error } = await supabase
      .from('learner_profiles')
      .upsert({
        user_id: userId,
        ...dbUpdates,
      }, {
        onConflict: 'user_id',
      });

    if (error) {
      console.error('Failed to update learner profile:', error);
    }
  }

  /**
   * Refresh profile with latest learning data
   * Aggregates data from sessions, evaluations, and review tasks
   * @param userId - User ID
   */
  async refreshProfile(userId: string): Promise<LearnerProfile> {
    // Get aggregated data from last 7 and 30 days
    const aggregated = await this.aggregateLearningData(userId);

    // Generate weak knowledge points (top 5 by error count)
    const weakKPs = this.generateWeakKnowledgePoints(aggregated);

    // Generate frequent error types (top 3)
    const frequentET = this.generateFrequentErrorTypes(aggregated);

    // Calculate hint dependency score (0-1, higher = more dependent on hints)
    const hintScore = this.calculateHintDependency(aggregated);

    // Calculate recent accuracy
    const accuracy = this.calculateRecentAccuracy(aggregated);

    const profile: LearnerProfile = {
      userId,
      weakKnowledgePoints: weakKPs,
      frequentErrorTypes: frequentET,
      hintDependencyScore: hintScore,
      recentAccuracy: accuracy,
      profileVersion: 1,
      updatedAt: new Date(),
    };

    // Persist
    await this.updateProfile(userId, profile);

    return profile;
  }

  /**
   * Aggregate learning data from sessions and evaluations
   */
  private async aggregateLearningData(userId: string): Promise<AggregatedData> {
    const last7Days = await this.getLearningStats(userId, 7);
    const last30Days = await this.getLearningStats(userId, 30);

    const weakKP = new Map<string, number>();
    const frequentET = new Map<string, number>();

    // Aggregate weak knowledge points from step_evaluations via sessions/problems join
    if (supabase) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 30);

      // Get user's sessions with their problem_id
      const { data: userSessions } = await supabase
        .from('sessions')
        .select('id, problem_id')
        .eq('user_id', userId)
        .gte('started_at', cutoffDate.toISOString());

      if (userSessions && userSessions.length > 0) {
        const sessionIds = userSessions.map(s => s.id);

        // Get step evaluations for incorrect answers
        const { data: evaluations } = await supabase
          .from('step_evaluations')
          .select('session_id, correctness')
          .in('session_id', sessionIds)
          .eq('correctness', 'incorrect');

        if (evaluations) {
          // Create a map of session_id to problem_id
          const sessionToProblem = new Map(userSessions.map(s => [s.id, s.problem_id]));

          // Get knowledge_points from problems table
          const problemIds = [...new Set(evaluations.map(e => sessionToProblem.get(e.session_id)).filter(Boolean))];

          if (problemIds.length > 0) {
            const { data: problems } = await supabase
              .from('problems')
              .select('id, knowledge_points')
              .in('id', problemIds);

            if (problems) {
              const problemKnowledgePoints = new Map(problems.map(p => [p.id, p.knowledge_points || []]));

              // Count errors per knowledge point
              for (const eval_ of evaluations) {
                const problemId = sessionToProblem.get(eval_.session_id);
                const kps = problemKnowledgePoints.get(problemId) || [];
                for (const kp of kps) {
                  weakKP.set(kp, (weakKP.get(kp) || 0) + 1);
                }
              }
            }
          }
        }
      }
    }

    return {
      last7Days,
      last30Days,
      weakKnowledgePoints: weakKP,
      frequentErrorTypes: frequentET,
      hintDependencyScore: 0,
      recentAccuracy: null,
    };
  }

  /**
   * Get learning statistics for a time period
   */
  private async getLearningStats(userId: string, daysAgo: number): Promise<LearningStats> {
    const stats: LearningStats = {
      totalSessions: 0,
      completedSessions: 0,
      abandonedSessions: 0,
      totalSteps: 0,
      correctSteps: 0,
      partialSteps: 0,
      incorrectSteps: 0,
      hintUsage: 0,
    };

    if (!supabase) return stats;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysAgo);

    // Get sessions with status and hint_level
    const { data: sessions } = await supabase
      .from('sessions')
      .select('status, hint_level')
      .eq('user_id', userId)
      .gte('started_at', cutoffDate.toISOString());

    if (sessions) {
      stats.totalSessions = sessions.length;
      stats.completedSessions = sessions.filter(s => s.status === 'completed').length;
      stats.abandonedSessions = sessions.filter(s => s.status === 'abandoned').length;

      // Track hint usage: sessions with hint_level > 1 used hints
      stats.hintUsage = sessions.filter(s => (s.hint_level || 1) > 1).length;
    }

    // Get step evaluations through sessions
    // Note: This is a simplified query - in production would use proper joins
    const { data: evaluations } = await supabase
      .from('step_evaluations')
      .select('correctness')
      .gte('created_at', cutoffDate.toISOString());

    if (evaluations) {
      stats.totalSteps = evaluations.length;
      stats.correctSteps = evaluations.filter(e => e.correctness === 'correct').length;
      stats.partialSteps = evaluations.filter(e => e.correctness === 'partial').length;
      stats.incorrectSteps = evaluations.filter(e => e.correctness === 'incorrect').length;
    }

    return stats;
  }

  /**
   * Generate weak knowledge points from aggregated data
   */
  private generateWeakKnowledgePoints(aggregated: AggregatedData): string[] {
    // Sort by error count, take top 5
    const entries = Array.from(aggregated.weakKnowledgePoints.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    return entries.map(([kp]) => kp);
  }

  /**
   * Generate frequent error types from aggregated data
   */
  private generateFrequentErrorTypes(aggregated: AggregatedData): string[] {
    const entries = Array.from(aggregated.frequentErrorTypes.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    return entries.map(([et]) => et);
  }

  /**
   * Calculate hint dependency score
   * Higher score means student relies more on hints
   */
  private calculateHintDependency(aggregated: AggregatedData): number {
    const last7 = aggregated.last7Days;

    // Calculate based on hint usage vs total steps
    if (last7.totalSteps === 0) return 0;

    // Simplified: use ratio of hint actions to total evaluations
    // In production, would track actual hint requests
    const hintRate = last7.hintUsage / last7.totalSteps;

    // Weight by incorrect rate (more incorrect = possibly more hints used)
    const errorRate = last7.totalSteps > 0
      ? (last7.partialSteps + last7.incorrectSteps) / last7.totalSteps
      : 0;

    return Math.min(1, hintRate * 0.6 + errorRate * 0.4);
  }

  /**
   * Calculate recent accuracy
   */
  private calculateRecentAccuracy(aggregated: AggregatedData): number | null {
    const last7 = aggregated.last7Days;

    if (last7.totalSteps === 0) return null;

    // Weighted: correct = 1.0, partial = 0.5, incorrect = 0
    const weightedSum =
      last7.correctSteps * 1.0 +
      last7.partialSteps * 0.5;

    return weightedSum / last7.totalSteps;
  }

  /**
   * Get accuracy trend over time
   * @param userId - User ID
   * @param days - Number of days to analyze
   * @returns Array of daily accuracy percentages
   */
  async getAccuracyTrend(userId: string, days: number = 7): Promise<number[]> {
    if (!supabase) return [];

    const trend: number[] = [];

    for (let i = days - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);

      // First get user's sessions for this day
      const { data: userSessions } = await supabase
        .from('sessions')
        .select('id')
        .eq('user_id', userId)
        .gte('started_at', date.toISOString())
        .lt('started_at', nextDate.toISOString());

      if (!userSessions || userSessions.length === 0) {
        trend.push(0);
        continue;
      }

      const sessionIds = userSessions.map(s => s.id);

      // Then get evaluations for those sessions
      const { data: evaluations } = await supabase
        .from('step_evaluations')
        .select('correctness')
        .in('session_id', sessionIds);

      if (evaluations && evaluations.length > 0) {
        const correct = evaluations.filter(e => e.correctness === 'correct').length;
        const partial = evaluations.filter(e => e.correctness === 'partial').length;
        const weightedSum = correct * 1.0 + partial * 0.5;
        trend.push(weightedSum / evaluations.length);
      } else {
        trend.push(0);
      }
    }

    return trend;
  }

  /**
   * Get hint dependency trend
   * @param userId - User ID
   * @param days - Number of days to analyze
   * @returns Array of daily hint dependency scores
   */
  async getHintDependencyTrend(userId: string, days: number = 7): Promise<number[]> {
    // Simplified implementation
    // In production, would track hint requests per session per day
    if (!supabase) return [];

    const trend: number[] = [];

    for (let i = days - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);

      const { data: sessions } = await supabase
        .from('sessions')
        .select('hint_level')
        .eq('user_id', userId)
        .gte('started_at', date.toISOString())
        .lt('started_at', nextDate.toISOString());

      if (sessions && sessions.length > 0) {
        const avgHintLevel = sessions.reduce((sum, s) => sum + (s.hint_level || 1), 0) / sessions.length;
        // Normalize to 0-1 scale (hint levels 1-5)
        trend.push((avgHintLevel - 1) / 4);
      } else {
        trend.push(0);
      }
    }

    return trend;
  }

  /**
   * Create empty profile structure
   */
  private createEmptyProfile(userId: string): LearnerProfile {
    return {
      userId,
      weakKnowledgePoints: [],
      frequentErrorTypes: [],
      hintDependencyScore: 0,
      recentAccuracy: null,
      profileVersion: 1,
      updatedAt: new Date(),
    };
  }
}

// Singleton instance
export const profileService = new ProfileService();