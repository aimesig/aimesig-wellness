import { useEffect, useState, type ReactNode } from "react";
import { BarChart3, CalendarDays, Check, FileText, FolderOpen, Loader2, ShieldCheck, X } from "lucide-react";
import { getGeneralDocuments, type GeneralDocument } from "../../services/generalDocumentService";
import { getHealthCheckups, getMedicalReports, type HealthCheckup, type MedicalReport } from "../../services/medicalReportService";
import { getFriendSharePermissions, saveFriendSharePermissions, type Friend, type FriendSharePermissions } from "../../services/socialService";

export function ShareManager({ ownerId, friend, onClose }: { ownerId: string; friend: Friend; onClose: () => void }) {
  const [permissions, setPermissions] = useState<FriendSharePermissions | null>(null);
  const [medical, setMedical] = useState<(HealthCheckup | MedicalReport)[]>([]);
  const [documents, setDocuments] = useState<GeneralDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([
      getFriendSharePermissions(ownerId, friend.uid),
      getHealthCheckups(ownerId),
      getMedicalReports(ownerId),
      getGeneralDocuments(ownerId),
    ]).then(([p, checkups, legacy, docs]) => {
      if (!active) return;
      setPermissions(p);
      const byId = new Map<string, HealthCheckup | MedicalReport>();
      [...checkups, ...legacy].forEach((item) => { if (item.id) byId.set(item.id, item); });
      setMedical(Array.from(byId.values()).sort((a, b) => (a.date < b.date ? 1 : -1)));
      setDocuments(docs);
    }).catch((e) => active && setError(e?.message || "Unable to load sharing options.")).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [ownerId, friend.uid]);

  async function save() {
    if (!permissions) return;
    setSaving(true); setError("");
    try {
      await saveFriendSharePermissions(ownerId, friend.uid, {
        routineCalendar: permissions.routineCalendar,
        analytics: permissions.analytics,
        medicalReportIds: permissions.medicalReportIds,
        generalDocumentIds: permissions.generalDocumentIds,
      });
      onClose();
    } catch (e: any) {
      setError(e?.message || "Unable to save sharing permissions.");
    } finally { setSaving(false); }
  }

  function toggleMedical(id: string) {
    setPermissions((p) => p ? { ...p, medicalReportIds: p.medicalReportIds.includes(id) ? p.medicalReportIds.filter((x) => x !== id) : [...p.medicalReportIds, id] } : p);
  }
  function toggleDocument(id: string) {
    setPermissions((p) => p ? { ...p, generalDocumentIds: p.generalDocumentIds.includes(id) ? p.generalDocumentIds.filter((x) => x !== id) : [...p.generalDocumentIds, id] } : p);
  }

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onMouseDown={onClose}>
    <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5 shadow-xl sm:p-6" onMouseDown={(e) => e.stopPropagation()}>
      <div className="flex items-start justify-between gap-4">
        <div><h2 className="text-lg font-bold text-[var(--text-primary)]">Share with @{friend.username}</h2><p className="mt-1 text-xs text-[var(--text-secondary)]">Choose exactly what this friend can view. They cannot edit or delete anything you share.</p></div>
        <button type="button" onClick={onClose} className="rounded-xl p-2 text-[var(--text-secondary)] hover:bg-[var(--surface-strong)]"><X size={18}/></button>
      </div>
      {error && <p className="mt-3 rounded-xl bg-[var(--danger-soft)] px-3 py-2 text-xs font-medium text-[var(--danger)]">{error}</p>}
      {loading || !permissions ? <div className="flex justify-center py-12"><Loader2 size={22} className="animate-spin text-[var(--accent-pink)]"/></div> : <div className="mt-5 space-y-5">
        <PermissionToggle icon={<CalendarDays size={17}/>} title="Routine Calendar" description="Friend can view your routine calendar, completion status and logged details." checked={permissions.routineCalendar} onChange={() => setPermissions({...permissions, routineCalendar: !permissions.routineCalendar})}/>
        <PermissionToggle icon={<BarChart3 size={17}/>} title="Analytics" description="Friend can view your routine analytics. Analytics is always view-only." checked={permissions.analytics} onChange={() => setPermissions({...permissions, analytics: !permissions.analytics})}/>

        <SelectionSection icon={<FileText size={17}/>} title="Medical Reports" description="Select individual medical reports/checkups. Shared records are view-only." empty={!medical.length}>
          {medical.map((item) => item.id && <SelectRow key={item.id} checked={permissions.medicalReportIds.includes(item.id)} onChange={() => toggleMedical(item.id!)} title={item.title} subtitle={`${item.date} · ${item.category}`}/>) }
        </SelectionSection>

        <SelectionSection icon={<FolderOpen size={17}/>} title="General Documents" description="Select individual documents. Friends can view/download them but cannot delete or modify them." empty={!documents.length}>
          {documents.map((item) => item.id && <SelectRow key={item.id} checked={permissions.generalDocumentIds.includes(item.id)} onChange={() => toggleDocument(item.id!)} title={item.name} subtitle={item.folderName || "Unsorted"}/>) }
        </SelectionSection>

        <div className="flex items-center justify-between gap-3 border-t border-[var(--border)] pt-4">
          <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]"><ShieldCheck size={15} className="text-[var(--success)]"/> Individual permissions for this friend</div>
          <div className="flex gap-2"><button type="button" onClick={onClose} className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--text-secondary)]">Cancel</button><button type="button" disabled={saving} onClick={() => void save()} className="flex items-center gap-2 rounded-xl bg-[var(--accent-pink)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving && <Loader2 size={14} className="animate-spin"/>}{saving ? "Saving…" : "Save permissions"}</button></div>
        </div>
      </div>}
    </div>
  </div>;
}

