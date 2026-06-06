"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createQuiz, createQuizFromPdf, createSimilarQuiz, createSimilarQuizFromPdf, type QuizResult } from "@/app/actions";

type Phase = "input" | "loading" | "quiz" | "result";
type Difficulty = "easy" | "normal" | "hard";
type Question = QuizResult["questions"][number];
type SavedQuiz = {
  id: string; subject: string; title: string; date: string;
  score: number; total: number; summary: string;
  sourceText: string; difficulty: Difficulty;
  questions: Question[]; answers: Record<number, string>;
};

const STORAGE_KEY = "exam-prep-history";
const MAX_SAVED = 30;
const COUNTS = [5, 8, 12];
const DIFFS: { value: Difficulty; label: string }[] = [
  { value: "easy", label: "쉬움" }, { value: "normal", label: "보통" }, { value: "hard", label: "어려움" },
];
const CREATE_TIPS = ["자료를 읽는 중...", "핵심 개념을 찾는 중...", "문제를 만드는 중...", "해설을 다듬는 중..."];
const SIMILAR_TIPS = ["틀린 개념을 분석하는 중...", "비슷한 새 문제를 만드는 중...", "마지막으로 다듬는 중..."];
const CONFETTI = ["🎊","🎉","✨","🌟","💫","🎊","🎉","✨","🌟","💫","🎊","🎉","✨","🌟","💫","🎊","🎉","✨","🌟","💫","🎊","🎉","✨","🌟","💫","🎊","🎉","✨","🌟","💫"];

function isCorrect(q: Question, ans: string | undefined) {
  if (!ans) return false;
  return ans.trim().toLowerCase() === q.answer.trim().toLowerCase();
}
function loadHistory(): SavedQuiz[] {
  if (typeof window === "undefined") return [];
  try { const r = localStorage.getItem(STORAGE_KEY); return r ? JSON.parse(r) : []; } catch { return []; }
}
function saveHistoryToStorage(list: SavedQuiz[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, MAX_SAVED))); } catch {}
}

