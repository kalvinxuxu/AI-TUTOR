"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  CheckCircle,
  SkipForward,
  Loader2,
  AlertCircle,
  Calendar,
  Clock,
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
  reading_error: "审题错误",
  formula_misuse: "公式误用",
  step_skip: "跳步",
  calculation_error: "计算错误",
  sign_error: "符号错误",
};

export default function ReviewPage() {
  const router = useRouter();
  const [tasks, setTasks] = useState<ReviewTask[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchTasks = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/review/tasks?status=pending", {
        headers: { "x-user-id": "demo-user" },
      });

      const data = await response.json();

      if (data.success) {
        setTasks(data.data.tasks);
      }
    } catch {
      // Silently handle
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const handleMarkComplete = async (taskId: string) => {
    setActionLoading(taskId);
    try {
      const response = await fetch(`/api/review/tasks/${taskId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': 'demo-user',
        },
        body: JSON.stringify({ action: 'complete' }),
      });

      if (response.ok) {
        setTasks((prev) =>
          prev.map((t) =>
            t.id === taskId ? { ...t, status: 'completed' as const } : t
          )
        );
      }
    } catch {
      // Handle error silently
    } finally {
      setActionLoading(null);
    }
  };

  const handleSkip = async (taskId: string) => {
    setActionLoading(taskId);
    try {
      const response = await fetch(`/api/review/tasks/${taskId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': 'demo-user',
        },
        body: JSON.stringify({ action: 'skip' }),
      });

      if (response.ok) {
        setTasks((prev) =>
          prev.map((t) =>
            t.id === taskId ? { ...t, status: 'skipped' as const } : t
          )
        );
      }
    } catch {
      // Handle error silently
    } finally {
      setActionLoading(null);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor(
      (date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (diffDays === 0) return "今天";
    if (diffDays === 1) return "明天";
    if (diffDays === -1) return "昨天";

    return new Intl.DateTimeFormat("zh-CN", {
      month: "short",
      day: "numeric",
    }).format(date);
  };

  const pendingCount = tasks.filter((t) => t.status === "pending").length;
  const completedCount = tasks.filter((t) => t.status === "completed").length;
  const totalCount = tasks.length;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-4 py-3 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push("/")}>
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <span className="font-medium text-slate-900">今日复习</span>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-2xl mx-auto px-6 py-6 space-y-6">
        {/* Summary Card */}
        <Card className="border-slate-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-slate-500">今日共 {totalCount} 个任务</div>
                <div className="text-lg font-semibold text-slate-900 mt-1">
                  已完成 {completedCount} / {totalCount}
                </div>
              </div>
              <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center">
                <Clock className="w-6 h-6 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Task List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : tasks.length === 0 ? (
          <Card className="border-slate-200">
            <CardContent className="p-8 text-center">
              <CheckCircle className="w-12 h-12 mx-auto text-slate-300 mb-4" />
              <h3 className="text-lg font-medium text-slate-700">暂无复习任务</h3>
              <p className="text-slate-500 mt-1 text-sm">
                完成一些题目后，这里会出现复习任务
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {tasks.map((task) => (
              <Card
                key={task.id}
                className={`border-slate-200 ${
                  task.status === "completed"
                    ? "bg-green-50 border-green-200"
                    : task.status === "skipped"
                    ? "bg-slate-50 border-slate-200 opacity-60"
                    : ""
                }`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    {/* Task Info */}
                    <div className="flex-1 space-y-2">
                      {/* Knowledge Point */}
                      <Badge variant="secondary" className="text-sm">
                        {task.knowledgePoint}
                      </Badge>

                      {/* Error Type */}
                      {task.errorType && (
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-slate-500">错因：</span>
                          <Badge variant="outline" className="text-xs text-amber-600 border-amber-200">
                            {errorTypeLabels[task.errorType] || task.errorType}
                          </Badge>
                        </div>
                      )}

                      {/* Scheduled Date */}
                      <div className="flex items-center gap-1.5 text-xs text-slate-500">
                        <Calendar className="w-3.5 h-3.5" />
                        {formatDate(task.scheduledFor)}
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
                            className="bg-green-600 hover:bg-green-700"
                          >
                            {actionLoading === task.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <>
                                <CheckCircle className="w-4 h-4 mr-1" />
                                完成
                              </>
                            )}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleSkip(task.id)}
                            disabled={actionLoading === task.id}
                            className="text-xs"
                          >
                            <SkipForward className="w-3.5 h-3.5 mr-1" />
                            跳过
                          </Button>
                        </>
                      )}
                      {task.status === "completed" && (
                        <Badge className="bg-green-100 text-green-700 border-green-200">
                          <CheckCircle className="w-3 h-3 mr-1" />
                          已完成
                        </Badge>
                      )}
                      {task.status === "skipped" && (
                        <Badge variant="secondary" className="bg-amber-100 text-amber-700 border-amber-200">
                          <SkipForward className="w-3 h-3 mr-1" />
                          已跳过
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Action Button */}
        {!isLoading && tasks.length > 0 && (
          <div className="pt-4">
            <Button
              size="lg"
              className="w-full"
              onClick={() => router.push("/upload")}
            >
              开始新题目
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}