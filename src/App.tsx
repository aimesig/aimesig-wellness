import {
  BookOpen,
  BarChart3,
  CalendarDays,
  Check,
  Flame,
  Home,
  Loader2,
  LogOut,
  Moon,
  Sun,
  User,
  X,
} from "lucide-react";

import { useState, useEffect, useCallback, useRef } from "react";
import { Timestamp } from "firebase/firestore";

import AuthScreen from "./components/auth/AuthScreen";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ThemeProvider, useTheme } from "./context/ThemeContext";
import { CalendarView } from "./components/calendar/CalendarView";
import { ProfileView } from "./components/profile/ProfileView";
import { RoutineManager } from "./components/routines/RoutineManager";
import { RoutineAnalytics } from "./components/analytics/RoutineAnalytics";

import type { Routine, RoutineLog, RoutineStatus } from "./types/routine";
import { getRoutines } from "./services/routineService";
import { getRoutineLog, saveRoutineLog } from "./services/routineLogService";
import { getRoutinesForDate } from "./utils/recurrence";
import { getStreakData } from "./services/streakService";
import { getProfile } from "./services/profileService";
import { getUserTheme, saveUserTheme } from "./services/themeService";
import aimesigLogo from "./assets/aimesig-logo.png";

// ─── helpers ───────────────────────────────────────────────────────────────

function toDayTimestamp(date: Date): Timestamp {
  return Timestamp.fromDate(new Date(date.getFullYear(), date.getMonth(), date.getDate()));
}

function getDisplayName(email: string | null): string {
  if (!email) return "there";
  const localPart = email.split("@")[0]?.trim();
  if (!localPart) return "there";
  return localPart
    .replace(/[._-]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

// ─── app shell ─────────────────────────────────────────────────────────────

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AuthenticatedApplication />
      </AuthProvider>
    </ThemeProvider>
  );
}

function AuthenticatedApplication() {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <AuthScreen />;
  return <WellnessDashboard userName={getDisplayName(user.email)} userId={user.uid} />;
}

function LoadingScreen() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--bg)]">
      <div className="flex items-center gap-3 text-sm font-medium text-[var(--text-secondary)]">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--accent-pink)]" />
        Loading…
      </div>
    </main>
  );
}

// ─── nav ───────────────────────────────────────────────────────────────────

type NavTab = "Home" | "My Routines" | "Calendar" | "Analytics" | "Profile";

const NAV: { label: NavTab; icon: typeof Home }[] = [
  { label: "Home",        icon: Home        },
  { label: "My Routines", icon: BookOpen    },
  { label: "Calendar",    icon: CalendarDays},
  { label: "Analytics",   icon: BarChart3   },
];

// ─── dashboard ─────────────────────────────────────────────────────────────

