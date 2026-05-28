/**
 * AI Instrumentation
 * Unified logging, cost tracking, and observability for AI model calls
 * Ref: TDG Section 15, 17.1
 */

// Model call log entry
export interface ModelCallLog {
  request_id: string;
  user_id: string;
  session_id: string;
  model_name: string;
  latency_ms: number;
  input_tokens: number;
  output_tokens: number;
  success: boolean;
  fallback_used: boolean;
  operation: string;
  error?: string;
  cost_usd?: number;
  timestamp?: string;
}

// Cost configuration (USD per 1M tokens)
const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  'gemini-2.5-flash': { input: 0.075, output: 0.30 },
  'claude-sonnet-4-20250514': { input: 3.0, output: 15.0 },
  'gpt-4.1': { input: 2.0, output: 8.0 },
  'o4-mini': { input: 1.5, output: 6.0 },
};

/**
 * Calculate cost in USD for a model call
 */
export function calculateCost(modelName: string, inputTokens: number, outputTokens: number): number {
  const costs = MODEL_COSTS[modelName] || MODEL_COSTS['gemini-2.5-flash'];
  return (inputTokens / 1_000_000) * costs.input + (outputTokens / 1_000_000) * costs.output;
}

// In-memory store for logs (in production, use proper observability service)
const callLogs: ModelCallLog[] = [];
const MAX_LOGS = 1000;

// Lazy import Supabase admin client to avoid circular dependencies
let supabaseAdmin: ReturnType<typeof import('../supabase/server').getSupabaseServerClient> | null = null;

async function getSupabaseAdmin() {
  if (!supabaseAdmin) {
    try {
      const { getSupabaseServerClient } = await import('../supabase/server');
      supabaseAdmin = getSupabaseServerClient();
    } catch (e) {
      console.warn('[AI Instrumentation] Could not load Supabase admin client');
    }
  }
  return supabaseAdmin;
}

/**
 * Persist a call log to Supabase (non-blocking)
 * Falls back to structured console.log if Supabase is unavailable
 */
async function persistCallLog(log: ModelCallLog): Promise<void> {
  // Try Supabase first
  const supabase = await getSupabaseAdmin();
  if (supabase) {
    try {
      const { error } = await supabase.from('ai_call_logs').insert({
        request_id: log.request_id,
        user_id: log.user_id,
        session_id: log.session_id,
        model_name: log.model_name,
        latency_ms: log.latency_ms,
        input_tokens: log.input_tokens,
        output_tokens: log.output_tokens,
        success: log.success,
        fallback_used: log.fallback_used,
        operation: log.operation,
        error: log.error || null,
        cost_usd: log.cost_usd || null,
        timestamp: log.timestamp || new Date().toISOString(),
      });

      if (error) {
        throw error;
      }
      return; // Successfully persisted
    } catch (e) {
      // Supabase failed, fall through to console.log
      console.warn('[AI Instrumentation] Supabase insert failed, using console.log:', e);
    }
  }

  // Fallback: structured console.log for Vercel log capture
  console.log(JSON.stringify({
    type: 'ai_call_log',
    ...log,
    cost_usd: log.cost_usd || calculateCost(log.model_name, log.input_tokens, log.output_tokens),
  }));
}

/**
 * Log a model call for monitoring and cost tracking
 * @param call - The model call log entry
 */
export async function logModelCall(call: ModelCallLog): Promise<void> {
  const logEntry: ModelCallLog = {
    ...call,
    timestamp: new Date().toISOString(),
    cost_usd: calculateCost(call.model_name, call.input_tokens, call.output_tokens),
  };

  // Keep only last MAX_LOGS entries
  if (callLogs.length >= MAX_LOGS) {
    callLogs.shift();
  }
  callLogs.push(logEntry);

  // In development, log to console
  if (process.env.NODE_ENV === 'development') {
    console.log(`[AI Call] ${logEntry.model_name} | ${logEntry.operation} | ${logEntry.latency_ms}ms | ${logEntry.success ? 'OK' : 'FAIL'}${logEntry.fallback_used ? ' (fallback)' : ''}`);
    if (logEntry.error) {
      console.error(`[AI Error] ${logEntry.error}`);
    }
  }

  // Persist to Supabase or fallback to structured console.log (non-blocking)
  persistCallLog(logEntry).catch((e) => {
    // Should not happen since we handle errors inside persistCallLog
    console.error('[AI Instrumentation] Unexpected error in persistCallLog:', e);
  });
}

/**
 * Get recent call logs for debugging
 */
export function getRecentLogs(count: number = 100): ModelCallLog[] {
  return callLogs.slice(-count);
}

/**
 * Get aggregate statistics for a model
 */
export function getModelStats(modelName: string): {
  totalCalls: number;
  successRate: number;
  avgLatency: number;
  totalCost: number;
  fallbackRate: number;
} {
  const logs = callLogs.filter(l => l.model_name === modelName);
  if (logs.length === 0) {
    return { totalCalls: 0, successRate: 0, avgLatency: 0, totalCost: 0, fallbackRate: 0 };
  }

  const totalCalls = logs.length;
  const successfulCalls = logs.filter(l => l.success).length;
  const fallbackCalls = logs.filter(l => l.fallback_used).length;
  const totalLatency = logs.reduce((sum, l) => sum + l.latency_ms, 0);
  const totalCost = logs.reduce((sum, l) => sum + (l.cost_usd || 0), 0);

  return {
    totalCalls,
    successRate: successfulCalls / totalCalls,
    avgLatency: totalLatency / totalCalls,
    totalCost,
    fallbackRate: fallbackCalls / totalCalls,
  };
}

/**
 * Trace an AI call with automatic timing and error handling
 * @param fn - The async function to execute
 * @param metadata - Metadata for the call
 * @returns The result of the function
 */
export async function traceAicall<T>(
  fn: () => Promise<T>,
  metadata: Omit<ModelCallLog, 'latency_ms' | 'success' | 'error'>
): Promise<T> {
  const startTime = Date.now();
  const fallbackUsed = metadata.fallback_used;

  try {
    const result = await fn();
    const latencyMs = Date.now() - startTime;

    logModelCall({
      ...metadata,
      latency_ms: latencyMs,
      success: true,
      fallback_used: fallbackUsed,
    });

    return result;
  } catch (error) {
    const latencyMs = Date.now() - startTime;

    logModelCall({
      ...metadata,
      latency_ms: latencyMs,
      success: false,
      fallback_used: fallbackUsed,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    throw error;
  }
}

/**
 * Create a retry decorator for AI calls
 */
export function createRetryDecorator(options: {
  maxRetries?: number;
  retryDelay?: number;
  initialDelay?: number;
}) {
  const { maxRetries = 2, retryDelay = 1000, initialDelay = 500 } = options;

  return async function withRetry<T>(
    fn: () => Promise<T>,
    onRetry?: (attempt: number, error: Error) => void
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');

        if (attempt < maxRetries) {
          if (onRetry) {
            onRetry(attempt + 1, lastError);
          }
          // Exponential backoff
          const delay = initialDelay * Math.pow(2, attempt) + Math.random() * retryDelay;
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError;
  };
}

// Export singleton instrumentation instance
export const instrumentation = {
  logModelCall,
  traceAicall,
  getRecentLogs,
  getModelStats,
  calculateCost,
};