// Gemini AI Adapter
// TODO: Implement full Gemini adapter for AI tutoring

export class GeminiAdapter {
  async generateResponse(prompt: string): Promise<string> {
    // Stub: Return placeholder response
    return 'Gemini response - not implemented';
  }

  async generateWithContext(context: unknown): Promise<string> {
    return 'Gemini response with context - not implemented';
  }
}

export const geminiAdapter = new GeminiAdapter();