import { useEffect, useMemo, useState } from "react";
import { Bot, RefreshCw, Send, ShieldCheck, Sparkles, User } from "lucide-react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { getRoutines } from "../../services/routineService";
import { getHealthCheckups, getHealthIssues, type HealthCheckup, type HealthIssue } from "../../services/medicalReportService";
import type { Routine, RoutineLog } from "../../types/routine";

type Message = { id: string; role: "user" | "assistant"; text: string };
type DataSnapshot = { routines: Routine[]; logs: RoutineLog[]; checkups: HealthCheckup[]; issues: HealthIssue[] };

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
function dateObj(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "string") { const d = new Date(value); return Number.isNaN(d.getTime()) ? null : d; }
  const d = (value as { toDate?: () => Date })?.toDate?.();
  return d && !Number.isNaN(d.getTime()) ? d : null;
}
function dateText(value: unknown) { const d = dateObj(value); return d ? d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"; }
function idsFor(c: HealthCheckup) { return Array.from(new Set([...(c.healthIssueIds ?? []), ...(c.healthIssueId ? [c.healthIssueId] : [])])); }
function tokens(q: string) { return normalize(q).split(" ").filter(x => x.length > 2); }

function scoreText(q: string, text: string) {
  const nq = normalize(q), nt = normalize(text); let score = 0;
  for (const t of tokens(q)) if (nt.includes(t)) score += t.length >= 6 ? 3 : 1;
  if (nt.includes(nq)) score += 8;
  return score;
}
function bestMatches<T>(q: string, items: T[], textOf: (x: T) => string, limit = 8) {
  return items.map(item => ({ item, score: scoreText(q, textOf(item)) })).filter(x => x.score > 0).sort((a,b) => b.score-a.score).slice(0, limit).map(x => x.item);
}

function answerQuestion(question: string, data: DataSnapshot): string {
  const q = normalize(question);
  const yearMatch = q.match(/\b(20\d{2})\b/);
  const monthNames = ["january","february","march","april","may","june","july","august","september","october","november","december"];
  const monthIndex = monthNames.findIndex(m => q.includes(m));
  const dateFilter = (v: unknown) => { const d = dateObj(v); if (!d) return false; return (!yearMatch || d.getFullYear() === Number(yearMatch[1])) && (monthIndex < 0 || d.getMonth() === monthIndex); };
  const has = (...words: string[]) => words.some(w => q.includes(w));

  if (has("help", "what can", "ask")) return "I can answer questions from your saved AimeSig data: routines, routine history, health issues, health checkups, dates, notes, attachments and Issue ↔ Checkup relationships. I don't read attachment contents, and I won't invent information.";

  if (has("routine", "habit", "log", "completion", "completed")) {
    const routines = data.routines.filter(r => !r.deletedAt);
    const logs = data.logs.filter(l => dateFilter(l.date));
    const matched = bestMatches(question, routines, r => `${r.title} ${r.description ?? ""}`, 5);
    const completed = logs.filter(l => String(l.status ?? "").toLowerCase() === "yes" || String(l.status ?? "").toLowerCase() === "completed");
    if (has("how many", "count", "number") && has("log", "routine")) return `I found ${logs.length} routine log${logs.length === 1 ? "" : "s"}${yearMatch || monthIndex >= 0 ? " in the requested period" : ""}. ${completed.length} are marked completed/yes.`;
    if (matched.length) return `Here are the routines most related to your question:\n${matched.map(r => `• ${r.title} — ${r.active ? "active" : "inactive"}`).join("\n")}\n\nI found ${completed.length} completed log${completed.length === 1 ? "" : "s"} in the selected period.`;
    return routines.length ? `You have ${routines.length} active/non-deleted routine${routines.length === 1 ? "" : "s"}.\n${routines.slice(0,8).map(r => `• ${r.title}`).join("\n")}` : "I couldn't find any saved routines.";
  }

  if (has("checkup", "report", "lab", "prescription", "bill", "medical")) {
    const checkups = data.checkups.filter(c => dateFilter(c.date));
    const matched = bestMatches(question, checkups, c => `${c.title} ${c.category} ${c.notes ?? ""}`, 6);
    const list = matched.length ? matched : checkups.slice(0, 6);
    if (!list.length) return "I couldn't find a health checkup in the saved data for that period.";
    const issueMap = new Map((data.issues.map(i => [i.id, i.title])));
    return `${matched.length ? "I found these checkups related to your question:" : "Here are the relevant saved checkups:"}\n${list.map(c => { const linked = idsFor(c).map(id => issueMap.get(id)).filter(Boolean); return `• ${c.title} — ${dateText(c.date)}${linked.length ? ` — linked to: ${linked.join(", ")}` : ""}${(c.attachments ?? []).length ? ` — ${(c.attachments ?? []).length} attachment${c.attachments.length === 1 ? "" : "s"}` : ""}`; }).join("\n")}`;
  }

  if (has("issue", "problem", "condition", "disease", "health")) {
    const issues = data.issues.filter(i => dateFilter(i.date));
    const matched = bestMatches(question, issues, i => `${i.title} ${i.notes ?? ""}`, 6);
    const list = matched.length ? matched : issues.slice(0, 6);
    if (!list.length) return "I couldn't find a health issue matching that question in your saved data.";
    return `${matched.length ? "I found these health issues related to your question:" : "Here are the saved health issues:"}\n${list.map(i => { const checkups = data.checkups.filter(c => idsFor(c).includes(i.id ?? "")); return `• ${i.title} — ${dateText(i.date)}${checkups.length ? ` — ${checkups.length} linked checkup${checkups.length === 1 ? "" : "s"}` : ""}${(i.attachments ?? []).length ? ` — ${(i.attachments ?? []).length} attachment${i.attachments.length === 1 ? "" : "s"}` : ""}`; }).join("\n")}`;
  }

  if (has("attachment", "document", "file")) {
    const checkups = data.checkups.filter(c => (c.attachments ?? []).length > 0 && dateFilter(c.date));
    const issues = data.issues.filter(i => (i.attachments ?? []).length > 0 && dateFilter(i.date));
    const total = checkups.reduce((n,c) => n + c.attachments.length,0) + issues.reduce((n,i) => n + i.attachments.length,0);
    return `I found ${total} attached document${total === 1 ? "" : "s"}${yearMatch || monthIndex >= 0 ? " in the selected period" : ""}.\n\nHealth Checkups:\n${checkups.length ? checkups.map(c => `• ${c.title} — ${c.attachments.map(a=>a.name).join(", ")}`).join("\n") : "• None"}\n\nHealth Issues:\n${issues.length ? issues.map(i => `• ${i.title} — ${i.attachments.map(a=>a.name).join(", ")}`).join("\n") : "• None"}\n\nAttachment contents are not read by this assistant.`;
  }

  if (has("latest", "recent", "newest")) {
    const combined = [...data.checkups.map(c => ({ kind: "Health Checkup", title: c.title, date: c.date })), ...data.issues.map(i => ({ kind: "Health Issue", title: i.title, date: i.date }))].sort((a,b) => (dateObj(b.date)?.getTime() ?? 0) - (dateObj(a.date)?.getTime() ?? 0)).slice(0, 8);
    return combined.length ? `Your latest saved health records are:\n${combined.map(x => `• ${x.kind}: ${x.title} — ${dateText(x.date)}`).join("\n")}` : "There are no saved health records yet.";
  }

  const all = [
    ...data.issues.map(i => ({ title: i.title, type: "Health Issue", text: `${i.title} ${i.notes ?? ""}` })),
    ...data.checkups.map(c => ({ title: c.title, type: "Health Checkup", text: `${c.title} ${c.category} ${c.notes ?? ""}` })),
    ...data.routines.map(r => ({ title: r.title, type: "Routine", text: `${r.title} ${r.description ?? ""}` })),
  ];
  const matches = bestMatches(question, all, x => x.text, 6);
  if (matches.length) return `I found these saved AimeSig records related to your question:\n${matches.map(x => `• ${x.type}: ${x.title}`).join("\n")}\n\nAsk me to show the details, linked records, dates, notes, or attachments for any of them.`;
  return "I couldn't find enough matching information in your saved AimeSig data. Try asking about a routine, health issue, health checkup, report, attachment, date/year/month, or a relationship between an issue and a checkup.";
}

function suggestionsFor(question: string, data: DataSnapshot): string[] {
  const q = normalize(question); const firstIssue = data.issues[0]?.title; const firstCheckup = data.checkups[0]?.title;
  if (q.includes("routine") || q.includes("log") || q.includes("habit")) return ["Which routine has the most completed logs?", "Show my recent routine activity", "Which routines are inactive?", "How many routine logs do I have this year?"];
  if (q.includes("issue") || q.includes("condition")) return [firstIssue ? `What checkups are linked to ${firstIssue}?` : "Which checkups are linked to my health issues?", "Which health issues have attached reports?", "Show my health issue timeline", "Which issues have multiple checkups?"];
  if (q.includes("checkup") || q.includes("report") || q.includes("lab") || q.includes("prescription") || q.includes("bill")) return [firstCheckup ? `Tell me about ${firstCheckup}` : "Show my latest health checkup", "Which issues are linked to my checkups?", "Which checkups have attachments?", "Show checkups from this year"];
  if (q.includes("attachment") || q.includes("document") || q.includes("file")) return ["Which checkups have documents attached?", "Which issues reference checkup documents?", "Show my recent medical documents", "Which reports are linked to health issues?"];
  return ["What are my active routines?", "Show my latest health records", "Which health issues are linked to checkups?", "Which checkups have attachments?"];
}

export function ChatbotView({ userId }: { userId: string }) {
  const [data, setData] = useState<DataSnapshot>({ routines: [], logs: [], checkups: [], issues: [] });
  const [messages, setMessages] = useState<Message[]>([{ id: "welcome", role: "assistant", text: "Hi! I’m AimeSig Assistant. I can instantly search and reason across your saved routines, health issues and health checkups. Your data stays in AimeSig; no AI model or cloud AI service is required." }]);
  const [input, setInput] = useState(""); const [loading, setLoading] = useState(false); const [dataLoading, setDataLoading] = useState(true); const [error, setError] = useState("");
  async function loadData() { setDataLoading(true); setError(""); try { const [routines, checkups, issues, logSnap] = await Promise.all([getRoutines(userId,{includeDeleted:true}), getHealthCheckups(userId), getHealthIssues(userId), getDocs(collection(db,"users",userId,"routineLogs"))]); setData({ routines, checkups, issues, logs: logSnap.docs.map(d=>({id:d.id,...d.data()} as RoutineLog)) }); } catch(e){ console.error(e); setError("Could not load your AimeSig data. Please refresh."); } finally { setDataLoading(false); } }
  useEffect(()=>{void loadData();},[userId]);
  const suggestions = useMemo(()=>suggestionsFor(messages.filter(m=>m.role==="user").at(-1)?.text ?? "",data),[messages,data]);
  function send(question=input) { const text=question.trim(); if(!text||loading||dataLoading)return; setInput(""); setError(""); setLoading(true); setMessages(p=>[...p,{id:crypto.randomUUID(),role:"user",text}]); setTimeout(()=>{ try { const answer=answerQuestion(text,data); setMessages(p=>[...p,{id:crypto.randomUUID(),role:"assistant",text:answer}]); } finally { setLoading(false); } }, 20); }
  return <div className="mx-auto w-full max-w-3xl px-1 sm:px-2">
    <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] shadow-sm">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-pink-soft)] text-[var(--accent-pink)]"><Sparkles size={18}/></div>
          <div className="min-w-0"><h2 className="truncate text-base font-semibold">AimeSig Assistant</h2><p className="truncate text-xs text-[var(--text-muted)]">Private answers from your AimeSig data</p></div>
        </div>
        <button aria-label="Refresh data" onClick={()=>void loadData()} disabled={dataLoading} className="shrink-0 rounded-lg p-2 text-[var(--text-muted)] hover:bg-[var(--surface-strong)] disabled:opacity-40"><RefreshCw size={16}/></button>
      </div>

      <div className="h-[min(58vh,520px)] min-h-[340px] overflow-y-auto bg-[var(--bg)] px-3 py-4 sm:px-5">
        {dataLoading ? <div className="flex h-full items-center justify-center text-sm text-[var(--text-muted)]">Loading your data…</div> : messages.map(m=><div key={m.id} className={`mb-3 flex gap-2 ${m.role==="user"?"justify-end":"justify-start"}`}>
          <div className={`flex max-w-[92%] gap-2 sm:max-w-[82%] ${m.role==="user"?"flex-row-reverse":""}`}>
            <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--surface-strong)] text-[var(--text-secondary)]">{m.role==="user"?<User size={13}/>:<Bot size={13}/>}</div>
            <div className={`whitespace-pre-wrap break-words rounded-2xl px-3 py-2.5 text-sm leading-6 ${m.role==="user"?"bg-[var(--accent-pink)] text-white":"bg-[var(--surface-strong)] text-[var(--text-primary)]"}`}>{m.text}</div>
          </div>
        </div>)}
        {loading&&<div className="ml-9 text-sm text-[var(--text-muted)]">Thinking…</div>}
      </div>

      <div className="border-t border-[var(--border)] bg-[var(--bg-elevated)] p-3 sm:p-4">
        <div className="flex items-end gap-2">
          <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")send();}} disabled={dataLoading||loading} placeholder="Ask about your routines or health…" className="min-w-0 flex-1 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3.5 py-2.5 text-sm outline-none transition focus:border-[var(--accent-pink)]"/>
          <button aria-label="Send message" onClick={()=>send()} disabled={!input.trim()||loading||dataLoading} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-pink)] text-white disabled:opacity-40"><Send size={17}/></button>
        </div>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
          {suggestions.map(s=><button key={s} onClick={()=>send(s)} disabled={loading||dataLoading} className="shrink-0 rounded-full border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-strong)] disabled:opacity-50">{s}</button>)}
        </div>
        <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-[var(--text-muted)]"><span className="truncate">{dataLoading?"Loading…":"Ready · your data stays in AimeSig"}</span><span className="shrink-0"><ShieldCheck size={12} className="mr-1 inline text-emerald-500"/>Private</span></div>
        {error&&<p className="mt-2 text-xs text-red-500">{error}</p>}
      </div>
    </div>
  </div>;
}
