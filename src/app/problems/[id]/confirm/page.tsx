"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ChevronLeft,
  CheckCircle,
  AlertCircle,
  Loader2,
  Pencil,
  RefreshCw,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

interface ProblemData {
  problemId: string;
  normalizedText: string;
  problemType: string | null;
  knowledgePoints: string[];
  confidence: number;
  needsManualConfirm: boolean;
}

export default function OCRConfirmPage() {
  const params = useParams();
  const router = useRouter();
  const problemId = params.id as string;

  const [problem, setProblem] = useState<ProblemData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState("");
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchProblem = useCallback(async () => {
    try {
      const response = await fetch(`/api/problems/${problemId}`);
      const data = await response.json();

      if (data.success && data.data) {
        setProblem({
          problemId: data.data.problemId,
          normalizedText: data.data.normalizedText,
          problemType: data.data.problemType,
          knowledgePoints: data.data.knowledgePoints,
          confidence: data.data.confidence,
          needsManualConfirm: data.data.needsManualConfirm,
        });
      } else {
        setError(data.error || "无法加载题目信息");
      }
    } catch {
      setError("网络错误，请重试");
    } finally {
      setIsLoading(false);
    }
  }, [problemId]);

  useEffect(() => {
    fetchProblem();
  }, [fetchProblem]);

  const handleEdit = () => {
    if (problem) {
      setEditedText(problem.normalizedText);
      setIsEditing(true);
    }
  };

  const handleSaveEdit = () => {
    if (problem) {
      setProblem({ ...problem, normalizedText: editedText, needsManualConfirm: true });
      setIsEditing(false);
    }
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditedText("");
  };

  const handleReupload = () => {
    router.push("/upload");
  };

  const handleStartSession = async () => {
    setIsStarting(true);
    try {
      const response = await fetch("/api/sessions/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": "demo-user",
        },
        body: JSON.stringify({ problemId }),
      });

      const data = await response.json();

      if (data.success) {
        router.push(`/session/${data.data.sessionId}`);
      } else {
        setError(data.error || "无法开始会话");
        setIsStarting(false);
      }
    } catch {
      setError("网络错误，请重试");
      setIsStarting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error && !problem) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex flex-col items-center justify-center p-6">
        <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
        <p className="text-slate-700 mb-4">{error}</p>
        <Button onClick={handleReupload}>重新上传</Button>
      </div>
    );
  }

  if (!problem) return null;

  const isLowConfidence = problem.confidence < 0.7;
  const showConfirmButton = problem.needsManualConfirm || isLowConfidence;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-4 py-3 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push("/upload")}>
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <span className="font-medium text-slate-900">识别结果</span>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        {/* OCR Result Card */}
        <Card className={isLowConfidence ? "border-amber-200" : "border-green-200"}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                {isLowConfidence ? (
                  <AlertCircle className="w-5 h-5 text-amber-600" />
                ) : (
                  <CheckCircle className="w-5 h-5 text-green-600" />
                )}
                识别结果
              </CardTitle>
              <Badge variant={isLowConfidence ? "secondary" : "default"}
                     className={isLowConfidence ? "bg-amber-100 text-amber-700 border-amber-200" : ""}>
                置信度 {Math.round(problem.confidence * 100)}%
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Problem Text Display/Edit */}
            {isEditing ? (
              <div className="space-y-3">
                <Label className="text-slate-700">编辑题目内容</Label>
                <textarea
                  value={editedText}
                  onChange={(e) => setEditedText(e.target.value)}
                  className="w-full h-32 p-3 rounded-lg border border-slate-300 bg-white text-slate-900 resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder="请输入或修改题目内容..."
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleSaveEdit}>
                    保存
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleCancelEdit}>
                    取消
                  </Button>
                </div>
              </div>
            ) : (
              <div
                className={`p-4 rounded-lg ${
                  isLowConfidence ? "bg-amber-50 border border-amber-200" : "bg-green-50 border border-green-200"
                }`}
              >
                <p className="text-slate-800 whitespace-pre-wrap leading-relaxed">
                  {problem.normalizedText}
                </p>
              </div>
            )}

            {/* Low Confidence Warning */}
            {isLowConfidence && !isEditing && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
                <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                <p className="text-sm text-amber-800">
                  识别置信度较低，请先确认题目内容是否正确
                </p>
              </div>
            )}

            {/* Problem Type */}
            {problem.problemType && (
              <div className="space-y-2">
                <Label className="text-slate-700">题目类型</Label>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">{problem.problemType}</Badge>
                </div>
              </div>
            )}

            {/* Knowledge Points */}
            {problem.knowledgePoints.length > 0 && (
              <div className="space-y-2">
                <Label className="text-slate-700">知识点</Label>
                <div className="flex flex-wrap gap-2">
                  {problem.knowledgePoints.map((kp, index) => (
                    <Badge key={index} variant="outline">
                      {kp}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            {!isEditing && (
              <div className="flex gap-3 pt-2">
                <Button variant="outline" size="sm" onClick={handleEdit} className="gap-1.5">
                  <Pencil className="w-4 h-4" />
                  编辑题目
                </Button>
                <Button variant="outline" size="sm" onClick={handleReupload} className="gap-1.5">
                  <RefreshCw className="w-4 h-4" />
                  重新上传
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Start Session Button */}
        <div className="pt-4">
          <Button
            size="lg"
            className="w-full h-12 text-base"
            onClick={handleStartSession}
            disabled={isStarting}
          >
            {isStarting ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                正在进入...
              </>
            ) : showConfirmButton ? (
              <>
                确认题目并开始
                <ArrowRight className="w-5 h-5 ml-2" />
              </>
            ) : (
              <>
                开始做题
                <ArrowRight className="w-5 h-5 ml-2" />
              </>
            )}
          </Button>
        </div>
      </main>
    </div>
  );
}