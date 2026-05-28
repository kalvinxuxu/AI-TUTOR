"use client";

import { useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  Camera,
  Image,
  Upload,
  Loader2,
  CheckCircle,
  AlertCircle,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface ProblemResult {
  problemId: string;
  normalizedText: string;
  problemType: string | null;
  knowledgePoints: string[];
  confidence: number;
  needsManualConfirm: boolean;
}

export default function UploadPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<ProblemResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileSelect = useCallback((file: File) => {
    const validTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!validTypes.includes(file.type)) {
      setError("请选择有效的图片文件（JPEG、PNG、GIF 或 WEBP）");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError("图片大小必须小于 10MB");
      return;
    }

    setSelectedFile(file);
    setError(null);
    setUploadResult(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      setPreviewUrl(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  }, []);

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        handleFileSelect(files[0]);
      }
    },
    [handleFileSelect]
  );

  const handleClearSelection = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    setUploadResult(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    if (cameraInputRef.current) {
      cameraInputRef.current.value = "";
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setIsUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("image", selectedFile);

      const response = await fetch("/api/problems", {
        method: "POST",
        headers: {
          "x-user-id": "00000000-0000-0000-0000-000000000000",
        },
        body: formData,
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || "图片上传失败");
      }

      setUploadResult(data.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "上传失败");
    } finally {
      setIsUploading(false);
    }
  };

  const handleStartSession = () => {
    if (uploadResult?.problemId) {
      router.push(`/problems/${uploadResult.problemId}/confirm`);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-4 py-3 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <Button variant="ghost" size="icon" onClick={() => router.push("/")}>
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <span className="font-medium text-slate-900">上传题目</span>
          <Button variant="ghost" size="icon">
            <span className="text-sm text-slate-500">帮助</span>
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        {/* Upload Actions - Only show when no file selected */}
        {!selectedFile && (
          <div className="space-y-4">
            {/* Camera Upload */}
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleFileInputChange}
            />
            <Button
              variant="outline"
              className="w-full h-16 text-base border-slate-200"
              onClick={() => cameraInputRef.current?.click()}
            >
              <Camera className="w-6 h-6 mr-3 text-slate-600" />
              <span className="text-slate-700">拍照上传</span>
            </Button>

            {/* Gallery Upload */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileInputChange}
            />
            <Button
              variant="outline"
              className="w-full h-16 text-base border-slate-200"
              onClick={() => fileInputRef.current?.click()}
            >
              <Image className="w-6 h-6 mr-3 text-slate-600" />
              <span className="text-slate-700">从相册选择</span>
            </Button>
          </div>
        )}

        {/* Preview Area - Only show when file selected */}
        {selectedFile && (
          <Card className="border-slate-200">
            <CardContent className="p-4">
              <div className="relative">
                {previewUrl && (
                  <img
                    src={previewUrl}
                    alt="Preview"
                    className="max-h-64 mx-auto rounded-lg object-contain"
                  />
                )}
                <Button
                  variant="outline"
                  size="icon"
                  className="absolute top-2 right-2 bg-white/80 hover:bg-white"
                  onClick={handleClearSelection}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Error Message */}
        {error && (
          <div className="flex items-center gap-2 p-4 rounded-lg bg-red-50 border border-red-200 text-red-700">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Upload Button */}
        {selectedFile && !uploadResult && (
          <div className="flex justify-center">
            <Button
              size="lg"
              onClick={handleUpload}
              disabled={isUploading}
              className="min-w-[200px]"
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  识别中...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  开始识别
                </>
              )}
            </Button>
          </div>
        )}

        {/* OCR Result */}
        {uploadResult && (
          <Card className="border-2 border-green-200 bg-green-50">
            <CardContent className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <span className="font-medium text-green-800">识别成功</span>
                </div>
                <Badge
                  variant={uploadResult.confidence > 0.7 ? "secondary" : "outline"}
                  className={
                    uploadResult.confidence <= 0.7
                      ? "bg-amber-100 text-amber-700 border-amber-200"
                      : ""
                  }
                >
                  置信度 {Math.round(uploadResult.confidence * 100)}%
                </Badge>
              </div>

              {/* Extracted Text */}
              <div className="p-3 bg-white rounded-lg border border-green-200">
                <p className="text-slate-800 whitespace-pre-wrap text-sm leading-relaxed">
                  {uploadResult.normalizedText}
                </p>
              </div>

              {/* Start Session Button */}
              <Button size="lg" className="w-full" onClick={handleStartSession}>
                开始做题
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Upload Tips - Only show when no file selected */}
        {!selectedFile && (
          <div className="text-sm text-slate-500 space-y-1 px-2">
            <p className="font-medium text-slate-700 mb-2">温馨提示：</p>
            <ul className="space-y-1 list-disc list-inside">
              <li>尽量只拍一道题</li>
              <li>保持画面清晰</li>
              <li>支持截图上传</li>
            </ul>
          </div>
        )}
      </main>
    </div>
  );
}