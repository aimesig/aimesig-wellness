import { useEffect, useState } from "react";
import {
  User,
  ChevronRight,
  ChevronLeft,
  Check,
  Scale,
  Target,
  Activity,
  Droplets,
  Moon,
  Utensils,
  Heart,
  Edit3,
  Save,
  Loader2,
  AlertCircle,
} from "lucide-react";
import {
  getProfile,
  saveProfile,
  calculateBMI,
  getBMICategory,
  calculateAge,
  calculateBMR,
  calculateTDEE,
  type FitnessProfile,
} from "../../services/profileService";

interface ProfileViewProps {
  userId: string;
  userName: string;
  onNameChange?: (name: string) => void;
}

const EMPTY_PROFILE: FitnessProfile = {
  name: "",
  dateOfBirth: "",
  gender: "",
  heightCm: null,
  weightKg: null,
  fitnessGoal: "",
  targetWeightKg: null,
  weeklyWorkoutDays: null,
  dailyStepsGoal: null,
  dailyWaterLiters: null,
  sleepHoursGoal: null,
  activityLevel: "",
  dietaryPreference: "",
  healthConditions: [],
  reminderEnabled: true,
};

type Step = "personal" | "body" | "goals" | "lifestyle" | "health" | "done";
const STEPS: Step[] = ["personal", "body", "goals", "lifestyle", "health", "done"];

const STEP_LABELS: Record<Step, string> = {
  personal: "About You",
  body: "Body Metrics",
  goals: "Fitness Goals",
  lifestyle: "Lifestyle",
  health: "Health Info",
  done: "Summary",
};

const HEALTH_CONDITIONS_LIST = [
  "Diabetes", "Hypertension", "Heart Disease", "Asthma",
  "Thyroid Disorder", "PCOS", "Arthritis", "Back Pain", "None",
];

