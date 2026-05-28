"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Send,
  Lightbulb,
  Eye,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface Message {
  id: string;
  role: "student" | "assistant" | "system";
  content: string;
  tutorState?: string | null;
  createdAt?: string;
}

interface EvaluationResult {
  correctness: "correct" | "partial" | "incorrect";
  understandingLevel: string;
  primaryErrorType: string | null;
  feedback: string;
  nextAction: string;
}

interface ProblemInfo {
  normalizedText: string;
  problemType: string | null;
  knowledgePoints: string[];
}

const tutorStateLabels: Record<string, string> = {
  observe: "观察模式",
  hint: "提示模式",
  encourage: "鼓励模式",
  simplify: "简化模式",
  challenge: "挑战模式",
  explain: "解释模式",
};

const correctnessColors: Record<string, string> = {
  correct: "bg-green-50 border-green-200 text-green-800",
  partial: "bg-amber-50 border-amber-200 text-amber-800",
  incorrect: "bg-red-50 border-red-200 text-red-800",
};

const correctnessLabels: Record<string, string> = {
  correct: "正确",
  partial: "部分正确",
  incorrect: "需要改进",
};

const MAX_HINT_LEVEL = 5;

export default function SessionPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.id as string;

  const [problem, setProblem] = useState<ProblemInfo | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [studentInput, setStudentInput] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [tutorState, setTutorState] = useState("observe");
  const [hintLevel, setHintLevel] = useState(1);
  const [consecutiveFails, setConsecutiveFails] = useState(0);
  const [lastEvaluation, setLastEvaluation] = useState<EvaluationResult | null>(null);
  const [sessionStatus, setSessionStatus] = useState<string>("active");
  const [error, setError] = useState<string | null>(null);
  const [problemCollapsed, setProblemCollapsed] = useState(true);
  const [showSolution, setShowSolution] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const fetchMessages = useCallback(async () => {
    try {
      const response = await fetch(`/api/sessions/${sessionId}/messages`, {
        headers: { "x-user-id": "00000000-0000-0000-0000-000000000000" },
      });
      const data = await response.json();

      if (data.success) {
        setMessages(data.data.messages);
        setSessionStatus(data.data.sessionStatus || "active");
        // Set real problem data from API
        if (data.data.problem) {
          setProblem(data.data.problem);
        }
      } else {
        if (response.status === 404) {
          setError("本次学习会话已失效，请重新上传题目开始。");
          setSessionStatus("expired");
        } else {
          setError(data.error || "加载消息失败");
        }
      }
    } catch {
      setError("无法加载会话消息");
    } finally {
      setIsLoading(false);
    }
  }, [sessionId]);

  // Fetch problem and messages on mount
  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Show solution button only after 2+ consecutive failures
  useEffect(() => {
    if (consecutiveFails >= 2) {
      setShowSolution(true);
    }
  }, [consecutiveFails]);

  const handleSubmitStep = async () => {
    if (!studentInput.trim() || isSending) return;

    const inputToSend = studentInput.trim();
    setStudentInput("");
    setIsSending(true);
    setIsEvaluating(true);
    setLastEvaluation(null);
    setError(null);

    try {
      const evalResponse = await fetch(`/api/sessions/${sessionId}/evaluate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": "00000000-0000-0000-0000-000000000000",
        },
        body: JSON.stringify({ studentInput: inputToSend }),
      });

      const evalData = await evalResponse.json();

      if (evalData.success) {
        setLastEvaluation(evalData.data);
        // Update consecutive fail/success counters
        if (evalData.data.correctness === "incorrect") {
          setConsecutiveFails((prev) => prev + 1);
        } else {
          setConsecutiveFails(0);
        }
      }

      const response = await fetch(`/api/sessions/${sessionId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": "00000000-0000-0000-0000-000000000000",
        },
        body: JSON.stringify({ input: inputToSend }),
      });

      const data = await response.json();

      if (data.success) {
        setTutorState(data.data.tutorState || "observe");
        setHintLevel(data.data.hintLevel || 1);
        setSessionStatus(data.data.sessionStatus || "active");
        await fetchMessages();
      } else {
        setError(data.error || "发送消息失败");
      }
    } catch {
      setError("与 Tutor 通信失败");
    } finally {
      setIsSending(false);
      setIsEvaluating(false);
      inputRef.current?.focus();
    }
  };

  const handleHint = async () => {
    if (isSending || hintLevel >= MAX_HINT_LEVEL) return;

    setIsSending(true);
    setError(null);

    try {
      const response = await fetch(`/api/sessions/${sessionId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": "00000000-0000-0000-0000-000000000000",
        },
        body: JSON.stringify({ input: "", action: "hint" }),
      });

      const data = await response.json();

      if (data.success) {
        setTutorState(data.data.tutorState || "hint");
        setHintLevel(data.data.hintLevel || Math.min(hintLevel + 1, MAX_HINT_LEVEL));
        await fetchMessages();
      } else {
        setError(data.error || "获取提示失败");
      }
    } catch {
      setError("获取提示失败");
    } finally {
      setIsSending(false);
    }
  };

  const handleGiveUp = async () => {
    if (!confirm("确定要放弃吗？会话将结束。")) {
      return;
    }

    setIsSending(true);
    try {
      const response = await fetch(`/api/sessions/${sessionId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": "00000000-0000-0000-0000-000000000000",
        },
        body: JSON.stringify({ input: "", action: "give_up" }),
      });

      const data = await response.json();

      if (data.success) {
        setSessionStatus("abandoned");
        await fetchMessages();
      }
    } catch {
      setError("结束会话失败");
    } finally {
      setIsSending(false);
    }
  };

  const handleSeeSolution = async () => {
    if (!confirm("查看详细解析？你仍然可以从中学习！")) {
      return;
    }

    setIsSending(true);
    try {
      const response = await fetch(`/api/sessions/${sessionId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": "00000000-0000-0000-0000-000000000000",
        },
        body: JSON.stringify({ input: "", action: "see_solution" }),
      });

      const data = await response.json();

      if (data.success) {
        setTutorState("explain");
        setHintLevel(MAX_HINT_LEVEL);
        setSessionStatus("completed");
        await fetchMessages();
      }
    } catch {
      setError("查看解析失败");
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmitStep();
    }
  };

  const handleBack = () => {
    router.push("/history");
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-4 py-3 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={handleBack}>
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <span className="font-medium text-slate-900">当前题目</span>
          </div>
          <Badge variant="outline" className="flex items-center gap-1">
            <ChevronDown className="w-3 h-3" />
          </Badge>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden">
        <div className="max-w-2xl mx-auto h-full flex flex-col p-4">
          {/* Problem Card - Collapsible */}
          {problem && (
            <Card className="mb-4 border-slate-200">
              <button
                className="w-full p-4 flex items-center justify-between text-left"
                onClick={() => setProblemCollapsed(!problemCollapsed)}
              >
                <span className="font-medium text-slate-700 text-sm">题目内容</span>
                {problemCollapsed ? (
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                ) : (
                  <ChevronUp className="w-4 h-4 text-slate-400" />
                )}
              </button>
              {!problemCollapsed && (
                <CardContent className="pt-0">
                  <p className="text-slate-800 whitespace-pre-wrap leading-relaxed">
                    {problem.normalizedText}
                  </p>
                  {problem.problemType && (
                    <Badge variant="secondary" className="mt-2">
                      {problem.problemType}
                    </Badge>
                  )}
                </CardContent>
              )}
            </Card>
          )}

          {/* Chat Area */}
          <div className="flex-1 overflow-y-auto space-y-4 mb-4">
            {isLoading ? (
              <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : messages.length === 0 ? (
              <div className="flex items-center justify-center h-64 text-slate-500 text-sm">
                准备好后，请输入你的解题步骤或想法
              </div>
            ) : (
              messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${
                    message.role === "student" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                      message.role === "student"
                        ? "bg-primary text-primary-foreground"
                        : message.role === "system"
                        ? "bg-amber-50 text-amber-900 border border-amber-200"
                        : "bg-white border border-slate-200 text-slate-900"
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{message.content}</p>
                    {message.role === "assistant" && message.tutorState && (
                      <div className="mt-2 pt-2 border-t border-slate-200/30">
                        <Badge variant="outline" className="text-xs">
                          {tutorStateLabels[message.tutorState] || message.tutorState}
                        </Badge>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}

            {/* Last Evaluation Result */}
            {lastEvaluation && (
              <div className="flex justify-end">
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 border ${correctnessColors[lastEvaluation.correctness]}`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    {lastEvaluation.correctness === "correct" && (
                      <CheckCircle className="w-4 h-4" />
                    )}
                    {lastEvaluation.correctness === "incorrect" && (
                      <XCircle className="w-4 h-4" />
                    )}
                    {lastEvaluation.correctness === "partial" && (
                      <AlertCircle className="w-4 h-4" />
                    )}
                    <span className="font-medium text-sm">
                      {correctnessLabels[lastEvaluation.correctness]}
                    </span>
                  </div>
                  <p className="text-sm opacity-90">{lastEvaluation.feedback}</p>
                </div>
              </div>
            )}

            {/* Evaluating indicator */}
            {isEvaluating && (
              <div className="flex justify-start">
                <div className="bg-white border border-slate-200 rounded-2xl px-4 py-3">
                  <div className="flex items-center gap-2 text-slate-500 text-sm">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>正在评估你的步骤...</span>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Hint Progress Indicator */}
          {sessionStatus === "active" && (
            <div className="text-center py-2 text-sm text-slate-500">
              提示进度：第 {hintLevel} 层 / 共 {MAX_HINT_LEVEL} 层
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="mb-3 p-3 rounded-lg bg-red-50 text-red-700 border border-red-200 flex items-center gap-2 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Session Ended - View Result */}
          {sessionStatus !== "active" && sessionStatus !== "expired" && (
            <Card className="mb-4 bg-amber-50 border-amber-200">
              <CardContent className="p-4 text-center">
                <p className="text-amber-800 text-sm mb-3">
                  {sessionStatus === "abandoned"
                    ? "会话已结束，继续练习吧！"
                    : "本题已完成"}
                </p>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => router.push(`/result/${sessionId}`)}
                >
                  查看结果
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Session Expired - Redirect to Upload */}
          {sessionStatus === "expired" && (
            <Card className="mb-4 bg-red-50 border-red-200">
              <CardContent className="p-4 text-center">
                <p className="text-red-800 text-sm mb-3">
                  本次学习会话已失效，请重新上传题目开始。
                </p>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => router.push("/upload")}
                >
                  重新上传题目
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Input Area */}
          {sessionStatus === "active" && (
            <Card className="border-slate-200">
              <CardContent className="p-4 space-y-3">
                <div className="flex gap-2">
                  <Input
                    ref={inputRef}
                    value={studentInput}
                    onChange={(e) => setStudentInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="输入你的步骤或想法..."
                    disabled={isSending}
                    className="flex-1"
                  />
                  <Button
                    onClick={handleSubmitStep}
                    disabled={!studentInput.trim() || isSending}
                    size="icon"
                  >
                    {isSending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                  </Button>
                </div>

                {/* Secondary Action Buttons */}
                <div className="flex justify-between pt-2 border-t border-slate-100">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleGiveUp}
                    disabled={isSending}
                    className="text-slate-500 text-xs"
                  >
                    放弃
                  </Button>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleHint}
                      disabled={isSending || hintLevel >= MAX_HINT_LEVEL}
                      className="text-xs gap-1"
                    >
                      <Lightbulb className="w-3 h-3" />
                      给我一点提示
                    </Button>
                    {showSolution && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleSeeSolution}
                        disabled={isSending}
                        className="text-xs text-amber-600 border-amber-200 hover:bg-amber-50"
                      >
                        <Eye className="w-3 h-3 mr-1" />
                        查看详细解析
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}