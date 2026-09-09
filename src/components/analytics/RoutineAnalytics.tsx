import { useEffect, useState, useCallback } from "react";
import {
  ChevronDown,
  Loader2,
  Plus,
  Target,
  Trash2,
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
import { collection, getDocs, query, where, Timestamp, doc, setDoc, deleteDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { getRoutines } from "../../services/routineService";
import { getRoutinesForDate } from "../../utils/recurrence";
import type { Routine, RoutineLog } from "../../types/routine";

// ─── types ─────────────────────────────────────────────────────────────────

type GoalPeriod = "weekly" | "monthly" | "yearly";
type HeatmapRange = "7d" | "30d" | "3m" | "1y" | "lifetime";

interface AnalyticsCard {
  id: string; // card id stored in firestore
  routineId: string;
  goalPeriod: GoalPeriod;
  goalTarget: number;
  heatmapRange: HeatmapRange;
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

// ─── data fetching ─────────────────────────────────────────────────────────

async function fetchLogsForRoutine(
  userId: string,
  routineId: string,
  from: Date,
): Promise<RoutineLog[]> {
  const ref = collection(db, "users", userId, "routineLogs");
  const q = query(
    ref,
    where("routineId", "==", routineId),
    where("date", ">=", Timestamp.fromDate(from)),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as RoutineLog));
}

async function fetchAllLogs(userId: string, routineId: string): Promise<RoutineLog[]> {
  const ref = collection(db, "users", userId, "routineLogs");
  const q = query(ref, where("routineId", "==", routineId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as RoutineLog));
}

async function loadAnalyticsCards(userId: string): Promise<AnalyticsCard[]> {
  const ref = collection(db, "users", userId, "analyticsCards");
  const snap = await getDocs(ref);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as AnalyticsCard));
}

async function saveAnalyticsCard(userId: string, card: Omit<AnalyticsCard, "id">): Promise<string> {
  const ref = doc(collection(db, "users", userId, "analyticsCards"));
  await setDoc(ref, card);
  return ref.id;
}

async function deleteAnalyticsCard(userId: string, cardId: string): Promise<void> {
  await deleteDoc(doc(db, "users", userId, "analyticsCards", cardId));
}

// ─── main component ─────────────────────────────────────────────────────────

