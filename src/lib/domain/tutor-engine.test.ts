/**
 * Tutor Engine Unit Tests
 * Tests state transitions per TDG Section 10.2
 */

import { describe, it, expect } from 'vitest';
import { determineNextState } from './tutor-engine';
import { TutorContext, Correctness, UnderstandingLevel } from '@/types/domain';

describe('Tutor Engine - State Transitions', () => {
  describe('consecutive_failures >= 3', () => {
    it('should transition to explain when consecutive_failures >= 3', () => {
      const context: Pick<TutorContext, 'consecutiveFailures' | 'consecutiveSuccesses' | 'lastEvaluation' | 'hintLevel'> = {
        consecutiveFailures: 3,
        consecutiveSuccesses: 0,
        hintLevel: 1,
        lastEvaluation: undefined,
      };

      const result = determineNextState(context);

      expect(result.tutorState).toBe('explain');
    });

    it('should transition to explain when consecutive_failures > 3', () => {
      const context: Pick<TutorContext, 'consecutiveFailures' | 'consecutiveSuccesses' | 'lastEvaluation' | 'hintLevel'> = {
        consecutiveFailures: 5,
        consecutiveSuccesses: 0,
        hintLevel: 1,
        lastEvaluation: undefined,
      };

      const result = determineNextState(context);

      expect(result.tutorState).toBe('explain');
    });
  });

  describe('consecutive_failures >= 2', () => {
    it('should transition to simplify when consecutive_failures >= 2 but < 3', () => {
      const context: Pick<TutorContext, 'consecutiveFailures' | 'consecutiveSuccesses' | 'lastEvaluation' | 'hintLevel'> = {
        consecutiveFailures: 2,
        consecutiveSuccesses: 0,
        hintLevel: 1,
        lastEvaluation: undefined,
      };

      const result = determineNextState(context);

      expect(result.tutorState).toBe('simplify');
    });
  });

  describe('correctness=correct & understanding=mostly_understood', () => {
    it('should transition to challenge when correctness is correct and understanding is mostly_understood', () => {
      const context: Pick<TutorContext, 'consecutiveFailures' | 'consecutiveSuccesses' | 'lastEvaluation' | 'hintLevel'> = {
        consecutiveFailures: 0,
        consecutiveSuccesses: 0,
        hintLevel: 1,
        lastEvaluation: {
          correctness: 'correct' as Correctness,
          understandingLevel: 'mostly_understood' as UnderstandingLevel,
          feedback: 'Great job!',
        },
      };

      const result = determineNextState(context);

      expect(result.tutorState).toBe('challenge');
    });
  });

  describe('correctness=partial', () => {
    it('should transition to hint when correctness is partial', () => {
      const context: Pick<TutorContext, 'consecutiveFailures' | 'consecutiveSuccesses' | 'lastEvaluation' | 'hintLevel'> = {
        consecutiveFailures: 0,
        consecutiveSuccesses: 0,
        hintLevel: 1,
        lastEvaluation: {
          correctness: 'partial' as Correctness,
          understandingLevel: 'partial_understanding' as UnderstandingLevel,
          feedback: 'Partial credit',
        },
      };

      const result = determineNextState(context);

      expect(result.tutorState).toBe('hint');
    });
  });

  describe('else -> observe', () => {
    it('should transition to observe when no other rules match', () => {
      const context: Pick<TutorContext, 'consecutiveFailures' | 'consecutiveSuccesses' | 'lastEvaluation' | 'hintLevel'> = {
        consecutiveFailures: 0,
        consecutiveSuccesses: 0,
        hintLevel: 1,
        lastEvaluation: undefined,
      };

      const result = determineNextState(context);

      expect(result.tutorState).toBe('observe');
    });
  });

  describe('see_solution action override', () => {
    it('should transition to explain when action is see_solution', () => {
      const context: Pick<TutorContext, 'consecutiveFailures' | 'consecutiveSuccesses' | 'lastEvaluation' | 'hintLevel'> = {
        consecutiveFailures: 0,
        consecutiveSuccesses: 0,
        hintLevel: 1,
        lastEvaluation: undefined,
      };

      const result = determineNextState(context, 'see_solution');

      expect(result.tutorState).toBe('explain');
      expect(result.hintLevel).toBe(5);
    });
  });

  describe('consecutive_successes rules', () => {
    it('should transition to encourage when consecutive_successes >= 1', () => {
      const context: Pick<TutorContext, 'consecutiveFailures' | 'consecutiveSuccesses' | 'lastEvaluation' | 'hintLevel'> = {
        consecutiveFailures: 0,
        consecutiveSuccesses: 1,
        hintLevel: 2,
        lastEvaluation: undefined,
      };

      const result = determineNextState(context);

      expect(result.tutorState).toBe('encourage');
    });

    it('should transition to challenge when consecutive_successes >= 2', () => {
      const context: Pick<TutorContext, 'consecutiveFailures' | 'consecutiveSuccesses' | 'lastEvaluation' | 'hintLevel'> = {
        consecutiveFailures: 0,
        consecutiveSuccesses: 2,
        hintLevel: 2,
        lastEvaluation: undefined,
      };

      const result = determineNextState(context);

      expect(result.tutorState).toBe('challenge');
    });
  });

  describe('hint level escalation', () => {
    it('should increment hint level when correctness is partial', () => {
      const context: Pick<TutorContext, 'consecutiveFailures' | 'consecutiveSuccesses' | 'lastEvaluation' | 'hintLevel'> = {
        consecutiveFailures: 0,
        consecutiveSuccesses: 0,
        hintLevel: 2,
        lastEvaluation: {
          correctness: 'partial' as Correctness,
          understandingLevel: 'partial_understanding' as UnderstandingLevel,
          feedback: 'Partial',
        },
      };

      const result = determineNextState(context);

      expect(result.hintLevel).toBe(3);
    });

    it('should cap hint level at 4 for partial correctness', () => {
      const context: Pick<TutorContext, 'consecutiveFailures' | 'consecutiveSuccesses' | 'lastEvaluation' | 'hintLevel'> = {
        consecutiveFailures: 0,
        consecutiveSuccesses: 0,
        hintLevel: 4,
        lastEvaluation: {
          correctness: 'partial' as Correctness,
          understandingLevel: 'partial_understanding' as UnderstandingLevel,
          feedback: 'Partial',
        },
      };

      const result = determineNextState(context);

      expect(result.hintLevel).toBe(4);
    });
  });
});