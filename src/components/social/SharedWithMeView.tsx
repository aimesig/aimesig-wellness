import { useEffect, useState, type ReactNode } from "react";
import { BarChart3, CalendarDays, FileText, FolderOpen, Loader2, ShieldCheck, ExternalLink } from "lucide-react";
import { getPublicProfile, getSharedWithMe, type FriendSharePermissions, type PublicProfile } from "../../services/socialService";
import { getSharedMedicalReports, getSharedGeneralDocuments } from "../../services/shareService";
import type { GeneralDocument } from "../../services/generalDocumentService";
import type { HealthCheckup, MedicalReport } from "../../services/medicalReportService";

export function SharedWithMeView({ userId, onOpen }: { userId: string; onOpen?: (ownerId: string, view: "calendar" | "analytics") => void }) {
  const [shares, setShares] = useState<FriendSharePermissions[]>([]);
  const [profiles, setProfiles] = useState<Record<string, PublicProfile | null>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    getSharedWithMe(userId).then(async (items) => {
      if (!active) return;
      setShares(items.filter((s) => s.routineCalendar || s.analytics || s.medicalReportIds.length || s.generalDocumentIds.length));
      const pairs = await Promise.all(items.map(async (s) => [s.ownerId, await getPublicProfile(s.ownerId)] as const));
      if (active) setProfiles(Object.fromEntries(pairs));
    }).catch((e) => active && setError(e?.message || "Unable to load shared data.")).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [userId]);

  if (loading) return <div className="flex justify-center py-16"><Loader2 size={22} className="animate-spin text-[var(--accent-pink)]"/></div>;
  if (error) return <p className="rounded-2xl bg-[var(--danger-soft)] p-4 text-sm text-[var(--danger)]">{error}</p>;
  if (!shares.length) return <div className="rounded-3xl border border-dashed border-[var(--border)] py-16 text-center"><ShieldCheck size={30} className="mx-auto mb-3 text-[var(--text-faint)]"/><p className="text-sm font-semibold text-[var(--text-primary)]">Nothing has been shared with you yet</p><p className="mt-1 text-xs text-[var(--text-secondary)]">When a friend gives you access, it will appear here.</p></div>;

  return <div className="space-y-5">{shares.map((share) => <SharedOwnerCard key={share.id || `${share.ownerId}_${share.friendId}`} share={share} profile={profiles[share.ownerId] || null} onOpen={onOpen}/>)}</div>;
}

function SharedOwnerCard({ share, profile, onOpen }: { share: FriendSharePermissions; profile: PublicProfile | null; onOpen?: (ownerId: string, view: "calendar" | "analytics") => void }) {
  const [medical, setMedical] = useState<(HealthCheckup | MedicalReport)[]>([]);
  const [documents, setDocuments] = useState<GeneralDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  async function loadSelected() {
    if (loaded) return;
    setLoading(true);
    try {
      const [m, d] = await Promise.all([
        getSharedMedicalReports(share.ownerId, share.medicalReportIds),
        getSharedGeneralDocuments(share.ownerId, share.generalDocumentIds),
      ]);
      setMedical(m); setDocuments(d); setLoaded(true);
    } finally { setLoading(false); }
  }

  useEffect(() => { if (share.medicalReportIds.length || share.generalDocumentIds.length) void loadSelected(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return <section className="rounded-3xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5 shadow-sm">
    <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--accent-pink-soft)] text-[var(--accent-pink)]">{(profile?.displayName || "A").charAt(0).toUpperCase()}</div><div className="min-w-0 flex-1"><h2 className="truncate font-bold text-[var(--text-primary)]">{profile?.displayName || "AimeSig User"}</h2><p className="text-xs text-[var(--text-secondary)]">@{profile?.username || "user"}</p></div><span className="flex items-center gap-1 rounded-full bg-[var(--success-soft)] px-2.5 py-1 text-[10px] font-semibold text-[var(--success)]"><ShieldCheck size={12}/> View only</span></div>
    <div className="mt-4 flex flex-wrap gap-2">{share.routineCalendar && <button type="button" onClick={() => onOpen?.(share.ownerId, "calendar")} className="flex items-center gap-1.5 rounded-xl bg-[var(--accent-pink)] px-3 py-2 text-xs font-semibold text-white"><CalendarDays size={13}/> Open Calendar</button>}{share.analytics && <button type="button" onClick={() => onOpen?.(share.ownerId, "analytics")} className="flex items-center gap-1.5 rounded-xl bg-[var(--accent-pink)] px-3 py-2 text-xs font-semibold text-white"><BarChart3 size={13}/> Open Analytics</button>}{share.routineCalendar && <AccessPill icon={<CalendarDays size={13}/>} text="Routine Calendar"/>}{share.analytics && <AccessPill icon={<BarChart3 size={13}/>} text="Analytics"/>}{share.medicalReportIds.length > 0 && <AccessPill icon={<FileText size={13}/>} text={`${share.medicalReportIds.length} Medical Report${share.medicalReportIds.length === 1 ? "" : "s"}`}/>} {share.generalDocumentIds.length > 0 && <AccessPill icon={<FolderOpen size={13}/>} text={`${share.generalDocumentIds.length} Document${share.generalDocumentIds.length === 1 ? "" : "s"}`}/>}</div>
    {(medical.length > 0 || documents.length > 0) && <div className="mt-4 space-y-3"><p className="text-xs font-bold uppercase tracking-wide text-[var(--text-secondary)]">Shared files</p>{medical.map((item) => <FileRow key={`m-${item.id}`} title={item.title} subtitle={`${item.date} · Medical report`} url={item.attachments?.[0]?.url}/>) }{documents.map((item) => <FileRow key={`d-${item.id}`} title={item.name} subtitle={item.folderName || "General document"} url={item.url}/>)}</div>}
    {loading && <div className="mt-4 flex items-center gap-2 text-xs text-[var(--text-secondary)]"><Loader2 size={14} className="animate-spin"/> Loading shared files…</div>}
  </section>;
}

function AccessPill({ icon, text }: { icon: ReactNode; text: string }) { return <span className="flex items-center gap-1.5 rounded-xl bg-[var(--surface-strong)] px-3 py-2 text-xs font-semibold text-[var(--text-secondary)]">{icon}{text}</span>; }
function FileRow({ title, subtitle, url }: { title: string; subtitle: string; url?: string }) { return <div className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3"><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-[var(--text-primary)]">{title}</p><p className="truncate text-xs text-[var(--text-secondary)]">{subtitle}</p></div>{url && <a href={url} target="_blank" rel="noreferrer" className="flex shrink-0 items-center gap-1 rounded-lg border border-[var(--border)] px-2.5 py-2 text-xs font-semibold text-[var(--accent-pink)]"><ExternalLink size={13}/> View</a>}</div>; }
