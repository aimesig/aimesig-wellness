import {
  Activity,
  BarChart3,
  CalendarDays,
  Check,
  ChevronRight,
  Circle,
  Droplets,
  Dumbbell,
  Flame,
  Home,
  LogOut,
  MoreHorizontal,
  Settings,
  Sparkles,
  Target,
  User,
} from "lucide-react";

import type { ReactNode } from "react";
import { RoutineManager } from "./components/routines/RoutineManager";
import { useState, useEffect } from "react";

import AuthScreen from "./components/auth/AuthScreen";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { WeightAnalytics } from "./components/analytics/WeightAnalytics";
import { CalendarView } from "./components/calendar/CalendarView";
import { AnalyticsView } from "./components/analytics/AnalyticsView";
import { ProfileView } from "./components/profile/ProfileView";
import { getStreakData } from "./services/streakService";

type DashboardRoutineStatus = "completed" | "missed" | "pending";

interface RoutineItem {
  id: number;
  title: string;
  time?: string;
  status: DashboardRoutineStatus;
  remark?: string;
  icon: "activity" | "water" | "target";
}

const dailyRoutines: RoutineItem[] = [
  { id: 1, title: "Wake Up", time: "7:00 AM", status: "completed", remark: "Slept well", icon: "activity" },
  { id: 2, title: "Exercise", time: "6:00 PM", status: "missed", remark: "Didn't have time", icon: "activity" },
  { id: 3, title: "Drink Water", time: "Throughout the day", status: "pending", icon: "water" },
];

const weeklyRoutines: RoutineItem[] = [
  { id: 4, title: "Visit Temple", status: "completed", icon: "target" },
];

const monthlyRoutines: RoutineItem[] = [
  { id: 5, title: "Check Expenses", status: "pending", icon: "target" },
];

const navigationItems = [
  { label: "Home", icon: Home },
  { label: "Calendar", icon: CalendarDays },
  { label: "Analytics", icon: BarChart3 },
  { label: "Profile", icon: User },
];

function App() {
  return (
    <AuthProvider>
      <AuthenticatedApplication />
    </AuthProvider>
  );
}

function AuthenticatedApplication() {
  const { user, loading } = useAuth();
  if (loading) return <AuthenticationLoadingScreen />;
  if (!user) return <AuthScreen />;
  return <WellnessDashboard userName={getDisplayName(user.email)} userId={user.uid} />;
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

function AuthenticationLoadingScreen() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f5f8f5] px-5">
      <div className="text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#dfeee2] text-[#315c3d]">
          <Sparkles size={25} />
        </div>
        <div className="mt-5 flex items-center justify-center gap-2 text-sm font-semibold text-[#526359]">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#c8d9cb] border-t-[#315c3d]" />
          Loading your wellness space...
        </div>
      </div>
    </main>
  );
}

interface WellnessDashboardProps {
  userName: string;
  userId: string;
}

