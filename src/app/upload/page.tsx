"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Upload, Loader2, Image as ImageIcon, CheckCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<ProblemResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileSelect = useCallback((file: File) => {
    // Validate file type
    const validTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!validTypes.includes(file.type)) {
      setError("Please select a valid image file (JPEG, PNG, GIF, or WEBP)");
      return;
    }

    // Validate file size (10MB max)
    if (file.size > 10 * 1024 * 1024) {
      setError("Image size must be less than 10MB");
      return;
    }

    setSelectedFile(file);
    setError(null);
    setUploadResult(null);

    // Create preview URL
    const reader = new FileReader();
    reader.onload = (e) => {
      setPreviewUrl(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  }, [handleFileSelect]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileSelect(files[0]);
    }
  }, [handleFileSelect]);

  const handleUpload = async () => {
    if (!selectedFile) return;

    setIsUploading(true);
    setError(null);
    setUploadResult(null);

    try {
      const formData = new FormData();
      formData.append("image", selectedFile);

      const response = await fetch("/api/problems", {
        method: "POST",
        headers: {
          "x-user-id": "demo-user",
        },
        body: formData,
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || "Failed to upload image");
      }

      setUploadResult(data.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setIsUploading(false);
    }
  };

  const handleStartSession = () => {
    if (uploadResult?.problemId) {
      router.push(`/session/${uploadResult.problemId}`);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white p-8">
      <div className="max-w-2xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-semibold text-slate-900">Upload Math Problem</h1>
          <p className="text-slate-600">Take a photo or select an image of your math problem</p>
        </div>

        {/* Upload Area */}
        <Card className={`border-2 border-dashed transition-colors ${
          isDragging ? "border-primary bg-primary/5" : "border-slate-200"
        }`}>
          <CardContent className="p-8">
            <div
              className="flex flex-col items-center justify-center space-y-4"
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              {previewUrl ? (
                <div className="relative w-full">
                  <img
                    src={previewUrl}
                    alt="Preview"
                    className="max-h-80 mx-auto rounded-lg object-contain"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="absolute top-2 right-2"
                    onClick={() => {
                      setSelectedFile(null);
                      setPreviewUrl(null);
                      setUploadResult(null);
                      setError(null);
                    }}
                  >
                    Remove
                  </Button>
                </div>
              ) : (
                <>
                  <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                    <Upload className="w-8 h-8 text-primary" />
                  </div>
                  <div className="text-center">
                    <p className="text-slate-700 font-medium">
                      Drag and drop your image here
                    </p>
                    <p className="text-sm text-slate-500">or</p>
                  </div>
                  <Label
                    htmlFor="file-input"
                    className="cursor-pointer inline-flex"
                  >
                    Browse Files
                  </Label>
                  <Input
                    id="file-input"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleInputChange}
                  />
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Error Message */}
        {error && (
          <div className="flex items-center gap-2 p-4 rounded-lg bg-destructive/10 text-destructive">
            <AlertCircle className="w-5 h-5" />
            <span>{error}</span>
          </div>
        )}

        {/* Upload Button */}
        <div className="flex justify-center">
          <Button
            size="lg"
            onClick={handleUpload}
            disabled={!selectedFile || isUploading}
            className="min-w-[200px]"
          >
            {isUploading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <ImageIcon className="w-4 h-4 mr-2" />
                Analyze Image
              </>
            )}
          </Button>
        </div>

        {/* OCR Result */}
        {uploadResult && (
          <Card className="border-2 border-green-200 bg-green-50">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  Problem Analyzed
                </CardTitle>
                <Badge variant={uploadResult.confidence > 0.7 ? "default" : "secondary"}>
                  {Math.round(uploadResult.confidence * 100)}% confidence
                </Badge>
              </div>
              <CardDescription>
                The AI has extracted and normalized your problem
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* OCR Text */}
              <div className="space-y-2">
                <Label className="text-slate-700">Extracted Problem</Label>
                <div className="p-4 bg-white rounded-lg border border-green-200">
                  <p className="text-slate-800 whitespace-pre-wrap">{uploadResult.normalizedText}</p>
                </div>
              </div>

              {/* Problem Type */}
              {uploadResult.problemType && (
                <div className="space-y-2">
                  <Label className="text-slate-700">Problem Type</Label>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary">{uploadResult.problemType}</Badge>
                  </div>
                </div>
              )}

              {/* Knowledge Points */}
              {uploadResult.knowledgePoints.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-slate-700">Knowledge Points</Label>
                  <div className="flex flex-wrap gap-2">
                    {uploadResult.knowledgePoints.map((kp, index) => (
                      <Badge key={index} variant="outline">
                        {kp}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Start Session Button */}
              <div className="pt-4">
                <Button
                  size="lg"
                  className="w-full"
                  onClick={handleStartSession}
                >
                  Start Tutoring Session
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}