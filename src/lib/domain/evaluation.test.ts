/**
 * Evaluation Service Unit Tests
 * Tests error classification rules per TDG Section 11.4
 */

import { describe, it, expect } from 'vitest';
import { classifyError } from './evaluation-service';
import { ErrorType } from '@/types/domain';

describe('Evaluation Service - Error Classification Rules', () => {
  describe('sign_error classification', () => {
    it('should classify sign error when moving terms incorrectly', () => {
      const studentInput = 'x - 2 = 4 -> x = 4 + 2 (should be 4 - 2)';

      const result = classifyError(studentInput, null);

      expect(result).toBe('sign_error');
    });

    it('should classify sign error when bracket is mishandled', () => {
      const studentInput = 'the student moved the term but got the sign wrong';

      const result = classifyError(studentInput, null);

      expect(result).toBe('sign_error');
    });
  });

  describe('step_skip classification', () => {
    it('should classify skipped steps as step_skip', () => {
      const studentInput = 'I skip the middle step and go directly to answer';

      const result = classifyError(studentInput, null);

      expect(result).toBe('step_skip');
    });

    it('should classify jumping directly to answer as step_skip', () => {
      const studentInput = 'x = 3 directly answer';

      const result = classifyError(studentInput, null);

      expect(result).toBe('step_skip');
    });
  });

  describe('calculation_error classification', () => {
    it('should classify arithmetic mistakes as calculation_error', () => {
      const studentInput = '5 + 3 = 6 arithmetic mistake here';

      const result = classifyError(studentInput, null);

      expect(result).toBe('calculation_error');
    });

    it('should classify multiplication errors as calculation_error', () => {
      const studentInput = '4 * 2 = 6 (should be 8)';

      const result = classifyError(studentInput, null);

      expect(result).toBe('calculation_error');
    });

    it('should classify division errors as calculation_error', () => {
      const studentInput = '10 / 2 = 4 (should be 5)';

      const result = classifyError(studentInput, null);

      expect(result).toBe('calculation_error');
    });

    it('should detect arithmetic pattern in input', () => {
      const studentInput = 'the calculation 5 + 3 = 6 is wrong';

      const result = classifyError(studentInput, null);

      expect(result).toBe('calculation_error');
    });
  });

  describe('Fallback to concept_error', () => {
    it('should default to concept_error when no pattern matches', () => {
      const studentInput = 'some complex error that does not match any pattern';

      const result = classifyError(studentInput, null);

      expect(result).toBe('concept_error');
    });
  });

  describe('Model error type takes precedence', () => {
    it('should use model-provided error type if valid', () => {
      const studentInput = 'any input';
      const modelErrorType: ErrorType = 'formula_misuse';

      const result = classifyError(studentInput, modelErrorType);

      expect(result).toBe('formula_misuse');
    });

    it('should use model-provided error type if valid (reading_error)', () => {
      const studentInput = 'any input';
      const modelErrorType: ErrorType = 'reading_error';

      const result = classifyError(studentInput, modelErrorType);

      expect(result).toBe('reading_error');
    });
  });
});