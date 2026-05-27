import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sessionService } from '@/lib/domain/session-service';
import { problemService } from '@/lib/domain/problem-service';
import { tutorEngine } from '@/lib/domain/tutor-engine';
import { TutorState } from '@/types/domain';

// Validation schema
const sendMessageSchema = z.object({
  input: z.string().min(1, 'Input is required').max(5000, 'Input too long'),
  action: z.enum(['continue', 'give_up', 'see_solution']).optional(),
});

// Helper to get user ID
function getUserId(request: NextRequest): string | null {
  const userIdHeader = request.headers.get('x-user-id');
  if (userIdHeader) return userIdHeader;

  const cookies = request.cookies.getAll();
  const userIdCookie = cookies.find((c) => c.name === 'user_id');
  return userIdCookie?.value || null;
}

// GET /api/sessions/[id]/messages - Get session messages
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionId } = await params;

    const userId = getUserId(request);
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    const session = await sessionService.getSession(sessionId);
    if (!session || session.userId !== userId) {
      return NextResponse.json(
        { success: false, error: 'Session not found' },
        { status: 404 }
      );
    }

    const messages = await sessionService.getMessages(sessionId);

    return NextResponse.json({
      success: true,
      data: { messages },
    });
  } catch (error) {
    console.error('Error getting messages:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to get messages' },
      { status: 500 }
    );
  }
}

// POST /api/sessions/[id]/messages - Send a message
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

    // Verify session exists and belongs to user per TDG Section 16.3
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

    // Check session is still active
    if (session.status !== 'active') {
      return NextResponse.json(
        { success: false, error: 'Session is no longer active' },
        { status: 400 }
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

    const validation = sendMessageSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error.issues[0].message },
        { status: 400 }
      );
    }

    const { input, action } = validation.data;

    // Handle action types per TDG Section 9
    if (action === 'give_up') {
      // Mark session as abandoned
      await sessionService.abandonSession(sessionId);
      return NextResponse.json({
        success: true,
        data: {
          sessionStatus: 'abandoned',
          message: 'Session ended. Keep practicing!',
        },
      });
    }

    if (action === 'see_solution') {
      // Per TDG Section 9: see_solution needs explicit record solution_revealed = true
      await sessionService.updateSessionState(sessionId, {
        solutionRevealed: true,
        tutorState: 'explain',
        hintLevel: 5,
      });

      const solutionResponse = await tutorEngine.revealSolution(sessionId);

      await sessionService.addMessage(
        sessionId,
        'assistant',
        solutionResponse.message,
        solutionResponse.tutorState as TutorState
      );

      return NextResponse.json({
        success: true,
        data: {
          sessionStatus: 'active',
          tutorState: solutionResponse.tutorState,
          hintLevel: solutionResponse.hintLevel,
          message: solutionResponse.message,
        },
      });
    }

    // Default: continue (normal interaction)
    // Add student message to session
    await sessionService.addMessage(sessionId, 'student', input);

    // Get problem for context
    const problem = await problemService.getProblem(session.problemId);
    if (!problem) {
      return NextResponse.json(
        { success: false, error: 'Problem not found' },
        { status: 404 }
      );
    }

    // Get recent messages for context
    const recentMessages = await sessionService.getRecentMessages(sessionId, 10);

    // Update tutor engine context
    const context = tutorEngine.getContext(sessionId);
    if (context) {
      context.recentMessages = recentMessages;
    }

    // Generate tutor response
    const tutorResponse = await tutorEngine.generateResponse(sessionId, input);

    // Per TDG Section 9: Return message length controlled by prompt rules
    // (actual message length is controlled by the AI model prompt)

    // Add tutor response to session
    await sessionService.addMessage(
      sessionId,
      'assistant',
      tutorResponse.message,
      tutorResponse.tutorState as TutorState
    );

    // Update session state
    await sessionService.updateSessionState(sessionId, {
      tutorState: tutorResponse.tutorState,
      hintLevel: tutorResponse.hintLevel,
    });

    return NextResponse.json({
      success: true,
      data: {
        sessionStatus: 'active',
        tutorState: tutorResponse.tutorState,
        hintLevel: tutorResponse.hintLevel,
        message: tutorResponse.message,
      },
    });
  } catch (error) {
    console.error('Error sending message:', error);

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
      { success: false, error: 'Failed to send message' },
      { status: 500 }
    );
  }
}