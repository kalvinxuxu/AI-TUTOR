import { NextRequest, NextResponse } from 'next/server';
import { sessionService } from '@/lib/domain/session-service';
import { problemService } from '@/lib/domain/problem-service';
import { evaluationService } from '@/lib/domain/evaluation-service';
import { getUserIdFromRequest } from '@/lib/auth';
import { ErrorType } from '@/types/domain';

/**
 * GET /api/sessions/[id]/result
 * Get the result/summary of a completed or abandoned session
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionId } = await params;

    // Authenticate user
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Get session
    const session = await sessionService.getSession(sessionId);
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Session not found' },
        { status: 404 }
      );
    }

    // Verify ownership
    if (session.userId !== userId) {
      return NextResponse.json(
        { success: false, error: 'Session not found' },
        { status: 404 }
      );
    }

    // Get problem for knowledge points
    const problem = await problemService.getProblem(session.problemId);

    // Get evaluation history for error types and hint count
    const evaluations = await evaluationService.getEvaluationHistory(sessionId);

    // Determine completion type
    let completionType: 'self' | 'hint' | 'solution' = 'self';
    if (session.solutionRevealed) {
      completionType = 'solution';
    } else if (evaluations.some(e => e.nextAction === 'hint')) {
      completionType = 'hint';
    }

    // Count hints used
    const hintCount = evaluations.filter(e =>
      e.primaryErrorType !== null ||
      e.correctness !== 'correct'
    ).length;

    // Extract error types from evaluations
    const errorTypes = evaluations
      .map(e => e.primaryErrorType)
      .filter((et): et is ErrorType => et !== null);

    // Generate suggestion based on error types
    let suggestion = '继续练习，巩固知识点！';
    if (errorTypes.length > 0) {
      const errorTypeLabels: Record<string, string> = {
        concept_error: '概念',
        reading_error: '审题',
        formula_misuse: '公式',
        step_skip: '跳步',
        calculation_error: '计算',
        sign_error: '符号',
      };
      const uniqueErrors = [...new Set(errorTypes)];
      const labels = uniqueErrors.map(e => errorTypeLabels[e] || e);
      suggestion = `建议加强${labels.join('、')}方面的练习`;
    }

    return NextResponse.json({
      success: true,
      data: {
        sessionId: session.id,
        status: session.status,
        completionType,
        knowledgePoints: problem?.knowledgePoints || [],
        errorTypes: [...new Set(errorTypes)],
        hintCount,
        suggestion,
      },
    });
  } catch (error) {
    console.error('Error getting session result:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to get session result' },
      { status: 500 }
    );
  }
}