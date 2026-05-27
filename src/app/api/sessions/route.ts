import { NextRequest, NextResponse } from 'next/server';
import { sessionService } from '@/lib/domain/session-service';
import { problemService } from '@/lib/domain/problem-service';
import { evaluationService } from '@/lib/domain/evaluation-service';
import { getUserIdFromRequest } from '@/lib/auth';
import { supabase } from '@/lib/supabase/client';

/**
 * GET /api/sessions
 * Get all sessions for the current user with problem info
 */
export async function GET(request: NextRequest) {
  try {
    // Authenticate user
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Query sessions for this user with problem info
    if (!supabase) {
      return NextResponse.json({
        success: true,
        data: { sessions: [] },
      });
    }

    const { data: sessions, error } = await supabase
      .from('sessions')
      .select(`
        id,
        problem_id,
        status,
        current_tutor_state,
        hint_level,
        consecutive_failures,
        consecutive_successes,
        solution_revealed,
        started_at,
        ended_at
      `)
      .eq('user_id', userId)
      .order('started_at', { ascending: false });

    if (error) {
      console.error('Error fetching sessions:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to get sessions' },
        { status: 500 }
      );
    }

    // Build session summaries with problem info
    const sessionSummaries = await Promise.all(
      (sessions || []).map(async (session) => {
        // Get problem info
        const problem = await problemService.getProblem(session.problem_id);

        // Get evaluation history for completion type
        const evaluations = await evaluationService.getEvaluationHistory(session.id);

        // Determine completion type
        let completionType: 'self' | 'hint' | 'solution' | undefined;
        if (session.status === 'completed') {
          if (session.solution_revealed) {
            completionType = 'solution';
          } else if (evaluations.some(e => e.correctness !== 'correct')) {
            completionType = 'hint';
          } else {
            completionType = 'self';
          }
        }

        return {
          id: session.id,
          problemText: problem?.normalizedText || '未知题目',
          status: session.status,
          startedAt: session.started_at,
          endedAt: session.ended_at,
          knowledgePoints: problem?.knowledgePoints || [],
          completionType,
          hintCount: evaluations.filter(e => e.correctness !== 'correct').length,
        };
      })
    );

    return NextResponse.json({
      success: true,
      data: { sessions: sessionSummaries },
    });
  } catch (error) {
    console.error('Error getting sessions:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to get sessions' },
      { status: 500 }
    );
  }
}