function PermissionToggle({ icon, title, description, checked, onChange }: { icon: ReactNode; title: string; description: string; checked: boolean; onChange: () => void }) {
  return <button type="button" onClick={onChange} className="flex w-full items-start gap-3 rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-4 text-left">
    <span className="mt-0.5 text-[var(--accent-pink)]">{icon}</span><span className="min-w-0 flex-1"><span className="block text-sm font-bold text-[var(--text-primary)]">{title}</span><span className="mt-1 block text-xs text-[var(--text-secondary)]">{description}</span></span><span className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded-md border ${checked ? "border-[var(--accent-pink)] bg-[var(--accent-pink)] text-white" : "border-[var(--border-strong)]"}`}>{checked && <Check size={13}/>}</span>
  </button>;
}

function SelectionSection({ icon, title, description, empty, children }: { icon: ReactNode; title: string; description: string; empty: boolean; children: ReactNode }) {
  return <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-4"><div className="flex items-start gap-3"><span className="text-[var(--accent-pink)]">{icon}</span><div><h3 className="text-sm font-bold text-[var(--text-primary)]">{title}</h3><p className="mt-1 text-xs text-[var(--text-secondary)]">{description}</p></div></div><div className="mt-3 space-y-2">{empty ? <p className="py-3 text-xs text-[var(--text-muted)]">No items available.</p> : children}</div></section>;
}

function SelectRow({ checked, onChange, title, subtitle }: { checked: boolean; onChange: () => void; title: string; subtitle: string }) {
  return <button type="button" onClick={onChange} className="flex w-full items-center gap-3 rounded-xl border border-[var(--border)] px-3 py-2.5 text-left hover:bg-[var(--surface-strong)]"><span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${checked ? "border-[var(--accent-pink)] bg-[var(--accent-pink)] text-white" : "border-[var(--border-strong)]"}`}>{checked && <Check size={13}/>}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-[var(--text-primary)]">{title}</span><span className="block truncate text-xs text-[var(--text-secondary)]">{subtitle}</span></span></button>;
}
