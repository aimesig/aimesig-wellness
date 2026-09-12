import { useEffect, useState, useCallback } from "react";
import {
  ChevronDown,
  Layers,
  Loader2,
  Minus,
  Pencil,
  Plus,
  Sparkles,
  Target,
  Trash2,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { collection, getDocs, query, where, doc, setDoc, deleteDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { getRoutines } from "../../services/routineService";
import { getRoutinesForDate } from "../../utils/recurrence";
import type { Routine, RoutineInputField, RoutineLog } from "../../types/routine";

// ─── types ─────────────────────────────────────────────────────────────────

type GoalPeriod = "weekly" | "monthly" | "yearly";
type HeatmapRange = "7d" | "30d" | "3m" | "1y" | "lifetime";

/** Which value is shown as the primary "big number" inside the goal progress block. */
type GoalDisplayStat =
  | "actual"       // sum / yes-count for the period (default)
  | "percentage"   // % of goal reached
  | "current"      // latest single log value (numeric) or period % (yes/no)
  | "average"      // mean log value (numeric) or avg completion % (yes/no)
  | "submissions"; // total number of logs in the period

const GOAL_DISPLAY_OPTIONS: { key: GoalDisplayStat; label: string }[] = [
  { key: "actual",      label: "Actual" },
  { key: "percentage",  label: "Percentage" },
  { key: "current",     label: "Current" },
  { key: "average",     label: "Average" },
  { key: "submissions", label: "Submissions" },
];

// Stats the user can opt into when creating a card
type StatKey =
  | "current"       // latest value (numeric) or completion % (yes/no)
  | "average"       // mean value over the period (numeric) or avg completion % (yes/no)
  | "total"         // sum of values (numeric) or total yes-days (yes/no)
  | "submissions"   // total number of logs in the period
  | "best_streak"   // longest consecutive yes streak
  | "min"           // minimum value (numeric only)
  | "max"           // maximum value (numeric only)
  | "goal_progress"; // period goal progress % (always shown, but toggleable)

const STAT_OPTIONS: { key: StatKey; label: string; numericOnly?: boolean; yesnoOnly?: boolean }[] = [
  { key: "goal_progress", label: "Goal progress" },
  { key: "current",       label: "Current" },
  { key: "average",       label: "Average" },
  { key: "total",         label: "Total" },
  { key: "submissions",   label: "Submissions" },
  { key: "best_streak",   label: "Best streak",   yesnoOnly: true },
  { key: "min",           label: "Min",            numericOnly: true },
  { key: "max",           label: "Max",            numericOnly: true },
];

const DEFAULT_STATS: StatKey[] = ["goal_progress", "current", "average", "submissions"];

/** Color palette cycled through when comparing multiple numeric fields on one chart. */
const FIELD_COLORS = [
  "var(--accent-pink)",
  "var(--accent-blue)",
  "var(--accent-yellow)",
  "var(--success)",
  "var(--danger)",
  "var(--warning)",
];

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

interface AnalyticsCard {
  id: string;
  routineId: string;
  goalPeriod: GoalPeriod;
  goalTarget: number;
  heatmapRange: HeatmapRange;
  enabledStats: StatKey[]; // which stat chips to show
  /** What the big number in the goal-progress block shows. Defaults to "actual". */
  goalDisplayStat: GoalDisplayStat;
  /** For inputType === "multi": which named field this card's goal/stats/chart track. */
  fieldKey?: string;
  /** For inputType === "multi" with 2+ fields: show every field on one comparison chart. */
  compareFields?: boolean;
}

// ─── helpers ───────────────────────────────────────────────────────────────

function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function toDayStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function getRangeStart(range: HeatmapRange): Date {
  const now = new Date();
  const d = toDayStart(now);
  if (range === "7d") { d.setDate(d.getDate() - 6); return d; }
  if (range === "30d") { d.setDate(d.getDate() - 29); return d; }
  if (range === "3m") { d.setMonth(d.getMonth() - 3); return d; }
  if (range === "1y") { d.setFullYear(d.getFullYear() - 1); return d; }
  // lifetime — 3 years back max for display
  d.setFullYear(d.getFullYear() - 3); return d;
}

function getRangeDays(range: HeatmapRange): Date[] {
  const start = getRangeStart(range);
  const today = toDayStart(new Date());
  const days: Date[] = [];
  const cur = new Date(start);
  while (cur <= today) {
    days.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

/** True for any routine whose logs carry a numeric value (legacy "number" or new "multi"). */
function isNumericRoutine(routine: Routine): boolean {
  return routine.inputType === "number" || routine.inputType === "multi";
}

/** The field being tracked by a card, for "multi" routines only. Falls back to the first field. */
function resolveField(routine: Routine, fieldKey?: string): RoutineInputField | undefined {
  if (routine.inputType !== "multi") return undefined;
  const fields = routine.inputFields ?? [];
  return fields.find((f) => f.key === fieldKey) ?? fields[0];
}

/** Reads the numeric value a card cares about off a log, regardless of legacy/multi shape. */
function makeValueGetter(routine: Routine, field: RoutineInputField | undefined) {
  if (routine.inputType === "multi") {
    return (log: RoutineLog): number | null => {
      if (!field) return null;
      const v = log.values?.[field.key];
      return typeof v === "number" && Number.isFinite(v) ? v : null;
    };
  }
  return (log: RoutineLog): number | null =>
    typeof log.value === "number" && Number.isFinite(log.value) ? log.value : null;
}

/** Start/end (inclusive) of the calendar period containing refDate. */
function getPeriodRange(period: GoalPeriod, refDate: Date): { start: Date; end: Date } {
  const d = toDayStart(refDate);
  if (period === "weekly") {
    const start = new Date(d);
    start.setDate(start.getDate() - start.getDay());
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return { start, end };
  }
  if (period === "monthly") {
    const start = new Date(d.getFullYear(), d.getMonth(), 1);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return { start, end };
  }
  const start = new Date(d.getFullYear(), 0, 1);
  const end = new Date(d.getFullYear(), 11, 31);
  return { start, end };
}

/** The immediately preceding period of the same kind (previous week/month/year). */
function getPreviousPeriodRange(period: GoalPeriod, refDate: Date): { start: Date; end: Date } {
  const cur = getPeriodRange(period, refDate);
  const before = new Date(cur.start);
  before.setDate(before.getDate() - 1);
  return getPeriodRange(period, before);
}

interface RangeAggregate { actual: number; submissions: number; scheduled: number }

/** Sums/counts a routine's logs over [start, end], capped at today. */
function aggregateRange(
  routine: Routine,
  logMap: Map<string, RoutineLog>,
  start: Date,
  end: Date,
  numeric: boolean,
  getValue: (log: RoutineLog) => number | null,
): RangeAggregate {
  const today = toDayStart(new Date());
  const cappedEnd = end > today ? today : end;
  let actual = 0;
  let submissions = 0;
  let scheduled = 0;
  const cur = new Date(start);
  while (cur <= cappedEnd) {
    const key = toDateKey(cur);
    const log = logMap.get(key);
    const isScheduled = getRoutinesForDate([routine], cur).length > 0 || !!log;
    if (isScheduled) {
      scheduled++;
      if (log) submissions++;
      if (numeric) {
        const v = log?.status === "yes" ? getValue(log) : null;
        if (v != null) actual += v;
      } else if (log?.status === "yes") {
        actual++;
      }
    }
    cur.setDate(cur.getDate() + 1);
  }
  return { actual, submissions, scheduled };
}

/** Weekday (0-6) with the strongest average/completion-rate, or null if not enough data. */
function computeBestWeekday(
  routine: Routine,
  logMap: Map<string, RoutineLog>,
  range: HeatmapRange,
  numeric: boolean,
  getValue: (log: RoutineLog) => number | null,
): number | null {
  const days = getRangeDays(range);
  const today = toDayStart(new Date());
  const buckets = Array.from({ length: 7 }, () => ({ sum: 0, count: 0, yes: 0, scheduled: 0 }));

  for (const d of days) {
    if (d > today) continue;
    const log = logMap.get(toDateKey(d));
    const isScheduled = getRoutinesForDate([routine], d).length > 0 || !!log;
    if (!isScheduled) continue;
    const b = buckets[d.getDay()];
    b.scheduled++;
    if (numeric) {
      const v = log?.status === "yes" ? getValue(log) : null;
      if (v != null) { b.sum += v; b.count++; }
    } else if (log?.status === "yes") {
      b.yes++;
    }
  }

  let bestIdx: number | null = null;
  let bestScore = -Infinity;
  buckets.forEach((b, i) => {
    if (numeric) {
      if (b.count >= 2) {
        const avg = b.sum / b.count;
        if (avg > bestScore) { bestScore = avg; bestIdx = i; }
      }
    } else if (b.scheduled >= 2) {
      const rate = b.yes / b.scheduled;
      if (rate > bestScore) { bestScore = rate; bestIdx = i; }
    }
  });
  return bestIdx;
}

// ─── data fetching ─────────────────────────────────────────────────────────

async function fetchAllLogs(userId: string, routineId: string): Promise<RoutineLog[]> {
  const ref = collection(db, "users", userId, "routineLogs");
  const q = query(ref, where("routineId", "==", routineId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as RoutineLog));
}

async function loadAnalyticsCards(userId: string): Promise<AnalyticsCard[]> {
  const ref = collection(db, "users", userId, "analyticsCards");
  const snap = await getDocs(ref);
  return snap.docs.map((d) => {
    const data = d.data() as Omit<AnalyticsCard, "id">;
    return {
      id: d.id,
      ...data,
      // Back-compat: old cards without enabledStats / goalDisplayStat get the defaults
      enabledStats: data.enabledStats ?? DEFAULT_STATS,
      goalDisplayStat: data.goalDisplayStat ?? "actual",
    };
  });
}

async function saveAnalyticsCard(userId: string, card: Omit<AnalyticsCard, "id">): Promise<string> {
  const ref = doc(collection(db, "users", userId, "analyticsCards"));
  await setDoc(ref, card);
  return ref.id;
}

async function updateAnalyticsCard(userId: string, cardId: string, updates: Partial<Omit<AnalyticsCard, "id">>): Promise<void> {
  const { updateDoc } = await import("firebase/firestore");
  await updateDoc(doc(db, "users", userId, "analyticsCards", cardId), updates);
}

async function deleteAnalyticsCard(userId: string, cardId: string): Promise<void> {
  await deleteDoc(doc(db, "users", userId, "analyticsCards", cardId));
}

// ─── main component ─────────────────────────────────────────────────────────

export function RoutineAnalytics({ userId, readOnly = false }: { userId: string; readOnly?: boolean }) {
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [cards, setCards] = useState<AnalyticsCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  // Add-card form state
  const [selectedRoutineId, setSelectedRoutineId] = useState("");
  const [goalPeriod, setGoalPeriod] = useState<GoalPeriod>("weekly");
  const [goalTarget, setGoalTarget] = useState("");
  const [heatmapRange, setHeatmapRange] = useState<HeatmapRange>("30d");
  const [enabledStats, setEnabledStats] = useState<StatKey[]>(DEFAULT_STATS);
  const [goalDisplayStat, setGoalDisplayStat] = useState<GoalDisplayStat>("actual");
  const [fieldKey, setFieldKey] = useState("");
  const [compareFields, setCompareFields] = useState(false);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rs, cs] = await Promise.all([getRoutines(userId), loadAnalyticsCards(userId)]);
      setRoutines(rs.filter((r) => r.active));
      setCards(cs);
      if (rs.length > 0) setSelectedRoutineId(rs[0].id);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { void load(); }, [load]);

  const selectedRoutine = routines.find((r) => r.id === selectedRoutineId);
  const selectedIsMulti = selectedRoutine?.inputType === "multi";
  const selectedFields = selectedRoutine?.inputFields ?? [];

  // Keep the field picker in sync when the chosen routine changes.
  useEffect(() => {
    if (selectedIsMulti && selectedFields.length > 0) {
      setFieldKey((prev) => (selectedFields.some((f) => f.key === prev) ? prev : selectedFields[0].key));
    } else {
      setFieldKey("");
      setCompareFields(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRoutineId]);

  async function handleAdd() {
    if (!selectedRoutineId || !goalTarget) return;
    setAdding(true);
    try {
      const newCard: Omit<AnalyticsCard, "id"> = {
        routineId: selectedRoutineId,
        goalPeriod,
        goalTarget: Number(goalTarget),
        heatmapRange,
        enabledStats,
        goalDisplayStat,
        ...(selectedIsMulti ? { fieldKey, compareFields } : {}),
      };
      const id = await saveAnalyticsCard(userId, newCard);
      setCards((prev) => [...prev, { id, ...newCard }]);
      setShowAdd(false);
      setGoalTarget("");
      setEnabledStats(DEFAULT_STATS);
      setGoalDisplayStat("actual");
      setCompareFields(false);
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(cardId: string) {
    await deleteAnalyticsCard(userId, cardId);
    setCards((prev) => prev.filter((c) => c.id !== cardId));
  }

  function handleUpdate(updated: AnalyticsCard) {
    setCards((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20 text-[var(--text-muted)]">
        <Loader2 size={22} className="animate-spin" />
      </div>
    );
  }

  if (routines.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--border)] py-16 text-center">
        <p className="text-sm font-medium text-[var(--text-muted)]">No active routines yet</p>
        <p className="mt-1 text-xs text-[var(--text-faint)]">Create routines in My Routines to track analytics</p>
      </div>
    );
  }

  const isNumericSelected = selectedRoutine ? isNumericRoutine(selectedRoutine) : false;

  return (
    <div className="space-y-5">
      {/* Header + Add button */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-[var(--text-primary)]">Routine Analytics</h2>
          <p className="text-xs text-[var(--text-secondary)]">Customizable goal tracking per routine</p>
        </div>
        {!readOnly && <button
          type="button"
          onClick={() => setShowAdd((v) => !v)}
          className="flex items-center gap-1.5 rounded-xl bg-[var(--accent-pink)] px-3 py-2 text-xs font-semibold text-white transition hover:opacity-90"
        >
          <Plus size={14} />
          Add card
        </button>}
      </div>

      {/* Add-card form */}
      {showAdd && (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5 shadow-sm">
          <p className="mb-4 text-sm font-semibold text-[var(--text-primary)]">New analytics card</p>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Routine</label>
              <div className="relative">
                <select
                  value={selectedRoutineId}
                  onChange={(e) => setSelectedRoutineId(e.target.value)}
                  className="w-full appearance-none rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2.5 pr-8 text-sm outline-none focus:border-[var(--success)]"
                >
                  {routines.map((r) => (
                    <option key={r.id} value={r.id}>{r.title}</option>
                  ))}
                </select>
                <ChevronDown size={14} className="pointer-events-none absolute right-3 top-3 text-[var(--text-muted)]" />
              </div>
            </div>

            {/* Field picker — only for "multi" routines (user-selectable numeric field) */}
            {selectedIsMulti && selectedFields.length > 0 && (
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Field to track</label>
                <div className="flex flex-wrap gap-2">
                  {selectedFields.map((f) => {
                    const active = fieldKey === f.key;
                    return (
                      <button
                        key={f.key}
                        type="button"
                        onClick={() => setFieldKey(f.key)}
                        disabled={compareFields}
                        className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:opacity-40 ${
                          active
                            ? "bg-[var(--accent-pink)] text-white"
                            : "bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:bg-[var(--accent-pink-soft)]"
                        }`}
                      >
                        {f.label}{f.unit ? ` (${f.unit})` : ""}
                      </button>
                    );
                  })}
                </div>
                {selectedFields.length > 1 && (
                  <label className="mt-2 flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                    <input
                      type="checkbox"
                      checked={compareFields}
                      onChange={(e) => setCompareFields(e.target.checked)}
                      className="h-3.5 w-3.5 rounded accent-[var(--accent-pink)]"
                    />
                    <Layers size={12} />
                    Compare all fields on one chart
                  </label>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Goal period</label>
                <div className="relative">
                  <select
                    value={goalPeriod}
                    onChange={(e) => setGoalPeriod(e.target.value as GoalPeriod)}
                    className="w-full appearance-none rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2.5 pr-8 text-sm outline-none focus:border-[var(--success)]"
                  >
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                  <ChevronDown size={14} className="pointer-events-none absolute right-3 top-3 text-[var(--text-muted)]" />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">
                  {isNumericSelected ? "Target value" : "Target days"}
                </label>
                <input
                  type="number"
                  value={goalTarget}
                  onChange={(e) => setGoalTarget(e.target.value)}
                  placeholder="e.g. 5"
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2.5 text-sm outline-none focus:border-[var(--success)] placeholder:text-[var(--text-faint)]"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Heatmap range</label>
              <div className="flex flex-wrap gap-2">
                {(["7d", "30d", "3m", "1y", "lifetime"] as HeatmapRange[]).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setHeatmapRange(r)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                      heatmapRange === r
                        ? "bg-[var(--accent-pink)] text-white"
                        : "bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:bg-[var(--accent-pink-soft)]"
                    }`}
                  >
                    {r === "7d" ? "7 days" : r === "30d" ? "30 days" : r === "3m" ? "3 months" : r === "1y" ? "1 year" : "Lifetime"}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Show stats</label>
              <p className="mb-2 text-[10px] text-[var(--text-faint)]">Pick which metrics appear on the card</p>
              <div className="flex flex-wrap gap-2">
                {STAT_OPTIONS.filter((s) => {
                  const isNum = isNumericSelected;
                  if (s.numericOnly && !isNum) return false;
                  if (s.yesnoOnly && isNum) return false;
                  return true;
                }).map((s) => {
                  const active = enabledStats.includes(s.key);
                  return (
                    <button
                      key={s.key}
                      type="button"
                      onClick={() =>
                        setEnabledStats((prev) =>
                          active ? prev.filter((k) => k !== s.key) : [...prev, s.key],
                        )
                      }
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                        active
                          ? "bg-[var(--accent-pink)] text-white"
                          : "bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:bg-[var(--accent-pink-soft)]"
                      }`}
                    >
                      {s.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Goal progress display</label>
              <p className="mb-2 text-[10px] text-[var(--text-faint)]">What the primary number inside the goal block shows</p>
              <div className="flex flex-wrap gap-2">
                {GOAL_DISPLAY_OPTIONS.map((opt) => {
                  const active = goalDisplayStat === opt.key;
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setGoalDisplayStat(opt.key)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                        active
                          ? "bg-[var(--accent-pink)] text-white"
                          : "bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:bg-[var(--accent-pink-soft)]"
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => void handleAdd()}
                disabled={adding || !goalTarget}
                className="flex items-center gap-1.5 rounded-xl bg-[var(--accent-pink)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {adding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                Add
              </button>
              <button
                type="button"
                onClick={() => setShowAdd(false)}
                className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--text-secondary)]"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Analytics cards */}
      {cards.length === 0 && !showAdd ? (
        <div className="rounded-2xl border border-dashed border-[var(--border)] py-12 text-center">
          <Target size={28} className="mx-auto mb-3 text-[var(--text-faint)]" />
          <p className="text-sm font-medium text-[var(--text-muted)]">No analytics cards yet</p>
          <p className="mt-1 text-xs text-[var(--text-faint)]">Click "Add card" to start tracking a routine goal</p>
        </div>
      ) : (
        <div className="space-y-5">
          {cards.map((card) => {
            const routine = routines.find((r) => r.id === card.routineId);
            if (!routine) return null;
            return (
              <RoutineAnalyticsCard
                key={card.id}
                card={card}
                routine={routine}
                userId={userId}
                allRoutines={routines}
                onDelete={() => void handleDelete(card.id)}
                onUpdate={handleUpdate}
                readOnly={readOnly}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── individual analytics card ─────────────────────────────────────────────

function RoutineAnalyticsCard({
  card,
  routine,
  userId,
  allRoutines,
  onDelete,
  onUpdate,
  readOnly = false,
}: {
  card: AnalyticsCard;
  routine: Routine;
  userId: string;
  allRoutines: Routine[];
  onDelete: () => void;
  onUpdate: (updated: AnalyticsCard) => void;
  readOnly?: boolean;
}) {
  const [logs, setLogs] = useState<RoutineLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [heatmapRange, setHeatmapRange] = useState<HeatmapRange>(card.heatmapRange);

  // ── Edit mode state ──────────────────────────────────────────────────────
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  // Form fields mirror add-card — initialised from current card values
  const [editGoalPeriod, setEditGoalPeriod] = useState<GoalPeriod>(card.goalPeriod);
  const [editGoalTarget, setEditGoalTarget] = useState(String(card.goalTarget));
  const [editHeatmapRange, setEditHeatmapRange] = useState<HeatmapRange>(card.heatmapRange);
  const [editEnabledStats, setEditEnabledStats] = useState<StatKey[]>(card.enabledStats ?? DEFAULT_STATS);
  const [editGoalDisplayStat, setEditGoalDisplayStat] = useState<GoalDisplayStat>(card.goalDisplayStat ?? "actual");
  const [editFieldKey, setEditFieldKey] = useState(card.fieldKey ?? "");
  const [editCompareFields, setEditCompareFields] = useState(card.compareFields ?? false);

  const isMultiRoutine = routine.inputType === "multi";
  const routineFields = routine.inputFields ?? [];

  function openEdit() {
    // Reset form to current card values every time
    setEditGoalPeriod(card.goalPeriod);
    setEditGoalTarget(String(card.goalTarget));
    setEditHeatmapRange(card.heatmapRange);
    setEditEnabledStats(card.enabledStats ?? DEFAULT_STATS);
    setEditGoalDisplayStat(card.goalDisplayStat ?? "actual");
    setEditFieldKey(card.fieldKey ?? "");
    setEditCompareFields(card.compareFields ?? false);
    setEditing(true);
  }

  async function handleSave() {
    if (!editGoalTarget) return;
    setSaving(true);
    try {
      const updates: Partial<Omit<AnalyticsCard, "id">> = {
        goalPeriod: editGoalPeriod,
        goalTarget: Number(editGoalTarget),
        heatmapRange: editHeatmapRange,
        enabledStats: editEnabledStats,
        goalDisplayStat: editGoalDisplayStat,
        ...(isMultiRoutine ? { fieldKey: editFieldKey, compareFields: editCompareFields } : {}),
      };
      await updateAnalyticsCard(userId, card.id, updates);
      const updated: AnalyticsCard = { ...card, ...updates };
      onUpdate(updated);
      setHeatmapRange(editHeatmapRange);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  const editIsNumeric = isNumericRoutine(routine);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const data = await fetchAllLogs(userId, routine.id);
        setLogs(data);
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [userId, routine.id, routine.inputType]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5 shadow-sm">
        <div className="flex justify-center py-8">
          <Loader2 size={20} className="animate-spin text-[var(--text-muted)]" />
        </div>
      </div>
    );
  }

  const isMulti = routine.inputType === "multi";
  const isNumeric = isNumericRoutine(routine);
  const field = resolveField(routine, card.fieldKey);
  const getValue = makeValueGetter(routine, field);
  const unit = isMulti ? (field?.unit ?? "") : (routine.unit || "");
  const showComparison = isMulti && !!card.compareFields && (routine.inputFields?.length ?? 0) > 1;

  const trackingLabel = isMulti
    ? `Multi-field tracking${showComparison ? "" : field ? ` · ${field.label}` : ""}`
    : isNumeric
      ? "Numeric tracking"
      : "Yes/No tracking";

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] shadow-sm overflow-hidden">
      {/* Card header */}
      <div className="flex items-start justify-between gap-3 border-b border-[var(--bg-elevated)] px-5 py-4">
        <div>
          <p className="font-semibold text-[var(--text-primary)]">{routine.title}</p>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            {trackingLabel}
            {!showComparison && (
              <>
                {" "}· Goal:{" "}
                <span className="font-semibold text-[var(--success)]">
                  {card.goalTarget}{isNumeric && unit ? ` ${unit}` : " days"} / {card.goalPeriod}
                </span>
              </>
            )}
          </p>
        </div>
        {!readOnly && <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={openEdit}
            className="rounded-lg p-1.5 text-[var(--text-faint)] transition hover:bg-[var(--accent-blue-soft)] hover:text-[var(--accent-blue)]"
            title="Edit card"
          >
            <Pencil size={15} />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="rounded-lg p-1.5 text-[var(--text-faint)] transition hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]"
            title="Delete card"
          >
            <Trash2 size={15} />
          </button>
        </div>}
      </div>

      {/* ── Inline edit form ─────────────────────────────────────────────── */}
      {!readOnly && editing && (
        <div className="border-b border-[var(--border)] bg-[var(--bg-base)] px-5 py-4 space-y-3">
          <p className="text-xs font-bold uppercase tracking-wide text-[var(--text-secondary)]">Edit card</p>

          {/* Field picker — multi routines only */}
          {isMultiRoutine && routineFields.length > 0 && (
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Field to track</label>
              <div className="flex flex-wrap gap-2">
                {routineFields.map((f) => {
                  const active = editFieldKey === f.key;
                  return (
                    <button key={f.key} type="button" onClick={() => setEditFieldKey(f.key)}
                      disabled={editCompareFields}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:opacity-40 ${active ? "bg-[var(--accent-pink)] text-white" : "bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:bg-[var(--accent-pink-soft)]"}`}>
                      {f.label}{f.unit ? ` (${f.unit})` : ""}
                    </button>
                  );
                })}
              </div>
              {routineFields.length > 1 && (
                <label className="mt-2 flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                  <input type="checkbox" checked={editCompareFields} onChange={(e) => setEditCompareFields(e.target.checked)}
                    className="h-3.5 w-3.5 rounded accent-[var(--accent-pink)]" />
                  <Layers size={12} /> Compare all fields on one chart
                </label>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Goal period</label>
              <div className="relative">
                <select value={editGoalPeriod} onChange={(e) => setEditGoalPeriod(e.target.value as GoalPeriod)}
                  className="w-full appearance-none rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2.5 pr-8 text-sm outline-none focus:border-[var(--success)]">
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                </select>
                <ChevronDown size={14} className="pointer-events-none absolute right-3 top-3 text-[var(--text-muted)]" />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">
                {editIsNumeric ? "Target value" : "Target days"}
              </label>
              <input type="number" value={editGoalTarget} onChange={(e) => setEditGoalTarget(e.target.value)}
                placeholder="e.g. 5"
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2.5 text-sm outline-none focus:border-[var(--success)] placeholder:text-[var(--text-faint)]" />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Heatmap range</label>
            <div className="flex flex-wrap gap-2">
              {(["7d", "30d", "3m", "1y", "lifetime"] as HeatmapRange[]).map((r) => (
                <button key={r} type="button" onClick={() => setEditHeatmapRange(r)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${editHeatmapRange === r ? "bg-[var(--accent-pink)] text-white" : "bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:bg-[var(--accent-pink-soft)]"}`}>
                  {r === "7d" ? "7 days" : r === "30d" ? "30 days" : r === "3m" ? "3 months" : r === "1y" ? "1 year" : "Lifetime"}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Show stats</label>
            <div className="flex flex-wrap gap-2">
              {STAT_OPTIONS.filter((s) => {
                if (s.numericOnly && !editIsNumeric) return false;
                if (s.yesnoOnly && editIsNumeric) return false;
                return true;
              }).map((s) => {
                const active = editEnabledStats.includes(s.key);
                return (
                  <button key={s.key} type="button"
                    onClick={() => setEditEnabledStats((prev) => active ? prev.filter((k) => k !== s.key) : [...prev, s.key])}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${active ? "bg-[var(--accent-pink)] text-white" : "bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:bg-[var(--accent-pink-soft)]"}`}>
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Goal progress display</label>
            <div className="flex flex-wrap gap-2">
              {GOAL_DISPLAY_OPTIONS.map((opt) => {
                const active = editGoalDisplayStat === opt.key;
                return (
                  <button key={opt.key} type="button" onClick={() => setEditGoalDisplayStat(opt.key)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${active ? "bg-[var(--accent-pink)] text-white" : "bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:bg-[var(--accent-pink-soft)]"}`}>
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={() => void handleSave()} disabled={saving || !editGoalTarget}
              className="flex items-center gap-1.5 rounded-xl bg-[var(--accent-pink)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Pencil size={14} />}
              Save
            </button>
            <button type="button" onClick={() => setEditing(false)}
              className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--text-secondary)]">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="p-5 space-y-6">
        {/* Goal summary chips (skipped in comparison mode — no single target applies) */}
        {!showComparison && (
          <GoalSummary
            logs={logs}
            card={card}
            routine={routine}
            isNumeric={isNumeric}
            unit={unit}
            getValue={getValue}
          />
        )}

        {/* Smart insights */}
        <RoutineInsights
          logs={logs}
          routine={routine}
          card={card}
          isNumeric={isNumeric}
          unit={unit}
          getValue={getValue}
        />

        {/* Content by type */}
        {showComparison ? (
          <MultiFieldLineChart logs={logs} routine={routine} />
        ) : isNumeric ? (
          <NumberLineChart logs={logs} card={card} unit={unit} getValue={getValue} />
        ) : (
          <>
            {/* Heatmap range selector */}
            <div>
              <p className="mb-2 text-xs font-semibold text-[var(--text-secondary)]">Heatmap range</p>
              <div className="flex flex-wrap gap-1.5">
                {(["7d", "30d", "3m", "1y", "lifetime"] as HeatmapRange[]).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setHeatmapRange(r)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                      heatmapRange === r
                        ? "bg-[var(--accent-pink)] text-white"
                        : "bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:bg-[var(--accent-pink-soft)]"
                    }`}
                  >
                    {r === "7d" ? "7d" : r === "30d" ? "30d" : r === "3m" ? "3mo" : r === "1y" ? "1yr" : "All"}
                  </button>
                ))}
              </div>
            </div>
            <YesNoHeatmap logs={logs} routine={routine} allRoutines={allRoutines} range={heatmapRange} />
          </>
        )}
      </div>
    </div>
  );
}

// ─── goal summary ───────────────────────────────────────────────────────────

function GoalSummary({
  logs,
  card,
  routine,
  isNumeric,
  unit,
  getValue,
}: {
  logs: RoutineLog[];
  card: AnalyticsCard;
  routine: Routine;
  isNumeric: boolean;
  unit: string;
  getValue: (log: RoutineLog) => number | null;
}) {
  const goalDisplayStat: GoalDisplayStat = card.goalDisplayStat ?? "actual";
  const today = toDayStart(new Date());

  const getPeriodStart = (period: GoalPeriod) => {
    const d = new Date(today);
    if (period === "weekly") { d.setDate(d.getDate() - d.getDay()); return d; }
    if (period === "monthly") return new Date(d.getFullYear(), d.getMonth(), 1);
    return new Date(d.getFullYear(), 0, 1);
  };

  const periodStart = getPeriodStart(card.goalPeriod);
  const logMap = new Map(logs.map((l) => [toDateKey(l.date.toDate()), l]));

  // ── Collect period data ─────────────────────────────────────────────────
  let periodActual = 0;
  let submissionCount = 0;
  const numericValues: number[] = [];

  if (isNumeric) {
    for (const log of logs) {
      const d = toDayStart(log.date.toDate());
      if (d >= periodStart && d <= today) {
        submissionCount++;
        if (log.status === "yes") {
          const v = getValue(log);
          if (v != null) {
            periodActual += v;
            numericValues.push(v);
          }
        }
      }
    }
  } else {
    const cur = new Date(periodStart);
    while (cur <= today) {
      const key = toDateKey(cur);
      const log = logMap.get(key);
      const scheduled = getRoutinesForDate([routine], cur).length > 0 || !!log;
      if (scheduled) {
        if (log) submissionCount++;
        if (log?.status === "yes") periodActual++;
      }
      cur.setDate(cur.getDate() + 1);
    }
  }

  const pct = card.goalTarget > 0 ? Math.min(100, Math.round((periodActual / card.goalTarget) * 100)) : 0;
  const met = periodActual >= card.goalTarget;

  // ── Per-stat values ─────────────────────────────────────────────────────
  const currentValue = isNumeric
    ? (numericValues.length > 0 ? numericValues[numericValues.length - 1] : null)
    : pct;

  const average = isNumeric
    ? (numericValues.length > 0 ? numericValues.reduce((a, b) => a + b, 0) / numericValues.length : null)
    : (submissionCount > 0 ? Math.round((periodActual / submissionCount) * 100) : null);

  const minVal = isNumeric && numericValues.length > 0 ? Math.min(...numericValues) : null;
  const maxVal = isNumeric && numericValues.length > 0 ? Math.max(...numericValues) : null;

  // Best streak (all-time consecutive yes days)
  const allYesDays = Array.from(
    new Set(logs.filter((l) => l.status === "yes").map((l) => toDateKey(l.date.toDate())))
  ).sort();
  let bestStreak = 0;
  let curStreak = 0;
  let prevDate: Date | null = null;
  for (const key of allYesDays) {
    const d = new Date(key + "T00:00:00");
    if (prevDate) {
      const diff = (d.getTime() - prevDate.getTime()) / 86400000;
      curStreak = diff === 1 ? curStreak + 1 : 1;
    } else {
      curStreak = 1;
    }
    bestStreak = Math.max(bestStreak, curStreak);
    prevDate = d;
  }

  // ── Render stat chips based on user selection ───────────────────────────
  const enabled = card.enabledStats ?? DEFAULT_STATS;

  interface Chip { label: string; value: string; sub?: string; accent?: boolean }
  const chips: Chip[] = [];

  if (enabled.includes("current")) {
    chips.push({
      label: isNumeric ? "Current" : "This period",
      value: isNumeric
        ? (currentValue != null ? `${(currentValue as number).toFixed(1)} ${unit}` : "—")
        : `${periodActual} days`,
      accent: true,
    });
  }
  if (enabled.includes("average")) {
    chips.push({
      label: "Average",
      value: average != null
        ? isNumeric ? `${(average as number).toFixed(1)} ${unit}` : `${average}%`
        : "—",
    });
  }
  if (enabled.includes("total") && isNumeric) {
    chips.push({
      label: "Total",
      value: periodActual > 0 ? `${periodActual.toFixed(1)} ${unit}` : "—",
    });
  }
  if (enabled.includes("submissions")) {
    chips.push({
      label: "Submissions",
      value: String(submissionCount),
      sub: `this ${card.goalPeriod.replace("ly", "")}`,
    });
  }
  if (enabled.includes("best_streak") && !isNumeric) {
    chips.push({ label: "Best streak", value: bestStreak > 0 ? `${bestStreak}d` : "—" });
  }
  if (enabled.includes("min") && isNumeric) {
    chips.push({ label: "Min", value: minVal != null ? `${(minVal as number).toFixed(1)} ${unit}` : "—" });
  }
  if (enabled.includes("max") && isNumeric) {
    chips.push({ label: "Max", value: maxVal != null ? `${(maxVal as number).toFixed(1)} ${unit}` : "—" });
  }

  return (
    <div className="space-y-3">
      {enabled.includes("goal_progress") && (() => {
        // Derive the primary display value from goalDisplayStat
        let primaryValue: string;
        let primarySub: string | null = null;

        switch (goalDisplayStat) {
          case "percentage":
            primaryValue = `${pct}%`;
            primarySub = `of ${card.goalTarget} ${isNumeric ? unit : "days"} goal`;
            break;
          case "current":
            primaryValue = isNumeric
              ? (currentValue != null ? `${(currentValue as number).toFixed(1)}${unit ? ` ${unit}` : ""}` : "—")
              : `${pct}%`;
            primarySub = isNumeric ? "latest entry" : "completion";
            break;
          case "average":
            primaryValue = average != null
              ? isNumeric ? `${(average as number).toFixed(1)}${unit ? ` ${unit}` : ""}` : `${average}%`
              : "—";
            primarySub = isNumeric ? "per entry avg" : "avg completion";
            break;
          case "submissions":
            primaryValue = String(submissionCount);
            primarySub = `log${submissionCount !== 1 ? "s" : ""} this ${card.goalPeriod.replace("ly", "")}`;
            break;
          case "actual":
          default:
            primaryValue = isNumeric ? periodActual.toFixed(1) : String(periodActual);
            primarySub = `/ ${card.goalTarget} ${isNumeric ? unit : "days"}`;
            break;
        }

        return (
          <div className="rounded-xl bg-[var(--bg-elevated)] p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-xs text-[var(--text-muted)] capitalize">{card.goalPeriod} goal progress</p>
                <p className="text-2xl font-bold text-[var(--text-primary)]">
                  {primaryValue}
                  {primarySub && (
                    <span className="ml-1.5 text-sm font-medium text-[var(--text-muted)]">{primarySub}</span>
                  )}
                </p>
              </div>
              <div className={`rounded-xl px-3 py-1.5 text-xs font-bold ${
                met ? "bg-[var(--accent-pink-soft)] text-[var(--accent-pink)]" : "bg-[var(--warning-soft)] text-[var(--warning)]"
              }`}>
                {pct}% {met ? "✓" : ""}
              </div>
            </div>
            <div className="h-1.5 w-full rounded-full bg-[var(--border)]">
              <div
                className="h-1.5 rounded-full transition-all duration-500"
                style={{ width: `${pct}%`, backgroundColor: met ? "var(--success)" : "var(--warning)" }}
              />
            </div>
          </div>
        );
      })()}

      {chips.length > 0 && (
        <div className={`grid gap-2 ${chips.length <= 2 ? "grid-cols-2" : chips.length === 3 ? "grid-cols-3" : "grid-cols-2 sm:grid-cols-4"}`}>
          {chips.map((chip) => (
            <div
              key={chip.label}
              className={`rounded-xl p-3 ${chip.accent ? "bg-[var(--accent-pink-soft)]" : "bg-[var(--bg-elevated)]"}`}
            >
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">{chip.label}</p>
              <p className={`mt-1 text-lg font-bold ${chip.accent ? "text-[var(--accent-pink)]" : "text-[var(--text-primary)]"}`}>
                {chip.value}
              </p>
              {chip.sub && <p className="text-[10px] text-[var(--text-faint)]">{chip.sub}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── smart insights (trend, pace, consistency, best day) ──────────────────

function RoutineInsights({
  logs,
  routine,
  card,
  isNumeric,
  unit,
  getValue,
}: {
  logs: RoutineLog[];
  routine: Routine;
  card: AnalyticsCard;
  isNumeric: boolean;
  unit: string;
  getValue: (log: RoutineLog) => number | null;
}) {
  const today = new Date();
  const logMap = new Map(logs.map((l) => [toDateKey(l.date.toDate()), l]));

  const cur = getPeriodRange(card.goalPeriod, today);
  const prev = getPreviousPeriodRange(card.goalPeriod, today);
  const curAgg = aggregateRange(routine, logMap, cur.start, cur.end, isNumeric, getValue);
  const prevAgg = aggregateRange(routine, logMap, prev.start, prev.end, isNumeric, getValue);

  // Trend vs previous period
  let trend: { direction: "up" | "down" | "flat" | "new"; pct: number | null } | null = null;
  if (prevAgg.actual > 0) {
    const pct = Math.round(((curAgg.actual - prevAgg.actual) / prevAgg.actual) * 100);
    trend = { direction: pct > 2 ? "up" : pct < -2 ? "down" : "flat", pct };
  } else if (curAgg.actual > 0) {
    trend = { direction: "new", pct: null };
  }

  // Pace toward the current period's goal
  const totalDays = Math.round((cur.end.getTime() - cur.start.getTime()) / 86400000) + 1;
  const todayCapped = toDayStart(today) > cur.end ? cur.end : toDayStart(today);
  const elapsedDays = Math.max(1, Math.round((todayCapped.getTime() - cur.start.getTime()) / 86400000) + 1);
  const remainingDays = Math.max(0, totalDays - elapsedDays);
  const expectedByNow = card.goalTarget * (elapsedDays / totalDays);
  const met = curAgg.actual >= card.goalTarget;
  const onTrack = met || curAgg.actual >= expectedByNow - 0.001;
  const requiredPerDay = remainingDays > 0 ? Math.max(0, card.goalTarget - curAgg.actual) / remainingDays : 0;

  // Consistency over the card's own heatmap range
  const rangeDays = getRangeDays(card.heatmapRange);
  const rangeAgg = aggregateRange(routine, logMap, rangeDays[0] ?? toDayStart(today), toDayStart(today), isNumeric, getValue);
  const consistencyPct = rangeAgg.scheduled > 0 ? Math.round((rangeAgg.submissions / rangeAgg.scheduled) * 100) : null;

  // Best weekday
  const bestWeekdayIdx = computeBestWeekday(routine, logMap, card.heatmapRange, isNumeric, getValue);

  interface Insight { icon: React.ReactNode; text: string; tone: "good" | "warn" | "neutral" }
  const insights: Insight[] = [];

  if (trend) {
    if (trend.direction === "up") {
      insights.push({
        icon: <TrendingUp size={14} />,
        text: `Up ${trend.pct}% vs last ${card.goalPeriod.replace("ly", "")}`,
        tone: "good",
      });
    } else if (trend.direction === "down") {
      insights.push({
        icon: <TrendingDown size={14} />,
        text: `Down ${Math.abs(trend.pct as number)}% vs last ${card.goalPeriod.replace("ly", "")}`,
        tone: "warn",
      });
    } else if (trend.direction === "flat") {
      insights.push({ icon: <Minus size={14} />, text: `Holding steady vs last ${card.goalPeriod.replace("ly", "")}`, tone: "neutral" });
    } else {
      insights.push({ icon: <Sparkles size={14} />, text: `First active ${card.goalPeriod.replace("ly", "")} of tracking`, tone: "neutral" });
    }
  }

  if (card.goalTarget > 0) {
    if (met) {
      insights.push({ icon: <Sparkles size={14} />, text: `Goal already met for this ${card.goalPeriod.replace("ly", "")} 🎉`, tone: "good" });
    } else if (onTrack) {
      insights.push({ icon: <TrendingUp size={14} />, text: "On track to hit your goal", tone: "good" });
    } else if (remainingDays > 0) {
      const amount = isNumeric ? `${requiredPerDay.toFixed(1)}${unit ? ` ${unit}` : ""}` : `${requiredPerDay.toFixed(1)} days`;
      insights.push({ icon: <TrendingDown size={14} />, text: `Behind pace — need ~${amount}/day to catch up`, tone: "warn" });
    } else {
      insights.push({ icon: <TrendingDown size={14} />, text: `Goal missed for this ${card.goalPeriod.replace("ly", "")}`, tone: "warn" });
    }
  }

  if (consistencyPct != null) {
    insights.push({
      icon: <Target size={14} />,
      text: `${consistencyPct}% consistency over the last ${card.heatmapRange === "lifetime" ? "lifetime" : card.heatmapRange}`,
      tone: consistencyPct >= 70 ? "good" : consistencyPct >= 40 ? "neutral" : "warn",
    });
  }

  if (bestWeekdayIdx != null) {
    insights.push({
      icon: <Sparkles size={14} />,
      text: isNumeric
        ? `Highest ${unit ? `${unit} ` : ""}values tend to land on ${WEEKDAY_NAMES[bestWeekdayIdx]}s`
        : `Most consistent on ${WEEKDAY_NAMES[bestWeekdayIdx]}s`,
      tone: "neutral",
    });
  }

  if (insights.length === 0) return null;

  const toneClasses: Record<Insight["tone"], string> = {
    good: "text-[var(--success)] bg-[var(--success-soft)]",
    warn: "text-[var(--warning)] bg-[var(--warning-soft)]",
    neutral: "text-[var(--accent-blue)] bg-[var(--accent-blue-soft)]",
  };

  return (
    <div className="rounded-xl border border-[var(--border)] p-4">
      <div className="mb-2.5 flex items-center gap-1.5">
        <Sparkles size={14} className="text-[var(--accent-pink)]" />
        <p className="text-xs font-bold uppercase tracking-wide text-[var(--text-secondary)]">Insights</p>
      </div>
      <div className="flex flex-col gap-2">
        {insights.map((ins, i) => (
          <div key={i} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium ${toneClasses[ins.tone]}`}>
            {ins.icon}
            <span>{ins.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── number line chart (single field / legacy numeric) ────────────────────

function NumberLineChart({
  logs,
  card,
  unit,
  getValue,
}: {
  logs: RoutineLog[];
  card: AnalyticsCard;
  unit: string;
  getValue: (log: RoutineLog) => number | null;
}) {
  // Build chart data from all logs sorted by date
  const validLogs = logs
    .filter((l) => getValue(l) != null)
    .sort((a, b) => a.date.toDate().getTime() - b.date.toDate().getTime());

  const chartData = validLogs.map((l) => ({
    date: l.date.toDate().toLocaleDateString("en", { day: "2-digit", month: "short" }),
    actual: getValue(l) as number,
  }));

  // Determine goal line value based on period
  // For a per-period goal on a per-entry chart, show the daily average goal
  const goalLine = card.goalTarget;

  if (chartData.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--border)] py-8 text-center">
        <TrendingUp size={22} className="mx-auto mb-2 text-[var(--text-faint)]" />
        <p className="text-xs text-[var(--text-muted)]">No numeric data logged yet</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-center gap-4 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-5 bg-[var(--success)] rounded" />
          <span className="text-[var(--text-secondary)]">Actual{unit ? ` (${unit})` : ""}</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-5 bg-[var(--text-faint)] rounded" style={{ borderTop: "2px dashed var(--text-faint)", background: "none" }} />
          <span className="text-[var(--text-secondary)]">Goal ({goalLine}{unit ? ` ${unit}` : ""})</span>
        </span>
      </div>
      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-elevated)" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: "var(--text-muted)" }}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 10, fill: "var(--text-muted)" }}
              tickFormatter={(v) => unit ? `${v}${unit}` : String(v)}
            />
            <Tooltip
              formatter={(v) => [`${v ?? ""}${unit ? ` ${unit}` : ""}`, "Actual"]}
              contentStyle={{ borderRadius: 10, border: "1px solid var(--border)", fontSize: 12 }}
            />
            <ReferenceLine
              y={goalLine}
              stroke="var(--text-faint)"
              strokeDasharray="5 3"
              strokeWidth={1.5}
              label={{ value: `Goal: ${goalLine}${unit}`, fill: "var(--text-faint)", fontSize: 10, position: "right" }}
            />
            <Line
              type="monotone"
              dataKey="actual"
              stroke="var(--success)"
              strokeWidth={2}
              dot={{ fill: "var(--success)", r: 3 }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── multi-field comparison chart ──────────────────────────────────────────

function MultiFieldLineChart({ logs, routine }: { logs: RoutineLog[]; routine: Routine }) {
  const fields = routine.inputFields ?? [];

  const sortedLogs = [...logs].sort((a, b) => a.date.toDate().getTime() - b.date.toDate().getTime());
  const chartData = sortedLogs.map((l) => {
    const row: Record<string, string | number | null> = {
      date: l.date.toDate().toLocaleDateString("en", { day: "2-digit", month: "short" }),
    };
    for (const f of fields) {
      const v = l.values?.[f.key];
      row[f.key] = typeof v === "number" && Number.isFinite(v) ? v : null;
    }
    return row;
  }).filter((row) => fields.some((f) => row[f.key] != null));

  if (chartData.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--border)] py-8 text-center">
        <TrendingUp size={22} className="mx-auto mb-2 text-[var(--text-faint)]" />
        <p className="text-xs text-[var(--text-muted)]">No numeric data logged yet</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-4 text-xs">
        {fields.map((f, i) => (
          <span key={f.key} className="flex items-center gap-1.5">
            <span className="h-0.5 w-5 rounded" style={{ backgroundColor: FIELD_COLORS[i % FIELD_COLORS.length] }} />
            <span className="text-[var(--text-secondary)]">{f.label}{f.unit ? ` (${f.unit})` : ""}</span>
          </span>
        ))}
      </div>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-elevated)" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--text-muted)" }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 10, fill: "var(--text-muted)" }} />
            <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid var(--border)", fontSize: 12 }} />
            {fields.map((f, i) => (
              <Line
                key={f.key}
                type="monotone"
                dataKey={f.key}
                name={f.label}
                stroke={FIELD_COLORS[i % FIELD_COLORS.length]}
                strokeWidth={2}
                dot={{ fill: FIELD_COLORS[i % FIELD_COLORS.length], r: 3 }}
                activeDot={{ r: 5 }}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── yes/no heatmap (github style) ─────────────────────────────────────────

function YesNoHeatmap({
  logs,
  routine,
  allRoutines: _allRoutines,
  range,
}: {
  logs: RoutineLog[];
  routine: Routine;
  allRoutines: Routine[];
  range: HeatmapRange;
}) {
  const today = toDayStart(new Date());
  const todayKey = toDateKey(today);
  const days = getRangeDays(range);

  const logMap = new Map(logs.map((l) => [toDateKey(l.date.toDate()), l]));

  // Compute stats
  let yesCount = 0;
  let noCount = 0;
  let scheduledCount = 0;

  const dayData: { key: string; date: Date; status: "yes" | "no" | "unscheduled" | "future" }[] = days.map((date) => {
    const key = toDateKey(date);
    if (key > todayKey) return { key, date, status: "future" };

    const log = logMap.get(key);
    // A day with an actual log always counts, even if the routine's
    // recurrence rule wouldn't normally schedule it that day (e.g.
    // backfilled/logged manually via "Log Today" with a different date).
    const isScheduled = getRoutinesForDate([routine], date).length > 0 || !!log;
    if (!isScheduled) return { key, date, status: "unscheduled" };

    scheduledCount++;
    // pending until yesterday = no
    const status = log?.status === "yes" ? "yes" : "no";
    if (status === "yes") yesCount++;
    else noCount++;
    return { key, date, status };
  });

  const pct = scheduledCount > 0 ? Math.round((yesCount / scheduledCount) * 100) : 0;

  // Group into weeks for github layout
  // Pad days array to start on Sunday
  const firstDay = days[0];
  const paddedStart = firstDay ? firstDay.getDay() : 0;
  const paddedDays: (typeof dayData[0] | null)[] = [
    ...Array(paddedStart).fill(null),
    ...dayData,
  ];
  while (paddedDays.length % 7 !== 0) paddedDays.push(null);

  const weeks: (typeof dayData[0] | null)[][] = [];
  for (let i = 0; i < paddedDays.length; i += 7) {
    weeks.push(paddedDays.slice(i, i + 7));
  }

  const WEEK_DAYS = ["S", "M", "T", "W", "T", "F", "S"];

  // Show month labels above heatmap
  const monthLabels: { text: string; colIdx: number }[] = [];
  let lastMonth = -1;
  weeks.forEach((week, wi) => {
    const firstReal = week.find((d) => d !== null);
    if (firstReal) {
      const m = firstReal.date.getMonth();
      if (m !== lastMonth) {
        monthLabels.push({
          text: firstReal.date.toLocaleString("en", { month: "short" }),
          colIdx: wi,
        });
        lastMonth = m;
      }
    }
  });

  // Condensed view for 7d
  if (range === "7d") {
    return (
      <div>
        <div className="mb-3 flex items-center gap-3 text-xs text-[var(--text-muted)]">
          <span className="font-semibold text-[var(--text-primary)]">{pct}%</span> completion
          <span className="text-[var(--success)]">{yesCount} yes</span>
          <span className="text-[var(--danger)]">{noCount} no</span>
        </div>
        <div className="flex gap-2">
          {dayData.map((d) => {
            if (!d) return null;
            const color =
              d.status === "yes" ? "var(--success)"
              : d.status === "no" ? "var(--danger)"
              : d.status === "unscheduled" ? "var(--bg-elevated)"
              : "var(--bg-elevated)";
            const label = d.date.toLocaleDateString("en", { weekday: "short", day: "numeric" });
            return (
              <div key={d.key} className="flex flex-col items-center gap-1" title={`${label}: ${d.status}`}>
                <div
                  className="h-9 w-9 rounded-lg transition-all"
                  style={{ backgroundColor: color }}
                />
                <span className="text-[9px] text-[var(--text-muted)]">
                  {d.date.toLocaleDateString("en", { weekday: "narrow" })}
                </span>
              </div>
            );
          })}
        </div>
        <Legend />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-center gap-4 text-xs text-[var(--text-muted)]">
        <span>
          <span className="font-semibold text-[var(--text-primary)]">{pct}%</span> completion rate
        </span>
        <span className="text-[var(--success)] font-medium">{yesCount} yes</span>
        <span className="text-[var(--danger)] font-medium">{noCount} no</span>
        <span>{scheduledCount} counted</span>
      </div>

      <div className="overflow-x-auto">
        <div style={{ display: "grid", gridTemplateColumns: `16px repeat(${weeks.length}, 1fr)`, gap: "2px", minWidth: "max-content" }}>
          {/* Day labels col */}
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <div style={{ height: 14 }} /> {/* month row spacer */}
            {WEEK_DAYS.map((d, i) => (
              <div key={i} style={{ height: 13, fontSize: 9, color: "var(--text-muted)", lineHeight: "13px", textAlign: "center" }}>
                {i % 2 === 1 ? d : ""}
              </div>
            ))}
          </div>

          {/* Weeks */}
          {weeks.map((week, wi) => {
            const monthLabel = monthLabels.find((m) => m.colIdx === wi);
            return (
              <div key={wi} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {/* Month label */}
                <div style={{ height: 14, fontSize: 9, color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "visible" }}>
                  {monthLabel?.text ?? ""}
                </div>
                {week.map((d, di) => {
                  if (!d) return <div key={di} style={{ height: 13, width: 13 }} />;
                  const color =
                    d.status === "yes" ? "var(--success)"
                    : d.status === "no" ? "var(--danger)"
                    : d.status === "future" ? "transparent"
                    : "var(--border)";
                  const opacity = d.status === "unscheduled" ? 0.4 : 1;
                  return (
                    <div
                      key={d.key}
                      title={`${d.date.toLocaleDateString("en", { month: "short", day: "numeric" })}: ${d.status}`}
                      style={{
                        height: 13,
                        width: 13,
                        borderRadius: 2,
                        backgroundColor: color,
                        opacity,
                        cursor: "default",
                      }}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
      <Legend />
    </div>
  );
}

function Legend() {
  return (
    <div className="mt-3 flex items-center gap-3 text-xs text-[var(--text-muted)]">
      <span className="flex items-center gap-1">
        <span className="h-3 w-3 rounded-sm bg-[var(--success)]" /> Yes
      </span>
      <span className="flex items-center gap-1">
        <span className="h-3 w-3 rounded-sm bg-[var(--danger)]" /> No / Pending
      </span>
      <span className="flex items-center gap-1">
        <span className="h-3 w-3 rounded-sm bg-[var(--border)]" /> Not scheduled
      </span>
    </div>
  );
}