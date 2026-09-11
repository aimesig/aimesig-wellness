import { useEffect, useMemo, useState } from "react";
import { Bot, MessageCircle, RefreshCw, Send, X } from "lucide-react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { getRoutines } from "../../services/routineService";
import { getHealthCheckups, getHealthIssues, type HealthCheckup, type HealthIssue } from "../../services/medicalReportService";
import type { Routine, RoutineLog } from "../../types/routine";

interface WellnessChatbotProps {
  userId: string;
}

type ChatMessage = { id: number; role: "bot" | "user"; text: string };

function formatDate(value: string | { toDate?: () => Date } | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value.toDate?.();
  if (!date || Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function lower(value: unknown): string {
  return String(value ?? "").toLowerCase();
}

function includesAny(text: string, words: string[]): boolean {
  return words.some((word) => text.includes(word));
}

function getLinkedIssueIds(checkup: HealthCheckup): string[] {
  return Array.from(new Set([
    ...(checkup.healthIssueIds ?? []),
    ...(checkup.healthIssueId ? [checkup.healthIssueId] : []),
  ]));
}

export function WellnessChatbot({ userId }: WellnessChatbotProps) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [logs, setLogs] = useState<RoutineLog[]>([]);
  const [checkups, setCheckups] = useState<HealthCheckup[]>([]);
  const [issues, setIssues] = useState<HealthIssue[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 1,
      role: "bot",
      text: "Hi! I’m your AimeSig data assistant. I can answer from your saved routines, routine history, health issues, health checkups, notes and attachment information. I don’t use an external AI service, so this stays free.",
    },
  ]);

  const activeRoutines = useMemo(() => routines.filter((r) => r.active && !r.deletedAt), [routines]);

  async function loadData() {
    setLoading(true);
    try {
      const [routineData, checkupData, issueData, logSnap] = await Promise.all([
        getRoutines(userId, { includeDeleted: true }),
        getHealthCheckups(userId),
        getHealthIssues(userId),
        getDocs(collection(db, "users", userId, "routineLogs")),
      ]);
      setRoutines(routineData);
      setCheckups(checkupData);
      setIssues(issueData);
      setLogs(logSnap.docs.map((d) => ({ id: d.id, ...d.data() } as RoutineLog)));
      setDataLoaded(true);
    } catch (error) {
      console.error("Wellness chatbot data load failed:", error);
      setMessages((prev) => [...prev, { id: Date.now(), role: "bot", text: "I couldn’t load your saved data right now. Please try Refresh." }]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open && !dataLoaded) void loadData();
  }, [open, dataLoaded]);

  function answer(question: string): string {
    const q = lower(question).trim();
    if (!q) return "Ask me about your routines, routine history, health issues, health checkups, reports, attachments, dates or notes.";

    if (includesAny(q, ["hello", "hi", "hey"])) {
      return "Hello! Ask me something like “What routines do I have?”, “Show my latest checkups”, “What health issues are linked to my checkups?”, or “How many routine logs do I have?”";
    }

    if (includesAny(q, ["what can you", "help", "how can you"])) {
      return "I can search only the data saved in AimeSig: routines and their history, health issues, health checkups, notes, dates, attachment names/counts, and issue↔checkup links. I can’t read the inside of an attached PDF/image unless its information is saved as text in AimeSig.";
    }

    if (includesAny(q, ["how many", "count", "number of"])) {
      const parts: string[] = [];
      if (includesAny(q, ["routine"])) parts.push(`${routines.length} routines (${activeRoutines.length} active)`);
      if (includesAny(q, ["log", "history", "activity"])) parts.push(`${logs.length} routine logs`);
      if (includesAny(q, ["issue"])) parts.push(`${issues.length} health issues`);
      if (includesAny(q, ["checkup", "report", "medical"])) parts.push(`${checkups.length} health checkups`);
      if (includesAny(q, ["attachment", "document", "file"])) {
        const total = checkups.reduce((n, c) => n + (c.attachments?.length ?? 0), 0) + issues.reduce((n, i) => n + (i.attachments?.length ?? 0) + (i.referencedAttachments?.length ?? 0), 0);
        parts.push(`${total} saved/referenced medical attachments`);
      }
      return parts.length ? `You have ${parts.join(", ")}.` : `You have ${routines.length} routines, ${logs.length} routine logs, ${issues.length} health issues and ${checkups.length} health checkups.`;
    }

    if (includesAny(q, ["routine", "routines"])) {
      const matched = activeRoutines.filter((r) => q.includes(lower(r.title)) || lower(r.description).includes(q.replace(/routine|routines/g, "").trim()));
      if (matched.length) {
        return matched.map((r) => {
          const routineLogs = logs.filter((l) => l.routineId === r.id);
          const yes = routineLogs.filter((l) => l.status === "yes").length;
          return `• ${r.title}: ${r.frequency}, ${routineLogs.length} logged entries, ${yes} completed.`;
        }).join("\n");
      }
      const list = activeRoutines.slice(0, 12).map((r) => `• ${r.title} — ${r.frequency}${r.description ? ` — ${r.description}` : ""}`);
      return list.length ? `Your active routines are:\n${list.join("\n")}` : "I don’t see any active routines.";
    }

    const issueMatch = issues.find((i) => q.includes(lower(i.title)) || lower(i.title).includes(q));
    if (issueMatch || includesAny(q, ["health issue", "health issues", "problem", "condition"])) {
      if (!issueMatch) {
        const list = issues.slice(0, 12).map((i) => `• ${i.title} — ${formatDate(i.date)}`);
        return list.length ? `Your saved health issues are:\n${list.join("\n")}` : "I don’t see any saved health issues.";
      }
      const linked = checkups.filter((c) => getLinkedIssueIds(c).includes(issueMatch.id ?? ""));
      const notes = issueMatch.notes ? `\nNotes: ${issueMatch.notes}` : "";
      const files = (issueMatch.attachments?.length ?? 0) + (issueMatch.referencedAttachments?.length ?? 0);
      return `${issueMatch.title} — ${formatDate(issueMatch.date)}${notes}\n${linked.length ? `Linked checkups: ${linked.map((c) => c.title).join(", ")}.` : "No linked checkups saved."}\nAttachments: ${files}.`;
    }

    const checkupMatch = checkups.find((c) => q.includes(lower(c.title)) || lower(c.title).includes(q));
    if (checkupMatch || includesAny(q, ["checkup", "check ups", "report", "medical report", "lab", "prescription", "bill"])) {
      if (!checkupMatch) {
        const sorted = [...checkups].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        const list = sorted.slice(0, 10).map((c) => `• ${c.title} — ${formatDate(c.date)} — ${c.category}`);
        return list.length ? `Your recent health checkups are:\n${list.join("\n")}` : "I don’t see any saved health checkups.";
      }
      const linkedIds = getLinkedIssueIds(checkupMatch);
      const linkedIssues = issues.filter((i) => linkedIds.includes(i.id ?? ""));
      return `${checkupMatch.title} — ${formatDate(checkupMatch.date)} — ${checkupMatch.category}\n${checkupMatch.notes ? `Notes: ${checkupMatch.notes}\n` : ""}Attachments: ${checkupMatch.attachments?.length ?? 0}.${linkedIssues.length ? `\nLinked health issues: ${linkedIssues.map((i) => i.title).join(", ")}.` : "\nNo health issues linked."}`;
    }

    if (includesAny(q, ["latest", "recent", "last"])) {
      const latestCheckup = [...checkups].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
      const latestIssue = [...issues].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
      const latestLog = [...logs].sort((a, b) => b.date.toMillis() - a.date.toMillis())[0];
      const routineTitle = latestLog ? routines.find((r) => r.id === latestLog.routineId)?.title : null;
      return `Latest available data:\n• Checkup: ${latestCheckup ? `${latestCheckup.title} (${formatDate(latestCheckup.date)})` : "none"}\n• Health issue: ${latestIssue ? `${latestIssue.title} (${formatDate(latestIssue.date)})` : "none"}\n• Routine activity: ${routineTitle ? `${routineTitle} (${formatDate(latestLog?.date)})` : "none"}`;
    }

    if (includesAny(q, ["attachment", "document", "file"])) {
      const rows = checkups.flatMap((c) => (c.attachments ?? []).map((a) => `• ${a.name} — ${c.title} (${formatDate(c.date)})`));
      const issueRows = issues.flatMap((i) => (i.attachments ?? []).map((a) => `• ${a.name} — ${i.title} (${formatDate(i.date)})`));
      const all = [...rows, ...issueRows];
      return all.length ? `Saved medical attachments I can see:\n${all.slice(0, 15).join("\n")}${all.length > 15 ? `\n…and ${all.length - 15} more.` : ""}` : "I don’t see any medical attachments saved.";
    }

    const token = q.split(/\s+/).filter((t) => t.length > 2).slice(0, 5);
    const routineHit = activeRoutines.find((r) => token.some((t) => lower(r.title).includes(t) || lower(r.description).includes(t)));
    const issueHit = issues.find((i) => token.some((t) => lower(i.title).includes(t) || lower(i.notes).includes(t)));
    const checkupHit = checkups.find((c) => token.some((t) => lower(c.title).includes(t) || lower(c.notes).includes(t)));
    if (routineHit || issueHit || checkupHit) {
      const hits = [
        routineHit ? `Routine: ${routineHit.title}` : "",
        issueHit ? `Health issue: ${issueHit.title}` : "",
        checkupHit ? `Checkup: ${checkupHit.title}` : "",
      ].filter(Boolean);
      return `I found matching saved data: ${hits.join(" · ")}. Ask me about that item for more details.`;
    }

    return "I couldn’t find that in your saved AimeSig data. Try asking about routines, routine history, health issues, checkups, reports, attachments, dates, or notes.";
  }

  function send() {
    const text = input.trim();
    if (!text || loading) return;
    setMessages((prev) => [...prev, { id: Date.now(), role: "user", text }, { id: Date.now() + 1, role: "bot", text: dataLoaded ? answer(text) : "I’m still loading your data. Please try again in a moment." }]);
    setInput("");
  }

  return (
    <>
      {open && (
        <div className="fixed bottom-24 right-4 z-50 flex w-[min(380px,calc(100vw-2rem))] flex-col overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--bg-elevated)] shadow-2xl sm:bottom-6 sm:right-6">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="rounded-xl bg-[var(--accent-pink-soft)] p-2 text-[var(--accent-pink)]"><Bot size={17} /></div>
              <div>
                <p className="text-sm font-bold text-[var(--text-primary)]">AimeSig Data Assistant</p>
                <p className="text-[10px] text-[var(--text-muted)]">Free · uses only your saved data</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button type="button" title="Refresh data" onClick={() => void loadData()} className="rounded-lg p-2 text-[var(--text-secondary)] hover:bg-[var(--surface-strong)]"><RefreshCw size={15} className={loading ? "animate-spin" : ""} /></button>
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-2 text-[var(--text-secondary)] hover:bg-[var(--surface-strong)]"><X size={16} /></button>
            </div>
          </div>

          <div className="max-h-[min(55vh,460px)] space-y-3 overflow-y-auto p-3">
            {messages.map((message) => (
              <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[88%] whitespace-pre-line rounded-2xl px-3 py-2 text-sm ${message.role === "user" ? "bg-[var(--accent-pink)] text-white" : "bg-[var(--surface-strong)] text-[var(--text-primary)]"}`}>
                  {message.text}
                </div>
              </div>
            ))}
            {loading && <div className="text-xs text-[var(--text-muted)]">Loading your saved data…</div>}
          </div>

          <div className="border-t border-[var(--border)] p-3">
            <div className="flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") send(); }}
                placeholder="Ask about your routines or health…"
                className="min-w-0 flex-1 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-pink)]"
              />
              <button type="button" onClick={send} disabled={!input.trim() || loading} className="rounded-xl bg-[var(--accent-pink)] px-3 text-white disabled:opacity-40"><Send size={16} /></button>
            </div>
          </div>
        </div>
      )}

      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-20 right-4 z-40 flex items-center gap-2 rounded-full bg-[var(--accent-pink)] px-4 py-3 text-sm font-bold text-white shadow-xl transition hover:scale-105 sm:bottom-6 sm:right-6"
          aria-label="Open AimeSig Data Assistant"
        >
          <MessageCircle size={18} />
          <span className="hidden sm:inline">Ask AimeSig</span>
        </button>
      )}
    </>
  );
}
