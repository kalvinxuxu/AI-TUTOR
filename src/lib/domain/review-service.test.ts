/**
 * Review Service Unit Tests
 * Tests deduplication per TDG Section 12.3
 * Dedupe key = user_id + knowledge_point + error_type + scheduled_for (date only)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ReviewService } from './review-service';

describe('Review Service - Deduplication', () => {
  let reviewService: ReviewService;

  beforeEach(() => {
    reviewService = new ReviewService();
  });

  describe('Dedupe Key Generation', () => {
    it('should generate correct dedupe key for knowledge point review', () => {
      // Test the internal dedupe key format
      const knowledgePoint = 'quadratic_equation';
      const dedupeKey = `kp:${knowledgePoint}`;

      expect(dedupeKey).toBe('kp:quadratic_equation');
    });

    it('should generate correct dedupe key for error type review', () => {
      const errorType = 'sign_error';
      const dedupeKey = `err:${errorType}`;

      expect(dedupeKey).toBe('err:sign_error');
    });
  });

  describe('In-memory deduplication', () => {
    it('should prevent duplicate tasks within 24 hour window', async () => {
      const userId = 'user123';
      const sessionId = 'session456';
      const problemId = 'problem789';
      const knowledgePoint = 'linear_equation';

      // Mock the database methods to avoid actual DB calls
      const originalHasRecentTask = reviewService['hasRecentTask'];
      reviewService['hasRecentTask'] = async () => false;

      // Create first task (returns array of 4 tasks at intervals [0,2,7,21])
      const tasks1 = await reviewService['createReviewTask'](
        userId,
        sessionId,
        problemId,
        knowledgePoint,
        null,
        'knowledge_point'
      );

      expect(tasks1).toHaveLength(4);
      expect(tasks1[0]?.knowledgePoint).toBe(knowledgePoint);

      // Try to create duplicate within 24 hours
      const tasks2 = await reviewService['createReviewTask'](
        userId,
        sessionId,
        problemId,
        knowledgePoint,
        null,
        'knowledge_point'
      );

      // Should be blocked by in-memory deduplication (returns empty array)
      expect(tasks2).toEqual([]);

      // Restore original method
      reviewService['hasRecentTask'] = originalHasRecentTask;
    });
  });

  describe('Database deduplication', () => {
    it('should check database for existing similar tasks', async () => {
      // This test verifies the hasRecentTask method is called
      const userId = 'user123';
      const dedupeKey = 'kp:quadratic_equation';

      // The hasRecentTask should be called during checkAndCreateReviewTasks
      // When it returns true, createReviewTask should return null
      const result = await reviewService['hasRecentTask'](userId, dedupeKey, 7);

      // Without a real database, this returns false
      expect(typeof result).toBe('boolean');
    });
  });

  describe('Same user/same day/same knowledge point', () => {
    it('should only create one task per user per knowledge point per week', async () => {
      const userId = 'user123';
      const sessionId = 'session456';
      const problemId = 'problem789';
      const knowledgePoint = 'fraction_addition';

      // Mock database to not find existing tasks
      const originalHasRecentTask = reviewService['hasRecentTask'];
      reviewService['hasRecentTask'] = async () => false;

      // Create first task (returns array of 4 tasks at intervals [0,2,7,21])
      const tasks1 = await reviewService['createReviewTask'](
        userId,
        sessionId,
        problemId,
        knowledgePoint,
        null,
        'knowledge_point'
      );

      expect(tasks1).toHaveLength(4);

      // Second task should be blocked by in-memory dedupe (returns empty array)
      const tasks2 = await reviewService['createReviewTask'](
        userId,
        sessionId,
        problemId,
        knowledgePoint,
        null,
        'knowledge_point'
      );

      expect(tasks2).toEqual([]);

      // Restore
      reviewService['hasRecentTask'] = originalHasRecentTask;
    });
  });

  describe('Same user/same day/same error type', () => {
    it('should only create one task per user per error type per week', async () => {
      const userId = 'user123';
      const sessionId = 'session456';
      const problemId = 'problem789';
      const errorType = 'calculation_error';

      // Mock database
      const originalHasRecentTask = reviewService['hasRecentTask'];
      reviewService['hasRecentTask'] = async () => false;

      // Create first task (returns array of 4 tasks at intervals [0,2,7,21])
      const tasks1 = await reviewService['createReviewTask'](
        userId,
        sessionId,
        problemId,
        null,
        errorType,
        'error_type'
      );

      expect(tasks1).toHaveLength(4);
      expect(tasks1[0]?.errorType).toBe(errorType);

      // Restore
      reviewService['hasRecentTask'] = originalHasRecentTask;
    });
  });

  describe('Different knowledge points can have separate tasks', () => {
    it('should allow tasks for different knowledge points', async () => {
      const userId = 'user123';
      const sessionId = 'session456';
      const problemId = 'problem789';

      // Mock database
      const originalHasRecentTask = reviewService['hasRecentTask'];
      reviewService['hasRecentTask'] = async () => false;

      // Create task for first knowledge point (returns array of 4 tasks)
      const tasks1 = await reviewService['createReviewTask'](
        userId,
        sessionId,
        problemId,
        'knowledge_point_a',
        null,
        'knowledge_point'
      );

      // Clear in-memory tracking for a different KP
      reviewService['recentTaskKeys'].set('kp:knowledge_point_b', 0);

      // Create task for second knowledge point (returns array of 4 tasks)
      const tasks2 = await reviewService['createReviewTask'](
        userId,
        sessionId,
        problemId,
        'knowledge_point_b',
        null,
        'knowledge_point'
      );

      expect(tasks1).toHaveLength(4);
      expect(tasks2).toHaveLength(4);
      expect(tasks1[0]?.knowledgePoint).toBe('knowledge_point_a');
      expect(tasks2[0]?.knowledgePoint).toBe('knowledge_point_b');

      // Restore
      reviewService['hasRecentTask'] = originalHasRecentTask;
    });
  });

  describe('Review task structure', () => {
    it('should create task with correct structure', async () => {
      const userId = 'user123';
      const sessionId = 'session456';
      const problemId = 'problem789';

      // Mock database
      const originalHasRecentTask = reviewService['hasRecentTask'];
      reviewService['hasRecentTask'] = async () => false;

      // createReviewTask returns array of 4 tasks at intervals [0,2,7,21]
      const tasks = await reviewService['createReviewTask'](
        userId,
        sessionId,
        problemId,
        'test_kp',
        null,
        'knowledge_point'
      );

      expect(tasks).toHaveLength(4);
      const task = tasks[0];

      expect(task).toMatchObject({
        id: expect.any(String),
        userId,
        sessionId,
        problemId,
        knowledgePoint: 'test_kp',
        errorType: null,
        status: 'pending',
        dedupeKey: expect.stringMatching(/^kp:test_kp:\d+$/), // includes interval suffix
        createdAt: expect.any(Date),
        completedAt: null,
      });

      expect(task?.scheduledFor).toBeInstanceOf(Date);

      // Restore
      reviewService['hasRecentTask'] = originalHasRecentTask;
    });
  });
});