export default function QuizApp() {
  const [phase, setPhase] = useState<Phase>("input");
  const [subject, setSubject] = useState("");
  const [title, setTitle] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [count, setCount] = useState(8);
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  const [errorMsg, setErrorMsg] = useState("");
  const [loadingKind, setLoadingKind] = useState<"create" | "similar">("create");
  const [fileName, setFileName] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [summary, setSummary] = useState("");
  const [allQuestions, setAllQuestions] = useState<Question[]>([]);
  const [activeQuestions, setActiveQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [isReviewRound, setIsReviewRound] = useState(false);
  const [confirmGrade, setConfirmGrade] = useState(false);
  const [similarDismissed, setSimilarDismissed] = useState(false);
  const [result, setResult] = useState<{ score: number; total: number } | null>(null);
  const [history, setHistory] = useState<SavedQuiz[]>([]);
  const [savedCurrent, setSavedCurrent] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [tip, setTip] = useState(0);

  useEffect(() => { setHistory(loadHistory()); }, []);
  useEffect(() => {
    if (phase !== "loading") return;
    setTip(0); const id = setInterval(() => setTip((p) => p + 1), 1600);
    return () => clearInterval(id);
  }, [phase]);

  const answeredCount = useMemo(() => activeQuestions.filter((_, i) => (answers[i] ?? "").trim() !== "").length, [activeQuestions, answers]);
  const remaining = activeQuestions.length - answeredCount;
  const progress = activeQuestions.length ? Math.round((answeredCount / activeQuestions.length) * 100) : 0;
  const hasSource = sourceText.trim().length >= 20 || pdfFile !== null;

  // 수업별 그룹
  const grouped = useMemo(() => {
    const g: Record<string, SavedQuiz[]> = {};
    history.forEach((h) => { const k = h.subject || "기타"; if (!g[k]) g[k] = []; g[k].push(h); });
    return g;
  }, [history]);

  function startRound(qs: Question[], review: boolean) {
    setActiveQuestions(qs); setAnswers({}); setResult(null);
    setConfirmGrade(false); setSimilarDismissed(false); setSavedCurrent(false);
    setIsReviewRound(review); setPhase("quiz"); window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleFile(file: File) {
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!["pdf", "txt", "md"].includes(ext || "")) { setErrorMsg("PDF, TXT, MD 파일만 지원해요."); return; }
    setFileName(file.name); setExtracting(true); setErrorMsg("");
    try {
      if (ext === "pdf") { setPdfFile(file); setSourceText(""); }
      else { const t = await file.text(); if (t.trim().length < 10) { setErrorMsg("파일 내용이 너무 짧아요."); setExtracting(false); return; } setSourceText(t); setPdfFile(null); }
    } catch { setErrorMsg("파일을 읽지 못했어요."); }
    setExtracting(false);
  }
  function handleDrop(e: React.DragEvent) { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }

  async function handleCreate() {
    if (!hasSource) { setErrorMsg("강의 자료를 붙여넣거나 파일을 올려 주세요."); return; }
    setErrorMsg(""); setLoadingKind("create"); setPhase("loading");
    try {
      let res: QuizResult;
      if (pdfFile) {
        const fd = new FormData(); fd.append("file", pdfFile); fd.append("count", count.toString()); fd.append("difficulty", difficulty);
        res = await createQuizFromPdf(fd);
      } else { res = await createQuiz(title.trim() || "제목 없음", sourceText, count, difficulty); }
      if (!res.questions.length) { setErrorMsg("문제를 만들지 못했어요."); setPhase("input"); return; }
      setSummary(res.summary); setAllQuestions(res.questions); startRound(res.questions, false);
    } catch { setErrorMsg("오류가 발생했어요. 잠시 후 다시 시도해 주세요."); setPhase("input"); }
  }
  function handleGrade() {
    if (remaining > 0 && !confirmGrade) { setConfirmGrade(true); return; }
    let s = 0; activeQuestions.forEach((q, i) => { if (isCorrect(q, answers[i])) s++; });
    setResult({ score: s, total: activeQuestions.length }); setConfirmGrade(false); setPhase("result"); window.scrollTo({ top: 0, behavior: "smooth" });
  }
  async function handleSimilar() {
    const weak = activeQuestions.filter((q, i) => !isCorrect(q, answers[i])).map((q) => ({ prompt: q.prompt, answer: q.answer }));
    if (!weak.length) return; setLoadingKind("similar"); setPhase("loading");
    try {
      let res: QuizResult;
      if (pdfFile) { const fd = new FormData(); fd.append("file", pdfFile); fd.append("difficulty", difficulty); fd.append("weak", JSON.stringify(weak)); res = await createSimilarQuizFromPdf(fd); }
      else { res = await createSimilarQuiz(sourceText, weak, difficulty); }
      if (!res.questions.length) { setErrorMsg("비슷한 문제를 만들지 못했어요."); setPhase("result"); return; }
      if (res.summary) setSummary(res.summary); startRound(res.questions, true);
    } catch { setErrorMsg("오류가 발생했어요."); setPhase("result"); }
  }
  function handleSave() {
    if (!result || savedCurrent) return;
    const entry: SavedQuiz = { id: Date.now().toString(), subject: subject || "기타", title: title || "제목 없음", date: new Date().toISOString(), score: result.score, total: result.total, summary, sourceText, difficulty, questions: activeQuestions, answers };
    const updated = [entry, ...history].slice(0, MAX_SAVED); setHistory(updated); saveHistoryToStorage(updated); setSavedCurrent(true);
  }
  function handleLoadSaved(saved: SavedQuiz) {
    setSubject(saved.subject); setTitle(saved.title); setSourceText(saved.sourceText); setDifficulty(saved.difficulty);
    setSummary(saved.summary); setAllQuestions(saved.questions); setActiveQuestions(saved.questions);
    setAnswers(saved.answers); setResult({ score: saved.score, total: saved.total });
    setIsReviewRound(false); setSimilarDismissed(false); setSavedCurrent(true); setPdfFile(null); setPhase("result");
  }
  function handleDeleteSaved(id: string) { const u = history.filter((h) => h.id !== id); setHistory(u); saveHistoryToStorage(u); }
  function resetAll() {
    setPhase("input"); setTitle(""); setSourceText(""); setPdfFile(null); setSummary("");
    setAllQuestions([]); setActiveQuestions([]); setAnswers({}); setResult(null);
    setIsReviewRound(false); setConfirmGrade(false); setSimilarDismissed(false);
    setErrorMsg(""); setFileName(null); setSavedCurrent(false);
  }

  return (
    <div className="min-h-screen bg-[#15171C] text-[#E7E9ED]">
      <style>{`@keyframes confetti-fall{0%{transform:translateY(-20px) rotate(0deg);opacity:1}100%{transform:translateY(100vh) rotate(720deg);opacity:0}}`}</style>
      <div className="mx-auto max-w-2xl px-5 py-12">
        <header className="mb-8 text-center">
          <h1 className="text-3xl font-medium tracking-tight text-[#F4F6F9]">📝 시험 대비 도우미</h1>
          <p className="mt-1.5 text-[15px] text-[#8A92A0]">강의 자료를 붙여넣거나 PDF를 올리면 AI가 예상문제를 만들어 드려요</p>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            <span className="rounded-full bg-[#233049] px-3 py-1 text-xs text-[#B9CBFF]">🤖 AI 기반 출제</span>
            <span className="rounded-full bg-[#233049] px-3 py-1 text-xs text-[#B9CBFF]">📄 PDF 지원</span>
            <span className="rounded-full bg-[#233049] px-3 py-1 text-xs text-[#B9CBFF]">🔄 복습 모드</span>
            <span className="rounded-full bg-[#233049] px-3 py-1 text-xs text-[#B9CBFF]">💾 과목별 저장</span>
          </div>
        </header>

        {phase === "input" && (
          <div className="space-y-4">
            <div onDragOver={(e)=>{e.preventDefault();setDragOver(true)}} onDragLeave={()=>setDragOver(false)} onDrop={handleDrop} onClick={()=>fileInputRef.current?.click()}
              className={`flex cursor-pointer flex-col items-center rounded-2xl border-2 border-dashed p-7 transition ${dragOver?"border-[#7C9CF5] bg-[#1A2030]":"border-[#2A2E37] bg-[#1D2026] hover:border-[#3A4150]"}`}>
              <input ref={fileInputRef} type="file" accept=".pdf,.txt,.md" className="hidden" onChange={(e)=>{const f=e.target.files?.[0];if(f)handleFile(f)}} />
              {extracting?(
                <div className="flex items-center gap-3"><div className="h-5 w-5 animate-spin rounded-full border-2 border-[#2A2E37] border-t-[#7C9CF5]"/><span className="text-sm text-[#8A92A0]">파일 처리 중...</span></div>
              ):pdfFile?(
                <div className="text-center"><p className="text-sm text-[#5ED3A8]">✓ PDF 업로드 완료</p><p className="mt-1 text-xs text-[#8A92A0]">📄 {fileName}</p><p className="mt-1 text-xs text-[#6B7280]">AI가 PDF를 직접 읽고 문제를 만들어요</p></div>
              ):fileName?(
                <p className="text-sm text-[#7C9CF5]">📄 {fileName}</p>
              ):(
                <>
                  <svg className="mb-2 h-8 w-8 text-[#6B7280]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"/></svg>
                  <p className="text-[#8A92A0]">PDF, TXT 파일을 여기에 놓거나 클릭</p>
                  <p className="mt-1 text-xs text-[#6B7280]">또는 아래에 직접 붙여넣기</p>
                </>
              )}
            </div>
            <div className="flex gap-3">
              <input value={subject} onChange={(e)=>setSubject(e.target.value)} placeholder="수업명 (예: 데이터사이언스개론)"
                className="flex-1 rounded-xl border border-[#2A2E37] bg-[#1D2026] px-4 py-3 text-[#F4F6F9] placeholder-[#6B7280] outline-none focus:border-[#7C9CF5]" />
              <input value={title} onChange={(e)=>setTitle(e.target.value)} placeholder="제목 (예: 2주차 인권보장)"
                className="flex-1 rounded-xl border border-[#2A2E37] bg-[#1D2026] px-4 py-3 text-[#F4F6F9] placeholder-[#6B7280] outline-none focus:border-[#7C9CF5]" />
            </div>
            {!pdfFile&&(<textarea value={sourceText} onChange={(e)=>setSourceText(e.target.value)} placeholder="여기에 강의 자료를 붙여넣으세요..." rows={8}
              className="w-full resize-none rounded-xl border border-[#2A2E37] bg-[#1D2026] px-4 py-3 leading-relaxed text-[#E7E9ED] placeholder-[#6B7280] outline-none focus:border-[#7C9CF5]"/>)}
            <div className="flex flex-wrap gap-8">
              <div><p className="mb-2 text-sm text-[#8A92A0]">문항 수</p><div className="flex gap-2">{COUNTS.map((c)=>(<button key={c} onClick={()=>setCount(c)} className={`rounded-lg border px-4 py-2 text-sm transition ${count===c?"border-[#7C9CF5] bg-[#233049] text-[#B9CBFF]":"border-[#2A2E37] bg-[#1D2026] text-[#C7CCD4] hover:border-[#3A4150]"}`}>{c}개</button>))}</div></div>
              <div><p className="mb-2 text-sm text-[#8A92A0]">난이도</p><div className="flex gap-2">{DIFFS.map((d)=>(<button key={d.value} onClick={()=>setDifficulty(d.value)} className={`rounded-lg border px-4 py-2 text-sm transition ${difficulty===d.value?"border-[#7C9CF5] bg-[#233049] text-[#B9CBFF]":"border-[#2A2E37] bg-[#1D2026] text-[#C7CCD4] hover:border-[#3A4150]"}`}>{d.label}</button>))}</div></div>
            </div>
            {errorMsg&&<p className="text-sm text-[#E5746B]">{errorMsg}</p>}
            <button onClick={handleCreate} className="w-full rounded-xl bg-gradient-to-r from-[#7C9CF5] to-[#A78BFA] py-3.5 font-medium text-white shadow-lg shadow-[#7C9CF5]/20 transition hover:opacity-90 active:scale-[0.99]">예상문제 만들기</button>

            {history.length>0&&(
              <div className="pt-4">
                <button onClick={()=>setShowHistory(!showHistory)} className="text-sm text-[#8A92A0] transition hover:text-[#B9CBFF]">{showHistory?"▼":"▶"} 내 기록 ({history.length})</button>
                {showHistory&&(<div className="mt-3 space-y-4">
                  {Object.entries(grouped).map(([sub,items])=>(
                    <div key={sub}>
                      <p className="mb-2 text-xs font-medium text-[#7C9CF5]">📚 {sub}</p>
                      <div className="space-y-2">{items.map((h)=>(
                        <div key={h.id} className="flex items-center justify-between rounded-xl border border-[#2A2E37] bg-[#1D2026] px-4 py-3">
                          <div className="min-w-0 flex-1"><p className="truncate text-sm text-[#F4F6F9]">{h.title}</p><p className="text-xs text-[#6B7280]">{new Date(h.date).toLocaleDateString("ko-KR")} · {h.score}/{h.total}</p></div>
                          <div className="ml-3 flex gap-2">
                            <button onClick={()=>handleLoadSaved(h)} className="rounded-lg bg-[#233049] px-3 py-1.5 text-xs text-[#B9CBFF] transition hover:bg-[#2A3A5A]">다시 보기</button>
                            <button onClick={()=>handleDeleteSaved(h.id)} className="rounded-lg px-2 py-1.5 text-xs text-[#6B7280] transition hover:text-[#E5746B]">✕</button>
                          </div>
                        </div>
                      ))}</div>
                    </div>
                  ))}
                </div>)}
              </div>
            )}
          </div>
        )}

        {phase==="loading"&&(
          <div className="flex flex-col items-center justify-center py-24">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#2A2E37] border-t-[#7C9CF5]"/>
            <p className="mt-5 text-[#E7E9ED]">{(loadingKind==="create"?CREATE_TIPS:SIMILAR_TIPS)[tip%(loadingKind==="create"?CREATE_TIPS.length:SIMILAR_TIPS.length)]}</p>
            <p className="mt-1.5 text-sm text-[#6B7280]">{pdfFile?"PDF를 읽고 있어서 조금 더 걸릴 수 있어요":"보통 5~15초 정도 걸려요"}</p>
          </div>
        )}

        {phase==="quiz"&&(
          <div className="space-y-5">
            <div>
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="text-[#8A92A0]">{isReviewRound&&<span className="mr-2 rounded-md bg-[#233049] px-2 py-0.5 text-xs text-[#B9CBFF]">복습 라운드</span>}{answeredCount}/{activeQuestions.length} 답함</span>
                <span className="text-[#6B7280]">{progress}%</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-[#2A2E37]"><div className="h-1.5 rounded-full bg-gradient-to-r from-[#7C9CF5] to-[#A78BFA] transition-all duration-300" style={{width:`${progress}%`}}/></div>
            </div>
            {activeQuestions.map((q,i)=>(
              <div key={i} className="rounded-2xl border border-[#2A2E37] bg-[#1D2026] p-5">
                <p className="mb-3 font-medium text-[#F4F6F9]"><span className="mr-2 text-[#7C9CF5]">{i+1}.</span>{q.prompt}</p>
                {q.type==="mcq"&&q.choices?(
                  <div className="space-y-2">{q.choices.map((c)=>(<button key={c} onClick={()=>setAnswers({...answers,[i]:c})} className={`block w-full rounded-xl border px-4 py-2.5 text-left text-[15px] transition ${answers[i]===c?"border-[#7C9CF5] bg-[#233049] text-[#B9CBFF]":"border-[#2D323C] bg-[#20242B] text-[#C7CCD4] hover:border-[#3A4150]"}`}>{c}</button>))}</div>
                ):(<input value={answers[i]??""} onChange={(e)=>setAnswers({...answers,[i]:e.target.value})} placeholder="답을 입력하세요" className="w-full rounded-xl border border-[#2D323C] bg-[#20242B] px-4 py-2.5 text-[#E7E9ED] placeholder-[#6B7280] outline-none focus:border-[#7C9CF5]"/>)}
              </div>
            ))}
            {confirmGrade&&remaining>0&&<p className="text-sm text-[#E0A458]">아직 안 푼 문제가 {remaining}개 있어요. 그래도 채점하려면 한 번 더 누르세요.</p>}
            <button onClick={handleGrade} className="w-full rounded-xl bg-gradient-to-r from-[#7C9CF5] to-[#A78BFA] py-3.5 font-medium text-white shadow-lg shadow-[#7C9CF5]/20 transition hover:opacity-90 active:scale-[0.99]">{remaining>0?`안 푼 문제 ${remaining}개 · 채점하기`:"채점하기"}</button>
          </div>
        )}

        {phase==="result"&&result&&(
          <ResultView result={result} summary={summary} questions={activeQuestions} answers={answers}
            isReviewRound={isReviewRound} similarDismissed={similarDismissed} savedCurrent={savedCurrent}
            onSimilar={handleSimilar} onDismissSimilar={()=>setSimilarDismissed(true)}
            onSave={handleSave} onRetryAll={()=>startRound(allQuestions,false)} onReset={resetAll}/>
        )}

        <footer className="mt-16 border-t border-[#2A2E37] pt-6 text-center text-xs text-[#6B7280]">
          Powered by Claude AI · 만든 사람: 회현
        </footer>
      </div>
    </div>
  );
}

function ResultView({result,summary,questions,answers,isReviewRound,similarDismissed,savedCurrent,onSimilar,onDismissSimilar,onSave,onRetryAll,onReset}:{
  result:{score:number;total:number};summary:string;questions:Question[];answers:Record<number,string>;
  isReviewRound:boolean;similarDismissed:boolean;savedCurrent:boolean;
  onSimilar:()=>void;onDismissSimilar:()=>void;onSave:()=>void;onRetryAll:()=>void;onReset:()=>void;
}) {
  const pct=Math.round((result.score/result.total)*100);
  const CIRC=2*Math.PI*52;
  const ringColor=pct>=80?"#5ED3A8":pct>=50?"#E0A458":"#E5746B";
  const wrongCount=questions.filter((q,i)=>!isCorrect(q,answers[i])).length;

  return (
    <div className="space-y-6">
      {pct>=80&&(<div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">{CONFETTI.map((e,i)=>(<span key={i} className="absolute text-2xl" style={{left:`${(i*3.3+Math.random()*5)%100}%`,top:"-20px",animation:`confetti-fall ${2+Math.random()*3}s ease-in forwards`,animationDelay:`${Math.random()*2}s`}}>{e}</span>))}</div>)}

      <div className="flex flex-col items-center rounded-2xl border border-[#2A2E37] bg-[#1D2026] py-8">
        {isReviewRound&&<span className="mb-3 rounded-md bg-[#233049] px-2.5 py-1 text-xs text-[#B9CBFF]">복습 라운드 결과</span>}
        <div className="relative h-36 w-36">
          <svg viewBox="0 0 120 120" className="h-36 w-36 -rotate-90">
            <circle cx="60" cy="60" r="52" fill="none" stroke="#2A2E37" strokeWidth="9"/>
            <circle cx="60" cy="60" r="52" fill="none" stroke={ringColor} strokeWidth="9" strokeLinecap="round" strokeDasharray={CIRC} strokeDashoffset={CIRC*(1-pct/100)} style={{transition:"stroke-dashoffset 0.8s ease"}}/>
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-3xl font-medium text-[#F4F6F9]">{pct}%</span>
            <span className="text-sm text-[#8A92A0]">{result.score}/{result.total}</span>
          </div>
        </div>
        {pct>=80&&<p className="mt-3 text-sm text-[#5ED3A8]">🎉 훌륭해요! 거의 다 맞았어요!</p>}
        {pct>=50&&pct<80&&<p className="mt-3 text-sm text-[#E0A458]">💪 조금만 더 복습하면 완벽해요!</p>}
        {pct<50&&<p className="mt-3 text-sm text-[#E5746B]">📖 복습이 필요해요. 다시 도전해보세요!</p>}
        <button onClick={onSave} disabled={savedCurrent} className={`mt-4 rounded-xl px-5 py-2.5 text-sm font-medium transition ${savedCurrent?"bg-[#233049] text-[#6B7280]":"bg-[#2D323C] text-[#B9CBFF] hover:bg-[#3A4150]"}`}>{savedCurrent?"✓ 저장됨":"이 결과 저장하기"}</button>
      </div>

      {wrongCount>0&&!similarDismissed&&(
        <div className="rounded-2xl border-2 border-[#7C9CF5] bg-[#1A2030] p-5">
          <p className="font-medium text-[#F4F6F9]">틀린 {wrongCount}문제와 비슷한 문제로 다시 도전해볼까요?</p>
          <p className="mt-1 text-sm text-[#8A92A0]">AI가 같은 개념으로 새로운 문제를 출제해서, 진짜 이해했는지 확인해줘요.</p>
          <div className="mt-4 flex gap-3">
            <button onClick={onSimilar} className="rounded-xl bg-gradient-to-r from-[#7C9CF5] to-[#A78BFA] px-5 py-2.5 font-medium text-white transition hover:opacity-90 active:scale-[0.99]">예, 만들어 주세요</button>
            <button onClick={onDismissSimilar} className="rounded-xl border border-[#2D323C] px-5 py-2.5 text-[#C7CCD4] transition hover:border-[#3A4150]">아니요</button>
          </div>
        </div>
      )}

      {summary&&(<div className="rounded-2xl border border-[#2A2E37] bg-[#1D2026] p-5"><p className="mb-2 text-sm text-[#8A92A0]">요약</p><p className="leading-relaxed text-[#E7E9ED]">{summary}</p></div>)}

      {wrongCount>0?(
        <div><p className="mb-3 text-sm text-[#8A92A0]">오답노트 ({wrongCount})</p><div className="space-y-3">{questions.map((q,i)=>isCorrect(q,answers[i])?null:(
          <div key={i} className="rounded-2xl border border-[#3A2A2E] bg-[#211A1C] p-5">
            <p className="mb-2 font-medium text-[#F4F6F9]">{q.prompt}</p>
            <p className="text-sm text-[#E5746B]">내 답: {answers[i]?.trim()?answers[i]:"(없음)"}</p>
            <p className="text-sm text-[#5ED3A8]">정답: {q.answer}</p>
            {q.explanation&&<p className="mt-2 text-sm leading-relaxed text-[#9AA1AC]">{q.explanation}</p>}
          </div>
        ))}</div></div>
      ):(<div className="rounded-2xl border border-[#27403A] bg-[#16251F] p-5 text-center"><p className="font-medium text-[#5ED3A8]">전부 맞았어요! 완벽해요 🎉</p></div>)}

      <div className="flex flex-wrap gap-3 pt-2">
        <button onClick={onRetryAll} className="rounded-xl border border-[#2D323C] px-5 py-2.5 text-[#C7CCD4] transition hover:border-[#3A4150]">처음부터 다시 풀기</button>
        <button onClick={onReset} className="rounded-xl border border-[#2D323C] px-5 py-2.5 text-[#C7CCD4] transition hover:border-[#3A4150]">새 자료로 시작</button>
      </div>
    </div>
  );
}