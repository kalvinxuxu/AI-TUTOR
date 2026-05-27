"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Calendar,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  ChevronRight,
  Loader2,
  Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

interface SessionSummary {
  id: string;
  problemText: string;
  status: "active" | "completed" | "abandoned";
  startedAt: string;
  endedAt: string | null;
  knowledgePoints: string[];
}

export default function HistoryPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "completed" | "abandoned">("all");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    // For MVP, we simulate sessions since the API doesn't have a list endpoint yet
    // In production, this would fetch from /api/sessions
    const mockSessions: SessionSummary[] = [
      {
        id: "session-1",
        problemText: "Calculate the area of a circle with radius 5cm",
        status: "completed",
        startedAt: new Date(Date.now() - 86400000).toISOString(),
        endedAt: new Date(Date.now() - 86400000 + 1800000).toISOString(),
        knowledgePoints: ["Geometry", "Circle Area"],
      },
      {
        id: "session-2",
        problemText: "Solve for x: 2x + 5 = 15",
        status: "completed",
        startedAt: new Date(Date.now() - 172800000).toISOString(),
        endedAt: new Date(Date.now() - 172800000 + 2400000).toISOString(),
        knowledgePoints: ["Algebra", "Linear Equations"],
      },
      {
        id: "session-3",
        problemText: "What is the derivative of x^2?",
        status: "abandoned",
        startedAt: new Date(Date.now() - 432000000).toISOString(),
        endedAt: null,
        knowledgePoints: ["Calculus", "Derivatives"],
      },
    ];

    setTimeout(() => {
      setSessions(mockSessions);
      setIsLoading(false);
    }, 500);
  }, []);

  const filteredSessions = sessions.filter((session) => {
    // Status filter
    if (filter !== "all" && session.status !== filter) {
      return false;
    }
    // Search filter
    if (searchQuery && !session.problemText.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }
    return true;
  });

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  };

  const getDuration = (startedAt: string, endedAt: string | null) => {
    if (!endedAt) return "In progress";
    const start = new Date(startedAt).getTime();
    const end = new Date(endedAt).getTime();
    const minutes = Math.floor((end - start) / 60000);
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-slate-900">Session History</h1>
            <p className="text-slate-600 mt-1">Review your past learning sessions</p>
          </div>
          <Button onClick={() => router.push("/upload")}>
            New Session
          </Button>
        </div>

        {/* Filters */}
        <Card className="border-slate-200">
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-4 items-center">
              {/* Search */}
              <div className="flex-1 min-w-[200px]">
                <Input
                  placeholder="Search problems..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full"
                />
              </div>

              {/* Status Filter */}
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-slate-500" />
                <div className="flex gap-1">
                  <Button
                    variant={filter === "all" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setFilter("all")}
                  >
                    All
                  </Button>
                  <Button
                    variant={filter === "completed" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setFilter("completed")}
                  >
                    Completed
                  </Button>
                  <Button
                    variant={filter === "abandoned" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setFilter("abandoned")}
                  >
                    Abandoned
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Session List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : filteredSessions.length === 0 ? (
          <Card className="border-slate-200">
            <CardContent className="p-12 text-center">
              <AlertCircle className="w-12 h-12 mx-auto text-slate-300 mb-4" />
              <h3 className="text-lg font-medium text-slate-700">No sessions found</h3>
              <p className="text-slate-500 mt-1">
                {searchQuery ? "Try a different search term" : "Start a new session to begin learning"}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {filteredSessions.map((session) => (
              <Card
                key={session.id}
                className="cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => router.push(`/session/${session.id}`)}
              >
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 space-y-3">
                      {/* Problem Text */}
                      <p className="text-slate-900 font-medium line-clamp-2">
                        {session.problemText}
                      </p>

                      {/* Knowledge Points */}
                      <div className="flex flex-wrap gap-2">
                        {session.knowledgePoints.map((kp, index) => (
                          <Badge key={index} variant="secondary" className="text-xs">
                            {kp}
                          </Badge>
                        ))}
                      </div>

                      {/* Meta Info */}
                      <div className="flex items-center gap-4 text-sm text-slate-500">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          {formatDate(session.startedAt)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-4 h-4" />
                          {getDuration(session.startedAt, session.endedAt)}
                        </span>
                      </div>
                    </div>

                    {/* Status & Arrow */}
                    <div className="flex items-center gap-4">
                      <Badge
                        variant={
                          session.status === "completed"
                            ? "default"
                            : session.status === "abandoned"
                            ? "secondary"
                            : "outline"
                        }
                        className={
                          session.status === "completed"
                            ? "bg-green-100 text-green-700 border-green-200"
                            : session.status === "abandoned"
                            ? "bg-amber-100 text-amber-700 border-amber-200"
                            : ""
                        }
                      >
                        {session.status === "completed" && <CheckCircle className="w-3 h-3 mr-1" />}
                        {session.status === "abandoned" && <XCircle className="w-3 h-3 mr-1" />}
                        {session.status === "active" && <AlertCircle className="w-3 h-3 mr-1" />}
                        {session.status}
                      </Badge>
                      <ChevronRight className="w-5 h-5 text-slate-400" />
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