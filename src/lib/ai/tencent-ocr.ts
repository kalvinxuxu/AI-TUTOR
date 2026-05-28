/**
 * Tencent Cloud OCR Adapter
 * Uses Tencent Cloud OCR API for problem text extraction
 * Ref: TDG Section 4.3
 */

import tencentcloud from 'tencentcloud-sdk-nodejs/tencentcloud/services/ocr/v20181119';

const { Client } = tencentcloud.v20181119;
const Models = tencentcloud.v20181119.Models;

const TENCENTCLOUD_SECRET_ID = process.env.TENCENTCLOUD_SECRET_ID || '';
const TENCENTCLOUD_SECRET_KEY = process.env.TENCENTCLOUD_SECRET_KEY || '';
const TENCENTCLOUD_REGION = process.env.TENCENTCLOUD_REGION || 'ap-guangzhou';

// OCR Result interface
export interface OCRResult {
  normalizedText: string;
  problemType: string | null;
  knowledgePoints: string[];
  confidence: number;
  rawExtraction?: string;
}

/**
 * Extract problem text from base64 encoded image using Tencent Cloud OCR
 */
export async function extractProblemTextFromBase64(
  base64Image: string,
  mimeType: string = 'image/png'
): Promise<OCRResult> {
  const startTime = Date.now();
  let fallbackUsed = false;

  try {
    const client = new Client({
      credential: {
        secretId: TENCENTCLOUD_SECRET_ID,
        secretKey: TENCENTCLOUD_SECRET_KEY,
      },
      region: TENCENTCLOUD_REGION,
    });

    // Use GeneralBasic OCR for problem text extraction
    const response = await client.GeneralBasicOCR({
      ImageBase64: base64Image,
    });

    // Extract text from response
    let rawText = '';
    let totalConfidence = 0;

    if (response.TextDetections) {
      for (const detection of response.TextDetections) {
        if (detection.DetectedText) {
          rawText += detection.DetectedText + '\n';
          totalConfidence += detection.Confidence || 0;
        }
      }
    }

    const avgConfidence = response.TextDetections?.length
      ? totalConfidence / response.TextDetections.length
      : 0;

    // Clean up the extracted text
    const normalizedText = normalizeProblemText(rawText);

    // Identify problem type and knowledge points from text
    const { problemType, knowledgePoints } = analyzeProblemContent(normalizedText);

    const result: OCRResult = {
      normalizedText,
      problemType,
      knowledgePoints,
      confidence: avgConfidence / 100, // Convert to 0-1 scale
      rawExtraction: rawText,
    };

    const latencyMs = Date.now() - startTime;
    logModelCall({
      request_id: crypto.randomUUID(),
      user_id: '',
      session_id: '',
      model_name: 'tencent-ocr',
      latency_ms: latencyMs,
      input_tokens: 0,
      output_tokens: 0,
      success: true,
      fallback_used: fallbackUsed,
      operation: 'ocr',
    });

    return result;
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    logModelCall({
      request_id: crypto.randomUUID(),
      user_id: '',
      session_id: '',
      model_name: 'tencent-ocr',
      latency_ms: latencyMs,
      input_tokens: 0,
      output_tokens: 0,
      success: false,
      fallback_used: fallbackUsed,
      operation: 'ocr',
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    throw error;
  }
}

/**
 * Extract problem text from image URL using Tencent Cloud OCR
 */
export async function extractProblemText(imageUrl: string): Promise<OCRResult> {
  // For URL-based images, we would need to download first
  // For now, this is a placeholder - in production, you'd fetch the image and convert to base64
  throw new Error('URL-based OCR not implemented. Use extractProblemTextFromBase64 with downloaded image.');
}

/**
 * Normalize extracted problem text
 */
function normalizeProblemText(text: string): string {
  return text
    // Remove multiple spaces
    .replace(/\s+/g, ' ')
    // Fix common OCR mistakes
    .replace(/[|]/g, 'l')
    .replace(/[0O]/g, (match, offset, str) => {
      const before = str[offset - 1];
      const after = str[offset + 1];
      if (/\d/.test(before) && /\d/.test(after)) return '0';
      return match;
    })
    // Fix line break issues in formulas
    .replace(/-\n/g, '-')
    .replace(/\n+/g, '\n')
    .trim();
}

/**
 * Analyze problem content to identify type and knowledge points
 */
function analyzeProblemContent(text: string): { problemType: string | null; knowledgePoints: string[] } {
  const knowledgePoints: string[] = [];
  let problemType: string | null = null;

  // Keywords for problem type identification
  const typePatterns: Record<string, RegExp[]> = {
    'equation': [/方程/, /求解/, /x\s*=/, /y\s*=/, /一元二次/, /二元一次/],
    'geometry': [/三角形/, /四边形/, /圆形/, /面积/, /周长/, /角度/, /相似/, /全等/],
    'algebra': [/化简/, /计算/, /求值/, /因式分解/, /配方/],
    'function': [/函数/, /图像/, /顶点/, /对称轴/],
    'word_problem': [/应用题/, /商店/, /价格/, /数量/],
    'inequality': [/不等式/, /大于/, /小于/, /取值范围/],
    'probability': [/概率/, /可能性/, /随机/],
  };

  // Knowledge point keywords
  const kpPatterns: Record<string, RegExp[]> = {
    '一元二次方程': [/一元二次方程/, /求根公式/, /判别式/],
    '因式分解': [/因式分解/, /提取公因式/, /十字相乘法/],
    '几何证明': [/证明/, /因为/, /所以/],
    '三角形': [/三角形/, /内角和/, /外角/],
    '二次根式': [/二次根式/, /√/, /根号/],
    '一次函数': [/一次函数/, /斜率/, /截距/],
    '二元一次方程组': [/二元一次方程组/, /代入法/, /加减法/],
    '勾股定理': [/勾股定理/, /直角三角形/, /a²\+b²/],
  };

  // Detect problem type
  for (const [type, patterns] of Object.entries(typePatterns)) {
    for (const pattern of patterns) {
      if (pattern.test(text)) {
        problemType = type;
        break;
      }
    }
    if (problemType) break;
  }

  // Detect knowledge points
  for (const [kp, patterns] of Object.entries(kpPatterns)) {
    for (const pattern of patterns) {
      if (pattern.test(text)) {
        if (!knowledgePoints.includes(kp)) {
          knowledgePoints.push(kp);
        }
        break;
      }
    }
  }

  return { problemType, knowledgePoints };
}

// Logging function
function logModelCall(call: ModelCallLog): void {
  const logEntry: ModelCallLog = {
    ...call,
    timestamp: new Date().toISOString(),
  };

  if (process.env.NODE_ENV === 'development') {
    console.log(`[AI Call] ${logEntry.model_name} | ${logEntry.operation} | ${logEntry.latency_ms}ms | ${logEntry.success ? 'OK' : 'FAIL'}${logEntry.fallback_used ? ' (fallback)' : ''}`);
    if (logEntry.error) {
      console.error(`[AI Error] ${logEntry.error}`);
    }
  }
}

interface ModelCallLog {
  request_id: string;
  user_id: string;
  session_id: string;
  model_name: string;
  latency_ms: number;
  input_tokens: number;
  output_tokens: number;
  success: boolean;
  fallback_used: boolean;
  operation: string;
  error?: string;
  timestamp?: string;
}

// Export singleton
export const tencentOcrAdapter = {
  extractProblemText,
  extractProblemTextFromBase64,
};
