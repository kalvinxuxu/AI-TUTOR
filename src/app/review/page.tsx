"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Calendar,
  CheckCircle,
  SkipForward,
  Loader2,
  AlertCircle,
  Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface ReviewTask {
  id: string;
  knowledgePoint: string;
  errorType: string | null;
  scheduledFor: string;
  status: "pending" | "completed" | "skipped";
}

const errorTypeLabels: Record<string, string> = {
  concept_error: "概念错误",
  reading_error: "阅读错误",
  formula_misuse: "公式误用",
  step_skip: "跳步",
  calculation_error: "计算错误",
  sign_error: "符号错误",
};

export default function ReviewPage() {
  const [tasks, setTasks] = useState<ReviewTask[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "pending" | "completed" | "skipped">("pending");
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchTasks = useCallback(async () => {
    setIsLoading(true);
    try {
      const statusParam = filter === "all" ? "" : `?status=${filter}`;
      const response = await fetch(`/api/review/tasks${statusParam}`, {
        headers: { "x-user-id": "demo-user" },
      });

      const data = await response.json();

      if (data.success) {
        setTasks(data.data.tasks);
      } else {
        setError(data.error || "Failed to load review tasks");
      }
    } catch {
      setError("Failed to connect to server");
    } finally {
      setIsLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const handleMarkComplete = async (taskId: string) => {
    setActionLoading(taskId);
    try {
      // In production, this would call PATCH /api/review/tasks/[id]
      // For MVP, we simulate the action
      await new Promise((resolve) => setTimeout(resolve, 500));

      setTasks((prev) =>
        prev.map((t) =>
          t.id === taskId ? { ...t, status: "completed" as const } : t
        )
      );
    } catch {
      setError("Failed to update task");
    } finally {
      setActionLoading(null);
    }
  };

  const handleSkip = async (taskId: string) => {
    setActionLoading(taskId);
    try {
      // In production, this would call PATCH /api/review/tasks/[id]
      await new Promise((resolve) => setTimeout(resolve, 500));

      setTasks((prev) =>
        prev.map((t) =>
          t.id === taskId ? { ...t, status: "skipped" as const } : t
        )
      );
    } catch {
      setError("Failed to skip task");
    } finally {
      setActionLoading(null);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Tomorrow";
    if (diffDays === -1) return "Yesterday";

    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: diffDays > 365 || diffDays < -365 ? "numeric" : undefined,
    }).format(date);
  };

  const getDateColor = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return "text-red-600 bg-red-100 border-red-200";
    if (diffDays === 0) return "text-amber-600 bg-amber-100 border-amber-200";
    return "text-slate-600 bg-slate-100 border-slate-200";
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-slate-900">Review Tasks</h1>
            <p className="text-slate-600 mt-1">Master your weak areas through spaced repetition</p>
          </div>
          <Badge variant="secondary" className="text-sm px-3 py-1">
            {tasks.filter((t) => t.status === "pending").length} pending
          </Badge>
        </div>

        {/* Filters */}
        <Card className="border-slate-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              <Filter className="w-4 h-4 text-slate-500" />
              <div className="flex gap-1">
                <Button
                  variant={filter === "pending" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFilter("pending")}
                >
                  Pending
                </Button>
                <Button
                  variant={filter === "completed" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFilter("completed")}
                >
                  Completed
                </Button>
                <Button
                  variant={filter === "skipped" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFilter("skipped")}
                >
                  Skipped
                </Button>
                <Button
                  variant={filter === "all" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFilter("all")}
                >
                  All
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Error Message */}
        {error && (
          <div className="p-4 rounded-lg bg-red-100 text-red-700 border border-red-200 flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            {error}
          </div>
        )}

        {/* Task List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : tasks.length === 0 ? (
          <Card className="border-slate-200">
            <CardContent className="p-12 text-center">
              <CheckCircle className="w-12 h-12 mx-auto text-slate-300 mb-4" />
              <h3 className="text-lg font-medium text-slate-700">
                {filter === "pending"
                  ? "No pending review tasks"
                  : `No ${filter} tasks`}
              </h3>
              <p className="text-slate-500 mt-1">
                {filter === "pending"
                  ? "Great job! Check back later for new tasks."
                  : "Try a different filter to see more tasks."}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {tasks.map((task) => (
              <Card key={task.id} className="border-slate-200">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between gap-4">
                    {/* Task Info */}
                    <div className="flex-1 space-y-3">
                      {/* Knowledge Point */}
                      <div>
                        <Badge variant="secondary" className="text-sm">
                          {task.knowledgePoint}
                        </Badge>
                      </div>

                      {/* Error Type */}
                      {task.errorType && (
                        <div className="flex items-center gap-2 text-sm text-slate-600">
                          <span className="font-medium">Error Type:</span>
                          <Badge variant="outline" className="text-xs">
                            {errorTypeLabels[task.errorType] || task.errorType}
                          </Badge>
                        </div>
                      )}

                      {/* Scheduled Date */}
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-slate-400" />
                        <Badge
                          variant="outline"
                          className={`text-xs ${getDateColor(task.scheduledFor)}`}
                        >
                          {formatDate(task.scheduledFor)}
                        </Badge>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col gap-2">
                      {task.status === "pending" && (
                        <>
                          <Button
                            size="sm"
                            onClick={() => handleMarkComplete(task.id)}
                            disabled={actionLoading === task.id}
                          >
                            {actionLoading === task.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <>
                                <CheckCircle className="w-4 h-4 mr-1" />
                                Complete
                              </>
                            )}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleSkip(task.id)}
                            disabled={actionLoading === task.id}
                          >
                            <SkipForward className="w-4 h-4 mr-1" />
                            Skip
                          </Button>
                        </>
                      )}
                      {task.status === "completed" && (
                        <Badge variant="default" className="bg-green-100 text-green-700 border-green-200">
                          <CheckCircle className="w-3 h-3 mr-1" />
                          Completed
                        </Badge>
                      )}
                      {task.status === "skipped" && (
                        <Badge variant="secondary" className="bg-amber-100 text-amber-700 border-amber-200">
                          <SkipForward className="w-3 h-3 mr-1" />
                          Skipped
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}