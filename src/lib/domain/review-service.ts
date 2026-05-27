/**
 * Review Service
 * Generates review tasks based on error causes and knowledge points
 * Implements simplified spaced review strategy with deduplication
 * Ref: TDG Section 6 (Review Service), Section 12
 */

import { v4 as uuidv4 } from 'uuid';
import { ReviewTask, ErrorType } from '@/types/domain';
import { supabase } from '@/lib/supabase/client';

interface ReviewTrigger {
  type: 'knowledge_point' | 'error_type' | 'explain_trigger';
  value: string;
  count: number;
  periodDays: number;
}

/**
 * Review Service class for managing review tasks
 */
export class ReviewService {
  private recentTaskKeys: Map<string, number> = new Map();
  private readonly DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

  /**
   * Check if review should be triggered and create tasks
   * Ref: TDG Section 12 - Review Trigger Rules
   * @param userId - User ID
   * @param sessionId - Current session ID
   * @param problemId - Problem ID
   * @param knowledgePoints - Array of knowledge points involved
   * @param errorTypes - Array of error types encountered
   * @param understandingLevel - Current understanding level
   * @param tutorState - Current tutor state
   * @returns Array of created ReviewTask records (may be empty)
   */
  async checkAndCreateReviewTasks(
    userId: string,
    sessionId: string,
    problemId: string,
    knowledgePoints: string[],
    errorTypes: ErrorType[],
    understandingLevel: string,
    tutorState: string
  ): Promise<ReviewTask[]> {
    const tasks: ReviewTask[] = [];

    // Rule 3: If understanding_level = unknown and enters explain
    if (understandingLevel === 'unknown' && tutorState === 'explain') {
      for (const kp of knowledgePoints) {
        const task = await this.createReviewTask(
          userId,
          sessionId,
          problemId,
          kp,
          null,
          'explain_trigger'
        );
        if (task) tasks.push(task);
      }
    }

    // Check error history in database for rules 1 and 2
    for (const errorType of errorTypes) {
      const recentCount = await this.countRecentErrors(userId, errorType, 7);
      if (recentCount >= 2) {
        const dedupeKey = `error:${errorType}`;
        if (this.canCreateTask(dedupeKey)) {
          const task = await this.createReviewTask(
            userId,
            sessionId,
            problemId,
            null,
            errorType,
            'error_type'
          );
          if (task) tasks.push(task);
        }
      }
    }

    for (const kp of knowledgePoints) {
      const recentCount = await this.countRecentErrorsByKP(userId, kp, 7);
      if (recentCount >= 2) {
        const dedupeKey = `kp:${kp}`;
        if (this.canCreateTask(dedupeKey)) {
          const task = await this.createReviewTask(
            userId,
            sessionId,
            problemId,
            kp,
            null,
            'knowledge_point'
          );
          if (task) tasks.push(task);
        }
      }
    }

    return tasks;
  }

  /**
   * Create a single review task
   * @param userId - User ID
   * @param sessionId - Session ID
   * @param problemId - Problem ID
   * @param knowledgePoint - Knowledge point (if applicable)
   * @param errorType - Error type (if applicable)
   * @param triggerType - What triggered this review
   * @returns Created ReviewTask or null if deduplicated
   */
  private async createReviewTask(
    userId: string,
    sessionId: string,
    problemId: string,
    knowledgePoint: string | null,
    errorType: string | null,
    triggerType: string
  ): Promise<ReviewTask | null> {
    // Build dedupe key
    const dedupeKey = knowledgePoint
      ? `kp:${knowledgePoint}`
      : `err:${errorType}`;

    // Check in-memory deduplication
    if (!this.canCreateTask(dedupeKey)) {
      return null;
    }

    // Check database deduplication (avoid same task in 7 days)
    if (await this.hasRecentTask(userId, dedupeKey, 7)) {
      return null;
    }

    // Schedule for review in 1-3 days (simplified spaced review)
    const scheduledFor = new Date();
    scheduledFor.setDate(scheduledFor.getDate() + this.getRandomReviewDelay());

    const taskId = uuidv4();
    const now = new Date();

    const task: ReviewTask = {
      id: taskId,
      userId,
      sessionId,
      problemId,
      knowledgePoint: knowledgePoint || '',
      errorType: errorType || null,
      scheduledFor,
      status: 'pending',
      dedupeKey,
      createdAt: now,
      completedAt: null,
    };

    // Persist to database
    if (supabase) {
      await supabase.from('review_tasks').insert({
        id: task.id,
        user_id: task.userId,
        session_id: task.sessionId,
        problem_id: task.problemId,
        knowledge_point: task.knowledgePoint,
        error_type: task.errorType,
        scheduled_for: task.scheduledFor.toISOString(),
        status: task.status,
        dedupe_key: task.dedupeKey,
        created_at: task.createdAt.toISOString(),
        completed_at: null,
      });
    }

    // Track in memory
    this.recentTaskKeys.set(dedupeKey, Date.now());

    return task;
  }