function WellnessDashboard({ userName, userId }: WellnessDashboardProps) {
  const { logout } = useAuth();
  const [activeNavigation, setActiveNavigation] = useState("Home");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [currentStreak, setCurrentStreak] = useState<number | null>(null);

  const completedCount = dailyRoutines.filter((r) => r.status === "completed").length;
  const totalCount = dailyRoutines.length;
  const progress = totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100);

  useEffect(() => {
    getStreakData(userId).then((s) => setCurrentStreak(s.currentStreak)).catch(() => {});
  }, [userId]);

  async function handleLogout() {
    try { await logout(); } catch (e) { console.error("Logout failed:", e); }
  }

  const today = new Date();
  const dateStr = today.toLocaleDateString("en", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const hour = today.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  function renderContent() {
    switch (activeNavigation) {
      case "Calendar":
        return (
          <div>
            <PageHeader title="Calendar" subtitle="Track your progress day by day" />
            <div className="mt-6">
              <CalendarView userId={userId} />
            </div>
          </div>
        );
      case "Analytics":
        return (
          <div>
            <PageHeader title="Analytics" subtitle="Your health metrics at a glance" />
            <div className="mt-6">
              <AnalyticsView userId={userId} />
            </div>
          </div>
        );
      case "Profile":
        return (
          <div>
            <PageHeader title="Profile" subtitle="Your fitness profile and goals" />
            <div className="mt-6">
              <ProfileView userId={userId} userName={userName} />
            </div>
          </div>
        );
      default:
        return <HomeContent
          userName={userName}
          userId={userId}
          dateStr={dateStr}
          greeting={greeting}
          completedCount={completedCount}
          totalCount={totalCount}
          progress={progress}
          currentStreak={currentStreak}
          onNavigate={setActiveNavigation}
        />;
    }
  }

  return (
    <div className="min-h-screen bg-[#f5f8f5] text-[#17211b]">
      {/* Desktop Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-[#e0e8e1] bg-white/90 px-5 py-6 backdrop-blur-xl lg:flex lg:flex-col">
        <Brand />
        <nav className="mt-10 flex flex-1 flex-col gap-2">
          {navigationItems.map((item) => (
            <NavigationButton
              key={item.label}
              label={item.label}
              icon={item.icon}
              active={activeNavigation === item.label}
              onClick={() => setActiveNavigation(item.label)}
            />
          ))}
        </nav>

        {/* Streak badge in sidebar */}
        {currentStreak !== null && currentStreak > 0 && (
          <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4 mb-4">
            <div className="flex items-center gap-2 text-orange-600">
              <Flame size={17} />
              <span className="text-xs font-semibold">Active Streak</span>
            </div>
            <p className="mt-1 text-2xl font-bold text-orange-700">{currentStreak} days</p>
            <p className="text-xs text-orange-500">Keep it up! 🔥</p>
          </div>
        )}

        <div className="rounded-2xl border border-[#e3ece4] bg-[#f5f9f5] p-4">
          <div className="flex items-center gap-2 text-[#55705d]">
            <Sparkles size={17} />
            <span className="text-xs font-semibold uppercase tracking-[0.12em]">Wellness tip</span>
          </div>
          <p className="mt-2 text-sm leading-5 text-[#43564a]">
            Small consistent actions create meaningful long-term progress.
          </p>
        </div>

        <button
          type="button"
          onClick={handleLogout}
          className="mt-5 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-[#627067] transition hover:bg-[#f2f6f2] hover:text-[#17211b]"
        >
          <LogOut size={19} />
          Sign out
        </button>
      </aside>

      {/* Mobile Header */}
      <header className="sticky top-0 z-30 border-b border-[#e0e8e1] bg-white/90 px-4 py-3 backdrop-blur-xl lg:hidden">
        <div className="flex items-center justify-between">
          <Brand compact />
          <div className="flex items-center gap-2">
            {currentStreak !== null && currentStreak > 0 && (
              <span className="flex items-center gap-1 rounded-full bg-orange-100 px-2.5 py-1 text-xs font-bold text-orange-600">
                <Flame size={12} /> {currentStreak}d
              </span>
            )}
            <button
              type="button"
              aria-label="Open menu"
              onClick={() => setMobileMenuOpen((o) => !o)}
              className="rounded-xl p-2.5 text-[#53635a] transition hover:bg-[#f1f5f1]"
            >
              <Settings size={21} />
            </button>
          </div>
        </div>
        {mobileMenuOpen && (
          <div className="mt-3 rounded-2xl border border-[#e1e9e2] bg-white p-2 shadow-lg">
            <button
              type="button"
              onClick={handleLogout}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium text-[#53635a] hover:bg-[#f4f7f4]"
            >
              <LogOut size={18} />
              Sign out
            </button>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="pb-24 lg:ml-64 lg:pb-8">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
          {renderContent()}
        </div>
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[#dfe8e1] bg-white/95 px-2 pb-[env(safe-area-inset-bottom)] pt-2 backdrop-blur-xl lg:hidden">
        <div className="mx-auto flex max-w-lg items-center justify-around">
          {navigationItems.map((item) => (
            <NavigationButton
              key={item.label}
              label={item.label}
              icon={item.icon}
              active={activeNavigation === item.label}
              mobile
              onClick={() => setActiveNavigation(item.label)}
            />
          ))}
        </div>
      </nav>
    </div>
  );
}

function PageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h1 className="text-3xl font-bold tracking-tight text-[#17211b] sm:text-4xl">{title}</h1>
      <p className="mt-1 text-sm text-[#66746b]">{subtitle}</p>
    </div>
  );
}

function HomeContent({
  userName, userId, dateStr, greeting,
  completedCount, totalCount, progress,
  currentStreak, onNavigate,
}: {
  userName: string; userId: string; dateStr: string; greeting: string;
  completedCount: number; totalCount: number; progress: number;
  currentStreak: number | null;
  onNavigate: (nav: string) => void;
}) {
  return (
    <>
      <section className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-[#6d7c72]">{dateStr}</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-[#17211b] sm:text-4xl">
            {greeting}, {userName}
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-[#66746b] sm:text-base">
            Keep going. A few intentional actions today can make a big difference.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onNavigate("Calendar")}
          className="hidden items-center gap-2 self-start rounded-xl border border-[#dce6de] bg-white px-4 py-2.5 text-sm font-semibold text-[#43564a] shadow-sm transition hover:border-[#cbd9ce] hover:bg-[#f9fbf9] sm:flex"
        >
          <CalendarDays size={17} />
          Calendar
        </button>
      </section>

      {/* Progress Hero */}
      <section className="mt-7 overflow-hidden rounded-3xl bg-[#1e3528] p-6 text-white shadow-[0_18px_50px_rgba(31,55,40,0.16)] sm:p-8">
        <div className="flex flex-col gap-7 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-[#d9ebdc]">
              <Target size={14} />
              TODAY'S PROGRESS
            </div>
            <div className="mt-5 flex items-end gap-3">
              <span className="text-5xl font-bold tracking-tight sm:text-6xl">{completedCount}</span>
              <span className="pb-2 text-lg text-[#b9cbbd]">/ {totalCount} completed</span>
            </div>
            <p className="mt-3 text-sm leading-6 text-[#b9cbbd]">
              You're {progress}% through today's routine. Keep the momentum going.
            </p>
            {currentStreak !== null && currentStreak > 0 && (
              <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-orange-500/20 px-3 py-1.5 text-xs font-semibold text-orange-300">
                <Flame size={13} />
                {currentStreak}-day streak — don't break it!
              </div>
            )}
          </div>
          <ProgressRing progress={progress} />
        </div>
      </section>

      {/* Quick Stats */}
      <section className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Completed" value={String(completedCount)} icon={<Check size={18} />} />
        <StatCard label="Pending" value={String(dailyRoutines.filter((r) => r.status === "pending").length)} icon={<Circle size={18} />} />
        <StatCard label="Missed" value={String(dailyRoutines.filter((r) => r.status === "missed").length)} icon={<Circle size={18} />} />
        <StatCard label="Streak" value={currentStreak !== null ? `${currentStreak}d` : "—"} icon={<Flame size={18} />} />
      </section>

      {/* Daily Routine */}
      <section className="mt-8">
        <SectionHeader title="Daily Routine" subtitle="Your routines for today" count={dailyRoutines.length} />
        <div className="mt-4 space-y-3">
          {dailyRoutines.map((routine) => (
            <RoutineCard key={routine.id} routine={routine} />
          ))}
        </div>
      </section>

      {/* Weekly + Monthly */}
      <section className="mt-8 grid gap-8 xl:grid-cols-2">
        <RoutineSection title="Weekly Routine" subtitle="This week's recurring routines" routines={weeklyRoutines} />
        <RoutineSection title="Monthly Routine" subtitle="Your monthly wellness tasks" routines={monthlyRoutines} />
      </section>

      {/* Quick links to other views */}
      <section className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {[
          { nav: "Calendar", label: "View Calendar", icon: <CalendarDays size={16} />, color: "bg-blue-50 border-blue-200 text-blue-700" },
          { nav: "Analytics", label: "See Analytics", icon: <BarChart3 size={16} />, color: "bg-purple-50 border-purple-200 text-purple-700" },
          { nav: "Profile", label: "Edit Profile", icon: <User size={16} />, color: "bg-[#edf4ee] border-[#c5dfc9] text-[#315c3d]" },
        ].map(({ nav, label, icon, color }) => (
          <button
            key={nav}
            type="button"
            onClick={() => onNavigate(nav)}
            className={`flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold transition hover:opacity-80 ${color}`}
          >
            {icon}
            {label}
            <ChevronRight size={14} className="ml-auto" />
          </button>
        ))}
      </section>

      {/* Weight Preview */}
      <section className="mt-5 rounded-3xl border border-[#e0e9e1] bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#eef6ef] text-[#477253]">
                <Activity size={19} />
              </div>
              <div>
                <p className="font-semibold text-[#1d2b22]">Wellness measurement</p>
                <p className="text-xs text-[#7a877e]">Latest weight</p>
              </div>
            </div>
            <div className="mt-5 flex items-baseline gap-2">
              <span className="text-3xl font-bold text-[#17211b]">72.4</span>
              <span className="text-sm font-medium text-[#7a877e]">kg</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigate("Analytics")}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#dfe8e0] px-4 py-2.5 text-sm font-semibold text-[#4c5e52] transition hover:bg-[#f5f8f5]"
          >
            View analytics
            <ChevronRight size={16} />
          </button>
        </div>
      </section>

      {/* Routine Management */}
      <section className="mt-8">
        <RoutineManager userId={userId} />
      </section>
      <section className="mt-8">
        <WeightAnalytics userId={userId} />
      </section>
    </>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className={`flex shrink-0 items-center justify-center rounded-2xl bg-[#dfeee2] text-[#315c3d] ${compact ? "h-9 w-9" : "h-10 w-10"}`}>
        <Sparkles size={compact ? 18 : 20} />
      </div>
      <div>
        <p className="font-bold tracking-tight text-[#1c2b21]">AimeSig Wellness</p>
        {!compact && <p className="text-xs font-medium text-[#7a877e]">Your daily wellness companion</p>}
      </div>
    </div>
  );
}

function NavigationButton({
  label, icon: Icon, active, mobile = false, onClick,
}: {
  label: string; icon: typeof Home; active: boolean; mobile?: boolean; onClick: () => void;
}) {
  if (mobile) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`flex min-w-16 flex-col items-center gap-1 rounded-xl px-3 py-2 text-[11px] font-semibold transition ${active ? "bg-[#eaf4eb] text-[#315c3d]" : "text-[#77837a] hover:bg-[#f3f6f3]"}`}
      >
        <Icon size={19} />
        {label}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold transition ${active ? "bg-[#e9f3ea] text-[#315c3d]" : "text-[#718078] hover:bg-[#f4f7f4] hover:text-[#24362a]"}`}
    >
      <Icon size={19} />
      {label}
    </button>
  );
}

function ProgressRing({ progress }: { progress: number }) {
  const radius = 48;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (progress / 100) * circumference;
  return (
    <div className="relative flex h-36 w-36 shrink-0 items-center justify-center self-center lg:mr-8">
      <svg className="h-36 w-36 -rotate-90" viewBox="0 0 120 120" aria-hidden="true">
        <circle cx="60" cy="60" r={radius} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="9" />
        <circle cx="60" cy="60" r={radius} fill="none" stroke="#cfe7d3" strokeWidth="9" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset} />
      </svg>
      <div className="absolute text-center">
        <p className="text-3xl font-bold">{progress}%</p>
        <p className="text-xs text-[#b9cbbd]">complete</p>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return (
    <div className="rounded-2xl border border-[#e1e9e2] bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-[#6d7c72]">{icon}</span>
        <MoreHorizontal size={17} className="text-[#a0aaa3]" />
      </div>
      <p className="mt-4 text-2xl font-bold tracking-tight text-[#1c2b21]">{value}</p>
      <p className="mt-1 text-xs font-medium text-[#7a877e]">{label}</p>
    </div>
  );
}

function SectionHeader({ title, subtitle, count }: { title: string; subtitle: string; count: number }) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-[#1c2b21]">{title}</h2>
        <p className="mt-1 text-sm text-[#7a877e]">{subtitle}</p>
      </div>
      <span className="rounded-full bg-[#edf4ee] px-3 py-1 text-xs font-bold text-[#54705b]">{count}</span>
    </div>
  );
}

function RoutineCard({ routine }: { routine: RoutineItem }) {
  const statusConfig = {
    completed: { label: "Completed", className: "bg-[#e9f5eb] text-[#397047]", icon: <Check size={15} strokeWidth={2.5} /> },
    missed: { label: "Missed", className: "bg-[#fff0ee] text-[#b65c52]", icon: <Circle size={13} strokeWidth={2.5} /> },
    pending: { label: "Pending", className: "bg-[#f3f4ef] text-[#7b8177]", icon: <Circle size={13} strokeWidth={2.5} /> },
  };
  const status = statusConfig[routine.status];
  return (
    <article className="group rounded-2xl border border-[#e1e9e2] bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-[#d1ddd3] hover:shadow-md sm:p-5">
      <div className="flex items-center gap-4">
        <RoutineIcon type={routine.icon} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="truncate font-semibold text-[#243128]">{routine.title}</h3>
              {routine.time && <p className="mt-0.5 text-xs text-[#8a958d]">{routine.time}</p>}
            </div>
            <span className={`inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${status.className}`}>
              {status.icon}
              {status.label}
            </span>
          </div>
          {routine.remark && <p className="mt-2 text-sm text-[#6d7c72]">{routine.remark}</p>}
        </div>
        <button type="button" aria-label={`Open ${routine.title}`} className="hidden rounded-xl p-2 text-[#9aa49d] transition hover:bg-[#f4f7f4] hover:text-[#4d5d52] sm:block">
          <ChevronRight size={18} />
        </button>
      </div>
    </article>
  );
}

function RoutineSection({ title, subtitle, routines }: { title: string; subtitle: string; routines: RoutineItem[] }) {
  return (
    <div>
      <SectionHeader title={title} subtitle={subtitle} count={routines.length} />
      <div className="mt-4 space-y-3">
        {routines.map((routine) => <RoutineCard key={routine.id} routine={routine} />)}
      </div>
    </div>
  );
}

function RoutineIcon({ type }: { type: RoutineItem["icon"] }) {
  const cls = "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#eef6ef] text-[#4b7455]";
  if (type === "water") return <div className={cls}><Droplets size={21} /></div>;
  if (type === "target") return <div className={cls}><Target size={21} /></div>;
  return <div className={cls}><Dumbbell size={21} /></div>;
}

export default App;