export function ProfileView({ userId, userName, onNameChange }: ProfileViewProps) {
  const [profile, setProfile] = useState<FitnessProfile | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<FitnessProfile>(EMPTY_PROFILE);
  const [step, setStep] = useState<Step>("personal");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const p = await getProfile(userId);
        if (!cancelled) {
          setProfile(p);
          if (!p) {
            // New user — go straight to setup
            setDraft({ ...EMPTY_PROFILE, name: userName });
            setEditing(true);
            setStep("personal");
          } else {
            setDraft(p);
          }
        }
      } catch {
        if (!cancelled) setError("Failed to load profile.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [userId, userName]);

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      await saveProfile(userId, draft);
      setProfile(draft);
      setEditing(false);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      if (draft.name) onNameChange?.(draft.name);
    } catch {
      setError("Failed to save profile. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  function startEdit() {
    setDraft(profile ?? { ...EMPTY_PROFILE, name: userName });
    setStep("personal");
    setEditing(true);
  }

  function update<K extends keyof FitnessProfile>(key: K, value: FitnessProfile[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function toggleCondition(condition: string) {
    setDraft((d) => {
      const existing = d.healthConditions ?? [];
      if (condition === "None") return { ...d, healthConditions: [] };
      return {
        ...d,
        healthConditions: existing.includes(condition)
          ? existing.filter((c) => c !== condition)
          : [...existing.filter((c) => c !== "None"), condition],
      };
    });
  }

  function nextStep() {
    const idx = STEPS.indexOf(step);
    if (idx < STEPS.length - 1) setStep(STEPS[idx + 1]);
  }

  function prevStep() {
    const idx = STEPS.indexOf(step);
    if (idx > 0) setStep(STEPS[idx - 1]);
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-[#d1e5d3] border-t-[#315c3d]" />
      </div>
    );
  }

  // ── Profile Setup Wizard ───────────────────────────────
  if (editing) {
    const stepIdx = STEPS.indexOf(step);

    return (
      <div className="mx-auto max-w-lg">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xl font-bold text-[#17211b]">
              {profile ? "Edit Profile" : "Set Up Your Profile"}
            </h2>
            {profile && (
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="text-sm text-[#627067] hover:text-[#17211b] transition"
              >
                Cancel
              </button>
            )}
          </div>

          {/* Step indicator */}
          <div className="flex items-center gap-2 mb-2">
            {STEPS.filter((s) => s !== "done").map((s, i) => (
              <div
                key={s}
                className={`flex-1 h-1.5 rounded-full transition-all ${
                  i <= stepIdx ? "bg-[#315c3d]" : "bg-[#dde8de]"
                }`}
              />
            ))}
          </div>
          <p className="text-sm font-semibold text-[#627067]">
            {stepIdx + 1} of {STEPS.length} — {STEP_LABELS[step]}
          </p>
        </div>

        {/* Step Content */}
        <div className="rounded-3xl border border-[#e0e9e1] bg-white p-6 shadow-sm">
          {step === "personal" && (
            <StepPersonal draft={draft} update={update} />
          )}
          {step === "body" && (
            <StepBody draft={draft} update={update} />
          )}
          {step === "goals" && (
            <StepGoals draft={draft} update={update} />
          )}
          {step === "lifestyle" && (
            <StepLifestyle draft={draft} update={update} />
          )}
          {step === "health" && (
            <StepHealth
              draft={draft}
              update={update}
              toggleCondition={toggleCondition}
            />
          )}
          {step === "done" && (
            <StepSummary draft={draft} />
          )}

          {error && (
            <div className="mt-4 flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          <div className="mt-6 flex items-center justify-between gap-3">
            {stepIdx > 0 ? (
              <button
                type="button"
                onClick={prevStep}
                className="flex items-center gap-2 rounded-xl border border-[#dde8de] px-4 py-2.5 text-sm font-semibold text-[#627067] hover:bg-[#f5f9f5] transition"
              >
                <ChevronLeft size={16} />
                Back
              </button>
            ) : (
              <div />
            )}

            {step !== "done" ? (
              <button
                type="button"
                onClick={nextStep}
                className="flex items-center gap-2 rounded-xl bg-[#1e3528] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#2a4a38] transition"
              >
                Continue
                <ChevronRight size={16} />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 rounded-xl bg-[#315c3d] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#264a30] transition disabled:opacity-60"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                {saving ? "Saving…" : "Save Profile"}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Profile View ───────────────────────────────────────
  if (!profile) {
    return (
      <div className="flex flex-col items-center py-16 text-center">
        <div className="h-16 w-16 rounded-2xl bg-[#dfeee2] flex items-center justify-center mb-4">
          <User size={28} className="text-[#315c3d]" />
        </div>
        <h3 className="font-bold text-[#17211b] text-lg">No profile yet</h3>
        <p className="text-sm text-[#7a877e] mt-1 mb-4">Set up your fitness profile to unlock analytics.</p>
        <button
          type="button"
          onClick={startEdit}
          className="rounded-xl bg-[#1e3528] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#2a4a38] transition"
        >
          Set up profile
        </button>
      </div>
    );
  }

  const bmi = profile.weightKg && profile.heightCm
    ? calculateBMI(profile.weightKg, profile.heightCm) : null;
  const bmiCat = bmi ? getBMICategory(bmi) : null;
  const age = profile.dateOfBirth ? calculateAge(profile.dateOfBirth) : null;
  const bmr = profile.weightKg && profile.heightCm && age && profile.gender
    ? calculateBMR(profile.weightKg, profile.heightCm, age, profile.gender) : null;
  const tdee = bmr && profile.activityLevel ? calculateTDEE(bmr, profile.activityLevel) : null;

  return (
    <div className="space-y-5">
      {success && (
        <div className="flex items-center gap-2 rounded-2xl bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700 font-medium">
          <Check size={16} />
          Profile saved successfully!
        </div>
      )}

      {/* Identity card */}
      <div className="rounded-3xl border border-[#e0e9e1] bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-2xl bg-[#1e3528] flex items-center justify-center text-white text-2xl font-bold">
              {(profile.name || userName).charAt(0).toUpperCase()}
            </div>
            <div>
              <h2 className="text-xl font-bold text-[#17211b]">{profile.name || userName}</h2>
              {age && (
                <p className="text-sm text-[#7a877e] capitalize">
                  {age} yrs · {profile.gender || "—"} · {profile.activityLevel?.replace(/_/g, " ") || "—"}
                </p>
              )}
              {profile.fitnessGoal && (
                <span className="mt-1 inline-block rounded-full bg-[#edf4ee] px-3 py-0.5 text-xs font-semibold text-[#315c3d] capitalize">
                  Goal: {profile.fitnessGoal.replace(/_/g, " ")}
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={startEdit}
            className="flex items-center gap-2 rounded-xl border border-[#dde8de] px-3 py-2 text-sm font-semibold text-[#627067] hover:bg-[#f5f9f5] transition"
          >
            <Edit3 size={15} />
            Edit
          </button>
        </div>
      </div>

      {/* BMI Card */}
      {bmi && bmiCat && (
        <div className="rounded-3xl border border-[#e0e9e1] bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Scale size={18} className="text-[#315c3d]" />
            <h3 className="font-bold text-[#17211b]">Body Metrics</h3>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <BMIBlock label="BMI" value={bmi.toFixed(1)} sub={bmiCat.label} subColor={bmiCat.color} />
            <BMIBlock label="Height" value={`${profile.heightCm}`} sub="cm" />
            <BMIBlock label="Weight" value={`${profile.weightKg}`} sub="kg" />
            <BMIBlock label="Target" value={profile.targetWeightKg ? `${profile.targetWeightKg}` : "—"} sub="kg" />
          </div>
          {/* BMI bar */}
          <div className="mt-4 space-y-1">
            <div className="relative h-3 rounded-full overflow-hidden" style={{
              background: "linear-gradient(to right, #3b82f6 0%, #22c55e 30%, #f59e0b 60%, #ef4444 100%)"
            }}>
              <div
                className="absolute top-0 h-full w-1 bg-white rounded-full shadow"
                style={{ left: `${Math.min(100, Math.max(0, ((bmi - 10) / 30) * 100))}%`, transform: "translateX(-50%)" }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-[#8a9590]">
              <span>Underweight</span><span>Normal</span><span>Overweight</span><span>Obese</span>
            </div>
          </div>
        </div>
      )}

      {/* Calorie info */}
      {tdee && (
        <div className="rounded-3xl border border-[#e0e9e1] bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Activity size={18} className="text-orange-500" />
            <h3 className="font-bold text-[#17211b]">Daily Energy</h3>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 sm:col-span-1 rounded-2xl bg-[#1e3528] p-4 text-white">
              <p className="text-xs text-[#b9cbbd]">Maintenance Calories</p>
              <p className="text-3xl font-bold mt-1">{Math.round(tdee)}</p>
              <p className="text-xs text-[#b9cbbd]">kcal / day</p>
            </div>
            <BMIBlock label="Basal Rate" value={`${Math.round(bmr!)}`} sub="kcal BMR" />
          </div>
        </div>
      )}

      {/* Goals grid */}
      <div className="rounded-3xl border border-[#e0e9e1] bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <Target size={18} className="text-[#315c3d]" />
          <h3 className="font-bold text-[#17211b]">Goals & Lifestyle</h3>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <GoalItem icon={<Target size={15} />} label="Goal" value={profile.fitnessGoal?.replace(/_/g, " ") || "—"} />
          <GoalItem icon={<Activity size={15} />} label="Workouts/week" value={profile.weeklyWorkoutDays ? `${profile.weeklyWorkoutDays} days` : "—"} />
          <GoalItem icon={<Activity size={15} />} label="Daily steps" value={profile.dailyStepsGoal ? profile.dailyStepsGoal.toLocaleString() : "—"} />
          <GoalItem icon={<Droplets size={15} />} label="Water" value={profile.dailyWaterLiters ? `${profile.dailyWaterLiters} L` : "—"} />
          <GoalItem icon={<Moon size={15} />} label="Sleep" value={profile.sleepHoursGoal ? `${profile.sleepHoursGoal}h` : "—"} />
          <GoalItem icon={<Utensils size={15} />} label="Diet" value={profile.dietaryPreference || "—"} />
        </div>
      </div>

      {/* Health conditions */}
      {profile.healthConditions && profile.healthConditions.length > 0 && (
        <div className="rounded-3xl border border-[#e0e9e1] bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <Heart size={18} className="text-red-400" />
            <h3 className="font-bold text-[#17211b]">Health Conditions</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {profile.healthConditions.map((c) => (
              <span key={c} className="rounded-full bg-red-50 border border-red-200 px-3 py-1 text-xs font-semibold text-red-700">
                {c}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Step Components ────────────────────────────────────────

function StepPersonal({ draft, update }: {
  draft: FitnessProfile;
  update: <K extends keyof FitnessProfile>(k: K, v: FitnessProfile[K]) => void;
}) {
  return (
    <div className="space-y-4">
      <StepHeading icon={<User size={20} />} title="Tell us about yourself" subtitle="Basic personal details" />

      <Field label="Full Name">
        <input
          className={inputCls}
          value={draft.name}
          onChange={(e) => update("name", e.target.value)}
          placeholder="Your name"
        />
      </Field>

      <Field label="Date of Birth">
        <input
          type="date"
          className={inputCls}
          value={draft.dateOfBirth}
          onChange={(e) => update("dateOfBirth", e.target.value)}
        />
      </Field>

      <Field label="Gender">
        <div className="grid grid-cols-3 gap-2">
          {(["male", "female", "other"] as const).map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => update("gender", g)}
              className={`rounded-xl border py-2.5 text-sm font-semibold capitalize transition ${
                draft.gender === g
                  ? "border-[#315c3d] bg-[#edf4ee] text-[#315c3d]"
                  : "border-[#dde8de] text-[#627067] hover:bg-[#f5f9f5]"
              }`}
            >
              {g}
            </button>
          ))}
        </div>
      </Field>
    </div>
  );
}

function StepBody({ draft, update }: {
  draft: FitnessProfile;
  update: <K extends keyof FitnessProfile>(k: K, v: FitnessProfile[K]) => void;
}) {
  const bmi = draft.weightKg && draft.heightCm
    ? calculateBMI(draft.weightKg, draft.heightCm) : null;
  const bmiCat = bmi ? getBMICategory(bmi) : null;

  return (
    <div className="space-y-4">
      <StepHeading icon={<Scale size={20} />} title="Body measurements" subtitle="Used to calculate BMI and calorie needs" />

      <Field label="Height (cm)">
        <input
          type="number"
          className={inputCls}
          value={draft.heightCm ?? ""}
          onChange={(e) => update("heightCm", e.target.value ? Number(e.target.value) : null)}
          placeholder="e.g. 170"
          min={100}
          max={250}
        />
      </Field>

      <Field label="Current Weight (kg)">
        <input
          type="number"
          className={inputCls}
          value={draft.weightKg ?? ""}
          onChange={(e) => update("weightKg", e.target.value ? Number(e.target.value) : null)}
          placeholder="e.g. 70"
          step={0.1}
        />
      </Field>

      <Field label="Target Weight (kg)">
        <input
          type="number"
          className={inputCls}
          value={draft.targetWeightKg ?? ""}
          onChange={(e) => update("targetWeightKg", e.target.value ? Number(e.target.value) : null)}
          placeholder="e.g. 65"
          step={0.1}
        />
      </Field>

      {bmi && bmiCat && (
        <div className="rounded-2xl p-4" style={{ backgroundColor: `${bmiCat.color}15`, border: `1px solid ${bmiCat.color}40` }}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-[#7a877e]">Your BMI</p>
              <p className="text-2xl font-bold mt-0.5" style={{ color: bmiCat.color }}>{bmi.toFixed(1)}</p>
            </div>
            <div className="text-right">
              <p className="font-bold text-sm" style={{ color: bmiCat.color }}>{bmiCat.label}</p>
              <p className="text-xs text-[#7a877e]">{bmiCat.description}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StepGoals({ draft, update }: {
  draft: FitnessProfile;
  update: <K extends keyof FitnessProfile>(k: K, v: FitnessProfile[K]) => void;
}) {
  const goals = [
    { value: "lose_weight", label: "Lose Weight", emoji: "⬇️" },
    { value: "gain_muscle", label: "Gain Muscle", emoji: "💪" },
    { value: "maintain", label: "Maintain", emoji: "⚖️" },
    { value: "improve_endurance", label: "Endurance", emoji: "🏃" },
    { value: "general_health", label: "General Health", emoji: "❤️" },
  ] as const;

  return (
    <div className="space-y-4">
      <StepHeading icon={<Target size={20} />} title="What's your goal?" subtitle="We'll personalise your experience" />

      <div className="grid grid-cols-1 gap-2">
        {goals.map((g) => (
          <button
            key={g.value}
            type="button"
            onClick={() => update("fitnessGoal", g.value)}
            className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm font-semibold transition ${
              draft.fitnessGoal === g.value
                ? "border-[#315c3d] bg-[#edf4ee] text-[#315c3d]"
                : "border-[#dde8de] text-[#627067] hover:bg-[#f5f9f5]"
            }`}
          >
            <span className="text-lg">{g.emoji}</span>
            {g.label}
            {draft.fitnessGoal === g.value && <Check size={16} className="ml-auto text-[#315c3d]" />}
          </button>
        ))}
      </div>

      <Field label="Weekly workout days">
        <div className="flex gap-2 flex-wrap">
          {[1, 2, 3, 4, 5, 6, 7].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => update("weeklyWorkoutDays", d)}
              className={`h-10 w-10 rounded-xl border text-sm font-bold transition ${
                draft.weeklyWorkoutDays === d
                  ? "border-[#315c3d] bg-[#315c3d] text-white"
                  : "border-[#dde8de] text-[#627067] hover:bg-[#f5f9f5]"
              }`}
            >
              {d}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Daily steps goal">
        <select
          className={selectCls}
          value={draft.dailyStepsGoal ?? ""}
          onChange={(e) => update("dailyStepsGoal", e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">Select target</option>
          {[3000, 5000, 7500, 10000, 12000, 15000].map((s) => (
            <option key={s} value={s}>{s.toLocaleString()} steps</option>
          ))}
        </select>
      </Field>
    </div>
  );
}

function StepLifestyle({ draft, update }: {
  draft: FitnessProfile;
  update: <K extends keyof FitnessProfile>(k: K, v: FitnessProfile[K]) => void;
}) {
  const activityLevels = [
    { value: "sedentary", label: "Sedentary", sub: "Little or no exercise" },
    { value: "lightly_active", label: "Lightly Active", sub: "Light exercise 1–3 days/week" },
    { value: "moderately_active", label: "Moderately Active", sub: "Moderate exercise 3–5 days/week" },
    { value: "very_active", label: "Very Active", sub: "Hard exercise 6–7 days/week" },
    { value: "extra_active", label: "Extra Active", sub: "Physical job or twice-daily training" },
  ] as const;

  const diets = ["none", "vegetarian", "vegan", "keto", "paleo", "mediterranean"] as const;

  return (
    <div className="space-y-4">
      <StepHeading icon={<Activity size={20} />} title="Your lifestyle" subtitle="Helps us calculate calorie needs accurately" />

      <Field label="Activity level">
        <div className="space-y-2">
          {activityLevels.map((a) => (
            <button
              key={a.value}
              type="button"
              onClick={() => update("activityLevel", a.value)}
              className={`w-full flex items-center justify-between rounded-xl border px-4 py-3 text-left transition ${
                draft.activityLevel === a.value
                  ? "border-[#315c3d] bg-[#edf4ee]"
                  : "border-[#dde8de] hover:bg-[#f5f9f5]"
              }`}
            >
              <div>
                <p className="text-sm font-semibold text-[#17211b]">{a.label}</p>
                <p className="text-xs text-[#7a877e]">{a.sub}</p>
              </div>
              {draft.activityLevel === a.value && <Check size={16} className="text-[#315c3d] shrink-0" />}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Dietary preference">
        <div className="flex flex-wrap gap-2">
          {diets.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => update("dietaryPreference", d)}
              className={`rounded-xl border px-3 py-2 text-sm font-semibold capitalize transition ${
                draft.dietaryPreference === d
                  ? "border-[#315c3d] bg-[#edf4ee] text-[#315c3d]"
                  : "border-[#dde8de] text-[#627067] hover:bg-[#f5f9f5]"
              }`}
            >
              {d === "none" ? "No preference" : d}
            </button>
          ))}
        </div>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Daily water (L)">
          <select
            className={selectCls}
            value={draft.dailyWaterLiters ?? ""}
            onChange={(e) => update("dailyWaterLiters", e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">Select</option>
            {[1, 1.5, 2, 2.5, 3, 3.5, 4].map((l) => (
              <option key={l} value={l}>{l} L</option>
            ))}
          </select>
        </Field>
        <Field label="Sleep goal (hours)">
          <select
            className={selectCls}
            value={draft.sleepHoursGoal ?? ""}
            onChange={(e) => update("sleepHoursGoal", e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">Select</option>
            {[5, 6, 7, 7.5, 8, 9, 10].map((h) => (
              <option key={h} value={h}>{h}h</option>
            ))}
          </select>
        </Field>
      </div>
    </div>
  );
}

function StepHealth({ draft, update, toggleCondition }: {
  draft: FitnessProfile;
  update: <K extends keyof FitnessProfile>(k: K, v: FitnessProfile[K]) => void;
  toggleCondition: (c: string) => void;
}) {
  return (
    <div className="space-y-4">
      <StepHeading icon={<Heart size={20} />} title="Health information" subtitle="Optional — helps personalise your experience" />

      <Field label="Health conditions (if any)">
        <div className="flex flex-wrap gap-2">
          {HEALTH_CONDITIONS_LIST.map((c) => {
            const selected = c === "None"
              ? (draft.healthConditions ?? []).length === 0
              : (draft.healthConditions ?? []).includes(c);
            return (
              <button
                key={c}
                type="button"
                onClick={() => toggleCondition(c)}
                className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                  selected
                    ? "border-red-400 bg-red-50 text-red-700"
                    : "border-[#dde8de] text-[#627067] hover:bg-[#f5f9f5]"
                }`}
              >
                {c}
              </button>
            );
          })}
        </div>
      </Field>

      <Field label="Reminders">
        <button
          type="button"
          onClick={() => update("reminderEnabled", !draft.reminderEnabled)}
          className={`flex items-center gap-3 w-full rounded-xl border px-4 py-3 text-left text-sm font-semibold transition ${
            draft.reminderEnabled
              ? "border-[#315c3d] bg-[#edf4ee] text-[#315c3d]"
              : "border-[#dde8de] text-[#627067] hover:bg-[#f5f9f5]"
          }`}
        >
          {draft.reminderEnabled ? <Check size={16} /> : <span className="h-4 w-4 rounded-sm border border-[#b0bdb5]" />}
          Enable daily reminders
        </button>
      </Field>
    </div>
  );
}

function StepSummary({ draft }: { draft: FitnessProfile }) {
  const bmi = draft.weightKg && draft.heightCm
    ? calculateBMI(draft.weightKg, draft.heightCm) : null;
  const bmiCat = bmi ? getBMICategory(bmi) : null;
  const age = draft.dateOfBirth ? calculateAge(draft.dateOfBirth) : null;

  return (
    <div className="space-y-4">
      <StepHeading icon={<Check size={20} />} title="Looking good!" subtitle="Review your details before saving" />

      <div className="space-y-2 text-sm">
        <SummaryRow label="Name" value={draft.name || "—"} />
        <SummaryRow label="Age" value={age ? `${age} yrs` : "—"} />
        <SummaryRow label="Gender" value={draft.gender || "—"} />
        <SummaryRow label="Height" value={draft.heightCm ? `${draft.heightCm} cm` : "—"} />
        <SummaryRow label="Weight" value={draft.weightKg ? `${draft.weightKg} kg` : "—"} />
        {bmi && bmiCat && (
          <div className="flex justify-between py-1.5">
            <span className="text-[#7a877e] font-medium">BMI</span>
            <span className="font-bold" style={{ color: bmiCat.color }}>
              {bmi.toFixed(1)} ({bmiCat.label})
            </span>
          </div>
        )}
        <SummaryRow label="Goal" value={draft.fitnessGoal?.replace(/_/g, " ") || "—"} />
        <SummaryRow label="Activity" value={draft.activityLevel?.replace(/_/g, " ") || "—"} />
        <SummaryRow label="Diet" value={draft.dietaryPreference || "—"} />
        <SummaryRow label="Workouts/week" value={draft.weeklyWorkoutDays ? `${draft.weeklyWorkoutDays} days` : "—"} />
      </div>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────

const inputCls = "w-full rounded-xl border border-[#dde8de] bg-[#f9fcf9] px-4 py-2.5 text-sm font-medium text-[#17211b] placeholder-[#a8b5ad] focus:border-[#315c3d] focus:outline-none focus:ring-2 focus:ring-[#315c3d]/20 transition";
const selectCls = "w-full rounded-xl border border-[#dde8de] bg-[#f9fcf9] px-4 py-2.5 text-sm font-medium text-[#17211b] focus:border-[#315c3d] focus:outline-none focus:ring-2 focus:ring-[#315c3d]/20 transition";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-[#627067] uppercase tracking-wide">{label}</label>
      {children}
    </div>
  );
}

function StepHeading({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div className="flex items-start gap-3 mb-2">
      <div className="h-10 w-10 rounded-xl bg-[#edf4ee] flex items-center justify-center text-[#315c3d] shrink-0">
        {icon}
      </div>
      <div>
        <h3 className="font-bold text-[#17211b]">{title}</h3>
        <p className="text-xs text-[#7a877e]">{subtitle}</p>
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-1.5 border-b border-[#f0f5f1]">
      <span className="text-[#7a877e] font-medium">{label}</span>
      <span className="font-semibold text-[#17211b] capitalize">{value}</span>
    </div>
  );
}

function BMIBlock({ label, value, sub, subColor }: { label: string; value: string; sub: string; subColor?: string }) {
  return (
    <div className="rounded-2xl bg-[#f5f9f5] p-3">
      <p className="text-xs text-[#7a877e]">{label}</p>
      <p className="text-2xl font-bold text-[#17211b] mt-0.5">{value}</p>
      <p className="text-xs font-semibold mt-0.5 capitalize" style={{ color: subColor ?? "#7a877e" }}>{sub}</p>
    </div>
  );
}

function GoalItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[#e8f0e9] bg-[#f9fcf9] p-3">
      <div className="flex items-center gap-1.5 mb-1 text-[#315c3d]">{icon}
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[#8a9590]">{label}</p>
      </div>
      <p className="text-sm font-semibold text-[#2d3d32] capitalize">{value}</p>
    </div>
  );
}
