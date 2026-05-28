/**
 * Vitest Setup File
 * Mocks external dependencies for unit testing
 */

import { vi } from 'vitest';

// Mock Supabase client
vi.mock('@/lib/supabase/client', () => ({
  supabase: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockResolvedValue({ data: null, error: null }),
      update: vi.fn().mockResolvedValue({ data: null, error: null }),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
  },
  createSupabaseClient: vi.fn(),
  isSupabaseConfigured: vi.fn().mockReturnValue(false),
}));

// Mock uuid
vi.mock('uuid', () => ({
  v4: vi.fn().mockReturnValue('test-uuid-1234'),
}));

// Mock deepseek AI module (initialized at module scope, causes credential errors in tests)
vi.mock('@/lib/ai/deepseek', () => ({
  deepseekAdapter: {
    generateResponse: vi.fn().mockResolvedValue({
      message: 'Mocked response',
      tutorState: 'observe',
      hintLevel: 1,
      isComplete: false,
    }),
    generateInitialMessage: vi.fn().mockResolvedValue({
      message: 'Mocked initial message',
      tutorState: 'hint',
      hintLevel: 1,
      isComplete: false,
    }),
    generateHint: vi.fn().mockResolvedValue('Mocked hint'),
    evaluateStep: vi.fn().mockResolvedValue({
      correctness: 'partial' as const,
      understandingLevel: 'partial_understanding' as const,
      primaryErrorType: null,
      secondaryErrorTypes: [],
      feedbackSummary: '继续努力',
      nextAction: 'hint' as const,
    }),
  },
  generateResponse: vi.fn().mockResolvedValue({
    message: 'Mocked response',
    tutorState: 'observe' as const,
    hintLevel: 1,
    isComplete: false,
  }),
  generateInitialMessage: vi.fn().mockResolvedValue({
    message: 'Mocked initial message',
    tutorState: 'hint' as const,
    hintLevel: 1,
    isComplete: false,
  }),
  generateHint: vi.fn().mockResolvedValue('Mocked hint'),
}));