export function RoutineAnalytics({ userId }: { userId: string }) {
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [cards, setCards] = useState<AnalyticsCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  // Add-card form state
  const [selectedRoutineId, setSelectedRoutineId] = useState("");
  const [goalPeriod, setGoalPeriod] = useState<GoalPeriod>("weekly");
  const [goalTarget, setGoalTarget] = useState("");
  const [heatmapRange, setHeatmapRange] = useState<HeatmapRange>("30d");
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

  async function handleAdd() {
    if (!selectedRoutineId || !goalTarget) return;
    setAdding(true);
    try {
      const newCard: Omit<AnalyticsCard, "id"> = {
        routineId: selectedRoutineId,
        goalPeriod,
        goalTarget: Number(goalTarget),
        heatmapRange,
      };
      const id = await saveAnalyticsCard(userId, newCard);
      setCards((prev) => [...prev, { id, ...newCard }]);
      setShowAdd(false);
      setGoalTarget("");
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(cardId: string) {
    await deleteAnalyticsCard(userId, cardId);
    setCards((prev) => prev.filter((c) => c.id !== cardId));
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

  return (
    <div className="space-y-5">
      {/* Header + Add button */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-[var(--text-primary)]">Routine Analytics</h2>
          <p className="text-xs text-[var(--text-secondary)]">Customizable goal tracking per routine</p>
        </div>
        <button
          type="button"
          onClick={() => setShowAdd((v) => !v)}
          className="flex items-center gap-1.5 rounded-xl bg-[var(--accent-pink)] px-3 py-2 text-xs font-semibold text-white transition hover:opacity-90"
        >
          <Plus size={14} />
          Add card
        </button>
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
                  {routines.find((r) => r.id === selectedRoutineId)?.inputType === "number"
                    ? "Target value"
                    : "Target days"}
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
}: {
  card: AnalyticsCard;
  routine: Routine;
  userId: string;
  allRoutines: Routine[];
  onDelete: () => void;
}) {
  const [logs, setLogs] = useState<RoutineLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [heatmapRange, setHeatmapRange] = useState<HeatmapRange>(card.heatmapRange);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const from = getRangeStart("lifetime");
        const data = routine.inputType === "number"
          ? await fetchLogsForRoutine(userId, routine.id, from)
          : await fetchAllLogs(userId, routine.id);
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

  const isNumber = routine.inputType === "number";

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] shadow-sm overflow-hidden">
      {/* Card header */}
      <div className="flex items-start justify-between gap-3 border-b border-[var(--bg-elevated)] px-5 py-4">
        <div>
          <p className="font-semibold text-[var(--text-primary)]">{routine.title}</p>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            {isNumber ? "Numeric tracking" : "Yes/No tracking"} · Goal:{" "}
            <span className="font-semibold text-[var(--success)]">
              {card.goalTarget}{isNumber && routine.unit ? ` ${routine.unit}` : " days"} / {card.goalPeriod}
            </span>
          </p>
        </div>
        <button
          type="button"
          onClick={onDelete}
          className="rounded-lg p-1.5 text-[var(--text-faint)] transition hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]"
        >
          <Trash2 size={15} />
        </button>
      </div>

      <div className="p-5 space-y-6">
        {/* Goal summary chips */}
        <GoalSummary logs={logs} card={card} routine={routine} allRoutines={allRoutines} />

        {/* Content by type */}
        {isNumber ? (
          <NumberLineChart logs={logs} routine={routine} card={card} />
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
  allRoutines,
}: {
  logs: RoutineLog[];
  card: AnalyticsCard;
  routine: Routine;
  allRoutines: Routine[];
}) {
  const today = toDayStart(new Date());

  // Compute period window
  const getPeriodStart = (period: GoalPeriod) => {
    const d = new Date(today);
    if (period === "weekly") { d.setDate(d.getDate() - d.getDay()); return d; }
    if (period === "monthly") { return new Date(d.getFullYear(), d.getMonth(), 1); }
    return new Date(d.getFullYear(), 0, 1);
  };

  const periodStart = getPeriodStart(card.goalPeriod);
  const isNumber = routine.inputType === "number";

  // For yes/no: count scheduled days where status=yes (pending past = no)
  const logMap = new Map(logs.map((l) => [toDateKey(l.date.toDate()), l]));

  let periodActual = 0;

  if (isNumber) {
    // Sum all numeric values in period
    for (const log of logs) {
      const d = toDayStart(log.date.toDate());
      if (d >= periodStart && d <= today && log.status === "yes" && log.value != null) {
        periodActual += log.value;
      }
    }
  } else {
    // Count yes days in period
    const cur = new Date(periodStart);
    while (cur <= today) {
      const key = toDateKey(cur);
      const scheduled = allRoutines.every((r) => r.id !== routine.id) ||
        getRoutinesForDate([routine], cur).length > 0;
      if (scheduled) {
        const log = logMap.get(key);
        if (log?.status === "yes") periodActual++;
      }
      cur.setDate(cur.getDate() + 1);
    }
  }

  const pct = card.goalTarget > 0 ? Math.min(100, Math.round((periodActual / card.goalTarget) * 100)) : 0;
  const met = periodActual >= card.goalTarget;

  // All-time streak of best periods
  const unit = isNumber ? (routine.unit || "units") : "days";

  return (
    <div className="rounded-xl bg-[var(--bg-elevated)] p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-xs text-[var(--text-muted)] capitalize">{card.goalPeriod} goal progress</p>
          <p className="text-2xl font-bold text-[var(--text-primary)]">
            {isNumber ? periodActual.toFixed(1) : periodActual}
            <span className="ml-1 text-sm font-medium text-[var(--text-muted)]">/ {card.goalTarget} {unit}</span>
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
          style={{
            width: `${pct}%`,
            backgroundColor: met ? "var(--success)" : "var(--warning)",
          }}
        />
      </div>
    </div>
  );
}

// ─── number line chart ──────────────────────────────────────────────────────

function NumberLineChart({
  logs,
  routine,
  card,
}: {
  logs: RoutineLog[];
  routine: Routine;
  card: AnalyticsCard;
}) {
  // Build chart data from all number logs sorted by date
  const validLogs = logs
    .filter((l) => l.status === "yes" && l.value != null)
    .sort((a, b) => a.date.toDate().getTime() - b.date.toDate().getTime());

  const chartData = validLogs.map((l) => ({
    date: l.date.toDate().toLocaleDateString("en", { day: "2-digit", month: "short" }),
    actual: l.value as number,
  }));

  // Determine goal line value based on period
  // For a per-period goal on a per-entry chart, show the daily average goal
  const goalLine = card.goalTarget;

  const unit = routine.unit || "";

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

    const isScheduled = getRoutinesForDate([routine], date).length > 0;
    if (!isScheduled) return { key, date, status: "unscheduled" };

    scheduledCount++;
    const log = logMap.get(key);
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
        <span>{scheduledCount} scheduled</span>
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
