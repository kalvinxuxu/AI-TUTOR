import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { reviewService } from '@/lib/domain/review-service';
import { getUserIdFromRequest } from '@/lib/auth';

const updateSchema = z.object({
  action: z.enum(['complete', 'skip']),
});

// PATCH /api/review/tasks/[id] - Mark task as complete or skip
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Get user ID for auth
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Parse request body
    const body = await request.json();
    const validation = updateSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error.issues[0].message },
        { status: 400 }
      );
    }

    const { id } = await params;
    const { action } = validation.data;

    // Call the appropriate service method
    if (action === 'complete') {
      await reviewService.completeTask(id);
    } else {
      await reviewService.skipTask(id);
    }

    return NextResponse.json({
      success: true,
      data: { id, status: action === 'complete' ? 'completed' : 'skipped' },
    });
  } catch (error) {
    console.error('Error updating review task:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update review task' },
      { status: 500 }
    );
  }
}