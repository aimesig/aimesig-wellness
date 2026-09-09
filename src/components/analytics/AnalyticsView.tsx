import { useEffect, useState } from "react";
import {
  Activity,
  BarChart3,
  Flame,
  Scale,
  Target,
  Zap,
  Heart,
  Droplets,
} from "lucide-react";
import {
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
} from "recharts";
import { getProfile, calculateBMI, getBMICategory, calculateAge, calculateBMR, calculateTDEE } from "../../services/profileService";
import { getWeightAnalytics, type WeightAnalytics } from "../../services/weightService";
import { getStreakData, type StreakData } from "../../services/streakService";
import { getRoutines } from "../../services/routineService";
import type { FitnessProfile } from "../../services/profileService";

interface AnalyticsViewProps {
  userId: string;
}

type WeightRange = "7d" | "30d" | "3m" | "6m" | "1y" | "all";

function fmt(n: number | null, unit = "kg"): string {
  return n === null ? "—" : `${n.toFixed(1)} ${unit}`;
}

export function AnalyticsView({ userId }: AnalyticsViewProps) {
  const [profile, setProfile] = useState<FitnessProfile | null>(null);
  const [weightData, setWeightData] = useState<WeightAnalytics | null>(null);
  const [streakData, setStreakData] = useState<StreakData | null>(null);
  const [routineCount, setRoutineCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<WeightRange>("30d");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const [p, w, s, r] = await Promise.all([
          getProfile(userId),
          getWeightAnalytics(userId),
          getStreakData(userId),
          getRoutines(userId),
        ]);
        if (!cancelled) {
          setProfile(p);
          setWeightData(w);
          setStreakData(s);
          setRoutineCount(r.filter((rt) => rt.active).length);
        }
      } catch (err) {
        console.error("Analytics load failed:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [userId]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--accent-pink)]" />
      </div>
    );
  }

  // BMI calculations
  const bmi =
    profile?.weightKg && profile?.heightCm
      ? calculateBMI(profile.weightKg, profile.heightCm)
      : null;
  const bmiCategory = bmi ? getBMICategory(bmi) : null;

  // BMR/TDEE calculations
  const age = profile?.dateOfBirth ? calculateAge(profile.dateOfBirth) : null;
  const bmr =
    profile?.weightKg && profile?.heightCm && age && profile?.gender
      ? calculateBMR(profile.weightKg, profile.heightCm, age, profile.gender)
      : null;
  const tdee =
    bmr && profile?.activityLevel ? calculateTDEE(bmr, profile.activityLevel) : null;

  // Weight goal progress
  const weightProgress =
    profile?.weightKg && profile?.targetWeightKg && weightData?.starting
      ? (() => {
          const start = weightData.starting;
          const current = profile.weightKg!;
          const target = profile.targetWeightKg!;
          const totalChange = Math.abs(target - start);
          const done = Math.abs(current - start);
          return totalChange === 0 ? 100 : Math.min(100, Math.round((done / totalChange) * 100));
        })()
      : null;

  // Filter weight entries by range
  const filteredEntries = (weightData?.entries ?? []).filter((e) => {
    if (range === "all") return true;
    const now = new Date();
    const d = e.date.toDate();
    const start = new Date(now);
    if (range === "7d") start.setDate(now.getDate() - 7);
    else if (range === "30d") start.setDate(now.getDate() - 30);
    else if (range === "3m") start.setMonth(now.getMonth() - 3);
    else if (range === "6m") start.setMonth(now.getMonth() - 6);
    else if (range === "1y") start.setFullYear(now.getFullYear() - 1);
    return d >= start;
  });

  const chartData = filteredEntries.map((e) => ({
    date: e.date.toDate().toLocaleDateString("en", { day: "2-digit", month: "short" }),
    weight: e.value,
  }));

  const macroData = tdee
    ? [
        { name: "Protein", cal: Math.round(tdee * 0.3), color: "var(--accent-pink)" },
        { name: "Carbs", cal: Math.round(tdee * 0.45), color: "var(--success)" },
        { name: "Fat", cal: Math.round(tdee * 0.25), color: "var(--text-faint)" },
      ]
    : [];

  const bmiNeedle = bmi ? Math.min(100, Math.max(0, ((bmi - 10) / 30) * 100)) : 0;

  return (
    <div className="space-y-6">
      {/* Quick metrics row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label="Active Routines" value={String(routineCount)} icon={<Target size={18} />} color="text-[var(--accent-pink)]" bg="bg-[var(--bg-elevated)] border-[var(--accent-pink-soft)]" />
        <MetricCard label="Current Streak" value={streakData ? `${streakData.currentStreak}d` : "—"} icon={<Flame size={18} />} color="text-[var(--accent-yellow)]" bg="bg-[var(--accent-yellow-soft)] border-[var(--accent-yellow-soft)]" />
        <MetricCard label="Days Active" value={streakData ? `${streakData.activeDatesThisYear.size}` : "—"} icon={<Zap size={18} />} color="text-[var(--accent-blue)]" bg="bg-[var(--accent-blue-soft)] border-[var(--accent-blue-soft)]" />
        <MetricCard label="Current Weight" value={profile?.weightKg ? `${profile.weightKg} kg` : "—"} icon={<Scale size={18} />} color="text-[var(--accent-pink)]" bg="bg-[var(--accent-pink-soft)] border-[var(--accent-pink-soft)]" />
      </div>

      {/* BMI Card */}
      {bmi && bmiCategory ? (
        <div className="rounded-3xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5 shadow-sm sm:p-6">
          <div className="flex items-center gap-2 mb-4">
            <Heart size={20} className="text-[var(--accent-pink)]" />
            <h3 className="font-bold text-[var(--text-primary)] text-lg">Body Mass Index</h3>
          </div>

          <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
            <div className="flex-1">
              <div className="flex items-end gap-3 mb-2">
                <span className="text-5xl font-bold" style={{ color: bmiCategory.color }}>
                  {bmi.toFixed(1)}
                </span>
                <span className="pb-1 text-lg font-semibold" style={{ color: bmiCategory.color }}>
                  {bmiCategory.label}
                </span>
              </div>
              <p className="text-sm text-[var(--text-secondary)] mb-4">{bmiCategory.description}</p>

              {/* BMI Scale bar */}
              <div className="space-y-1">
                <div className="relative h-4 rounded-full overflow-hidden" style={{
                  background: "linear-gradient(to right, var(--accent-blue) 0%, var(--success) 30%, var(--warning) 60%, var(--danger) 100%)"
                }}>
                  <div
                    className="absolute top-0 h-full w-1 bg-[var(--bg-elevated)] rounded-full shadow-md transition-all duration-500"
                    style={{ left: `${bmiNeedle}%`, transform: "translateX(-50%)" }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-[var(--text-muted)]">
                  <span>10</span>
                  <span>Underweight 18.5</span>
                  <span>Normal 25</span>
                  <span>Overweight 30</span>
                  <span>40+</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:w-56">
              <InfoChip label="Height" value={profile?.heightCm ? `${profile.heightCm} cm` : "—"} />
              <InfoChip label="Weight" value={profile?.weightKg ? `${profile.weightKg} kg` : "—"} />
              <InfoChip label="Target" value={profile?.targetWeightKg ? `${profile.targetWeightKg} kg` : "—"} />
              <InfoChip label="Age" value={age ? `${age} yrs` : "—"} />
            </div>
          </div>

          {/* Weight to goal */}
          {weightProgress !== null && (
            <div className="mt-4 rounded-2xl bg-[var(--bg-elevated)] p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-[var(--accent-pink)]">Goal Progress</span>
                <span className="text-sm font-bold text-[var(--accent-pink)]">{weightProgress}%</span>
              </div>
              <div className="h-2 rounded-full bg-[var(--accent-pink-soft)]">
                <div
                  className="h-2 rounded-full bg-[var(--accent-pink)] transition-all duration-700"
                  style={{ width: `${weightProgress}%` }}
                />
              </div>
              <p className="mt-1.5 text-xs text-[var(--text-secondary)]">
                Target: {profile?.targetWeightKg} kg · Current: {profile?.weightKg} kg
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-3xl border border-dashed border-[var(--border)] bg-[var(--bg-elevated)] p-6 text-center">
          <Scale size={32} className="mx-auto text-[var(--text-faint)] mb-3" />
          <p className="font-semibold text-[var(--text-secondary)]">BMI not available</p>
          <p className="text-sm text-[var(--text-secondary)] mt-1">Complete your height and weight in Profile to see BMI.</p>
        </div>
      )}

      {/* Calorie / TDEE Card */}
      {tdee && bmr ? (
        <div className="rounded-3xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5 shadow-sm sm:p-6">
          <div className="flex items-center gap-2 mb-4">
            <Flame size={20} className="text-[var(--accent-yellow)]" />
            <h3 className="font-bold text-[var(--text-primary)] text-lg">Daily Calorie Needs</h3>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 mb-5">
            <div className="rounded-2xl bg-[var(--accent-pink)] p-4 text-white col-span-2 sm:col-span-1">
              <p className="text-xs text-[var(--text-faint)] mb-1">Total Daily Expenditure</p>
              <p className="text-3xl font-bold">{Math.round(tdee)}</p>
              <p className="text-xs text-[var(--text-faint)]">kcal / day</p>
            </div>
            <InfoChip label="Basal Metabolic Rate" value={`${Math.round(bmr)} kcal`} />
            <InfoChip label="Activity Multiplier" value={profile?.activityLevel?.replace(/_/g, " ") ?? "—"} />
          </div>

          {macroData.length > 0 && (
            <>
              <p className="text-sm font-semibold text-[var(--text-secondary)] mb-3">Suggested Macro Split</p>
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={macroData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-elevated)" />
                    <XAxis dataKey="name" tick={{ fontSize: 12, fill: "var(--text-secondary)" }} />
                    <YAxis tick={{ fontSize: 11, fill: "var(--text-secondary)" }} tickFormatter={(v) => `${v}`} />
                    <Tooltip formatter={(v) => [`${v} kcal`]} />
                    <Bar dataKey="cal" radius={[6, 6, 0, 0]}>
                      {macroData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </div>
      ) : null}

      {/* Hydration goal */}
      {profile?.dailyWaterLiters ? (
        <div className="rounded-3xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5 shadow-sm sm:p-6">
          <div className="flex items-center gap-2 mb-3">
            <Droplets size={20} className="text-[var(--accent-blue)]" />
            <h3 className="font-bold text-[var(--text-primary)] text-lg">Daily Hydration Goal</h3>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative h-24 w-10 rounded-full bg-[var(--accent-blue-soft)] border border-[var(--accent-blue-soft)] overflow-hidden">
              <div
                className="absolute bottom-0 w-full rounded-b-full bg-[var(--accent-blue)] transition-all"
                style={{ height: "60%" }}
              />
            </div>
            <div>
              <p className="text-3xl font-bold text-[var(--text-primary)]">{profile.dailyWaterLiters} L</p>
              <p className="text-sm text-[var(--text-secondary)]">target per day</p>
              <p className="mt-1 text-xs text-[var(--accent-blue)]">≈ {Math.round(profile.dailyWaterLiters * 4)} glasses</p>
            </div>
          </div>
        </div>
      ) : null}

      {/* Weight Analytics */}
      <div className="rounded-3xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5 shadow-sm sm:p-6">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 size={20} className="text-[var(--accent-pink)]" />
          <h3 className="font-bold text-[var(--text-primary)] text-lg">Weight History</h3>
        </div>

        <div className="flex flex-wrap gap-2 mb-5">
          {(["7d", "30d", "3m", "6m", "1y", "all"] as WeightRange[]).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                range === r
                  ? "bg-[var(--accent-pink)] text-white"
                  : "bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:bg-[var(--accent-pink-soft)]"
              }`}
            >
              {r === "all" ? "All time" : r === "7d" ? "7 days" : r === "30d" ? "30 days" : r === "3m" ? "3 months" : r === "6m" ? "6 months" : "1 year"}
            </button>
          ))}
        </div>

        {chartData.length === 0 ? (
          <div className="flex flex-col items-center py-10 text-center">
            <Activity size={32} className="text-[var(--text-faint)] mb-3" />
            <p className="font-semibold text-[var(--text-secondary)]">No weight data</p>
            <p className="text-sm text-[var(--text-secondary)] mt-1">Log a routine with unit "kg" to track weight.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3 mb-5">
              {[
                { label: "Current", value: fmt(filteredEntries[filteredEntries.length - 1]?.value ?? null) },
                { label: "Start", value: fmt(filteredEntries[0]?.value ?? null) },
                {
                  label: "Change",
                  value: (() => {
                    const s = filteredEntries[0]?.value;
                    const e = filteredEntries[filteredEntries.length - 1]?.value;
                    if (s == null || e == null) return "—";
                    const diff = e - s;
                    return `${diff >= 0 ? "+" : ""}${diff.toFixed(1)} kg`;
                  })(),
                },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-2xl bg-[var(--bg-elevated)] p-3">
                  <p className="text-xs text-[var(--text-secondary)]">{label}</p>
                  <p className="text-xl font-bold text-[var(--text-primary)] mt-0.5">{value}</p>
                </div>
              ))}
            </div>

            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-elevated)" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--text-secondary)" }} />
                  <YAxis domain={["dataMin - 1", "dataMax + 1"]} tick={{ fontSize: 11, fill: "var(--text-secondary)" }} tickFormatter={(v) => `${v}kg`} />
                  <Tooltip formatter={(v) => [`${Number(v).toFixed(1)} kg`, "Weight"]} />
                  <Line type="monotone" dataKey="weight" stroke="var(--accent-pink)" strokeWidth={2.5} dot={{ fill: "var(--accent-pink)", r: 3 }} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </div>

      {/* Goals summary */}
      {profile && (
        <div className="rounded-3xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5 shadow-sm sm:p-6">
          <div className="flex items-center gap-2 mb-4">
            <Target size={20} className="text-[var(--accent-pink)]" />
            <h3 className="font-bold text-[var(--text-primary)] text-lg">Your Goals</h3>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <GoalChip label="Fitness Goal" value={profile.fitnessGoal?.replace(/_/g, " ") || "—"} />
            <GoalChip label="Weekly Workouts" value={profile.weeklyWorkoutDays ? `${profile.weeklyWorkoutDays} days` : "—"} />
            <GoalChip label="Daily Steps" value={profile.dailyStepsGoal ? `${profile.dailyStepsGoal.toLocaleString()}` : "—"} />
            <GoalChip label="Sleep Goal" value={profile.sleepHoursGoal ? `${profile.sleepHoursGoal}h` : "—"} />
            <GoalChip label="Diet" value={profile.dietaryPreference || "—"} />
            <GoalChip label="Activity Level" value={profile.activityLevel?.replace(/_/g, " ") || "—"} />
          </div>
        </div>
      )}
    </div>
  );
}

function MetricCard({ label, value, icon, color, bg }: {
  label: string; value: string; icon: React.ReactNode; color: string; bg: string;
}) {
  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${bg}`}>
      <div className={`mb-2 ${color}`}>{icon}</div>
      <p className="text-xl font-bold text-[var(--text-primary)]">{value}</p>
      <p className="mt-0.5 text-xs font-medium text-[var(--text-secondary)]">{label}</p>
    </div>
  );
}

function InfoChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-[var(--bg-elevated)] p-3">
      <p className="text-xs text-[var(--text-secondary)]">{label}</p>
      <p className="mt-0.5 text-sm font-bold text-[var(--text-primary)] capitalize">{value}</p>
    </div>
  );
}

function GoalChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[var(--accent-pink-soft)] bg-[var(--bg-elevated)] p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">{label}</p>
      <p className="mt-1 text-sm font-semibold text-[var(--text-secondary)] capitalize">{value}</p>
    </div>
  );
}
