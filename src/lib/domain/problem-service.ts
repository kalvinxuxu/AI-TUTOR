/**
 * Problem Service
 * Handles problem creation, OCR integration, and text normalization
 * Ref: TDG Section 6 (Problem Service)
 */

import { v4 as uuidv4 } from 'uuid';
import { Problem } from '@/types/domain';
import { extractProblemText, extractProblemTextFromBase64 } from '@/lib/ai/gemini';
import { supabase } from '@/lib/supabase/client';

/**
 * Create a new problem from image upload
 * @param userId - The user ID
 * @param imageUrl - URL of the uploaded image (or base64 data URL)
 * @param source - Source identifier (e.g., 'upload', 'camera')
 * @returns The created Problem record
 */
export async function createProblemFromImage(
  userId: string,
  imageUrl: string,
  source: string = 'upload'
): Promise<Problem> {
  // Step 1: Call OCR Adapter to extract problem text
  let ocrResult;

  if (imageUrl.startsWith('data:')) {
    // Handle base64 image data
    const base64Match = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (base64Match) {
      const mimeType = base64Match[1];
      const base64Data = base64Match[2];
      ocrResult = await extractProblemTextFromBase64(base64Data, mimeType);
    } else {
      throw new Error('Invalid base64 image format');
    }
  } else {
    // Handle image URL
    ocrResult = await extractProblemText(imageUrl);
  }

  // Step 2: Normalize problem text (basic cleaning)
  const normalizedText = normalizeProblemText(ocrResult.normalizedText);

  // Step 3: Create problem record
  const problemId = uuidv4();
  const now = new Date();

  const problem: Problem = {
    id: problemId,
    userId,
    originalImageUrl: imageUrl,
    ocrText: ocrResult.normalizedText,
    normalizedText,
    problemType: ocrResult.problemType,
    knowledgePoints: ocrResult.knowledgePoints,
    difficulty: null,
    confidence: ocrResult.confidence,
    source,
    createdAt: now,
  };

  // Step 4: Write to database (if supabase is configured)
  if (supabase) {
    const { error } = await supabase.from('problems').insert({
      id: problem.id,
      user_id: problem.userId,
      original_image_url: problem.originalImageUrl,
      ocr_text: problem.ocrText,
      normalized_text: problem.normalizedText,
      problem_type: problem.problemType,
      knowledge_points: problem.knowledgePoints,
      difficulty: problem.difficulty,
      confidence: problem.confidence,
      source: problem.source,
      created_at: problem.createdAt.toISOString(),
    });

    if (error) {
      console.error('Failed to persist problem to Supabase:', error);
      // Continue anyway - we still have the in-memory record
    }
  }

  return problem;
}

/**
 * Normalize problem text by cleaning up common OCR artifacts
 * @param text - Raw OCR text
 * @returns Cleaned and normalized text
 */
function normalizeProblemText(text: string): string {
  return text
    // Remove multiple spaces
    .replace(/\s+/g, ' ')
    // Fix common OCR mistakes
    .replace(/[|]/g, 'l')
    .replace(/[0O]/g, (match, offset, str) => {
      // Context-aware replacement: if surrounded by numbers, likely 0
      const before = str[offset - 1];
      const after = str[offset + 1];
      if (/\d/.test(before) && /\d/.test(after)) return '0';
      return match;
    })
    // Fix line break issues in formulas
    .replace(/-\n/g, '-')
    .replace(/\n+/g, '\n')
    .trim();
}

/**
 * Get a problem by ID
 * @param id - Problem ID
 * @returns Problem record or null
 */
export async function getProblem(id: string): Promise<Problem | null> {
  if (supabase) {
    const { data, error } = await supabase
      .from('problems')
      .select('*')
      .eq('id', id)
      .single();

    if (!error && data) {
      return {
        id: data.id,
        userId: data.user_id,
        originalImageUrl: data.original_image_url,
        ocrText: data.ocr_text,
        normalizedText: data.normalized_text,
        problemType: data.problem_type,
        knowledgePoints: data.knowledge_points || [],
        difficulty: data.difficulty,
        confidence: data.confidence,
        source: data.source,
        createdAt: new Date(data.created_at),
      };
    }
  }

  return null;
}

/**
 * List problems for a user
 * @param userId - User ID
 * @param limit - Maximum number of results
 * @returns Array of Problem records
 */
export async function listProblems(
  userId: string,
  limit: number = 50
): Promise<Problem[]> {
  if (supabase) {
    const { data, error } = await supabase
      .from('problems')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (!error && data) {
      return data.map(row => ({
        id: row.id,
        userId: row.user_id,
        originalImageUrl: row.original_image_url,
        ocrText: row.ocr_text,
        normalizedText: row.normalized_text,
        problemType: row.problem_type,
        knowledgePoints: row.knowledge_points || [],
        difficulty: row.difficulty,
        confidence: row.confidence,
        source: row.source,
        createdAt: new Date(row.created_at),
      }));
    }
  }

  return [];
}

/**
 * Update problem metadata (e.g., after evaluation)
 * @param id - Problem ID
 * @param updates - Fields to update
 */
export async function updateProblem(
  id: string,
  updates: Partial<Pick<Problem, 'problemType' | 'knowledgePoints' | 'difficulty'>>
): Promise<void> {
  if (supabase) {
    const dbUpdates: Record<string, unknown> = {};
    if (updates.problemType !== undefined) dbUpdates.problem_type = updates.problemType;
    if (updates.knowledgePoints !== undefined) dbUpdates.knowledge_points = updates.knowledgePoints;
    if (updates.difficulty !== undefined) dbUpdates.difficulty = updates.difficulty;

    await supabase.from('problems').update(dbUpdates).eq('id', id);
  }
}

// Problem Service class for dependency injection
export class ProblemService {
  async createProblemFromImage(userId: string, imageUrl: string, source?: string): Promise<Problem> {
    return createProblemFromImage(userId, imageUrl, source);
  }

  async getProblem(id: string): Promise<Problem | null> {
    return getProblem(id);
  }

  async listProblems(userId: string, limit?: number): Promise<Problem[]> {
    return listProblems(userId, limit);
  }

  async updateProblem(id: string, updates: Partial<Pick<Problem, 'problemType' | 'knowledgePoints' | 'difficulty'>>): Promise<void> {
    return updateProblem(id, updates);
  }
}

export const problemService = new ProblemService();