function WellnessDashboard({ userName, userId }: { userName: string; userId: string }) {
  const { logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const [tab, setTab] = useState<NavTab>("Home");
  const [streak, setStreak] = useState<number | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const themeLoaded = useRef(false);

  useEffect(() => {
    getStreakData(userId).then((s) => setStreak(s.currentStreak)).catch(() => {});
    getProfile(userId)
      .then((p) => setDisplayName(p?.name?.trim() || userName))
      .catch(() => setDisplayName(userName));
  }, [userId]);

  // Each signed-in user keeps their own light/dark preference, synced from
  // Firestore on login and written back whenever they toggle it.
  useEffect(() => {
    let cancelled = false;
    themeLoaded.current = false;
    getUserTheme(userId)
      .then((saved) => {
        if (cancelled) return;
        if (saved) setTheme(saved);
        themeLoaded.current = true;
      })
      .catch(() => {
        themeLoaded.current = true;
      });
    return () => {
      cancelled = true;
    };
  }, [userId, setTheme, themeLoaded]);

  const handleNameChange = useCallback((name: string) => {
    setDisplayName(name);
  }, []);

  function handleThemeToggle() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    void saveUserTheme(userId, next);
  }

  async function handleLogout() {
    try { await logout(); } catch (e) { console.error(e); }
  }

  function renderContent() {
    switch (tab) {
      case "My Routines":
        return (
          <>
            <PageHeader title="My Routines" subtitle="Create and manage routines" />
            <RoutineManager userId={userId} />
          </>
        );
      case "Calendar":
        return (
          <>
            <PageHeader title="Calendar" subtitle="Review your history" />
            <CalendarView userId={userId} />
          </>
        );
      case "Analytics":
        return (
          <>
            <PageHeader title="Analytics" subtitle="Goal tracking per routine" />
            <RoutineAnalytics userId={userId} />
          </>
        );
      case "Profile":
        return (
          <>
            <PageHeader title="Profile" subtitle="Your goals and settings" />
            <ProfileView userId={userId} userName={displayName ?? userName} onNameChange={handleNameChange} />
          </>
        );
      default:
        return <HomeView userId={userId} userName={displayName} streak={streak} />;
    }
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text-primary)]">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-52 flex-col border-r border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-6 lg:flex">
        <Brand />
        <nav className="mt-8 flex flex-1 flex-col gap-0.5">
          {NAV.map((item) => (
            <SideNavBtn
              key={item.label}
              label={item.label}
              icon={item.icon}
              active={tab === item.label}
              onClick={() => setTab(item.label)}
            />
          ))}
        </nav>
        {streak !== null && streak > 0 && (
          <div className="mb-4 flex items-center gap-2 rounded-xl bg-[var(--accent-yellow-soft)] px-3 py-2.5 text-xs font-semibold text-[var(--accent-yellow)]">
            <Flame size={13} />
            {streak}-day streak
          </div>
        )}
        <button
          type="button"
          onClick={handleThemeToggle}
          className="mb-1 flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm text-[var(--text-secondary)] transition hover:bg-[var(--surface-strong)]"
        >
          {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
          {theme === "dark" ? "Light mode" : "Dark mode"}
        </button>
        <button
          type="button"
          onClick={handleLogout}
          className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm text-[var(--text-secondary)] transition hover:bg-[var(--surface-strong)]"
        >
          <LogOut size={15} />
          Sign out
        </button>
      </aside>

      {/* Top bar: profile (top-left), streak (top-middle), theme toggle (top-right) */}
      <TopBar
        displayName={displayName ?? userName}
        streak={streak}
        active={tab === "Profile"}
        theme={theme}
        onProfileClick={() => setTab("Profile")}
        onThemeToggle={handleThemeToggle}
      />

      {/* Main */}
      <main className="pb-24 lg:ml-52 lg:pb-10">
        <div className="mx-auto max-w-2xl px-4 py-6">
          {renderContent()}
        </div>
      </main>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border)] bg-[var(--nav-bg)] px-1 pb-[env(safe-area-inset-bottom)] pt-1 backdrop-blur-xl lg:hidden">
        <div className="flex items-center justify-around">
          {NAV.map((item) => (
            <MobileNavBtn
              key={item.label}
              label={item.label}
              icon={item.icon}
              active={tab === item.label}
              onClick={() => setTab(item.label)}
            />
          ))}
        </div>
      </nav>
    </div>
  );
}

// ─── top bar: profile top-left · streak top-middle · theme top-right ──────

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.charAt(0).toUpperCase();
  return (parts[0]!.charAt(0) + parts[parts.length - 1]!.charAt(0)).toUpperCase();
}

