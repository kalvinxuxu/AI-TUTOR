// Problem Service
// TODO: Implement full problem service for problem management

export class ProblemService {
  async getProblem(id: string): Promise<unknown> {
    return { id, title: 'Problem stub' };
  }

  async listProblems(): Promise<unknown[]> {
    return [];
  }

  async createProblem(data: unknown): Promise<unknown> {
    return data;
  }
}

export const problemService = new ProblemService();