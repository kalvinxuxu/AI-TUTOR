import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sessionService } from '@/lib/domain/session-service';
import { problemService } from '@/lib/domain/problem-service';
import { evaluationService } from '@/lib/domain/evaluation-service';
import { reviewService } from '@/lib/domain/review-service';
import { tutorEngine } from '@/lib/domain/tutor-engine';
import { NextAction, ErrorType } from '@/types/domain';

// Validation schema per TDG Section 16.3
const evaluateSchema = z.object({
  studentInput: z
    .string()
    .min(1, 'Student input is required')
    .max(10000, 'Input too long'),
});

// Helper to get user ID
function getUserId(request: NextRequest): string | null {
  const userIdHeader = request.headers.get('x-user-id');
  if (userIdHeader) return userIdHeader;

  const cookies = request.cookies.getAll();
  const userIdCookie = cookies.find((c) => c.name === 'user_id');
  return userIdCookie?.value || null;
}

// POST /api/sessions/[id]/evaluate - Evaluate session
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionId } = await params;

    // Get user ID
    const userId = getUserId(request);
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Verify session belongs to user per TDG Section 16.3
    const session = await sessionService.getSession(sessionId);
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Session not found' },
        { status: 404 }
      );
    }

    if (session.userId !== userId) {
      return NextResponse.json(
        { success: false, error: 'Session not found' },
        { status: 404 }
      );
    }

    // Parse and validate request body per TDG Section 16.3
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON body' },
        { status: 400 }
      );
    }

    const validation = evaluateSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error.issues[0].message },
        { status: 400 }
      );
    }

    const { studentInput } = validation.data;

    // Get problem for context
    const problem = await problemService.getProblem(session.problemId);
    if (!problem) {
      return NextResponse.json(
        { success: false, error: 'Problem not found' },
        { status: 404 }
      );
    }

    // Evaluate the student input
    const evaluation = await evaluationService.evaluateStep(
      sessionId,
      studentInput,
      problem.normalizedText
    );

    // Record evaluation result and update session counters
    await sessionService.recordEvaluationResult(
      sessionId,
      evaluation.correctness,
      evaluation.understandingLevel
    );

    // Update tutor engine with evaluation results
    tutorEngine.updateAfterEvaluation(
      evaluation.correctness,
      evaluation.understandingLevel,
      evaluation.feedbackSummary
    );

    // Generate feedback per TDG Section 9: feedback must include "current evaluation + next action"
    const feedback = `${evaluation.feedbackSummary} ${getNextActionDescription(evaluation.nextAction)}`;

    // Create review tasks based on evaluation
    // Only create if there were errors or knowledge points involved
    if (
      evaluation.primaryErrorType ||
      problem.knowledgePoints.length > 0
    ) {
      await reviewService.checkAndCreateReviewTasks(
        userId,
        sessionId,
        problem.id,
        problem.knowledgePoints,
        evaluation.secondaryErrorTypes.length > 0
          ? [evaluation.primaryErrorType, ...evaluation.secondaryErrorTypes].filter(Boolean) as ErrorType[]
          : evaluation.primaryErrorType
          ? [evaluation.primaryErrorType]
          : [],
        evaluation.understandingLevel,
        tutorEngine.getContext()?.tutorState || 'observe'
      );
    }

    // Build response per TDG Section 9 rules
    return NextResponse.json({
      success: true,
      data: {
        correctness: evaluation.correctness,
        understandingLevel: evaluation.understandingLevel,
        primaryErrorType: evaluation.primaryErrorType,
        secondaryErrorTypes: evaluation.secondaryErrorTypes,
        feedback,
        nextAction: evaluation.nextAction,
      },
    });
  } catch (error) {
    console.error('Error evaluating session:', error);

    // Fallback and degradation per TDG Section 13
    if (error instanceof Error) {
      if (error.message.includes('AI') || error.message.includes('evaluation')) {
        return NextResponse.json(
          {
            success: false,
            error: 'Evaluation service temporarily unavailable. Please try again.',
          },
          { status: 503 }
        );
      }
    }

    return NextResponse.json(
      { success: false, error: 'Failed to evaluate' },
      { status: 500 }
    );
  }
}

/**
 * Get description for next action
 */
function getNextActionDescription(action: NextAction): string {
  const descriptions: Record<NextAction, string> = {
    continue: '继续下一步',
    hint: '需要时我会给你提示',
    simplify: '让我们简化问题',
    explain: '我来详细解释',
  };
  return descriptions[action];
}