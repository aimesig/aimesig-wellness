import { useEffect, useState, useCallback } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Flame,
  Trophy,
  CalendarDays,
  Zap,
} from "lucide-react";
import { getCalendarProgress, getStreakData, type DayProgress, type StreakData } from "../../services/streakService";
import { Timestamp } from "firebase/firestore";
import { getRoutineLogsForDate } from "../../services/routineLogService";
import { getRoutines } from "../../services/routineService";

interface CalendarViewProps {
  userId: string;
}

function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function getProgressColorStyle(percent: number): string {
  if (percent === 0) return "#ebedf0";
  if (percent < 25) return "#9be9a8";
  if (percent < 50) return "#40c463";
  if (percent < 75) return "#30a14e";
  if (percent < 100) return "#216e39";
  return "#22c55e";
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function CalendarView({ userId }: CalendarViewProps) {
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [progressMap, setProgressMap] = useState<Map<string, DayProgress>>(new Map());
  const [streakData, setStreakData] = useState<StreakData | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(toDateKey(today));
  const [dayDetail, setDayDetail] = useState<{ logs: { title: string; status: string }[] } | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [progress, streak] = await Promise.all([
        getCalendarProgress(userId, currentMonth.getFullYear(), currentMonth.getMonth()),
        getStreakData(userId),
      ]);
      setProgressMap(progress);
      setStreakData(streak);
    } catch (err) {
      console.error("Failed to load calendar data:", err);
    } finally {
      setLoading(false);
    }
  }, [userId, currentMonth]);

  useEffect(() => { void loadData(); }, [loadData]);

  async function handleDayClick(dateKey: string) {
    setSelectedDay(dateKey);
    const [y, m, d] = dateKey.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    const ts = Timestamp.fromDate(date);
    try {
      const [logs, routines] = await Promise.all([
        getRoutineLogsForDate(userId, ts),
        getRoutines(userId),
      ]);
      const routineMap = new Map(routines.map((r) => [r.id, r.title]));
      const items = logs.map((log) => ({
        title: routineMap.get(log.routineId) ?? "Unknown",
        status: log.status,
      }));
      setDayDetail({ logs: items });
    } catch {
      setDayDetail({ logs: [] });
    }
  }

  function prevMonth() {
    setCurrentMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1));
    setSelectedDay(null);
    setDayDetail(null);
  }

  function nextMonth() {
    setCurrentMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1));
    setSelectedDay(null);
    setDayDetail(null);
  }

  const firstDay = currentMonth.getDay();
  const daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const todayKey = toDateKey(today);
  const selectedProgress = selectedDay ? progressMap.get(selectedDay) : undefined;

  // Year heatmap (last 52 weeks)
  const heatmapWeeks: { key: string; date: Date }[][] = [];
  const heatStart = new Date(today);
  heatStart.setDate(heatStart.getDate() - 364);
  heatStart.setDate(heatStart.getDate() - heatStart.getDay()); // align to Sunday
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
        <StreakCard
          label="Current Streak"
          value={streakData ? `${streakData.currentStreak}d` : "—"}
          icon={<Flame size={18} />}
          highlight={streakData ? streakData.currentStreak > 0 : false}
          color="text-orange-500"
          bg="bg-orange-50 border-orange-200"
        />
        <StreakCard
          label="Longest Streak"
          value={streakData ? `${streakData.longestStreak}d` : "—"}
          icon={<Trophy size={18} />}
          highlight={false}
          color="text-amber-500"
          bg="bg-amber-50 border-amber-200"
        />
        <StreakCard
          label="Active Days"
          value={streakData ? `${streakData.activeDatesThisYear.size}` : "—"}
          icon={<CalendarDays size={18} />}
          highlight={false}
          color="text-blue-500"
          bg="bg-blue-50 border-blue-200"
        />
        <StreakCard
          label="Last Active"
          value={streakData?.lastActiveDate
            ? new Date(streakData.lastActiveDate + "T00:00:00").toLocaleDateString("en", { month: "short", day: "numeric" })
            : "—"}
          icon={<Zap size={18} />}
          highlight={false}
          color="text-purple-500"
          bg="bg-purple-50 border-purple-200"
        />
      </div>

      {/* Monthly Calendar */}
      <div className="rounded-3xl border border-[#e0e9e1] bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-5 flex items-center justify-between">
          <button
            type="button"
            onClick={prevMonth}
            className="rounded-xl p-2 text-[#627067] transition hover:bg-[#f3f6f3]"
          >
            <ChevronLeft size={20} />
          </button>

          <h2 className="text-lg font-bold text-[#17211b]">
            {MONTH_NAMES[currentMonth.getMonth()]} {currentMonth.getFullYear()}
          </h2>

          <button
            type="button"
            onClick={nextMonth}
            className="rounded-xl p-2 text-[#627067] transition hover:bg-[#f3f6f3]"
            disabled={currentMonth >= new Date(today.getFullYear(), today.getMonth(), 1)}
          >
            <ChevronRight size={20} />
          </button>
        </div>

        {/* Day labels */}
        <div className="grid grid-cols-7 gap-1 mb-2">
          {DAY_LABELS.map((d) => (
            <div key={d} className="text-center text-xs font-semibold text-[#8a9590]">
              {d}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        {loading ? (
          <div className="flex justify-center py-10">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-[#d1e5d3] border-t-[#315c3d]" />
          </div>
        ) : (
          <div className="grid grid-cols-7 gap-1">
            {cells.map((day, i) => {
              if (!day) {
                return <div key={`empty-${i}`} />;
              }
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
                  className={`
                    relative flex flex-col items-center justify-center rounded-xl p-1 pt-1.5 pb-1
                    text-xs font-semibold transition
                    ${isFuture ? "cursor-default opacity-30" : "cursor-pointer hover:ring-2 hover:ring-[#315c3d]/30"}
                    ${isSelected ? "ring-2 ring-[#315c3d]" : ""}
                    ${isToday ? "font-extrabold" : ""}
                  `}
                >
                  <span className={`mb-1 ${isToday ? "text-[#315c3d]" : "text-[#3a4a3f]"}`}>
                    {day}
                  </span>
                  <span
                    className="h-5 w-5 rounded-md transition-all duration-300"
                    style={{ backgroundColor: isFuture ? "#ebedf0" : getProgressColorStyle(percent) }}
                  />
                </button>
              );
            })}
          </div>
        )}

        {/* Legend */}
        <div className="mt-4 flex items-center gap-2 text-xs text-[#7a877e]">
          <span>Less</span>
          {[0, 20, 45, 70, 90, 100].map((p) => (
            <span
              key={p}
              className="h-3.5 w-3.5 rounded-sm"
              style={{ backgroundColor: getProgressColorStyle(p) }}
            />
          ))}
          <span>More</span>
          <span className="ml-2 rounded-sm h-3.5 w-3.5 bg-[#22c55e]" />
          <span>100%</span>
        </div>
      </div>

      {/* Selected Day Detail */}
      {selectedDay && (
        <div className="rounded-3xl border border-[#e0e9e1] bg-white p-5 shadow-sm sm:p-6">
          <h3 className="font-bold text-[#17211b] mb-1">
            {new Date(selectedDay + "T00:00:00").toLocaleDateString("en", {
              weekday: "long", month: "long", day: "numeric",
            })}
          </h3>

          {selectedProgress ? (
            <div className="mb-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="flex-1 rounded-full bg-[#edf4ee] h-2">
                  <div
                    className="h-2 rounded-full transition-all"
                    style={{
                      width: `${selectedProgress.percent}%`,
                      backgroundColor: getProgressColorStyle(selectedProgress.percent),
                    }}
                  />
                </div>
                <span className="text-sm font-bold text-[#315c3d]">
                  {selectedProgress.percent}%
                </span>
              </div>
              <p className="text-xs text-[#7a877e]">
                {selectedProgress.completedCount} of {selectedProgress.totalCount} routines completed
              </p>
            </div>
          ) : (
            <p className="text-sm text-[#8a9590] mb-4">No routines logged this day.</p>
          )}

          {dayDetail && dayDetail.logs.length > 0 && (
            <div className="space-y-2">
              {dayDetail.logs.map((log, i) => (
                <div key={i} className="flex items-center gap-3 rounded-xl bg-[#f5f8f5] px-3 py-2">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      log.status === "yes" ? "bg-green-500" :
                      log.status === "no" ? "bg-red-400" : "bg-gray-300"
                    }`}
                  />
                  <span className="text-sm font-medium text-[#2d3d32]">{log.title}</span>
                  <span className={`ml-auto text-xs font-semibold ${
                    log.status === "yes" ? "text-green-600" :
                    log.status === "no" ? "text-red-500" : "text-gray-400"
                  }`}>
                    {log.status === "yes" ? "Done" : log.status === "no" ? "Missed" : "Pending"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Year Heatmap */}
      <div className="rounded-3xl border border-[#e0e9e1] bg-white p-5 shadow-sm sm:p-6">
        <h3 className="font-bold text-[#17211b] mb-4">Activity this year</h3>
        <div className="overflow-x-auto pb-2">
          <div className="flex gap-[3px]" style={{ minWidth: "max-content" }}>
            {heatmapWeeks.map((week, wi) => (
              <div key={wi} className="flex flex-col gap-[3px]">
                {week.map(({ key, date }) => {
                  const prog = streakData?.activeDatesThisYear.has(key) ? progressMap.get(key) : undefined;
                  const isFut = key > todayKey;
                  const pct = prog?.percent ?? (streakData?.activeDatesThisYear.has(key) ? 50 : 0);
                  return (
                    <span
                      key={key}
                      title={`${date.toLocaleDateString("en", { month: "short", day: "numeric" })}${prog ? ` — ${pct}%` : ""}`}
                      className="h-3 w-3 rounded-sm cursor-default"
                      style={{
                        backgroundColor: isFut ? "transparent" :
                          streakData?.activeDatesThisYear.has(key) ? getProgressColorStyle(pct) : "#ebedf0",
                      }}
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

function StreakCard({
  label,
  value,
  icon,
  highlight,
  color,
  bg,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  highlight: boolean;
  color: string;
  bg: string;
}) {
  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${bg} ${highlight ? "ring-2 ring-orange-300" : ""}`}>
      <div className={`mb-2 ${color}`}>{icon}</div>
      <p className="text-xl font-bold text-[#17211b]">{value}</p>
      <p className="mt-0.5 text-xs font-medium text-[#7a877e]">{label}</p>
      {highlight && (
        <div className="mt-2 flex gap-0.5">
          {Array.from({ length: Math.min(7, parseInt(value)) }).map((_, i) => (
            <span key={i} className="h-1.5 w-1.5 rounded-full bg-orange-400" />
          ))}
        </div>
      )}
    </div>
  );
}
