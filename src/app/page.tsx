"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Sparkles, Clock, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface ReviewTaskCount {
  pending: number;
}

interface LastSession {
  id: string;
  problemText: string;
  status: "completed" | "abandoned";
  hintCount: number;
  knowledgePoints: string[];
}

export default function HomePage() {
  const router = useRouter();
  const [reviewCount, setReviewCount] = useState<ReviewTaskCount | null>(null);
  const [lastSession, setLastSession] = useState<LastSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch review task count
        const reviewRes = await fetch("/api/review/tasks?status=pending", {
          headers: { "x-user-id": "demo-user" },
        });
        const reviewData = await reviewRes.json();
        if (reviewData.success) {
          setReviewCount({ pending: reviewData.data.tasks.length });
        }

        // Mock last session for MVP
        // In production, this would fetch from /api/sessions/last or similar
        setLastSession({
          id: "session-demo-1",
          problemText: "一元二次方程",
          status: "completed",
          hintCount: 2,
          knowledgePoints: ["方程与函数"],
        });
      } catch {
        // Silently handle - show empty state
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  const handleStartProblem = () => {
    router.push("/upload");
  };

  const handleViewReview = () => {
    router.push("/review");
  };

  const handleViewRecord = () => {
    router.push("/history");
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex items-center justify-center">
        <div className="text-slate-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 max-w-2xl mx-auto">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-medium text-slate-900">AI Tutor</span>
        </div>
        <div className="w-8 h-8 rounded-full bg-slate-200" />
      </header>

      {/* Main Content */}
      <main className="max-w-2xl mx-auto px-6 py-16">
        {/* Hero Section */}
        <div className="text-center space-y-8 mb-12">
          <h1 className="text-3xl font-semibold text-slate-900 tracking-tight">
            初中数学 AI Tutor
          </h1>
          <p className="text-slate-600">
            遇到难题不会做？先思考，再提示，一步步带你做出来
          </p>

          {/* Main CTA */}
          <Button
            size="lg"
            onClick={handleStartProblem}
            className="h-14 px-8 text-base font-medium rounded-xl"
          >
            <Sparkles className="w-5 h-5 mr-2" />
            开始做题
          </Button>
        </div>

        {/* Review Entry Card */}
        <Card className="mb-4 border-slate-200 cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all"
              onClick={handleViewReview}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
                  <Clock className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <div className="font-medium text-slate-900">今日复习</div>
                  <div className="text-sm text-slate-500">
                    {reviewCount?.pending && reviewCount.pending > 0
                      ? `${reviewCount.pending} 个待复习任务`
                      : "暂无复习任务"}
                  </div>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-slate-400" />
            </div>
          </CardContent>
        </Card>

        {/* Last Session Card */}
        {lastSession && (
          <Card className="border-slate-200">
            <CardContent className="p-4 space-y-3">
              <div className="text-sm font-medium text-slate-500">最近一次学习</div>

              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-slate-900 truncate">
                    {lastSession.problemText}
                  </div>
                  <div className="text-sm text-slate-500 mt-1">
                    {lastSession.status === "completed" ? (
                      <span className="inline-flex items-center gap-1 text-green-600">
                        <CheckCircle className="w-3.5 h-3.5" />
                        提示{lastSession.hintCount}次完成
                      </span>
                    ) : (
                      <span className="text-amber-600">未完成</span>
                    )}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleViewRecord();
                  }}
                  className="text-slate-500 hover:text-slate-900"
                >
                  查看记录
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* First-time user hint */}
        {!lastSession && reviewCount?.pending === 0 && (
          <Card className="border-slate-200 bg-slate-50">
            <CardContent className="p-6 text-center">
              <div className="text-slate-600 text-sm">
                <p className="mb-2">还没有学习记录</p>
                <p className="text-slate-500">点击上方「开始做题」上传你的第一道数学题</p>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}