"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ChevronLeft,
  CheckCircle,
  AlertCircle,
  Lightbulb,
  ArrowRight,
  Home,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface ResultData {
  sessionId: string;
  status: "completed" | "abandoned";
  completionType: "self" | "hint" | "solution";
  knowledgePoints: string[];
  errorTypes: string[];
  hintCount: number;
  suggestion: string;
}

const errorTypeLabels: Record<string, string> = {
  concept_error: "概念错误",
  reading_error: "审题错误",
  formula_misuse: "公式误用",
  step_skip: "跳步",
  calculation_error: "计算错误",
  sign_error: "符号错误",
};

const completionTypeLabels: Record<string, { label: string; color: string }> = {
  self: { label: "自主完成", color: "bg-green-100 text-green-700 border-green-200" },
  hint: { label: "提示后完成", color: "bg-amber-100 text-amber-700 border-amber-200" },
  solution: { label: "查看解析完成", color: "bg-slate-100 text-slate-700 border-slate-200" },
};

export default function ResultPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.id as string;

  const [result, setResult] = useState<ResultData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    const fetchResult = async () => {
      try {
        const response = await fetch(`/api/sessions/${sessionId}/result`);
        const data = await response.json();

        if (data.success && data.data) {
          setResult(data.data);
        } else {
          setResult(null);
        }
      } catch {
        setResult(null);
      } finally {
        setIsLoading(false);
      }
    };

    fetchResult();
  }, [sessionId]);

  const handleContinueProblem = async () => {
    setActionLoading("continue");
    router.push("/upload");
  };

  const handleViewReview = () => {
    router.push("/review");
  };

  const handleGoHome = () => {
    router.push("/");
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!result) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex flex-col items-center justify-center p-6">
        <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
        <p className="text-slate-700 mb-4">无法加载结果</p>
        <Button onClick={handleGoHome}>返回首页</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* Header - Completed Badge */}
      <header className="bg-white border-b border-slate-200 px-4 py-3 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={handleGoHome}>
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <span className="font-medium text-slate-900">已完成</span>
          <CheckCircle className="w-5 h-5 text-green-600 ml-auto" />
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        {/* Completion Status Card */}
        <Card className="border-slate-200">
          <CardContent className="p-6">
            <div className="text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-slate-900">本题已完成</h2>
                <Badge className={`mt-2 ${completionTypeLabels[result.completionType].color}`}>
                  {completionTypeLabels[result.completionType].label}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Details Card */}
        <Card className="border-slate-200">
          <CardContent className="p-6 space-y-5">
            {/* Completion Type */}
            <div className="space-y-2">
              <div className="text-sm font-medium text-slate-500">本次完成方式</div>
              <div className="flex items-center gap-2">
                <Badge className={completionTypeLabels[result.completionType].color}>
                  {completionTypeLabels[result.completionType].label}
                </Badge>
                {result.hintCount > 0 && (
                  <span className="text-sm text-slate-500">
                    （共获得 {result.hintCount} 次提示）
                  </span>
                )}
              </div>
            </div>

            {/* Knowledge Points */}
            <div className="space-y-2">
              <div className="text-sm font-medium text-slate-500">本次知识点</div>
              <div className="flex flex-wrap gap-2">
                {result.knowledgePoints.map((kp, index) => (
                  <Badge key={index} variant="secondary">
                    {kp}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Error Types */}
            {result.errorTypes.length > 0 && (
              <div className="space-y-2">
                <div className="text-sm font-medium text-slate-500">本次错因</div>
                <div className="flex flex-wrap gap-2">
                  {result.errorTypes.map((et, index) => (
                    <Badge key={index} variant="outline" className="text-amber-600 border-amber-200">
                      {errorTypeLabels[et] || et}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Suggestion */}
            <div className="space-y-2">
              <div className="text-sm font-medium text-slate-500">系统建议</div>
              <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 border border-blue-100">
                <Lightbulb className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
                <p className="text-sm text-blue-800">{result.suggestion}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="space-y-3 pt-4">
          <Button
            size="lg"
            className="w-full h-12 text-base"
            onClick={handleContinueProblem}
            disabled={actionLoading === "continue"}
          >
            {actionLoading === "continue" ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                继续做题
                <ArrowRight className="w-5 h-5 ml-2" />
              </>
            )}
          </Button>

          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1 h-11"
              onClick={handleViewReview}
            >
              查看今日复习
            </Button>
            <Button
              variant="outline"
              className="flex-1 h-11"
              onClick={handleGoHome}
            >
              <Home className="w-4 h-4 mr-1.5" />
              返回首页
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}