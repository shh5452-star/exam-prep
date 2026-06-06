"use server";

import {
  generateQuiz,
  generateSimilarQuiz,
  type Difficulty,
  type GeneratedQuiz,
} from "@/lib/generate-quiz";

export type QuizResult = {
  summary: string;
  deckId: string | null;
  questions: (GeneratedQuiz["questions"][number] & { id: string | null })[];
};

function toResult(quiz: GeneratedQuiz): QuizResult {
  return {
    summary: quiz.summary,
    deckId: null,
    questions: quiz.questions.map((q) => ({ ...q, id: null })),
  };
}

// 텍스트로 퀴즈 생성
export async function createQuiz(
  title: string,
  sourceText: string,
  count = 8,
  difficulty: Difficulty = "normal"
): Promise<QuizResult> {
  const quiz = await generateQuiz(sourceText, count, difficulty);
  return toResult(quiz);
}

// PDF 파일로 퀴즈 생성 (FormData로 받아서 서버에서 base64 변환)
export async function createQuizFromPdf(formData: FormData): Promise<QuizResult> {
  const file = formData.get("file") as File;
  const count = Number(formData.get("count") ?? 8);
  const difficulty = (formData.get("difficulty") ?? "normal") as Difficulty;

  const buffer = Buffer.from(await file.arrayBuffer());
  const pdfBase64 = buffer.toString("base64");

  const quiz = await generateQuiz("", count, difficulty, pdfBase64);
  return toResult(quiz);
}

// 틀린 문제 -> 비슷한 새 문제 (텍스트)
export async function createSimilarQuiz(
  sourceText: string,
  weakQuestions: { prompt: string; answer: string }[],
  difficulty: Difficulty = "normal"
): Promise<QuizResult> {
  const quiz = await generateSimilarQuiz(sourceText, weakQuestions, difficulty);
  return toResult(quiz);
}

// 틀린 문제 -> 비슷한 새 문제 (PDF)
export async function createSimilarQuizFromPdf(formData: FormData): Promise<QuizResult> {
  const file = formData.get("file") as File;
  const difficulty = (formData.get("difficulty") ?? "normal") as Difficulty;
  const weakStr = formData.get("weak") as string;
  const weakQuestions: { prompt: string; answer: string }[] = JSON.parse(weakStr);

  const buffer = Buffer.from(await file.arrayBuffer());
  const pdfBase64 = buffer.toString("base64");

  const quiz = await generateSimilarQuiz("", weakQuestions, difficulty, pdfBase64);
  return toResult(quiz);
}

export async function recordAttempt(): Promise<void> {
  return;
}