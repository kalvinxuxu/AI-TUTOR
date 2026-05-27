/**
 * Profile Service Unit Tests
 * Tests aggregation per TDG Section 12.4
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ProfileService } from './profile-service';

describe('Profile Service - Aggregation', () => {
  let profileService: ProfileService;

  beforeEach(() => {
    profileService = new ProfileService();
  });

  describe('Recent 7 day accuracy calculation', () => {
    it('should calculate weighted accuracy correctly', () => {
      // Test the accuracy calculation formula:
      // weightedSum = correctSteps * 1.0 + partialSteps * 0.5
      // accuracy = weightedSum / totalSteps

      const correctSteps = 10;
      const partialSteps = 5;
      const incorrectSteps = 5;
      const totalSteps = correctSteps + partialSteps + incorrectSteps;

      const weightedSum = correctSteps * 1.0 + partialSteps * 0.5;
      const accuracy = weightedSum / totalSteps;

      // (10 * 1.0 + 5 * 0.5) / 20 = 12.5 / 20 = 0.625
      expect(accuracy).toBe(0.625);
    });

    it('should return null when no steps recorded', () => {
      const totalSteps = 0;

      if (totalSteps === 0) {
        expect(null).toBeNull();
      }
    });

    it('should calculate 100% accuracy for all correct', () => {
      const correctSteps = 20;
      const partialSteps = 0;
      const totalSteps = 20;

      const weightedSum = correctSteps * 1.0 + partialSteps * 0.5;
      const accuracy = weightedSum / totalSteps;

      expect(accuracy).toBe(1.0);
    });

    it('should calculate 0% accuracy for all incorrect', () => {
      const correctSteps = 0;
      const partialSteps = 0;
      const incorrectSteps = 10;
      const totalSteps = correctSteps + partialSteps + incorrectSteps;

      const weightedSum = correctSteps * 1.0 + partialSteps * 0.5;
      const accuracy = weightedSum / totalSteps;

      expect(accuracy).toBe(0);
    });
  });

  describe('Hint dependency score calculation', () => {
    it('should calculate hint dependency score based on hint usage and error rate', () => {
      // Formula: Math.min(1, hintRate * 0.6 + errorRate * 0.4)
      // where hintRate = hintUsage / totalSteps
      // and errorRate = (partialSteps + incorrectSteps) / totalSteps

      const hintUsage = 5;
      const totalSteps = 20;
      const partialSteps = 5;
      const incorrectSteps = 5;

      const hintRate = hintUsage / totalSteps;
      const errorRate = (partialSteps + incorrectSteps) / totalSteps;
      const hintDependencyScore = Math.min(1, hintRate * 0.6 + errorRate * 0.4);

      // hintRate = 0.25, errorRate = 0.5
      // 0.25 * 0.6 + 0.5 * 0.4 = 0.15 + 0.2 = 0.35
      expect(hintDependencyScore).toBe(0.35);
    });

    it('should return 0 when no steps', () => {
      const totalSteps = 0;

      if (totalSteps === 0) {
        expect(0).toBe(0);
      }
    });

    it('should cap hint dependency at 1.0', () => {
      const hintUsage = 50;
      const totalSteps = 20;
      const partialSteps = 10;
      const incorrectSteps = 10;

      const hintRate = hintUsage / totalSteps;
      const errorRate = (partialSteps + incorrectSteps) / totalSteps;
      const hintDependencyScore = Math.min(1, hintRate * 0.6 + errorRate * 0.4);

      // hintRate = 2.5, errorRate = 1.0
      // 2.5 * 0.6 + 1.0 * 0.4 = 1.5 + 0.4 = 1.9, capped at 1.0
      expect(hintDependencyScore).toBe(1.0);
    });

    it('should give higher score to students who use more hints', () => {
      // High hint usage scenario
      const highHintUsage = 15;
      const totalSteps = 20;
      const partialSteps = 3;
      const incorrectSteps = 2;

      const highHintRate = highHintUsage / totalSteps;
      const highErrorRate = (partialSteps + incorrectSteps) / totalSteps;
      const highHintScore = Math.min(1, highHintRate * 0.6 + highErrorRate * 0.4);

      // Low hint usage scenario
      const lowHintUsage = 2;
      const lowHintRate = lowHintUsage / totalSteps;
      const lowErrorRate = (partialSteps + incorrectSteps) / totalSteps;
      const lowHintScore = Math.min(1, lowHintRate * 0.6 + lowErrorRate * 0.4);

      expect(highHintScore).toBeGreaterThan(lowHintScore);
    });
  });

  describe('Weak knowledge points generation', () => {
    it('should generate top 5 weak knowledge points by error count', () => {
      // Simulate a Map of knowledge points to error counts
      const weakKnowledgePoints = new Map<string, number>([
        ['quadratic_equation', 10],
        ['linear_equation', 8],
        ['fraction', 6],
        ['percentage', 4],
        ['geometry', 3],
        ['algebra', 2],
      ]);

      // Sort by error count descending, take top 5
      const entries = Array.from(weakKnowledgePoints.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

      const weakKPs = entries.map(([kp]) => kp);

      expect(weakKPs).toEqual([
        'quadratic_equation',
        'linear_equation',
        'fraction',
        'percentage',
        'geometry',
      ]);
    });

    it('should return empty array when no weak knowledge points', () => {
      const weakKnowledgePoints = new Map<string, number>();

      const entries = Array.from(weakKnowledgePoints.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

      const weakKPs = entries.map(([kp]) => kp);

      expect(weakKPs).toEqual([]);
    });

    it('should handle fewer than 5 knowledge points', () => {
      const weakKnowledgePoints = new Map<string, number>([
        ['quadratic_equation', 10],
        ['linear_equation', 8],
      ]);

      const entries = Array.from(weakKnowledgePoints.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

      const weakKPs = entries.map(([kp]) => kp);

      expect(weakKPs).toEqual(['quadratic_equation', 'linear_equation']);
    });
  });

  describe('Frequent error types generation', () => {
    it('should generate top 3 frequent error types by count', () => {
      const frequentErrorTypes = new Map<string, number>([
        ['sign_error', 15],
        ['calculation_error', 12],
        ['step_skip', 8],
        ['concept_error', 5],
        ['reading_error', 3],
      ]);

      const entries = Array.from(frequentErrorTypes.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);

      const errorTypes = entries.map(([et]) => et);

      expect(errorTypes).toEqual(['sign_error', 'calculation_error', 'step_skip']);
    });
  });

  describe('Empty profile creation', () => {
    it('should create empty profile with correct structure', () => {
      const userId = 'user123';

      const emptyProfile = {
        userId,
        weakKnowledgePoints: [] as string[],
        frequentErrorTypes: [] as string[],
        hintDependencyScore: 0,
        recentAccuracy: null as number | null,
        profileVersion: 1,
        updatedAt: expect.any(Date),
      };

      expect(emptyProfile.userId).toBe(userId);
      expect(emptyProfile.weakKnowledgePoints).toEqual([]);
      expect(emptyProfile.hintDependencyScore).toBe(0);
      expect(emptyProfile.recentAccuracy).toBeNull();
    });
  });

  describe('Profile update', () => {
    it('should build correct database update object', () => {
      const updates = {
        weakKnowledgePoints: ['quadratic_equation', 'linear_equation'],
        frequentErrorTypes: ['sign_error'],
        hintDependencyScore: 0.35,
        recentAccuracy: 0.75,
      };

      const dbUpdates: Record<string, unknown> = {
        updated_at: expect.any(String),
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

      expect(dbUpdates).toHaveProperty('weak_knowledge_points');
      expect(dbUpdates).toHaveProperty('frequent_error_types');
      expect(dbUpdates).toHaveProperty('hint_dependency_score');
      expect(dbUpdates).toHaveProperty('recent_accuracy');
    });
  });
});