function TopBar({
  displayName,
  streak,
  active,
  theme,
  onProfileClick,
  onThemeToggle,
}: {
  displayName: string | null;
  streak: number | null;
  active: boolean;
  theme: "light" | "dark";
  onProfileClick: () => void;
  onThemeToggle: () => void;
}) {
  const initials = displayName ? getInitials(displayName) : "";

  return (
    <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--nav-bg)] px-4 py-3 backdrop-blur-xl lg:pl-56">
      <div className="mx-auto grid max-w-2xl grid-cols-3 items-center">
        {/* Profile — top left */}
        <button
          type="button"
          onClick={onProfileClick}
          className="flex w-fit items-center gap-2"
          aria-label="Open profile"
        >
          <span
            className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold text-white transition
              ${active ? "shadow-[var(--glow-pink)]" : ""}`}
            style={{
              background: "linear-gradient(135deg, var(--accent-pink), var(--accent-blue))",
              border: active ? "2px solid var(--accent-pink)" : "2px solid transparent",
            }}
          >
            {initials || <User size={15} />}
          </span>
        </button>

        {/* Streak — top middle */}
        <div className="flex justify-center">
          {streak !== null && streak > 0 ? (
            <span
              className="flex items-center gap-1.5 rounded-full border border-[var(--accent-yellow-soft)] bg-[var(--accent-yellow-soft)] px-3 py-1.5 text-xs font-bold text-[var(--accent-yellow)]"
              style={{ boxShadow: "var(--glow-yellow)" }}
            >
              <Flame size={13} strokeWidth={2.5} />
              {streak}-day streak
            </span>
          ) : (
            <span className="text-xs font-medium text-[var(--text-faint)]">No streak yet</span>
          )}
        </div>

        {/* Theme toggle — top right */}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onThemeToggle}
            aria-label="Toggle light and dark theme"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] transition hover:border-[var(--accent-pink)] hover:text-[var(--accent-pink)]"
          >
            {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
          </button>
        </div>
      </div>
    </header>
  );
}

// ─── home: today's routines ────────────────────────────────────────────────

function HomeView({ userId, userName, streak }: { userId: string; userName: string | null; streak: number | null }) {
  const today = new Date();
  const hour = today.getHours();
  const greeting = hour < 12 ? "Morning" : hour < 17 ? "Afternoon" : "Evening";

  const [routines, setRoutines] = useState<Routine[]>([]);
  const [logs, setLogs] = useState<Record<string, RoutineLog | null>>({});
  const [loading, setLoading] = useState(true);

  const todayTs = toDayTimestamp(today);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const all = await getRoutines(userId);
      const todayRoutines = getRoutinesForDate(all, today);
      setRoutines(todayRoutines);
      const entries = await Promise.all(
        todayRoutines.map(async (r) => {
          const log = await getRoutineLog(userId, r.id, todayTs);
          return [r.id, log] as const;
        })
      );
      setLogs(Object.fromEntries(entries));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { void loadAll(); }, [loadAll]);

  const done = Object.values(logs).filter((l) => l?.status === "yes").length;
  const total = routines.length;

  return (
    <>
      <div className="mb-6">
        <p className="text-xs font-medium text-[var(--text-muted)]">
          {today.toLocaleDateString("en", { weekday: "long", month: "long", day: "numeric" })}
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-[var(--text-primary)]">
          {greeting},{" "}
          {userName === null ? (
            <span className="inline-block h-6 w-32 animate-pulse rounded-md bg-[var(--border)]" />
          ) : (
            userName
          )}
        </h1>
        {total > 0 && (
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            {done}/{total} done today
            {streak !== null && streak > 0 && (
              <span className="ml-3 inline-flex items-center gap-1 text-[var(--accent-yellow)]">
                <Flame size={12} /> {streak}d
              </span>
            )}
          </p>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16 text-[var(--text-muted)]">
          <Loader2 size={22} className="animate-spin" />
        </div>
      ) : routines.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--border)] py-16 text-center">
          <p className="text-sm font-medium text-[var(--text-muted)]">No routines scheduled for today</p>
          <p className="mt-1 text-xs text-[var(--text-faint)]">Add routines in My Routines</p>
        </div>
      ) : (
        <div className="space-y-3">
          {routines.map((routine) => (
            <RoutineCard
              key={routine.id}
              routine={routine}
              log={logs[routine.id] ?? null}
              userId={userId}
              date={today}
              onSaved={(updatedLog) =>
                setLogs((prev) => ({ ...prev, [routine.id]: updatedLog }))
              }
            />
          ))}
        </div>
      )}
    </>
  );
}

// ─── inline routine card ───────────────────────────────────────────────────

interface RoutineCardProps {
  routine: Routine;
  log: RoutineLog | null;
  userId: string;
  date: Date;
  onSaved: (log: RoutineLog) => void;
}

function RoutineCard({ routine, log, userId, date, onSaved }: RoutineCardProps) {
  const [status, setStatus] = useState<RoutineStatus>(log?.status ?? "pending");
  const [value, setValue] = useState(log?.value != null ? String(log.value) : "");
  const [remark, setRemark] = useState(log?.remark ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const todayTs = toDayTimestamp(date);

  useEffect(() => {
    setStatus(log?.status ?? "pending");
    setValue(log?.value != null ? String(log.value) : "");
    setRemark(log?.remark ?? "");
  }, [log]);

  async function handleStatusClick(next: RoutineStatus) {
    setStatus(next);
    setError("");
    if (routine.inputType === "number" && next === "yes" && !value.trim()) return;
    await save(next, value, remark);
  }

  async function save(s: RoutineStatus, v: string, r: string) {
    setError("");
    let numVal: number | null = null;
    if (routine.inputType === "number") {
      if (!v.trim()) { setError("Enter a value to save."); return; }
      numVal = Number(v);
      if (!Number.isFinite(numVal)) { setError("Enter a valid number."); return; }
    }
    try {
      setSaving(true);
      await saveRoutineLog(userId, {
        routineId: routine.id,
        date: todayTs,
        status: s,
        remark: r,
        value: numVal,
      });
      const pseudo: RoutineLog = {
        id: log?.id ?? "",
        routineId: routine.id,
        date: todayTs,
        status: s,
        remark: r,
        value: numVal,
        createdAt: log?.createdAt ?? todayTs,
        updatedAt: todayTs,
      };
      onSaved(pseudo);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (e) {
      console.error(e);
      setError("Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  const statusColors: Record<RoutineStatus, string> = {
    yes: "border-[var(--success)] bg-[var(--success-soft)]",
    no: "border-[var(--danger)]/40 bg-[var(--danger-soft)]",
    pending: "border-[var(--border)] bg-[var(--bg-elevated)]",
  };

  return (
    <article className={`rounded-2xl border p-4 transition-colors ${statusColors[status]}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-[var(--text-primary)] leading-snug">{routine.title}</p>
          {routine.description ? (
            <p className="mt-0.5 text-xs text-[var(--text-muted)] line-clamp-1">{routine.description}</p>
          ) : null}
        </div>
        {saved && (
          <span className="shrink-0 rounded-full bg-[var(--success)] px-2 py-0.5 text-[10px] font-bold text-white">Saved</span>
        )}
      </div>

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => void handleStatusClick("yes")}
          disabled={saving}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl border py-2.5 text-sm font-semibold transition
            ${status === "yes"
              ? "border-[var(--success)] bg-[var(--success)] text-white"
              : "border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--success)] hover:border-[var(--success)]"
            }`}
        >
          <Check size={15} strokeWidth={2.5} />
          Yes
        </button>
        <button
          type="button"
          onClick={() => void handleStatusClick("no")}
          disabled={saving}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl border py-2.5 text-sm font-semibold transition
            ${status === "no"
              ? "border-[var(--danger)] bg-[var(--danger)] text-white"
              : "border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--danger)] hover:border-[var(--danger)]"
            }`}
        >
          <X size={15} strokeWidth={2.5} />
          No
        </button>
      </div>

      {routine.inputType === "number" && (
        <div className="mt-2">
          <input
            type="number"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={() => { if (status !== "pending") void save(status, value, remark); }}
            placeholder={routine.unit ? `Value (${routine.unit})` : "Enter number"}
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2.5 text-sm outline-none focus:border-[var(--success)] placeholder:text-[var(--text-faint)]"
          />
        </div>
      )}

      <div className="mt-2">
        <input
          type="text"
          value={remark}
          onChange={(e) => setRemark(e.target.value)}
          onBlur={() => { if (status !== "pending") void save(status, value, remark); }}
          placeholder="Remarks (optional)"
          className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2.5 text-sm outline-none focus:border-[var(--success)] placeholder:text-[var(--text-faint)]"
        />
      </div>

      {error && <p className="mt-2 text-xs text-[var(--danger)]">{error}</p>}
      {saving && (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
          <Loader2 size={12} className="animate-spin" /> Saving…
        </div>
      )}
    </article>
  );
}

