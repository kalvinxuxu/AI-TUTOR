// Session Service
// TODO: Implement full session service for tutoring sessions

export class SessionService {
  async createSession(problemId: string): Promise<unknown> {
    return { id: 'stub-session-id', problemId };
  }

  async getSession(id: string): Promise<unknown> {
    return { id };
  }

  async addMessage(sessionId: string, message: unknown): Promise<unknown> {
    return { sessionId, message };
  }

  async getMessages(sessionId: string): Promise<unknown[]> {
    return [];
  }
}

export const sessionService = new SessionService();