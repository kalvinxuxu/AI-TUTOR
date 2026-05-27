import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { problemService } from '@/lib/domain/problem-service';

// Validation schema per TDG Section 16.3
const imageValidationSchema = z.object({
  image: z
    .instanceof(File)
    .refine((file) => {
      const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
      return validTypes.includes(file.type);
    }, 'Invalid image type. Supported: JPEG, PNG, GIF, WEBP')
    .refine((file) => {
      const maxSize = 10 * 1024 * 1024; // 10MB
      return file.size <= maxSize;
    }, 'Image size must be less than 10MB'),
});

// Helper to get user ID (simplified - would use real auth in production)
function getUserId(request: NextRequest): string | null {
  // Check header first
  const userIdHeader = request.headers.get('x-user-id');
  if (userIdHeader) return userIdHeader;

  // Check cookie
  const cookies = request.cookies.getAll();
  const userIdCookie = cookies.find((c) => c.name === 'user_id');
  return userIdCookie?.value || null;
}

// POST /api/problems - Create new problem from image
export async function POST(request: NextRequest) {
  try {
    // Get user ID
    const userId = getUserId(request);
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Parse FormData
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid form data' },
        { status: 400 }
      );
    }

    const image = formData.get('image');
    if (!image || !(image instanceof File)) {
      return NextResponse.json(
        { success: false, error: 'Image file is required' },
        { status: 400 }
      );
    }

    // Validate image per TDG Section 16.3
    const validation = imageValidationSchema.safeParse({ image });
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error.issues[0].message },
        { status: 400 }
      );
    }

    // Convert image to data URL for processing
    const arrayBuffer = await image.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    const dataUrl = `data:${image.type};base64,${base64}`;

    // Call Problem Service
    const problem = await problemService.createProblemFromImage(
      userId,
      dataUrl,
      'upload'
    );

    // Determine if needs manual confirmation (low confidence or unknown type)
    const needsManualConfirm =
      problem.confidence !== null && problem.confidence < 0.7;

    return NextResponse.json({
      success: true,
      data: {
        problemId: problem.id,
        normalizedText: problem.normalizedText,
        problemType: problem.problemType,
        knowledgePoints: problem.knowledgePoints,
        confidence: problem.confidence,
        needsManualConfirm,
      },
    });
  } catch (error) {
    console.error('Error creating problem:', error);

    // Fallback and degradation per TDG Section 13
    if (error instanceof Error) {
      if (error.message.includes('OCR') || error.message.includes('AI')) {
        return NextResponse.json(
          {
            success: false,
            error: 'Problem analysis temporarily unavailable. Please try again.',
          },
          { status: 503 }
        );
      }
    }

    return NextResponse.json(
      { success: false, error: 'Failed to process problem' },
      { status: 500 }
    );
  }
}