// ─── shared ui ─────────────────────────────────────────────────────────────

function PageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">{title}</h1>
      <p className="mt-0.5 text-sm text-[var(--text-secondary)]">{subtitle}</p>
    </div>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <img
        src={aimesigLogo}
        alt="AimeSig logo"
        className={`shrink-0 object-contain ${compact ? "h-8 w-8" : "h-9 w-9"}`}
      />
      <div className="leading-tight">
        <p className="font-bold text-[var(--text-primary)]">AimeSig</p>
        <p className="text-[10px] font-medium text-[var(--text-secondary)]">Wellness</p>
      </div>
    </div>
  );
}

function SideNavBtn({ label, icon: Icon, active, onClick }: { label: string; icon: typeof Home; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm transition
        ${active ? "bg-[var(--accent-pink-soft)] text-[var(--accent-pink)] font-semibold" : "font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]"}`}
    >
      <Icon size={17} />
      {label}
    </button>
  );
}

function MobileNavBtn({ label, icon: Icon, active, onClick }: { label: string; icon: typeof Home; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-w-0 flex-col items-center gap-0.5 rounded-xl px-2 py-1.5 transition
        ${active ? "text-[var(--accent-pink)]" : "text-[var(--text-muted)]"}`}
    >
      <Icon size={19} strokeWidth={active ? 2.5 : 1.8} />
      <span className="text-[9px] font-semibold leading-none">{label}</span>
    </button>
  );
}

export default App;