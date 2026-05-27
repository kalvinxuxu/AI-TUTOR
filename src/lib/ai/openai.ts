// OpenAI AI Adapter
// TODO: Implement full OpenAI adapter for AI tutoring

export class OpenAIAdapter {
  async generateResponse(prompt: string): Promise<string> {
    // Stub: Return placeholder response
    return 'OpenAI response - not implemented';
  }

  async generateWithContext(context: unknown): Promise<string> {
    return 'OpenAI response with context - not implemented';
  }
}

export const openaiAdapter = new OpenAIAdapter();