// Claude AI Adapter
// TODO: Implement full Claude adapter for AI tutoring

export class ClaudeAdapter {
  async generateResponse(prompt: string): Promise<string> {
    // Stub: Return placeholder response
    return 'Claude response - not implemented';
  }

  async generateWithContext(context: unknown): Promise<string> {
    return 'Claude response with context - not implemented';
  }
}

export const claudeAdapter = new ClaudeAdapter();