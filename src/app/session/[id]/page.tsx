"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Send,
  Lightbulb,
  Eye,
  RotateCcw,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
  ChevronLeft,
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

const tutorStateLabels: Record<string, string> = {
  observe: "观察模式",
  hint: "提示模式",
  encourage: "鼓励模式",
  simplify: "简化模式",
  challenge: "挑战模式",
  explain: "解释模式",
};

const correctnessColors: Record<string, string> = {
  correct: "text-green-600 bg-green-100 border-green-200",
  partial: "text-amber-600 bg-amber-100 border-amber-200",
  incorrect: "text-red-600 bg-red-100 border-red-200",
};

export default function SessionPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.id as string;

  const [messages, setMessages] = useState<Message[]>([]);
  const [studentInput, setStudentInput] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [tutorState, setTutorState] = useState("observe");
  const [hintLevel, setHintLevel] = useState(1);
  const [lastEvaluation, setLastEvaluation] = useState<EvaluationResult | null>(null);
  const [sessionStatus, setSessionStatus] = useState<string>("active");
  const [error, setError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const fetchMessages = useCallback(async () => {
    try {
      const response = await fetch(`/api/sessions/${sessionId}/messages`, {
        headers: { "x-user-id": "demo-user" },
      });
      const data = await response.json();

      if (data.success) {
        setMessages(data.data.messages);
        setSessionStatus(data.data.sessionStatus || "active");
      } else {
        setError(data.error || "Failed to load messages");
      }
    } catch {
      setError("Failed to load session messages");
    } finally {
      setIsLoading(false);
    }
  }, [sessionId]);

  // Fetch messages on mount
  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmitStep = async () => {
    if (!studentInput.trim() || isSending) return;

    const inputToSend = studentInput.trim();
    setStudentInput("");
    setIsSending(true);
    setIsEvaluating(true);
    setLastEvaluation(null);
    setError(null);

    try {
      // First, evaluate the step
      const evalResponse = await fetch(`/api/sessions/${sessionId}/evaluate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": "demo-user",
        },
        body: JSON.stringify({ studentInput: inputToSend }),
      });

      const evalData = await evalResponse.json();

      if (evalData.success) {
        setLastEvaluation(evalData.data);
      }

      // Then send the message to get tutor response
      const response = await fetch(`/api/sessions/${sessionId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": "demo-user",
        },
        body: JSON.stringify({ input: inputToSend }),
      });

      const data = await response.json();

      if (data.success) {
        setTutorState(data.data.tutorState || "observe");
        setHintLevel(data.data.hintLevel || 1);
        setSessionStatus(data.data.sessionStatus || "active");

        // Refresh messages to get the latest
        await fetchMessages();
      } else {
        setError(data.error || "Failed to send message");
      }
    } catch {
      setError("Failed to communicate with tutor");
    } finally {
      setIsSending(false);
      setIsEvaluating(false);
      inputRef.current?.focus();
    }
  };

  const handleGiveUp = async () => {
    if (!confirm("Are you sure you want to give up? This session will end.")) {
      return;
    }

    setIsSending(true);
    try {
      const response = await fetch(`/api/sessions/${sessionId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": "demo-user",
        },
        body: JSON.stringify({ input: "", action: "give_up" }),
      });

      const data = await response.json();

      if (data.success) {
        setSessionStatus("abandoned");
        await fetchMessages();
      }
    } catch {
      setError("Failed to end session");
    } finally {
      setIsSending(false);
    }
  };

  const handleSeeSolution = async () => {
    if (!confirm("View the solution? You can still learn from it!")) {
      return;
    }

    setIsSending(true);
    try {
      const response = await fetch(`/api/sessions/${sessionId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": "demo-user",
        },
        body: JSON.stringify({ input: "", action: "see_solution" }),
      });

      const data = await response.json();

      if (data.success) {
        setTutorState("explain");
        setHintLevel(5);
        await fetchMessages();
      }
    } catch {
      setError("Failed to reveal solution");
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

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.push("/history")}
            >
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-lg font-semibold text-slate-900">Tutoring Session</h1>
              <p className="text-sm text-slate-500">Session ID: {sessionId.slice(0, 8)}...</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="flex items-center gap-1">
              <Lightbulb className="w-3 h-3" />
              Hint Level {hintLevel}
            </Badge>
            <Badge
              variant={tutorState === "observe" ? "secondary" : "default"}
              className="flex items-center gap-1"
            >
              {tutorStateLabels[tutorState] || tutorState}
            </Badge>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden">
        <div className="max-w-4xl mx-auto h-full flex flex-col p-6">
          {/* Chat Area */}
          <div className="flex-1 overflow-y-auto space-y-4 mb-4">
            {isLoading ? (
              <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : messages.length === 0 ? (
              <div className="flex items-center justify-center h-64 text-slate-500">
                No messages yet. Start typing your solution!
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
                    className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                      message.role === "student"
                        ? "bg-primary text-primary-foreground"
                        : message.role === "system"
                        ? "bg-amber-100 text-amber-900 border border-amber-200"
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
                  className={`max-w-[80%] rounded-2xl px-4 py-3 border ${correctnessColors[lastEvaluation.correctness]}`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    {lastEvaluation.correctness === "correct" && (
                      <CheckCircle className="w-5 h-5" />
                    )}
                    {lastEvaluation.correctness === "incorrect" && (
                      <XCircle className="w-5 h-5" />
                    )}
                    {lastEvaluation.correctness === "partial" && (
                      <AlertCircle className="w-5 h-5" />
                    )}
                    <span className="font-semibold capitalize">
                      {lastEvaluation.correctness === "correct"
                        ? "Correct!"
                        : lastEvaluation.correctness === "incorrect"
                        ? "Needs Improvement"
                        : "Partially Correct"}
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
                  <div className="flex items-center gap-2 text-slate-500">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Evaluating your step...</span>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-100 text-red-700 border border-red-200 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}

          {/* Session Ended Message */}
          {sessionStatus === "abandoned" && (
            <Card className="mb-4 bg-amber-50 border-amber-200">
              <CardContent className="p-4">
                <p className="text-amber-800 text-center">
                  Session ended. Keep practicing! You can start a new session anytime.
                </p>
                <Button
                  variant="outline"
                  className="mt-3 w-full"
                  onClick={() => router.push("/upload")}
                >
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Start New Session
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Input Area */}
          {sessionStatus === "active" && (
            <Card className="border-slate-200">
              <CardContent className="p-4">
                <div className="flex gap-3">
                  <Input
                    ref={inputRef}
                    value={studentInput}
                    onChange={(e) => setStudentInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Type your solution steps here..."
                    disabled={isSending}
                    className="flex-1"
                  />
                  <Button
                    onClick={handleSubmitStep}
                    disabled={!studentInput.trim() || isSending}
                  >
                    {isSending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                  </Button>
                </div>

                {/* Action Buttons */}
                <div className="flex justify-between mt-4 pt-4 border-t border-slate-100">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleGiveUp}
                    disabled={isSending}
                    className="text-slate-500"
                  >
                    Give Up
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSeeSolution}
                    disabled={isSending}
                    className="text-slate-500"
                  >
                    <Eye className="w-4 h-4 mr-1" />
                    See Solution
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}