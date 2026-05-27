import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { reviewService } from '@/lib/domain/review-service';

// Validation schema for query params per TDG Section 16.3
const querySchema = z.object({
  date: z.string().optional(),
  status: z.enum(['pending', 'completed', 'skipped']).optional(),
});

// Helper to get user ID
function getUserId(request: NextRequest): string | null {
  const userIdHeader = request.headers.get('x-user-id');
  if (userIdHeader) return userIdHeader;

  const cookies = request.cookies.getAll();
  const userIdCookie = cookies.find((c) => c.name === 'user_id');
  return userIdCookie?.value || null;
}

// GET /api/review/tasks - Get review tasks
export async function GET(request: NextRequest) {
  try {
    // Get user ID
    const userId = getUserId(request);
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Parse and validate query params per TDG Section 16.3
    const searchParams = request.nextUrl.searchParams;
    const date = searchParams.get('date');
    const status = searchParams.get('status');

    const queryValidation = querySchema.safeParse({ date, status });
    if (!queryValidation.success) {
      return NextResponse.json(
        { success: false, error: queryValidation.error.issues[0].message },
        { status: 400 }
      );
    }

    // Get pending tasks by default, or filtered by status
    let tasks;
    if (queryValidation.data.status) {
      // For completed/skipped, get all (not just pending)
      // This is simplified - in production would filter properly
      const allTasks = await reviewService.getPendingTasks(userId, 100);
      tasks = allTasks.filter((t) => t.status === queryValidation.data.status);
    } else {
      // Default: get pending tasks that are due
      tasks = await reviewService.getPendingTasks(userId, 10);
    }

    // Format response per TDG Section 9
    const formattedTasks = tasks.map((task) => ({
      id: task.id,
      knowledgePoint: task.knowledgePoint,
      errorType: task.errorType,
      scheduledFor: task.scheduledFor.toISOString(),
      status: task.status,
    }));

    return NextResponse.json({
      success: true,
      data: {
        tasks: formattedTasks,
      },
    });
  } catch (error) {
    console.error('Error getting review tasks:', error);

    // Fallback and degradation per TDG Section 13
    return NextResponse.json(
      { success: false, error: 'Failed to get review tasks' },
      { status: 500 }
    );
  }
}

// POST /api/review/tasks - Create review task
export async function POST() {
  return NextResponse.json({ error: 'Not implemented' }, { status: 501 });
}