import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.QUIZ_MODEL ?? "claude-sonnet-4-6";
const MAX_INPUT_CHARS = 24000;

export type QuizQuestion = {
  type: "mcq" | "short";
  prompt: string;
  choices?: string[];
  answer: string;
  explanation: string;
};

export type GeneratedQuiz = {
  summary: string;
  questions: QuizQuestion[];
};

export type Difficulty = "easy" | "normal" | "hard";

const DIFFICULTY_GUIDE: Record<Difficulty, string> = {
  easy: "난이도는 '쉬움'. 강의 자료에 직접 나온 핵심 용어와 사실을 그대로 묻는 기본 확인 문제 위주로 만들어줘.",
  normal: "난이도는 '보통'. 개념 이해와 간단한 적용을 묻는 문제를 적절히 섞어줘.",
  hard: "난이도는 '어려움'. 개념을 응용·비교·추론해야 풀 수 있는 까다로운 문제 위주로, 헷갈리는 보기를 포함해서 만들어줘.",
};

const SYSTEM = [
  "너는 시험 출제 전문가야. 주어진 강의 자료만 근거로 한국어 예상문제를 만든다.",
  "반드시 자료에 실제로 있는 내용만 사용하고, 자료에 없는 사실은 절대 지어내지 마라(환각 금지).",
  "출력은 오직 JSON 객체 하나만. 인사말, 설명, 마크다운 코드펜스 없이 JSON만 출력해라.",
  "JSON 형식:",
  '{ "summary": string, "questions": [ { "type": "mcq" | "short", "prompt": string, "choices": string[](mcq일 때 보기 4개), "answer": string, "explanation": string } ] }',
  "mcq의 answer는 반드시 choices 안에 있는 보기와 글자까지 똑같아야 한다.",
  "short는 choices를 넣지 말고 짧은 정답만 answer에 둔다.",
].join("\n");

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end !== -1) return text.slice(start, end + 1);
  return text.trim();
}

function normalize(raw: unknown): GeneratedQuiz {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const summary = typeof obj.summary === "string" ? obj.summary : "";
  const list = Array.isArray(obj.questions) ? obj.questions : [];
  const questions: QuizQuestion[] = list
    .map((item) => {
      const q = (item ?? {}) as Record<string, unknown>;
      const type = q.type === "short" ? "short" : "mcq";
      const prompt = String(q.prompt ?? "").trim();
      const answer = String(q.answer ?? "").trim();
      const explanation = String(q.explanation ?? "").trim();
      const choices =
        type === "mcq" && Array.isArray(q.choices)
          ? q.choices.map((c) => String(c).trim()).filter(Boolean)
          : undefined;
      return { type, prompt, answer, explanation, choices } as QuizQuestion;
    })
    .filter((q) => q.prompt && q.answer);
  return { summary, questions };
}

// AI 호출 공통 (텍스트 또는 PDF+텍스트 형태의 content를 받음)
async function callModel(userContent: any): Promise<GeneratedQuiz> {
  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 4000,
    system: SYSTEM,
    messages: [{ role: "user", content: userContent }],
  });

  const text = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  try {
    return normalize(JSON.parse(extractJson(text)));
  } catch {
    return { summary: "", questions: [] };
  }
}

// PDF를 포함한 content 배열 만들기
function buildContent(promptText: string, sourceText?: string, pdfBase64?: string): any {
  if (pdfBase64) {
    // PDF를 AI에 직접 보내기 (Claude가 PDF를 읽을 수 있음)
    return [
      {
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: pdfBase64,
        },
      },
      { type: "text", text: promptText },
    ];
  }
  // 텍스트만 보내기
  const source = (sourceText ?? "").slice(0, MAX_INPUT_CHARS);
  return promptText + "\n\n=== 강의 자료 시작 ===\n" + source + "\n=== 강의 자료 끝 ===";
}

// 1) 강의 자료로 새 예상문제 만들기
export async function generateQuiz(
  sourceText: string,
  count = 8,
  difficulty: Difficulty = "normal",
  pdfBase64?: string
): Promise<GeneratedQuiz> {
  const prompt = [
    `${pdfBase64 ? "위 강의 자료(PDF)" : "다음 강의 자료"}로 예상문제 ${count}개를 만들어줘.`,
    DIFFICULTY_GUIDE[difficulty],
    "객관식(mcq)과 단답형(short)을 적절히 섞고, 각 문제에 간단한 해설(explanation)을 붙여줘.",
    "자료 전체를 2~4문장으로 요약(summary)도 해줘.",
  ].join("\n");

  return callModel(buildContent(prompt, sourceText, pdfBase64));
}

// 2) 틀린 문제 -> 같은 개념으로 새 비슷한 문제 만들기 (복습 라운드)
export async function generateSimilarQuiz(
  sourceText: string,
  weakQuestions: { prompt: string; answer: string }[],
  difficulty: Difficulty = "normal",
  pdfBase64?: string
): Promise<GeneratedQuiz> {
  const count = Math.max(weakQuestions.length, 1);
  const weakList = weakQuestions
    .map((q, i) => `${i + 1}. (문제) ${q.prompt}  (정답) ${q.answer}`)
    .join("\n");

  const prompt = [
    "학생이 아래 문제들을 틀렸어. 같은 개념과 주제를 다루되, 똑같이 베끼지 말고",
    `새롭게 변형한 비슷한 문제 ${count}개를 만들어줘.`,
    DIFFICULTY_GUIDE[difficulty],
    `반드시 ${pdfBase64 ? "위 강의 자료(PDF)" : "아래 강의 자료"}에 근거해서 만들고, 각 문제에 해설을 붙여줘.`,
    "summary에는 학생이 약한 개념이 무엇인지 1~2문장으로 짚어줘.",
    "",
    "=== 학생이 틀린 문제들 ===",
    weakList,
  ].join("\n");

  return callModel(buildContent(prompt, sourceText, pdfBase64));
}