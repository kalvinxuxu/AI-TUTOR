import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { problemService } from '@/lib/domain/problem-service';
import { getUserIdFromRequest } from '@/lib/auth';

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

// POST /api/problems - Create new problem from image
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
    // Return 503 for OCR-related errors (most errors here are from Tencent OCR)
    if (error instanceof Error) {
      const isOcrError =
        error.message.includes('OCR') ||
        error.message.includes('AI') ||
        error.message.includes('Tencent') ||
        error.message.includes('credential') ||
        error.message.includes('configured') ||
        error.message.includes('network') ||
        error.message.includes('timeout') ||
        error.message.includes('Failed to persist');

      if (isOcrError) {
        return NextResponse.json(
          {
            success: false,
            error: 'Problem analysis temporarily unavailable. Please try again.',
            detail: error.message,
          },
          { status: 503 }
        );
      }
    }

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to process problem',
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}