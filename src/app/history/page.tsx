"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  Calendar,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface SessionSummary {
  id: string;
  problemText: string;
  status: "completed" | "abandoned";
  startedAt: string;
  endedAt: string | null;
  knowledgePoints: string[];
  completionType?: "self" | "hint" | "solution";
  hintCount?: number;
}

export default function HistoryPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchSessions = async () => {
      try {
        const response = await fetch('/api/sessions', {
          headers: {
            'x-user-id': '00000000-0000-0000-0000-000000000000',
          },
        });
        const data = await response.json();

        if (data.success && data.data) {
          setSessions(data.data.sessions);
        }
      } catch {
        // Keep empty sessions on error
      } finally {
        setIsLoading(false);
      }
    };

    fetchSessions();
  }, []);

  const groupSessionsByDate = (sessions: SessionSummary[]) => {
    const groups: Record<string, SessionSummary[]> = {};

    sessions.forEach((session) => {
      const date = new Date(session.startedAt);
      const dateKey = new Intl.DateTimeFormat("zh-CN", {
        month: "long",
        day: "numeric",
      }).format(date);

      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(session);
    });

    return groups;
  };

  const formatTime = (dateString: string) => {
    return new Intl.DateTimeFormat("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(dateString));
  };

  const getDuration = (startedAt: string, endedAt: string | null) => {
    if (!endedAt) return "进行中";
    const start = new Date(startedAt).getTime();
    const end = new Date(endedAt).getTime();
    const minutes = Math.floor((end - start) / 60000);
    if (minutes < 60) return `${minutes} 分钟`;
    const hours = Math.floor(minutes / 60);
    return `${hours} 小时 ${minutes % 60} 分钟`;
  };

  const getCompletionLabel = (session: SessionSummary) => {
    if (session.status === "abandoned") return "未完成";

    switch (session.completionType) {
      case "self":
        return "自主完成";
      case "hint":
        return `提示${session.hintCount || 0}次完成`;
      case "solution":
        return "查看解析完成";
      default:
        return "已完成";
    }
  };

  const getCompletionBadgeColor = (session: SessionSummary) => {
    if (session.status === "abandoned") {
      return "bg-amber-100 text-amber-700 border-amber-200";
    }

    switch (session.completionType) {
      case "self":
        return "bg-green-100 text-green-700 border-green-200";
      case "hint":
        return "bg-blue-100 text-blue-700 border-blue-200";
      case "solution":
        return "bg-slate-100 text-slate-700 border-slate-200";
      default:
        return "";
    }
  };

  const handleSessionClick = (sessionId: string) => {
    router.push(`/result/${sessionId}`);
  };

  const handleNewSession = () => {
    router.push("/upload");
  };

  const groupedSessions = groupSessionsByDate(sessions);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-4 py-3 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => router.push("/")}>
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <span className="font-medium text-slate-900">学习记录</span>
          </div>
          <Button size="sm" onClick={handleNewSession}>
            新题目
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-2xl mx-auto px-6 py-6 space-y-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : sessions.length === 0 ? (
          <Card className="border-slate-200">
            <CardContent className="p-8 text-center">
              <AlertCircle className="w-12 h-12 mx-auto text-slate-300 mb-4" />
              <h3 className="text-lg font-medium text-slate-700">暂无学习记录</h3>
              <p className="text-slate-500 mt-1 text-sm">
                开始做题后，这里会显示你的学习历史
              </p>
              <Button className="mt-4" onClick={handleNewSession}>
                开始做题
              </Button>
            </CardContent>
          </Card>
        ) : (
          Object.entries(groupedSessions).map(([date, dateSessions]) => (
            <div key={date} className="space-y-3">
              {/* Date Header */}
              <div className="text-sm font-medium text-slate-500 flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                {date}
              </div>

              {/* Session Cards */}
              {dateSessions.map((session) => (
                <Card
                  key={session.id}
                  className="border-slate-200 cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all"
                  onClick={() => handleSessionClick(session.id)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        {/* Problem Text */}
                        <p className="text-slate-900 font-medium text-sm line-clamp-2">
                          {session.problemText}
                        </p>

                        {/* Knowledge Points */}
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {session.knowledgePoints.map((kp, index) => (
                            <Badge
                              key={index}
                              variant="secondary"
                              className="text-xs"
                            >
                              {kp}
                            </Badge>
                          ))}
                        </div>

                        {/* Meta Info */}
                        <div className="flex items-center gap-4 mt-3 text-xs text-slate-500">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" />
                            {formatTime(session.startedAt)}
                          </span>
                          <span>{getDuration(session.startedAt, session.endedAt)}</span>
                        </div>
                      </div>

                      {/* Status Badge */}
                      <div className="flex flex-col items-end gap-2">
                        <Badge
                          variant="outline"
                          className={`text-xs ${getCompletionBadgeColor(session)}`}
                        >
                          {session.status === "completed" && (
                            <CheckCircle className="w-3 h-3 mr-1" />
                          )}
                          {session.status === "abandoned" && (
                            <XCircle className="w-3 h-3 mr-1" />
                          )}
                          {getCompletionLabel(session)}
                        </Badge>
                        <ChevronRight className="w-4 h-4 text-slate-400" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ))
        )}
      </main>
    </div>
  );
}