  /**
   * Check if we can create a task (dedupe check)
   */
  private canCreateTask(dedupeKey: string): boolean {
    const lastCreated = this.recentTaskKeys.get(dedupeKey);
    if (lastCreated && Date.now() - lastCreated < this.DEDUPE_WINDOW_MS) {
      return false;
    }
    return true;
  }

  /**
   * Get random review delay (1-3 days)
   */
  private getRandomReviewDelay(): number {
    return Math.floor(Math.random() * 3) + 1;
  }

  /**
   * Check if user has had a recent similar task
   */
  private async hasRecentTask(
    userId: string,
    dedupeKey: string,
    daysAgo: number
  ): Promise<boolean> {
    if (!supabase) return false;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysAgo);

    const { data } = await supabase
      .from('review_tasks')
      .select('id')
      .eq('user_id', userId)
      .eq('dedupe_key', dedupeKey)
      .gte('created_at', cutoffDate.toISOString())
      .limit(1);

    return (data?.length || 0) > 0;
  }

  /**
   * Count recent errors by error type for a user
   */
  private async countRecentErrors(
    userId: string,
    errorType: string,
    daysAgo: number
  ): Promise<number> {
    if (!supabase) return 0;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysAgo);

    // Count from step_evaluations joined with sessions
    const { count } = await supabase
      .from('step_evaluations')
      .select('*', { count: 'exact', head: true })
      .eq('primary_error_type', errorType)
      .gte('created_at', cutoffDate.toISOString());

    // Note: In production, would join with sessions table to filter by user
    // For now, return 0 as we don't have user context in step_evaluations directly
    return count || 0;
  }

  /**
   * Count recent errors by knowledge point
   */
  private async countRecentErrorsByKP(
    userId: string,
    knowledgePoint: string,
    daysAgo: number
  ): Promise<number> {
    // In production, this would query through sessions->problems to get KP info
    // Simplified implementation
    if (!supabase) return 0;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysAgo);

    // Check review_tasks for this knowledge point
    const { data } = await supabase
      .from('review_tasks')
      .select('id')
      .eq('user_id', userId)
      .eq('knowledge_point', knowledgePoint)
      .gte('created_at', cutoffDate.toISOString());

    return data?.length || 0;
  }

  /**
   * Get pending review tasks for a user
   * @param userId - User ID
   * @param limit - Maximum number of tasks
   * @returns Array of pending ReviewTask
   */
  async getPendingTasks(userId: string, limit: number = 10): Promise<ReviewTask[]> {
    if (!supabase) return [];

    const now = new Date();

    const { data, error } = await supabase
      .from('review_tasks')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'pending')
      .lte('scheduled_for', now.toISOString())
      .order('scheduled_for', { ascending: true })
      .limit(limit);

    if (error || !data) return [];

    return data.map(row => ({
      id: row.id,
      userId: row.user_id,
      sessionId: row.session_id,
      problemId: row.problem_id,
      knowledgePoint: row.knowledge_point,
      errorType: row.error_type,
      scheduledFor: new Date(row.scheduled_for),
      status: row.status as 'pending' | 'completed' | 'skipped',
      dedupeKey: row.dedupe_key,
      createdAt: new Date(row.created_at),
      completedAt: row.completed_at ? new Date(row.completed_at) : null,
    }));
  }

  /**
   * Mark a review task as completed
   * @param taskId - Task ID
   */
  async completeTask(taskId: string): Promise<void> {
    if (!supabase) return;

    await supabase
      .from('review_tasks')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', taskId);
  }

  /**
   * Mark a review task as skipped
   * @param taskId - Task ID
   */
  async skipTask(taskId: string): Promise<void> {
    if (!supabase) return;

    await supabase
      .from('review_tasks')
      .update({
        status: 'skipped',
      })
      .eq('id', taskId);
  }

  /**
   * Get review statistics for a user
   * @param userId - User ID
   * @returns Statistics object
   */
  async getStatistics(userId: string): Promise<{
    totalTasks: number;
    completedTasks: number;
    pendingTasks: number;
    skippedTasks: number;
  }> {
    if (!supabase) {
      return { totalTasks: 0, completedTasks: 0, pendingTasks: 0, skippedTasks: 0 };
    }

    const { data } = await supabase
      .from('review_tasks')
      .select('status')
      .eq('user_id', userId);

    const tasks = data || [];
    return {
      totalTasks: tasks.length,
      completedTasks: tasks.filter(t => t.status === 'completed').length,
      pendingTasks: tasks.filter(t => t.status === 'pending').length,
      skippedTasks: tasks.filter(t => t.status === 'skipped').length,
    };
  }
}

// Singleton instance
export const reviewService = new ReviewService();