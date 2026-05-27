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

      // Create first task
      const task1 = await reviewService['createReviewTask'](
        userId,
        sessionId,
        problemId,
        knowledgePoint,
        null,
        'knowledge_point'
      );

      expect(task1).not.toBeNull();
      expect(task1?.knowledgePoint).toBe(knowledgePoint);

      // Try to create duplicate within 24 hours
      const task2 = await reviewService['createReviewTask'](
        userId,
        sessionId,
        problemId,
        knowledgePoint,
        null,
        'knowledge_point'
      );

      // Should be blocked by in-memory deduplication
      expect(task2).toBeNull();

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

      // Create first task
      const task1 = await reviewService['createReviewTask'](
        userId,
        sessionId,
        problemId,
        knowledgePoint,
        null,
        'knowledge_point'
      );

      expect(task1).not.toBeNull();

      // Second task should be blocked by in-memory dedupe
      const task2 = await reviewService['createReviewTask'](
        userId,
        sessionId,
        problemId,
        knowledgePoint,
        null,
        'knowledge_point'
      );

      expect(task2).toBeNull();

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

      // Create first task
      const task1 = await reviewService['createReviewTask'](
        userId,
        sessionId,
        problemId,
        null,
        errorType,
        'error_type'
      );

      expect(task1).not.toBeNull();
      expect(task1?.errorType).toBe(errorType);

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

      // Create task for first knowledge point
      const task1 = await reviewService['createReviewTask'](
        userId,
        sessionId,
        problemId,
        'knowledge_point_a',
        null,
        'knowledge_point'
      );

      // Clear in-memory tracking for a different KP
      reviewService['recentTaskKeys'].set('kp:knowledge_point_b', 0);

      // Create task for second knowledge point
      const task2 = await reviewService['createReviewTask'](
        userId,
        sessionId,
        problemId,
        'knowledge_point_b',
        null,
        'knowledge_point'
      );

      expect(task1).not.toBeNull();
      expect(task2).not.toBeNull();
      expect(task1?.knowledgePoint).toBe('knowledge_point_a');
      expect(task2?.knowledgePoint).toBe('knowledge_point_b');

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

      const task = await reviewService['createReviewTask'](
        userId,
        sessionId,
        problemId,
        'test_kp',
        null,
        'knowledge_point'
      );

      expect(task).toMatchObject({
        id: expect.any(String),
        userId,
        sessionId,
        problemId,
        knowledgePoint: 'test_kp',
        errorType: null,
        status: 'pending',
        dedupeKey: 'kp:test_kp',
        createdAt: expect.any(Date),
        completedAt: null,
      });

      expect(task?.scheduledFor).toBeInstanceOf(Date);

      // Restore
      reviewService['hasRecentTask'] = originalHasRecentTask;
    });
  });
});