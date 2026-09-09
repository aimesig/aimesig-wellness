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
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-[#d1e5d3] border-t-[#315c3d]" />
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
        { name: "Protein", cal: Math.round(tdee * 0.3), color: "#315c3d" },
        { name: "Carbs", cal: Math.round(tdee * 0.45), color: "#5fa076" },
        { name: "Fat", cal: Math.round(tdee * 0.25), color: "#9bcdad" },
      ]
    : [];

  const bmiNeedle = bmi ? Math.min(100, Math.max(0, ((bmi - 10) / 30) * 100)) : 0;

  return (
    <div className="space-y-6">
      {/* Quick metrics row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label="Active Routines" value={String(routineCount)} icon={<Target size={18} />} color="text-[#315c3d]" bg="bg-[#edf4ee] border-[#cfe8d3]" />
        <MetricCard label="Current Streak" value={streakData ? `${streakData.currentStreak}d` : "—"} icon={<Flame size={18} />} color="text-orange-500" bg="bg-orange-50 border-orange-200" />
        <MetricCard label="Days Active" value={streakData ? `${streakData.activeDatesThisYear.size}` : "—"} icon={<Zap size={18} />} color="text-blue-500" bg="bg-blue-50 border-blue-200" />
        <MetricCard label="Current Weight" value={profile?.weightKg ? `${profile.weightKg} kg` : "—"} icon={<Scale size={18} />} color="text-purple-500" bg="bg-purple-50 border-purple-200" />
      </div>

      {/* BMI Card */}
      {bmi && bmiCategory ? (
        <div className="rounded-3xl border border-[#e0e9e1] bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center gap-2 mb-4">
            <Heart size={20} className="text-[#315c3d]" />
            <h3 className="font-bold text-[#17211b] text-lg">Body Mass Index</h3>
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
              <p className="text-sm text-[#7a877e] mb-4">{bmiCategory.description}</p>

              {/* BMI Scale bar */}
              <div className="space-y-1">
                <div className="relative h-4 rounded-full overflow-hidden" style={{
                  background: "linear-gradient(to right, #3b82f6 0%, #22c55e 30%, #f59e0b 60%, #ef4444 100%)"
                }}>
                  <div
                    className="absolute top-0 h-full w-1 bg-white rounded-full shadow-md transition-all duration-500"
                    style={{ left: `${bmiNeedle}%`, transform: "translateX(-50%)" }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-[#8a9590]">
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
            <div className="mt-4 rounded-2xl bg-[#f5f9f5] p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-[#315c3d]">Goal Progress</span>
                <span className="text-sm font-bold text-[#315c3d]">{weightProgress}%</span>
              </div>
              <div className="h-2 rounded-full bg-[#ddeee0]">
                <div
                  className="h-2 rounded-full bg-[#315c3d] transition-all duration-700"
                  style={{ width: `${weightProgress}%` }}
                />
              </div>
              <p className="mt-1.5 text-xs text-[#7a877e]">
                Target: {profile?.targetWeightKg} kg · Current: {profile?.weightKg} kg
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-3xl border border-dashed border-[#c8d9cb] bg-[#f9fcf9] p-6 text-center">
          <Scale size={32} className="mx-auto text-[#9ab5a0] mb-3" />
          <p className="font-semibold text-[#3a4a3f]">BMI not available</p>
          <p className="text-sm text-[#7a877e] mt-1">Complete your height and weight in Profile to see BMI.</p>
        </div>
      )}

      {/* Calorie / TDEE Card */}
      {tdee && bmr ? (
        <div className="rounded-3xl border border-[#e0e9e1] bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center gap-2 mb-4">
            <Flame size={20} className="text-orange-500" />
            <h3 className="font-bold text-[#17211b] text-lg">Daily Calorie Needs</h3>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 mb-5">
            <div className="rounded-2xl bg-[#1e3528] p-4 text-white col-span-2 sm:col-span-1">
              <p className="text-xs text-[#b9cbbd] mb-1">Total Daily Expenditure</p>
              <p className="text-3xl font-bold">{Math.round(tdee)}</p>
              <p className="text-xs text-[#b9cbbd]">kcal / day</p>
            </div>
            <InfoChip label="Basal Metabolic Rate" value={`${Math.round(bmr)} kcal`} />
            <InfoChip label="Activity Multiplier" value={profile?.activityLevel?.replace(/_/g, " ") ?? "—"} />
          </div>

          {macroData.length > 0 && (
            <>
              <p className="text-sm font-semibold text-[#3a4a3f] mb-3">Suggested Macro Split</p>
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={macroData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#edf4ee" />
                    <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#7a877e" }} />
                    <YAxis tick={{ fontSize: 11, fill: "#7a877e" }} tickFormatter={(v) => `${v}`} />
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
        <div className="rounded-3xl border border-[#e0e9e1] bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center gap-2 mb-3">
            <Droplets size={20} className="text-blue-500" />
            <h3 className="font-bold text-[#17211b] text-lg">Daily Hydration Goal</h3>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative h-24 w-10 rounded-full bg-blue-50 border border-blue-200 overflow-hidden">
              <div
                className="absolute bottom-0 w-full rounded-b-full bg-blue-400 transition-all"
                style={{ height: "60%" }}
              />
            </div>
            <div>
              <p className="text-3xl font-bold text-[#17211b]">{profile.dailyWaterLiters} L</p>
              <p className="text-sm text-[#7a877e]">target per day</p>
              <p className="mt-1 text-xs text-blue-500">≈ {Math.round(profile.dailyWaterLiters * 4)} glasses</p>
            </div>
          </div>
        </div>
      ) : null}

      {/* Weight Analytics */}
      <div className="rounded-3xl border border-[#e0e9e1] bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 size={20} className="text-[#315c3d]" />
          <h3 className="font-bold text-[#17211b] text-lg">Weight History</h3>
        </div>

        <div className="flex flex-wrap gap-2 mb-5">
          {(["7d", "30d", "3m", "6m", "1y", "all"] as WeightRange[]).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                range === r
                  ? "bg-[#1e3528] text-white"
                  : "bg-[#f3f6f3] text-[#627067] hover:bg-[#e8f0e9]"
              }`}
            >
              {r === "all" ? "All time" : r === "7d" ? "7 days" : r === "30d" ? "30 days" : r === "3m" ? "3 months" : r === "6m" ? "6 months" : "1 year"}
            </button>
          ))}
        </div>

        {chartData.length === 0 ? (
          <div className="flex flex-col items-center py-10 text-center">
            <Activity size={32} className="text-[#9ab5a0] mb-3" />
            <p className="font-semibold text-[#3a4a3f]">No weight data</p>
            <p className="text-sm text-[#7a877e] mt-1">Log a routine with unit "kg" to track weight.</p>
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
                <div key={label} className="rounded-2xl bg-[#f5f9f5] p-3">
                  <p className="text-xs text-[#7a877e]">{label}</p>
                  <p className="text-xl font-bold text-[#17211b] mt-0.5">{value}</p>
                </div>
              ))}
            </div>

            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#edf4ee" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#7a877e" }} />
                  <YAxis domain={["dataMin - 1", "dataMax + 1"]} tick={{ fontSize: 11, fill: "#7a877e" }} tickFormatter={(v) => `${v}kg`} />
                  <Tooltip formatter={(v) => [`${Number(v).toFixed(1)} kg`, "Weight"]} />
                  <Line type="monotone" dataKey="weight" stroke="#315c3d" strokeWidth={2.5} dot={{ fill: "#315c3d", r: 3 }} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </div>

      {/* Goals summary */}
      {profile && (
        <div className="rounded-3xl border border-[#e0e9e1] bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center gap-2 mb-4">
            <Target size={20} className="text-[#315c3d]" />
            <h3 className="font-bold text-[#17211b] text-lg">Your Goals</h3>
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
      <p className="text-xl font-bold text-[#17211b]">{value}</p>
      <p className="mt-0.5 text-xs font-medium text-[#7a877e]">{label}</p>
    </div>
  );
}

function InfoChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-[#f5f9f5] p-3">
      <p className="text-xs text-[#7a877e]">{label}</p>
      <p className="mt-0.5 text-sm font-bold text-[#17211b] capitalize">{value}</p>
    </div>
  );
}

function GoalChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[#e8f0e9] bg-[#f9fcf9] p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[#8a9590]">{label}</p>
      <p className="mt-1 text-sm font-semibold text-[#2d3d32] capitalize">{value}</p>
    </div>
  );
}
