import { useEffect, useState, useCallback } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Flame,
  Trophy,
  CalendarDays,
  Zap,
  Pencil,
  X,
} from "lucide-react";
import { getCalendarProgress, getProgressInRange, getStreakData, type DayProgress, type StreakData } from "../../services/streakService";
import { Timestamp } from "firebase/firestore";
import { getRoutineLogsForDate } from "../../services/routineLogService";
import { getRoutines } from "../../services/routineService";
import { getRoutinesForDate } from "../../utils/recurrence";
import { RoutineLogPanel } from "../routines/RoutineLogPanel";
import { ImageLightbox } from "../ui/ImageLightbox";
import type { Routine, RoutineLog } from "../../types/routine";

interface CalendarViewProps {
  userId: string;
}

function toDayTimestamp(date: Date): Timestamp {
  return Timestamp.fromDate(
    new Date(date.getFullYear(), date.getMonth(), date.getDate()),
  );
}

function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dateFromKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function getProgressColorStyle(percent: number): string {
  if (percent === 0) return "var(--heat-0)";
  if (percent < 25) return "var(--heat-1)";
  if (percent < 50) return "var(--heat-2)";
  if (percent < 75) return "var(--heat-3)";
  if (percent < 100) return "var(--heat-4)";
  return "var(--success)";
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface DayItem {
  routine: Routine;
  log: RoutineLog | null;
  isDeleted: boolean;
}

/**
 * Stand-in Routine used only when a log references a routine that no
 * longer has a Firestore document at all (routines deleted before this
 * app started soft-deleting). Its actual title/settings are lost, so we
 * label it generically, but the log itself is still shown and editable.
 */
function placeholderRoutine(log: RoutineLog): Routine {
  return {
    id: log.routineId,
    title: "",
    description: "",
    frequency: "daily",
    schedule: {},
    alternateDay: false,
    inputType: log.value != null ? "number" : "none",
    unit: "",
    inputFields: [],
    startDate: log.date,
    endDate: null,
    active: false,
    deletedAt: log.date,
    createdAt: log.createdAt,
    updatedAt: log.updatedAt,
  };
}

export function CalendarView({ userId }: CalendarViewProps) {
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [progressMap, setProgressMap] = useState<Map<string, DayProgress>>(new Map());
  const [yearProgressMap, setYearProgressMap] = useState<Map<string, DayProgress>>(new Map());
  const [streakData, setStreakData] = useState<StreakData | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(toDateKey(today));
  const [dayItems, setDayItems] = useState<DayItem[] | null>(null);
  const [dayLoading, setDayLoading] = useState(false);
  const [calLoading, setCalLoading] = useState(true);
  const [editingRoutine, setEditingRoutine] = useState<Routine | null>(null);
  const [allRoutines, setAllRoutines] = useState<Routine[]>([]);

  const loadCalendar = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setCalLoading(true);
    try {
      const heatStart = new Date();
      heatStart.setDate(heatStart.getDate() - 364);
      heatStart.setDate(heatStart.getDate() - heatStart.getDay());

      const [progress, yearProgress, streak, routines] = await Promise.all([
        getCalendarProgress(userId, currentMonth.getFullYear(), currentMonth.getMonth()),
        getProgressInRange(userId, heatStart, new Date()),
        getStreakData(userId),
        // Include deleted routines here — the day view needs their
        // titles to label logs as "(deleted)" instead of losing them.
        getRoutines(userId, { includeDeleted: true }),
      ]);
      setProgressMap(progress);
      setYearProgressMap(yearProgress);
      setStreakData(streak);
      setAllRoutines(routines);
    } catch (err) {
      console.error("Failed to load calendar data:", err);
    } finally {
      if (!opts?.silent) setCalLoading(false);
    }
  }, [userId, currentMonth]);

  useEffect(() => { void loadCalendar(); }, [loadCalendar]);

  // Load today's items on first render
  useEffect(() => {
    if (selectedDay) void loadDayItems(selectedDay);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadDayItems(dateKey: string) {
    setDayLoading(true);
    setDayItems(null);
    try {
      const date = dateFromKey(dateKey);
      const ts = toDayTimestamp(date);

      const routines = allRoutines.length > 0 ? allRoutines : await getRoutines(userId, { includeDeleted: true });
      if (allRoutines.length === 0) setAllRoutines(routines);

      const scheduled = getRoutinesForDate(routines, date);
      const logs = await getRoutineLogsForDate(userId, ts);
      const logMap = new Map(logs.map((l) => [l.routineId, l]));
      const routineById = new Map(routines.map((r) => [r.id, r]));

      const items: DayItem[] = scheduled.map((r) => ({
        routine: r,
        log: logMap.get(r.id) ?? null,
        isDeleted: false,
      }));

      // Any log for this day should show, even if the routine wasn't
      // "scheduled" today by its recurrence rule (e.g. logged manually via
      // "Log Today" with a different date picked) — or if the routine has
      // since been deleted. Only skip logs already covered by `scheduled`.
      const scheduledIds = new Set(scheduled.map((r) => r.id));
      for (const log of logs) {
        if (scheduledIds.has(log.routineId)) continue;
        const matched = routineById.get(log.routineId);
        const isDeletedRoutine = !matched || matched.deletedAt != null;
        items.push({
          routine: matched ?? placeholderRoutine(log),
          log,
          isDeleted: isDeletedRoutine,
        });
      }

      setDayItems(items);
    } catch (err) {
      console.error("Failed to load day items:", err);
      setDayItems([]);
    } finally {
      setDayLoading(false);
    }
  }

  function handleDayClick(dateKey: string) {
    setSelectedDay(dateKey);
    setEditingRoutine(null);
    void loadDayItems(dateKey);
  }

  function handleEditSaved() {
    setEditingRoutine(null);
    if (selectedDay) void loadDayItems(selectedDay);
    // Refresh the month colors, the year heatmap, and the streak cards so
    // they reflect this log immediately instead of on next navigation/reload.
    // "silent" so we don't flash the whole grid's loading spinner.
    void loadCalendar({ silent: true });
  }

  function prevMonth() {
    setCurrentMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1));
    setSelectedDay(null);
    setDayItems(null);
    setEditingRoutine(null);
  }

  function nextMonth() {
    setCurrentMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1));
    setSelectedDay(null);
    setDayItems(null);
    setEditingRoutine(null);
  }

  const firstDay = currentMonth.getDay();
  const daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const todayKey = toDateKey(today);
  const selectedDate = selectedDay ? dateFromKey(selectedDay) : null;
  const selectedProgress = selectedDay ? progressMap.get(selectedDay) : undefined;

  /**
   * Smart progress derived from the loaded day items — always up to date
   * even for today (before Firestore logs are written) and for days where
   * the user has routines scheduled but hasn't logged yet.
   *
   * Priority: dayItems (live) > progressMap (Firestore snapshot)
   */
  const smartProgress = (() => {
    if (!selectedDay || !selectedDate) return null;
    const isFuture = selectedDay > todayKey;
    if (isFuture) return null;

    // While items are still loading, fall back to Firestore snapshot so the
    // bar doesn't flicker away.
    if (dayLoading || dayItems === null) {
      return selectedProgress
        ? { total: selectedProgress.totalCount, completed: selectedProgress.completedCount, pending: 0, isLive: false }
        : null;
    }

    const isToday = selectedDay === todayKey;
    const total = dayItems.length;
    if (total === 0) return { total: 0, completed: 0, pending: 0, isLive: false };

    const completed = dayItems.filter((i) => i.log?.status === "yes").length;
    const pending = dayItems.filter((i) => !i.log || i.log.status === "pending").length;

    return { total, completed, pending, isLive: isToday };
  })();

  // Year heatmap (last 53 weeks)
  const heatmapWeeks: { key: string; date: Date }[][] = [];
  const heatStart = new Date(today);
  heatStart.setDate(heatStart.getDate() - 364);
  heatStart.setDate(heatStart.getDate() - heatStart.getDay());
  let curr = new Date(heatStart);
  for (let w = 0; w < 53; w++) {
    const week: { key: string; date: Date }[] = [];
    for (let d = 0; d < 7; d++) {
      week.push({ key: toDateKey(curr), date: new Date(curr) });
      curr.setDate(curr.getDate() + 1);
    }
    heatmapWeeks.push(week);
  }

  return (
    <div className="space-y-6">
      {/* Streak Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StreakCard label="Current Streak" value={streakData ? `${streakData.currentStreak}d` : "—"} icon={<Flame size={18} />} highlight={streakData ? streakData.currentStreak > 0 : false} color="text-[var(--accent-yellow)]" bg="bg-[var(--accent-yellow-soft)] border-[var(--accent-yellow-soft)]" />
        <StreakCard label="Longest Streak" value={streakData ? `${streakData.longestStreak}d` : "—"} icon={<Trophy size={18} />} highlight={false} color="text-[var(--warning)]" bg="bg-[var(--warning-soft)] border-[var(--warning-soft)]" />
        <StreakCard label="Active Days" value={streakData ? `${streakData.activeDatesThisYear.size}` : "—"} icon={<CalendarDays size={18} />} highlight={false} color="text-[var(--accent-blue)]" bg="bg-[var(--accent-blue-soft)] border-[var(--accent-blue-soft)]" />
        <StreakCard
          label="Last Active"
          value={streakData?.lastActiveDate
            ? new Date(streakData.lastActiveDate + "T00:00:00").toLocaleDateString("en", { month: "short", day: "numeric" })
            : "—"}
          icon={<Zap size={18} />}
          highlight={false}
          color="text-[var(--accent-pink)]"
          bg="bg-[var(--accent-pink-soft)] border-[var(--accent-pink-soft)]"
        />
      </div>

      {/* Monthly Calendar */}
      <div className="rounded-3xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5 shadow-sm sm:p-6">
        <div className="mb-5 flex items-center justify-between">
          <button type="button" onClick={prevMonth} className="rounded-xl p-2 text-[var(--text-secondary)] transition hover:bg-[var(--bg-elevated)]">
            <ChevronLeft size={20} />
          </button>
          <h2 className="text-lg font-bold text-[var(--text-primary)]">
            {MONTH_NAMES[currentMonth.getMonth()]} {currentMonth.getFullYear()}
          </h2>
          <button type="button" onClick={nextMonth} className="rounded-xl p-2 text-[var(--text-secondary)] transition hover:bg-[var(--bg-elevated)]" disabled={currentMonth >= new Date(today.getFullYear(), today.getMonth(), 1)}>
            <ChevronRight size={20} />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 mb-2">
          {DAY_LABELS.map((d) => (
            <div key={d} className="text-center text-xs font-semibold text-[var(--text-muted)]">{d}</div>
          ))}
        </div>

        {calLoading ? (
          <div className="flex justify-center py-10">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--accent-pink)]" />
          </div>
        ) : (
          <div className="grid grid-cols-7 gap-1">
            {cells.map((day, i) => {
              if (!day) return <div key={`empty-${i}`} />;
              const dateKey = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const progress = progressMap.get(dateKey);
              const percent = progress?.percent ?? 0;
              const isToday = dateKey === todayKey;
              const isSelected = dateKey === selectedDay;
              const isFuture = dateKey > todayKey;
              return (
                <button
                  key={dateKey}
                  type="button"
                  onClick={() => !isFuture && handleDayClick(dateKey)}
                  disabled={isFuture}
                  title={progress ? `${percent}% complete` : ""}
                  className={`relative flex flex-col items-center justify-center rounded-xl p-1 pt-1.5 pb-1 text-xs font-semibold transition ${isFuture ? "cursor-default opacity-30" : "cursor-pointer hover:ring-2 hover:ring-[var(--accent-pink)]/30"} ${isSelected ? "ring-2 ring-[var(--accent-pink)]" : ""} ${isToday ? "font-extrabold" : ""}`}
                >
                  <span className={`mb-1 ${isToday ? "text-[var(--accent-pink)]" : "text-[var(--text-secondary)]"}`}>{day}</span>
                  <span className="h-5 w-5 rounded-md transition-all duration-300" style={{ backgroundColor: isFuture ? "var(--heat-0)" : getProgressColorStyle(percent) }} />
                </button>
              );
            })}
          </div>
        )}

        <div className="mt-4 flex items-center gap-2 text-xs text-[var(--text-secondary)]">
          <span>Less</span>
          {[0, 20, 45, 70, 90, 100].map((p) => (
            <span key={p} className="h-3.5 w-3.5 rounded-sm" style={{ backgroundColor: getProgressColorStyle(p) }} />
          ))}
          <span>More</span>
          <span className="ml-2 rounded-sm h-3.5 w-3.5 bg-[var(--success)]" />
          <span>100%</span>
        </div>
      </div>

      {/* Selected Day Detail */}
      {selectedDay && selectedDate && (
        <div className="rounded-3xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5 shadow-sm sm:p-6">
          <h3 className="font-bold text-[var(--text-primary)] mb-1">
            {selectedDate.toLocaleDateString("en", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
          </h3>

          <SmartProgressBar
            progress={smartProgress}
            isLoading={dayLoading && smartProgress === null}
          />

          {dayLoading ? (
            <div className="flex justify-center py-6">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--accent-pink)]" />
            </div>
          ) : dayItems === null ? null : dayItems.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)] py-2">No routines scheduled for this day.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {dayItems.map(({ routine, log, isDeleted }) => (
                <DayRoutineRow
                  key={routine.id}
                  routine={routine}
                  log={log}
                  isDeleted={isDeleted}
                  onEdit={() => setEditingRoutine(routine)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Edit panel — slide in when editing */}
      {editingRoutine && selectedDate && (
        <div className="rounded-3xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5 shadow-sm sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-[var(--text-primary)]">Edit Log</h3>
            <button type="button" onClick={() => setEditingRoutine(null)} className="rounded-lg p-1.5 text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]">
              <X size={18} />
            </button>
          </div>
          <RoutineLogPanel
            userId={userId}
            routine={editingRoutine}
            date={selectedDate}
            onSaved={handleEditSaved}
          />
        </div>
      )}

      {/* Year Heatmap */}
      <div className="rounded-3xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5 shadow-sm sm:p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-[var(--text-primary)]">Activity this year</h3>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              Daily routine completion over the last 12 months
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-[var(--accent-pink-soft)] px-2.5 py-1 text-[10px] font-semibold text-[var(--accent-pink)]">
            {today.getFullYear()}
          </span>
        </div>
        <div className="overflow-x-auto pb-2">
          <div className="flex gap-[4px]" style={{ minWidth: "max-content" }}>
            {heatmapWeeks.map((week, wi) => (
              <div key={wi} className="flex flex-col gap-[4px]">
                {week.map(({ key, date }) => {
                  const prog = yearProgressMap.get(key);
                  const isFut = key > todayKey;
                  const pct = prog?.percent ?? 0;
                  return (
                    <span
                      key={key}
                      title={`${date.toLocaleDateString("en", { month: "short", day: "numeric" })}${prog ? ` — ${prog.completedCount}/${prog.totalCount} (${pct}%)` : ""}`}
                      className="h-3.5 w-3.5 rounded-sm border border-[var(--border)] cursor-default"
                      style={{ backgroundColor: isFut ? "transparent" : prog ? getProgressColorStyle(pct) : "var(--heat-0)" }}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Smart progress bar ──────────────────────────────────────────────────────

interface SmartProgressBarProps {
  progress: { total: number; completed: number; pending: number; isLive: boolean } | null;
  isLoading: boolean;
}

function SmartProgressBar({ progress, isLoading }: SmartProgressBarProps) {
  if (isLoading) {
    // Skeleton placeholder while day data loads
    return (
      <div className="mb-4 mt-2 animate-pulse">
        <div className="h-2 rounded-full bg-[var(--border)] w-full mb-2" />
        <div className="h-3 rounded bg-[var(--border)] w-32" />
      </div>
    );
  }

  if (!progress) return null;

  const { total, completed, pending, isLive } = progress;

  // No routines scheduled for this day
  if (total === 0) {
    return (
      <p className="text-xs text-[var(--text-muted)] mb-4 mt-2 italic">
        No routines scheduled for this day.
      </p>
    );
  }

  const percent = Math.round((completed / total) * 100);
  const missed = total - completed - pending;

  // Decide label
  let label: string;
  if (isLive) {
    if (completed === total) {
      label = "All done for today 🎉";
    } else if (completed === 0 && pending === total) {
      label = `${total} routine${total > 1 ? "s" : ""} to go today`;
    } else {
      const parts: string[] = [];
      if (completed > 0) parts.push(`${completed} done`);
      if (pending > 0) parts.push(`${pending} pending`);
      if (missed > 0) parts.push(`${missed} missed`);
      label = parts.join(" · ");
    }
  } else {
    // Past day
    if (completed === total) {
      label = `All ${total} routines completed`;
    } else if (completed === 0) {
      label = total > 0 ? `Not logged — ${total} routine${total > 1 ? "s" : ""} were scheduled` : "Not logged";
    } else {
      label = `${completed} of ${total} routines completed`;
    }
  }

  // Segmented bar: completed | pending | missed
  const completedPct = (completed / total) * 100;
  const pendingPct   = (pending   / total) * 100;

  return (
    <div className="mb-4 mt-2">
      <div className="flex items-center gap-3 mb-1.5">
        {/* Segmented progress bar */}
        <div className="flex-1 h-2 rounded-full bg-[var(--bg)] overflow-hidden flex">
          {completed > 0 && (
            <div
              className="h-full transition-all duration-500"
              style={{ width: `${completedPct}%`, backgroundColor: getProgressColorStyle(percent) }}
            />
          )}
          {pending > 0 && (
            <div
              className="h-full transition-all duration-500"
              style={{ width: `${pendingPct}%`, backgroundColor: "var(--border-strong)", opacity: 0.5 }}
            />
          )}
          {/* missed fills the rest implicitly (bg-[var(--bg)]) */}
        </div>
        <span className="text-sm font-bold text-[var(--accent-pink)] tabular-nums">
          {percent}%
        </span>
      </div>
      <div className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
        {isLive && (
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--accent-pink)] animate-pulse shrink-0" />
        )}
        <span>{label}</span>
      </div>
    </div>
  );
}

// ─── Day routine row ────────────────────────────────────────────────────────

function DayRoutineRow({ routine, log, isDeleted, onEdit }: { routine: Routine; log: RoutineLog | null; isDeleted: boolean; onEdit: () => void }) {
  const status = log?.status ?? "pending";
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const statusStyle =
    status === "yes" ? { dot: "bg-[var(--success)]", label: "text-[var(--success)]", text: "Done" } :
    status === "no"  ? { dot: "bg-[var(--danger)]",   label: "text-[var(--danger)]",   text: "Missed" } :
                       { dot: "bg-[var(--border-strong)]",   label: "text-[var(--text-faint)]",  text: "Pending" };

  const displayTitle = isDeleted
    ? routine.title ? `${routine.title} (deleted)` : "(deleted)"
    : routine.title;

  return (
    <div className={`flex items-start gap-3 rounded-xl bg-[var(--bg)] px-3 py-3 ${isDeleted ? "opacity-70" : ""}`}>
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${statusStyle.dot}`} />

      {log?.imageUrl && (
        <button
          type="button"
          onClick={() => setLightboxOpen(true)}
          className="shrink-0 overflow-hidden rounded-lg border border-[var(--border)]"
          title="View attached image"
        >
          <img
            src={log.imageUrl}
            alt={`${displayTitle} attachment`}
            className="h-12 w-12 cursor-zoom-in object-cover"
          />
        </button>
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-[var(--text-secondary)] truncate">{displayTitle}</span>
          {routine.inputType === "number" && log?.value != null && (
            <span className="shrink-0 rounded-full bg-[var(--accent-yellow-soft)] px-2 py-0.5 text-xs font-bold text-[var(--accent-pink)]">
              {log.value}{routine.unit ? ` ${routine.unit}` : ""}
            </span>
          )}
          {routine.inputType === "multi" &&
            routine.inputFields?.length > 0 &&
            log?.values &&
            Object.keys(log.values).length > 0 &&
            routine.inputFields.map((f) =>
              log.values[f.key] !== undefined ? (
                <span
                  key={f.key}
                  className="shrink-0 rounded-full bg-[var(--accent-yellow-soft)] px-2 py-0.5 text-xs font-bold text-[var(--accent-pink)]"
                >
                  {f.label || f.key}: {log.values[f.key]}{f.unit ? ` ${f.unit}` : ""}
                </span>
              ) : null,
            )}
        </div>
        {log?.remark ? (
          <p className="mt-0.5 text-xs text-[var(--text-secondary)] truncate">{log.remark}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className={`text-xs font-semibold ${statusStyle.label}`}>{statusStyle.text}</span>
        <button
          type="button"
          onClick={onEdit}
          className="rounded-lg p-1.5 text-[var(--text-secondary)] hover:bg-[var(--accent-pink-soft)]"
          title="Edit log"
        >
          <Pencil size={14} />
        </button>
      </div>

      {log?.imageUrl && lightboxOpen && (
        <ImageLightbox
          src={log.imageUrl}
          alt={`${displayTitle} attachment`}
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </div>
  );
}

// ─── Streak card ────────────────────────────────────────────────────────────

function StreakCard({ label, value, icon, highlight, color, bg }: { label: string; value: string; icon: React.ReactNode; highlight: boolean; color: string; bg: string }) {
  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${bg} ${highlight ? "ring-2 ring-[var(--accent-yellow)]" : ""}`}>
      <div className={`mb-2 ${color}`}>{icon}</div>
      <p className="text-xl font-bold text-[var(--text-primary)]">{value}</p>
      <p className="mt-0.5 text-xs font-medium text-[var(--text-secondary)]">{label}</p>
      {highlight && (
        <div className="mt-2 flex gap-0.5">
          {Array.from({ length: Math.min(7, parseInt(value)) }).map((_, i) => (
            <span key={i} className="h-1.5 w-1.5 rounded-full bg-[var(--accent-yellow)]" />
          ))}
        </div>
      )}
    </div>
  );
}