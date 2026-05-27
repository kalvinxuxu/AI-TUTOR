// Review Service
// TODO: Implement full review service for task review

export class ReviewService {
  async getTasks(): Promise<unknown[]> {
    return [];
  }

  async createTask(data: unknown): Promise<unknown> {
    return data;
  }

  async updateTaskStatus(taskId: string, status: string): Promise<unknown> {
    return { taskId, status };
  }
}

export const reviewService = new ReviewService();