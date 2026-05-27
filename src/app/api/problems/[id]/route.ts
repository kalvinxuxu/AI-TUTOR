import { NextRequest, NextResponse } from 'next/server';
import { problemService } from '@/lib/domain/problem-service';
import { getUserIdFromRequest } from '@/lib/auth';

// GET /api/problems/[id] - Get problem by ID
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: problemId } = await params;

    // Authenticate user
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Get problem
    const problem = await problemService.getProblem(problemId);
    if (!problem) {
      return NextResponse.json(
        { success: false, error: 'Problem not found' },
        { status: 404 }
      );
    }

    // Verify ownership
    if (problem.userId !== userId) {
      return NextResponse.json(
        { success: false, error: 'Problem not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        problemId: problem.id,
        normalizedText: problem.normalizedText,
        problemType: problem.problemType,
        knowledgePoints: problem.knowledgePoints,
        confidence: problem.confidence,
        needsManualConfirm: problem.confidence !== null && problem.confidence < 0.7,
      },
    });
  } catch (error) {
    console.error('Error getting problem:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to get problem' },
      { status: 500 }
    );
  }
}