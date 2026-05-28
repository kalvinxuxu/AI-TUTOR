import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sessionService } from '@/lib/domain/session-service';
import { problemService } from '@/lib/domain/problem-service';
import { tutorEngine } from '@/lib/domain/tutor-engine';
import { TutorState } from '@/types/domain';
import { getUserIdFromRequest } from '@/lib/auth';

// Validation schema
const startSessionSchema = z.object({
  problemId: z.string().min(1, 'Problem ID is required'),
});

// POST /api/sessions/start - Start a new tutoring session
export async function POST(request: NextRequest) {
  try {
    // Get user ID
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Parse and validate request body
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON body' },
        { status: 400 }
      );
    }

    const validation = startSessionSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error.issues[0].message },
        { status: 400 }
      );
    }

    const { problemId } = validation.data;

    // Verify problem exists and belongs to user
    const problem = await problemService.getProblem(problemId);
    if (!problem) {
      return NextResponse.json(
        { success: false, error: 'Problem not found' },
        { status: 404 }
      );
    }

    if (problem.userId !== userId) {
      return NextResponse.json(
        { success: false, error: 'Problem not found' },
        { status: 404 }
      );
    }

    // Create session via SessionService
    const session = await sessionService.createSession(userId, problemId);

    // Generate first tutor message using TutorEngine
    // Per TDG Section 9: First message must be a question or light hint
    // Per TDG Section 9: First message prohibits complete solution
    const tutorResponse = await tutorEngine.startSession(
      problem.normalizedText,
      problem.problemType,
      problem.knowledgePoints,
      userId,
      session.id
    );

    // Add assistant message to session
    await sessionService.addMessage(
      session.id,
      'assistant',
      tutorResponse.message,
      tutorResponse.tutorState as TutorState
    );

    return NextResponse.json({
      success: true,
      data: {
        sessionId: session.id,
        tutorState: tutorResponse.tutorState,
        hintLevel: tutorResponse.hintLevel,
        message: tutorResponse.message,
      },
    });
  } catch (error) {
    console.error('Error starting session:', error);

    // Fallback and degradation per TDG Section 13
    if (error instanceof Error) {
      if (error.message.includes('AI') || error.message.includes('tutor')) {
        return NextResponse.json(
          {
            success: false,
            error: 'Tutor service temporarily unavailable. Please try again.',
          },
          { status: 503 }
        );
      }
    }

    return NextResponse.json(
      { success: false, error: 'Failed to start session' },
      { status: 500 }
    );
  }
}