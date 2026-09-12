import { useEffect, useRef, useState, type Dispatch, type SetStateAction, type ReactNode } from "react";
import {
  User,
  ChevronRight,
  ChevronLeft,
  Check,
  Scale,
  Target,
  Activity,
  Moon,
  Droplets,
  Utensils,
  Heart,
  Edit3,
  Save,
  Loader2,
  AlertCircle,
  LogOut,
  FileText,
  Upload,
  Plus,
  X,
  Image as ImageIcon,
  FileCheck,
  ClipboardList,
  GitBranch,
  ChevronDown,
  CalendarDays,
  CircleDot,
  Folder,
  FolderPlus,
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
import { getWeightRoutine, getWeightEntries } from "../../services/weightService";
import {
  subscribeHealthCheckups,
  subscribeHealthIssues,
  saveHealthCheckup,
  updateHealthCheckup,
  deleteHealthCheckup,
  saveHealthIssue,
  updateHealthIssue,
  deleteHealthIssue,
  uploadMedicalFile,
  type HealthCheckup,
  type HealthIssue,
  type CheckupCategory,
  type MedicalAttachment,
  type ReferencedCheckupAttachment,
  setHealthCheckupIssues,
} from "../../services/medicalReportService";
import {
  getGeneralDocuments,
  ensureDefaultGeneralFolders,
  createGeneralFolder,
  uploadGeneralDocument,
  deleteGeneralDocument,
  deleteGeneralFolder,
  moveGeneralDocument,
  moveGeneralFolder,
  type GeneralDocument,
  type GeneralFolder,
} from "../../services/generalDocumentService";

interface ProfileViewProps {
  userId: string;
  userName: string;
  onNameChange?: (name: string) => void;
  onSignOut?: () => void;
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

type ProfileTab = "profile" | "medical" | "general";


function isImage(mime: string) {
  return mime.startsWith("image/");
}

// ── Intelligent Health Records ────────────────────────────

interface MedicalReportTabProps { userId: string; }

type MedicalSection = "checkups" | "issues" | "flowchart";

const CHECKUP_META: Record<CheckupCategory, { label: string; emoji: string }> = {
  lab: { label: "Lab Report", emoji: "🧪" },
  prescription: { label: "Prescription", emoji: "💊" },
  bill: { label: "Bill", emoji: "🧾" },
  other: { label: "Other", emoji: "📄" },
};

function MedicalReportTab({ userId }: MedicalReportTabProps) {
  const [section, setSection] = useState<MedicalSection>("checkups");
  const [checkups, setCheckups] = useState<HealthCheckup[]>([]);
  const [issues, setIssues] = useState<HealthIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedYears, setExpandedYears] = useState<Set<number>>(new Set());
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());
  const [flowTarget, setFlowTarget] = useState<{ type: "issue" | "checkup"; id: string } | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [form, setForm] = useState<"checkup" | "issue" | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<CheckupCategory>("lab");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");
  const [healthIssueIds, setHealthIssueIds] = useState<string[]>([]);
  const [linkedCheckupIds, setLinkedCheckupIds] = useState<string[]>([]);
  const [existingAttachments, setExistingAttachments] = useState<MedicalAttachment[]>([]);
  const [removedAttachments, setRemovedAttachments] = useState<MedicalAttachment[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [referencedAttachments, setReferencedAttachments] = useState<ReferencedCheckupAttachment[]>([]);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    const stopCheckups = subscribeHealthCheckups(userId, (data) => { if (active) { setCheckups(data); setLoading(false); } });
    const stopIssues = subscribeHealthIssues(userId, (data) => { if (active) { setIssues(data); setLoading(false); } });
    return () => { active = false; stopCheckups(); stopIssues(); };
  }, [userId]);

  useEffect(() => {
    if (!flowTarget) return;
    const target = document.getElementById(`medical-${flowTarget.type}-${flowTarget.id}`);
    if (target) {
      window.setTimeout(() => target.scrollIntoView({ behavior: "smooth", block: "center" }), 30);
    }
    setFlowTarget(null);
  }, [flowTarget]);

  function openFlowTarget(type: "issue" | "checkup", id: string) {
    setForm(null);
    setSection(type === "issue" ? "issues" : "checkups");
    setExpandedId(id);
    setFlowTarget({ type, id });
  }

  function clearForm() {
    setTitle(""); setCategory("lab"); setDate(new Date().toISOString().split("T")[0]); setNotes("");
    setHealthIssueIds([]); setLinkedCheckupIds([]); setExistingAttachments([]); setRemovedAttachments([]); setSelectedFiles([]);
    setReferencedAttachments([]); setUploadProgress({}); setError(""); setEditingId(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function openNewCheckup(issueId: string | null = null) {
    clearForm(); setHealthIssueIds(issueId ? [issueId] : []); setForm("checkup"); setSection("checkups");
  }

  function openNewIssue() { clearForm(); setForm("issue"); setSection("issues"); }

  function openEditCheckup(item: HealthCheckup) {
    setTitle(item.title); setCategory(item.category); setDate(item.date); setNotes(item.notes || "");
    setHealthIssueIds(item.healthIssueIds?.length ? item.healthIssueIds : (item.healthIssueId ? [item.healthIssueId] : [])); setExistingAttachments(item.attachments || []); setRemovedAttachments([]);
    setSelectedFiles([]); setReferencedAttachments([]); setEditingId(item.id || null); setError(""); setForm("checkup");
  }

  function openEditIssue(item: HealthIssue) {
    setTitle(item.title); setDate(item.date); setNotes(item.notes || ""); setExistingAttachments(item.attachments || []);
    setHealthIssueIds([]);
    setLinkedCheckupIds(checkups.filter((c) => (c.healthIssueIds || (c.healthIssueId ? [c.healthIssueId] : [])).includes(item.id || "")).map((c) => c.id!).filter(Boolean));
    setReferencedAttachments(item.referencedAttachments || []); setRemovedAttachments([]); setSelectedFiles([]);
    setEditingId(item.id || null); setError(""); setForm("issue");
  }

  function closeForm() { clearForm(); setForm(null); }

  function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (!files.length) return;
    const tooLarge = files.find((f) => f.size > 25 * 1024 * 1024);
    if (tooLarge) {
      setError(`\"${tooLarge.name}\" is larger than 25 MB. Please choose a smaller file.`);
      e.target.value = "";
      return;
    }
    setError("");
    setSelectedFiles((p) => [...p, ...files]);
    e.target.value = "";
  }

  function removeExisting(att: MedicalAttachment) {
    setExistingAttachments((p) => p.filter((x) => x.storagePath !== att.storagePath));
    setRemovedAttachments((p) => [...p, att]);
  }

  function toggleReference(checkup: HealthCheckup, att: MedicalAttachment) {
    if (!checkup.id) return;
    const exists = referencedAttachments.some((x) => x.checkupId === checkup.id && x.storagePath === att.storagePath);
    if (exists) setReferencedAttachments((p) => p.filter((x) => !(x.checkupId === checkup.id && x.storagePath === att.storagePath)));
    else setReferencedAttachments((p) => [...p, { ...att, checkupId: checkup.id!, checkupTitle: checkup.title, checkupDate: checkup.date }]);
  }

  async function save() {
    if (!title.trim()) { setError("Please enter a title."); return; }
    if (!date) { setError("Please select a date."); return; }
    setSaving(true); setError("");
    try {
      const uploaded: MedicalAttachment[] = [];
      for (const file of selectedFiles) {
        uploaded.push(await uploadMedicalFile(userId, file, (pct) => setUploadProgress((p) => ({ ...p, [file.name]: pct }))));
      }
      const attachments = [...existingAttachments, ...uploaded];
      if (form === "checkup") {
        const payload = { title: title.trim(), category, date, notes, attachments, healthIssueIds, healthIssueId: healthIssueIds[0] ?? null };
        if (editingId) await updateHealthCheckup(userId, editingId, payload, removedAttachments);
        else await saveHealthCheckup(userId, payload);
      } else if (form === "issue") {
        const payload = { title: title.trim(), date, notes, attachments, referencedAttachments };
        let issueId = editingId;
        if (editingId) await updateHealthIssue(userId, editingId, payload, removedAttachments);
        else issueId = await saveHealthIssue(userId, payload);
        if (issueId) {
          const affected = checkups.filter((c) => {
            const ids = c.healthIssueIds?.length ? c.healthIssueIds : (c.healthIssueId ? [c.healthIssueId] : []);
            return ids.includes(issueId!) || linkedCheckupIds.includes(c.id || "");
          });
          await Promise.all(affected.filter((c) => c.id).map((c) => {
            const oldIds = c.healthIssueIds?.length ? c.healthIssueIds : (c.healthIssueId ? [c.healthIssueId] : []);
            const nextIds = linkedCheckupIds.includes(c.id || "") ? Array.from(new Set([...oldIds, issueId!])) : oldIds.filter((id) => id !== issueId);
            return setHealthCheckupIssues(userId, c.id!, nextIds);
          }));
        }
      }
      closeForm();
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : "Failed to save. Please try again.");
    } finally { setSaving(false); }
  }

  async function removeCheckup(item: HealthCheckup) {
    if (!item.id) return;
    await deleteHealthCheckup(userId, item.id, item.attachments || []);
    if (expandedId === item.id) setExpandedId(null);
  }

  async function removeIssue(item: HealthIssue) {
    if (!item.id) return;
    await deleteHealthIssue(userId, item.id, item.attachments || []);
    if (expandedId === item.id) setExpandedId(null);
  }

  const selectedIssues = issues.filter((x) => healthIssueIds.includes(x.id || ""));
  const referencedCount = referencedAttachments.length;

  if (loading) return <div className="flex justify-center py-16"><span className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--accent-pink)]" /></div>;

  return (
    <div className="space-y-5">
      <div className="rounded-3xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-bold text-[var(--text-primary)] text-base">Intelligent Health Report</h3>
            <p className="text-xs text-[var(--text-secondary)] mt-1">Keep health issues connected to the checkups, prescriptions and documents that explain them.</p>
          </div>
          <FileCheck size={20} className="text-[var(--accent-pink)] shrink-0" />
        </div>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2">
          <button type="button" onClick={() => setSection("checkups")} className={`rounded-2xl px-3 py-3 text-left transition ${section === "checkups" ? "bg-[var(--accent-pink)] text-white" : "bg-[var(--bg-card)] text-[var(--text-secondary)] border border-[var(--border)]"}`}>
            <div className="text-sm font-bold">Health Checkup</div><div className={`text-[10px] mt-0.5 ${section === "checkups" ? "text-white/80" : "text-[var(--text-faint)]"}`}>{checkups.length} records · labs · prescriptions · bills</div>
          </button>
          <button type="button" onClick={() => setSection("issues")} className={`rounded-2xl px-3 py-3 text-left transition ${section === "issues" ? "bg-[var(--accent-pink)] text-white" : "bg-[var(--bg-card)] text-[var(--text-secondary)] border border-[var(--border)]"}`}>
            <div className="text-sm font-bold">Health Issues</div><div className={`text-[10px] mt-0.5 ${section === "issues" ? "text-white/80" : "text-[var(--text-faint)]"}`}>{issues.length} records · linked evidence</div>
          </button>
          <button type="button" onClick={() => setSection("flowchart")} className={`rounded-2xl px-3 py-3 text-left transition ${section === "flowchart" ? "bg-[var(--accent-pink)] text-white" : "bg-[var(--bg-card)] text-[var(--text-secondary)] border border-[var(--border)]"}`}>
            <div className="flex items-center gap-2 text-sm font-bold"><GitBranch size={16}/> Flowchart</div><div className={`text-[10px] mt-0.5 ${section === "flowchart" ? "text-white/80" : "text-[var(--text-faint)]"}`}>Timeline of your complete health story</div>
          </button>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,.pdf,.doc,.docx,.txt,.xls,.xlsx,.csv,.rtf,.odt,.ods"
        className="hidden"
        onChange={handleFiles}
      />

      {form && (
        <div className="rounded-3xl border border-[var(--accent-pink)] bg-[var(--bg-elevated)] p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between"><div><h4 className="font-bold text-[var(--text-primary)]">{editingId ? "Edit" : "Add"} {form === "issue" ? "Health Issue" : "Health Checkup"}</h4><p className="text-[10px] text-[var(--text-faint)] mt-0.5">{form === "checkup" ? "Store the medical evidence." : "Describe the problem and connect its evidence."}</p></div><button type="button" onClick={closeForm}><X size={18} className="text-[var(--text-faint)]" /></button></div>
          {form === "checkup" && (
            <div className="space-y-1.5"><label className="text-xs font-semibold text-[var(--text-secondary)]">TYPE</label><div className="flex flex-wrap gap-2">{(Object.entries(CHECKUP_META) as [CheckupCategory, {label:string;emoji:string}][]).map(([v,m]) => <button key={v} type="button" onClick={() => setCategory(v)} className={`rounded-xl border px-3 py-2 text-xs font-semibold ${category === v ? "border-[var(--accent-pink)] text-[var(--accent-pink)] bg-[var(--accent-pink-soft)]" : "border-[var(--border)] text-[var(--text-secondary)]"}`}>{m.emoji} {m.label}</button>)}</div></div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5"><label className="text-xs font-semibold text-[var(--text-secondary)]">TITLE *</label><input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={form === "issue" ? "e.g. Recurring migraine" : "e.g. CBC Blood Test"} /></div>
            <div className="space-y-1.5"><label className="text-xs font-semibold text-[var(--text-secondary)]">DATE *</label><input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} /></div>
          </div>
          {form === "checkup" && <div className="space-y-1.5"><div className="flex items-center justify-between"><label className="text-xs font-semibold text-[var(--text-secondary)]">REFERS TO HEALTH ISSUES <span className="font-normal text-[var(--text-faint)]">(optional · multiple)</span></label><span className="text-[10px] font-bold text-[var(--accent-pink)]">{healthIssueIds.length} selected</span></div><div className="max-h-40 overflow-auto space-y-1.5 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-2">{issues.length === 0 && <p className="px-2 py-2 text-[10px] text-[var(--text-faint)]">No health issues yet.</p>}{issues.map((i) => { const selected = healthIssueIds.includes(i.id || ""); return <button type="button" key={i.id} onClick={() => setHealthIssueIds((p) => selected ? p.filter((id) => id !== i.id) : [...p, i.id!])} className={`w-full flex items-center gap-2 rounded-xl px-3 py-2 text-left border ${selected ? "border-[var(--accent-pink)] bg-[var(--accent-pink-soft)]" : "border-[var(--border)]"}`}><Check size={14} className={selected ? "text-[var(--accent-pink)]" : "text-transparent"}/><span className="min-w-0 flex-1"><span className="block text-xs font-semibold truncate text-[var(--text-primary)]">{i.title}</span><span className="block text-[9px] text-[var(--text-faint)]">{i.date}</span></span></button>; })}</div>{selectedIssues.length > 0 && <p className="text-[10px] text-[var(--accent-pink)] font-semibold">✓ Linked to {selectedIssues.map((i) => i.title).join(", ")}</p>}</div>}
          {form === "issue" && checkups.length > 0 && <div className="space-y-1.5"><div className="flex items-center justify-between"><label className="text-xs font-semibold text-[var(--text-secondary)]">LINK HEALTH CHECKUPS <span className="font-normal text-[var(--text-faint)]">(optional · multiple)</span></label><span className="text-[10px] font-bold text-[var(--accent-pink)]">{linkedCheckupIds.length} selected</span></div><div className="max-h-48 overflow-auto space-y-1.5 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-2">{checkups.map((c) => { const selected = linkedCheckupIds.includes(c.id || ""); const meta = CHECKUP_META[c.category] || CHECKUP_META.other; return <button type="button" key={c.id} onClick={() => setLinkedCheckupIds((p) => selected ? p.filter((id) => id !== c.id) : [...p, c.id!])} className={`w-full flex items-center gap-2 rounded-xl px-3 py-2 text-left border ${selected ? "border-[var(--accent-pink)] bg-[var(--accent-pink-soft)]" : "border-[var(--border)]"}`}><Check size={14} className={selected ? "text-[var(--accent-pink)]" : "text-transparent"}/><span>{meta.emoji}</span><span className="min-w-0 flex-1"><span className="block text-xs font-semibold truncate text-[var(--text-primary)]">{c.title}</span><span className="block text-[9px] text-[var(--text-faint)]">{meta.label} · {c.date}</span></span></button>; })}</div></div>}
          <div className="space-y-1.5"><label className="text-xs font-semibold text-[var(--text-secondary)]">NOTES</label><textarea className={`${inputCls} resize-none`} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observations, symptoms, doctor notes…" /></div>

          {form === "issue" && checkups.some((c) => (c.attachments || []).length > 0) && (
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-3 space-y-2"><div className="flex items-center justify-between"><div><p className="text-xs font-bold text-[var(--text-primary)]">Reference checkup evidence</p><p className="text-[10px] text-[var(--text-faint)]">Select attachments already stored in Health Checkup.</p></div><span className="text-[10px] font-bold text-[var(--accent-pink)]">{referencedCount} selected</span></div><div className="space-y-2 max-h-52 overflow-auto">{checkups.flatMap((c) => (c.attachments || []).map((a) => ({c,a}))).map(({c,a}) => { const selected = referencedAttachments.some((x) => x.checkupId === c.id && x.storagePath === a.storagePath); return <button type="button" key={`${c.id}-${a.storagePath}`} onClick={() => toggleReference(c,a)} className={`w-full flex items-center gap-2 rounded-xl border px-3 py-2 text-left ${selected ? "border-[var(--accent-pink)] bg-[var(--accent-pink-soft)]" : "border-[var(--border)]"}`}><Check size={14} className={selected ? "text-[var(--accent-pink)]" : "text-transparent"} />{isImage(a.type) ? <ImageIcon size={15} /> : <FileText size={15} />}<span className="min-w-0 flex-1"><span className="block text-xs font-semibold truncate text-[var(--text-primary)]">{a.name}</span><span className="block text-[9px] text-[var(--text-faint)]">{c.title} · {c.date}</span></span></button>})}</div></div>
          )}

          <div className="space-y-2"><label className="text-xs font-semibold text-[var(--text-secondary)]">ATTACHMENTS</label>{existingAttachments.map((a) => <div key={a.storagePath} className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2">{isImage(a.type) ? <ImageIcon size={15} /> : <FileText size={15} />}<span className="flex-1 truncate text-xs font-semibold text-[var(--text-primary)]">{a.name}</span><button type="button" onClick={() => removeExisting(a)}><X size={14} className="text-[var(--text-faint)]" /></button></div>)}<button type="button" onClick={() => fileInputRef.current?.click()} className="w-full rounded-2xl border-2 border-dashed border-[var(--border)] py-4 text-sm font-semibold text-[var(--text-secondary)] hover:border-[var(--accent-pink)] hover:text-[var(--accent-pink)]"><Upload size={17} className="inline mr-2" />Add attachments</button>{selectedFiles.map((f,i) => <div key={`${f.name}-${i}`} className="flex items-center gap-2 text-xs text-[var(--text-secondary)]"><FileText size={14}/><span className="flex-1 truncate">{f.name}</span>{uploadProgress[f.name] !== undefined && <span>{uploadProgress[f.name]}%</span>}<button type="button" onClick={() => setSelectedFiles((p) => p.filter((_,x) => x !== i))}><X size={13}/></button></div>)}</div>
          {error && <div className="rounded-xl bg-[var(--danger-soft)] px-3 py-2 text-xs text-[var(--danger)]">{error}</div>}
          <div className="flex gap-3"><button type="button" onClick={closeForm} className="flex-1 rounded-xl border border-[var(--border)] py-2.5 text-sm font-semibold text-[var(--text-secondary)]">Cancel</button><button type="button" disabled={saving} onClick={save} className="flex-1 rounded-xl bg-[var(--accent-pink)] py-2.5 text-sm font-semibold text-white disabled:opacity-60">{saving ? "Saving…" : editingId ? "Update" : "Save"}</button></div>
        </div>
      )}

      {section === "checkups" ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between"><div><h4 className="font-bold text-[var(--text-primary)]">Health Checkup</h4><p className="text-xs text-[var(--text-secondary)]">Lab reports, prescriptions, bills and other medical records.</p></div><button type="button" onClick={() => openNewCheckup()} className="flex items-center gap-1.5 rounded-xl bg-[var(--accent-pink)] px-3 py-2 text-xs font-semibold text-white"><Plus size={14}/> Add Checkup</button></div>
          {checkups.length === 0 && !form && <EmptyMedical title="No health checkups yet" text="Add a lab report, prescription, bill or other medical document." onClick={() => openNewCheckup()} />}
          {checkups.map((c) => <div id={`medical-checkup-${c.id}`} key={c.id}><CheckupCard item={c} issues={issues.filter((i) => (c.healthIssueIds?.length ? c.healthIssueIds : (c.healthIssueId ? [c.healthIssueId] : [])).includes(i.id || ""))} expanded={expandedId === c.id} onExpand={() => setExpandedId(expandedId === c.id ? null : (c.id || null))} onEdit={() => openEditCheckup(c)} onDelete={() => void removeCheckup(c)} onPreview={setLightboxUrl} /></div>)}
        </div>
      ) : section === "issues" ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between"><div><h4 className="font-bold text-[var(--text-primary)]">Health Issues</h4><p className="text-xs text-[var(--text-secondary)]">Each issue becomes a timeline with its supporting checkup evidence.</p></div><button type="button" onClick={openNewIssue} className="flex items-center gap-1.5 rounded-xl bg-[var(--accent-pink)] px-3 py-2 text-xs font-semibold text-white"><Plus size={14}/> Add Issue</button></div>
          {issues.length === 0 && !form && <EmptyMedical title="No health issues yet" text="Create an issue, then add checkups directly from it." onClick={openNewIssue} />}
          {issues.map((i) => { const linked = checkups.filter((c) => (c.healthIssueIds?.length ? c.healthIssueIds : (c.healthIssueId ? [c.healthIssueId] : [])).includes(i.id || "")); return <div id={`medical-issue-${i.id}`} key={i.id}><IssueCard item={i} linked={linked} expanded={expandedId === i.id} onExpand={() => setExpandedId(expandedId === i.id ? null : (i.id || null))} onEdit={() => openEditIssue(i)} onDelete={() => void removeIssue(i)} onPreview={setLightboxUrl} onAddCheckup={() => openNewCheckup(i.id || null)} /></div>; })}
        </div>
      ) : (
        <HealthFlowchart checkups={checkups} issues={issues} expandedYears={expandedYears} expandedMonths={expandedMonths} setExpandedYears={setExpandedYears} setExpandedMonths={setExpandedMonths} onOpenTarget={openFlowTarget} />
      )}

      {lightboxUrl && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setLightboxUrl(null)}><button type="button" onClick={() => setLightboxUrl(null)} className="absolute top-4 right-4 text-white"><X size={22}/></button><img src={lightboxUrl} alt="Preview" className="max-h-[90vh] max-w-full rounded-2xl object-contain" onClick={(e) => e.stopPropagation()} /></div>}
    </div>
  );
}



function GeneralFolderPicker({
  value,
  folders,
  getLabel,
  onChange,
  rootLabel = "All Documents / Root",
  disabled = false,
}: {
  value: string | null;
  folders: GeneralFolder[];
  getLabel: (folder: GeneralFolder) => string;
  onChange: (value: string | null) => void;
  rootLabel?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = value ? folders.find((folder) => folder.id === value) : undefined;
  const selectedLabel = selected ? getLabel(selected) : rootLabel;

  const uniqueFolders = Array.from(
    new Map(
      folders
        .filter((folder) => folder.id)
        .map((folder) => [getLabel(folder).trim().toLowerCase(), folder] as const)
    ).values()
  ).sort((a, b) => getLabel(a).localeCompare(getLabel(b)));

  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2.5 text-left text-sm text-[var(--text-primary)] outline-none transition hover:border-[var(--accent-pink)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className="min-w-0 truncate">{selectedLabel}</span>
        <ChevronDown size={16} className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && !disabled && (
        <div className="absolute left-0 right-0 top-full z-[70] mt-1 max-h-64 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-1 shadow-2xl">
          <button
            type="button"
            onClick={() => { onChange(null); setOpen(false); }}
            className={`block w-full rounded-lg px-3 py-2 text-left text-sm transition ${!value ? "bg-[var(--accent-pink-soft)] text-[var(--accent-pink)]" : "text-[var(--text-primary)] hover:bg-[var(--bg-card)]"}`}
          >
            {rootLabel}
          </button>
          {uniqueFolders.map((folder) => {
            const isSelected = folder.id === value;
            return (
              <button
                type="button"
                key={folder.id}
                onClick={() => { onChange(folder.id || null); setOpen(false); }}
                className={`block w-full rounded-lg px-3 py-2 text-left text-sm transition ${isSelected ? "bg-[var(--accent-pink-soft)] text-[var(--accent-pink)]" : "text-[var(--text-primary)] hover:bg-[var(--bg-card)] hover:text-[var(--text-primary)]"}`}
              >
                <span className="block truncate">{getLabel(folder)}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function GeneralDocumentsTab({ userId }: { userId: string }) {
  const [documents, setDocuments] = useState<GeneralDocument[]>([]);
  const [folders, setFolders] = useState<GeneralFolder[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [documentName, setDocumentName] = useState("");
  const [uploadFolderId, setUploadFolderId] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [moveTarget, setMoveTarget] = useState<
    | { kind: "document"; item: GeneralDocument }
    | { kind: "folder"; item: GeneralFolder }
    | null
  >(null);
  const [moveDestinationId, setMoveDestinationId] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    try {
      const [docs, folderItems] = await Promise.all([
        getGeneralDocuments(userId),
        ensureDefaultGeneralFolders(userId),
      ]);
      setDocuments(docs);
      setFolders(folderItems);
      setError("");
    } catch (err: any) {
      setError(err?.message || "Unable to load general documents.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [userId]);

  function openUpload(file: File | null) {
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) {
      setError(`"${file.name}" is larger than 25 MB.`);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    setError("");
    setUploadFile(file);
    setDocumentName(file.name.replace(/\.[^/.]+$/, ""));
    setUploadFolderId(selectedFolderId);
    setProgress(0);
  }

  function closeUpload() {
    if (uploading) return;
    setUploadFile(null);
    setDocumentName("");
    setProgress(0);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function confirmUpload() {
    if (!uploadFile) return;
    if (!documentName.trim()) {
      setError("Please enter a name for the document.");
      return;
    }
    const folder = folders.find((item) => item.id === uploadFolderId);
    setUploading(true);
    setError("");
    try {
      await uploadGeneralDocument(
        userId,
        uploadFile,
        documentName,
        uploadFolderId,
        folder?.name || null,
        setProgress,
      );
      closeUpload();
      await load();
    } catch (err: any) {
      setError(err?.message || "Unable to upload document.");
    } finally {
      setUploading(false);
    }
  }

  async function addFolder() {
    const name = newFolderName.trim();
    if (!name) return;
    setCreatingFolder(true);
    setError("");
    try {
      // A folder is created inside the currently selected folder.
      const folder = await createGeneralFolder(userId, name, selectedFolderId);
      setFolders((items) => [...items, folder]);
      setSelectedFolderId(folder.id || null);
      setNewFolderName("");
    } catch (err: any) {
      setError(err?.message || "Unable to create folder.");
    } finally {
      setCreatingFolder(false);
    }
  }

  async function remove(item: GeneralDocument) {
    if (!item.id || !window.confirm(`Delete "${item.name}"?`)) return;
    try {
      await deleteGeneralDocument(userId, item);
      setDocuments((items) => items.filter((x) => x.id !== item.id));
    } catch (err: any) {
      setError(err?.message || "Unable to delete document.");
    }
  }

  async function removeFolder(folder: GeneralFolder) {
    if (!folder.id) return;
    if (!window.confirm(`Delete folder "${folder.name}"? This only works when the folder is empty.`)) return;
    try {
      await deleteGeneralFolder(userId, folder);
      setFolders((items) => items.filter((x) => x.id !== folder.id));
      if (selectedFolderId === folder.id) {
        setSelectedFolderId(folder.parentFolderId || null);
      }
    } catch (err: any) {
      setError(err?.message || "Unable to delete folder.");
    }
  }

  function beginMoveDocument(item: GeneralDocument) {
    setMoveTarget({ kind: "document", item });
    setMoveDestinationId(item.folderId || null);
    setError("");
  }

  function beginMoveFolder(item: GeneralFolder) {
    setMoveTarget({ kind: "folder", item });
    setMoveDestinationId(item.parentFolderId || null);
    setError("");
  }

  function descendantsOf(folderId: string): Set<string> {
    const result = new Set<string>();
    const stack = [folderId];
    while (stack.length) {
      const parent = stack.pop()!;
      folders.forEach((folder) => {
        if (folder.parentFolderId === parent && folder.id && !result.has(folder.id)) {
          result.add(folder.id);
          stack.push(folder.id);
        }
      });
    }
    return result;
  }

  async function confirmMove() {
    if (!moveTarget) return;
    setMoving(true);
    setError("");
    try {
      if (moveTarget.kind === "document") {
        const folder = folders.find((item) => item.id === moveDestinationId);
        await moveGeneralDocument(userId, moveTarget.item.id!, moveDestinationId, folder?.name || null);
      } else {
        await moveGeneralFolder(userId, moveTarget.item.id!, moveDestinationId);
      }
      setMoveTarget(null);
      await load();
    } catch (err: any) {
      setError(err?.message || "Unable to move item.");
    } finally {
      setMoving(false);
    }
  }

  function sizeLabel(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  const childrenOf = (parentId: string | null) =>
    folders.filter((folder) => (folder.parentFolderId || null) === parentId);

  function folderPath(folderId: string | null): GeneralFolder[] {
    const result: GeneralFolder[] = [];
    let current = folders.find((folder) => folder.id === folderId);
    const seen = new Set<string>();
    while (current?.id && !seen.has(current.id)) {
      result.unshift(current);
      seen.add(current.id);
      current = folders.find((folder) => folder.id === current?.parentFolderId);
    }
    return result;
  }

  function folderLabel(folder: GeneralFolder) {
    return folderPath(folder.id || null).map((item) => item.name).join(" / ");
  }

  function renderFolderTree(parentId: string | null, depth = 0): ReactNode {
    return childrenOf(parentId).map((folder) => {
      const isSelected = selectedFolderId === folder.id;
      const childFolders = childrenOf(folder.id || null);
      const count = documents.filter((item) => item.folderId === folder.id).length;
      return (
        <div key={folder.id}>
          <button
            type="button"
            onClick={() => setSelectedFolderId(folder.id || null)}
            className={`mb-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold ${isSelected ? "bg-[var(--accent-pink-soft)] text-[var(--accent-pink)]" : "text-[var(--text-secondary)] hover:bg-[var(--bg-card)]"}`}
            style={{ paddingLeft: `${12 + depth * 18}px` }}
            title={folder.name}
          >
            {childFolders.length > 0 ? <ChevronDown size={14} /> : <span className="w-[14px]" />}
            <Folder size={15} />
            <span className="min-w-0 flex-1 truncate">{folder.name}</span>
            <span className="text-[10px]">{count}</span>
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); beginMoveFolder(folder); }}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); beginMoveFolder(folder); } }}
              className="rounded-lg p-1 hover:bg-[var(--bg-elevated)]"
              title="Move folder"
            >
              <Folder size={13} />
            </span>
          </button>
          {renderFolderTree(folder.id || null, depth + 1)}
        </div>
      );
    });
  }

  const visibleDocuments = selectedFolderId === null
    ? documents
    : documents.filter((item) => item.folderId === selectedFolderId);
  const selectedFolder = folders.find((folder) => folder.id === selectedFolderId);
  const currentChildren = childrenOf(selectedFolderId);
  const uploadFolders = [...folders].sort((a, b) => folderLabel(a).localeCompare(folderLabel(b)));

  return (
    <div className="space-y-5">
      <div className="rounded-3xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="font-bold text-[var(--text-primary)]">General Documents</h3>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">Create folders inside folders, name every document, and keep your personal files organized. Maximum 25 MB per file.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => inputRef.current?.click()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--accent-pink)] px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90">
              <Upload size={16} /> Upload Document
            </button>
            <input ref={inputRef} type="file" className="hidden" onChange={(e) => openUpload(e.target.files?.[0] || null)} />
          </div>
        </div>
        {error && <div className="mt-4 rounded-2xl border border-[var(--danger-soft)] bg-[var(--danger-soft)]/30 px-4 py-3 text-xs text-[var(--danger)]">{error}</div>}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="rounded-3xl border border-[var(--border)] bg-[var(--bg-elevated)] p-3 shadow-sm">
          <div className="mb-3 flex items-center justify-between px-2">
            <div className="text-xs font-bold uppercase tracking-wide text-[var(--text-faint)]">Folders</div>
            <Folder size={15} className="text-[var(--accent-pink)]" />
          </div>
          <button type="button" onClick={() => setSelectedFolderId(null)} className={`mb-1 flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-semibold ${selectedFolderId === null ? "bg-[var(--accent-pink-soft)] text-[var(--accent-pink)]" : "text-[var(--text-secondary)] hover:bg-[var(--bg-card)]"}`}>
            <FileCheck size={16} /> All Documents <span className="ml-auto text-[10px]">{documents.length}</span>
          </button>
          <div className="max-h-[430px] overflow-y-auto pr-1">
            {renderFolderTree(null)}
          </div>
          <div className="mt-3 border-t border-[var(--border)] pt-3">
            <p className="mb-2 px-1 text-[10px] text-[var(--text-faint)]">
              {selectedFolder ? `New folder inside “${selectedFolder.name}”` : "New top-level folder"}
            </p>
            <div className="flex gap-2">
              <input value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void addFolder(); }} placeholder={selectedFolder ? "Subfolder name" : "New folder name"} className="min-w-0 flex-1 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent-pink)]" />
              <button type="button" disabled={creatingFolder || !newFolderName.trim()} onClick={() => void addFolder()} className="rounded-xl bg-[var(--accent-pink)] px-3 text-white disabled:opacity-50" title={selectedFolder ? "Create subfolder" : "Create folder"}><FolderPlus size={16} /></button>
            </div>
          </div>
        </aside>

        <section className="min-w-0">
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h4 className="font-bold text-[var(--text-primary)]">{selectedFolder?.name || "All Documents"}</h4>
              {selectedFolder && folderPath(selectedFolderId).length > 1 && (
                <p className="mt-0.5 text-[10px] text-[var(--text-faint)]">{folderPath(selectedFolderId).map((item) => item.name).join(" / ")}</p>
              )}
              <p className="mt-1 text-xs text-[var(--text-secondary)]">{visibleDocuments.length} document{visibleDocuments.length === 1 ? "" : "s"}{selectedFolder ? ` · ${currentChildren.length} subfolder${currentChildren.length === 1 ? "" : "s"}` : ""}</p>
            </div>
            {selectedFolder && (
              <button type="button" onClick={() => setSelectedFolderId(selectedFolder.parentFolderId || null)} className="inline-flex items-center gap-1 self-start rounded-xl border border-[var(--border)] px-3 py-2 text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-card)]">
                <ChevronLeft size={14} /> Parent folder
              </button>
            )}
          </div>

          {loading ? (
            <div className="rounded-3xl border border-[var(--border)] bg-[var(--bg-elevated)] p-8 text-center text-sm text-[var(--text-secondary)]">Loading documents…</div>
          ) : currentChildren.length === 0 && visibleDocuments.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-[var(--border)] bg-[var(--bg-elevated)] p-10 text-center">
              <Folder size={30} className="mx-auto text-[var(--accent-pink)]" />
              <h4 className="mt-3 font-bold text-[var(--text-primary)]">This folder is empty</h4>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">Create a subfolder or upload a document here.</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] shadow-sm">
              {currentChildren.map((folder) => (
                <div
                  key={`folder-${folder.id}`}
                  className="border-b border-[var(--border)] px-3 py-3.5 transition last:border-b-0 hover:bg-[var(--bg-card)] sm:px-4"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setSelectedFolderId(folder.id || null)}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                      title={`Open ${folder.name}`}
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-pink-soft)] text-[var(--accent-pink)]">
                        <Folder size={17} />
                      </div>
                      <p className="min-w-0 truncate text-sm font-semibold text-[var(--text-primary)]">{folder.name}</p>
                    </button>
                    <span className="shrink-0 text-xs text-[var(--text-faint)]">—</span>
                  </div>
                  <div className="mt-2 flex items-center justify-end gap-1 border-t border-[var(--border)] pt-2">
                    <button
                      type="button"
                      onClick={() => setSelectedFolderId(folder.id || null)}
                      className="rounded-lg px-3 py-1.5 text-xs font-semibold text-[var(--text-secondary)] transition hover:bg-[var(--bg-elevated)]"
                    >
                      Open
                    </button>
                    <button
                      type="button"
                      onClick={() => beginMoveFolder(folder)}
                      className="rounded-lg px-3 py-1.5 text-xs font-semibold text-[var(--text-secondary)] transition hover:bg-[var(--bg-elevated)]"
                    >
                      Move
                    </button>
                    <button
                      type="button"
                      onClick={() => void removeFolder(folder)}
                      className="rounded-lg px-3 py-1.5 text-xs font-semibold text-[var(--danger)] transition hover:bg-[var(--danger-soft)]"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}

              {visibleDocuments.map((item) => (
                <div
                  key={`document-${item.id}`}
                  className="border-b border-[var(--border)] px-3 py-3.5 transition last:border-b-0 hover:bg-[var(--bg-card)] sm:px-4"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-pink-soft)] text-[var(--accent-pink)]">
                      <FileText size={17} />
                    </div>
                    <p className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--text-primary)]" title={item.name}>
                      {item.name}
                    </p>
                    <span className="shrink-0 text-xs text-[var(--text-faint)]">{sizeLabel(item.size)}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-end gap-1 border-t border-[var(--border)] pt-2">
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg px-3 py-1.5 text-xs font-semibold text-[var(--text-secondary)] transition hover:bg-[var(--bg-elevated)]"
                    >
                      Open
                    </a>
                    <button
                      type="button"
                      onClick={() => beginMoveDocument(item)}
                      className="rounded-lg px-3 py-1.5 text-xs font-semibold text-[var(--text-secondary)] transition hover:bg-[var(--bg-elevated)]"
                    >
                      Move
                    </button>
                    <button
                      type="button"
                      onClick={() => void remove(item)}
                      className="rounded-lg px-3 py-1.5 text-xs font-semibold text-[var(--danger)] transition hover:bg-[var(--danger-soft)]"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {moveTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => !moving && setMoveTarget(null)}>
          <div className="w-full max-w-md rounded-3xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-bold text-[var(--text-primary)]">Move {moveTarget.kind === "document" ? "Document" : "Folder"}</h3>
                <p className="mt-1 text-xs text-[var(--text-secondary)] truncate">{moveTarget.item.name}</p>
              </div>
              <button type="button" disabled={moving} onClick={() => setMoveTarget(null)}><X size={18} className="text-[var(--text-faint)]" /></button>
            </div>
            <div className="mt-5 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[var(--text-secondary)]">MOVE TO</label>
                <GeneralFolderPicker
                  value={moveDestinationId}
                  folders={folders.filter((folder) => {
                    if (moveTarget.kind !== "folder") return true;
                    const blocked = descendantsOf(moveTarget.item.id!);
                    return folder.id !== moveTarget.item.id && !blocked.has(folder.id || "");
                  })}
                  getLabel={folderLabel}
                  onChange={setMoveDestinationId}
                  rootLabel="All Documents / Root"
                  disabled={moving}
                />
                <p className="text-[10px] text-[var(--text-faint)]">Choose the root to move outside all folders, or any folder to move inside it.</p>
              </div>
              <div className="flex gap-3">
                <button type="button" disabled={moving} onClick={() => setMoveTarget(null)} className="flex-1 rounded-xl border border-[var(--border)] py-2.5 text-sm font-semibold text-[var(--text-secondary)]">Cancel</button>
                <button type="button" disabled={moving} onClick={() => void confirmMove()} className="flex-1 rounded-xl bg-[var(--accent-pink)] py-2.5 text-sm font-semibold text-white disabled:opacity-50">{moving ? "Moving…" : "Move"}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {uploadFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => !uploading && closeUpload()}>
          <div className="w-full max-w-md rounded-3xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div><h3 className="font-bold text-[var(--text-primary)]">Upload Document</h3><p className="mt-1 text-xs text-[var(--text-secondary)]">Give this document a name and choose where to save it.</p></div>
              <button type="button" disabled={uploading} onClick={closeUpload}><X size={18} className="text-[var(--text-faint)]" /></button>
            </div>
            <div className="mt-5 space-y-4">
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-3"><p className="truncate text-xs font-semibold text-[var(--text-primary)]">{uploadFile.name}</p><p className="mt-1 text-[10px] text-[var(--text-faint)]">{sizeLabel(uploadFile.size)}</p></div>
              <div className="space-y-1.5"><label className="text-xs font-semibold text-[var(--text-secondary)]">DOCUMENT NAME *</label><input autoFocus value={documentName} onChange={(e) => setDocumentName(e.target.value)} placeholder="e.g. Passport, Insurance Policy" className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-pink)]" /></div>
              <div className="space-y-1.5"><label className="text-xs font-semibold text-[var(--text-secondary)]">FOLDER</label><GeneralFolderPicker value={uploadFolderId} folders={uploadFolders} getLabel={folderLabel} onChange={setUploadFolderId} rootLabel="Unsorted" disabled={uploading} /></div>
              {uploading && <div><div className="mb-1 flex justify-between text-[10px] text-[var(--text-secondary)]"><span>Uploading…</span><span>{progress}%</span></div><div className="h-1.5 overflow-hidden rounded-full bg-[var(--border)]"><div className="h-full rounded-full bg-[var(--accent-pink)] transition-all" style={{ width: `${progress}%` }} /></div></div>}
              <div className="flex gap-3"><button type="button" disabled={uploading} onClick={closeUpload} className="flex-1 rounded-xl border border-[var(--border)] py-2.5 text-sm font-semibold text-[var(--text-secondary)] disabled:opacity-50">Cancel</button><button type="button" disabled={uploading || !documentName.trim()} onClick={() => void confirmUpload()} className="flex-1 rounded-xl bg-[var(--accent-pink)] py-2.5 text-sm font-semibold text-white disabled:opacity-50">{uploading ? "Uploading…" : "Upload"}</button></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
function HealthFlowchart({
  checkups,
  issues,
  expandedYears,
  expandedMonths,
  setExpandedYears,
  setExpandedMonths,
  onOpenTarget,
}: {
  checkups: HealthCheckup[];
  issues: HealthIssue[];
  expandedYears: Set<number>;
  expandedMonths: Set<string>;
  setExpandedYears: Dispatch<SetStateAction<Set<number>>>;
  setExpandedMonths: Dispatch<SetStateAction<Set<string>>>;
  onOpenTarget: (type: "issue" | "checkup", id: string) => void;
}) {
  const allDates = [...issues.map((x) => x.date), ...checkups.map((x) => x.date)].filter(Boolean);
  const years = Array.from(new Set(allDates.map((d) => Number(d.slice(0, 4))))).filter(Number.isFinite).sort((a, b) => b - a);
  const fallbackYear = new Date().getFullYear();
  if (!years.length) years.push(fallbackYear);

  function toggleYear(year: number) {
    setExpandedYears((prev) => {
      const next = new Set(prev);
      if (next.has(year)) next.delete(year); else next.add(year);
      return next;
    });
  }
  function toggleMonth(key: string) {
    setExpandedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  return (
    <div className="rounded-3xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4 sm:p-6 shadow-sm overflow-hidden">
      <div className="flex items-start justify-between gap-3 mb-6">
        <div>
          <div className="flex items-center gap-2"><GitBranch size={20} className="text-[var(--accent-pink)]"/><h4 className="font-bold text-[var(--text-primary)] text-base">Health Journey Flowchart</h4></div>
          <p className="text-xs text-[var(--text-secondary)] mt-1">Explore years → months → health issues & checkups. Click any final node to open the exact record.</p>
        </div>
        <div className="shrink-0 rounded-full bg-[var(--accent-pink-soft)] px-3 py-1.5 text-[10px] font-bold text-[var(--accent-pink)]">{issues.length + checkups.length} records</div>
      </div>

      <div className="relative pl-2 sm:pl-4">
        {years.map((year) => {
          const yearOpen = expandedYears.has(year);
          const yearCheckups = checkups.filter((x) => x.date.startsWith(String(year)));
          const yearIssueIdsFromCheckups = new Set(yearCheckups.flatMap((c) => c.healthIssueIds?.length ? c.healthIssueIds : (c.healthIssueId ? [c.healthIssueId] : [])));
          // Show an issue in a year not only when the issue itself was created/dated in that year,
          // but also when any checkup in that year refers to the issue.
          const yearIssues = issues.filter((x) => x.date.startsWith(String(year)) || yearIssueIdsFromCheckups.has(x.id || ""));
          const monthNums = Array.from(new Set([...yearIssues.filter((x) => x.date.startsWith(String(year))).map((x) => Number(x.date.slice(5, 7))), ...yearCheckups.map((x) => Number(x.date.slice(5, 7)))])).filter(Number.isFinite).sort((a, b) => a - b);
          return (
            <div key={year} className="relative pl-8 sm:pl-10 pb-5 last:pb-0">
              <div className="absolute left-3 sm:left-5 top-5 bottom-0 w-px bg-[var(--border)] last:hidden" />
              <div className="absolute left-0 top-0 h-7 w-7 sm:h-10 sm:w-10 sm:left-0 rounded-full border-4 border-[var(--bg-elevated)] bg-[var(--accent-pink)] shadow-md flex items-center justify-center z-10">
                <CalendarDays size={14} className="text-white sm:hidden"/><CalendarDays size={17} className="text-white hidden sm:block"/>
              </div>
              <button type="button" onClick={() => toggleYear(year)} className="w-full text-left rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3 hover:border-[var(--accent-pink)] transition">
                <div className="flex items-start gap-3"><div className="min-w-0 flex-1"><div className="text-lg font-black text-[var(--text-primary)]">{year}</div><div className="text-[10px] text-[var(--text-faint)]">{yearIssues.length} issues · {yearCheckups.length} checkups · {monthNums.length} active months</div>{yearIssues.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5"><span className="text-[9px] font-bold uppercase tracking-wide text-[var(--danger)] mr-0.5">Issues</span>{yearIssues.slice(0, 5).map((item) => <span key={item.id} className="rounded-full border border-[var(--danger-soft)] bg-[var(--danger-soft)]/30 px-2 py-0.5 text-[9px] font-semibold text-[var(--danger)]">{item.title}</span>)}{yearIssues.length > 5 && <span className="rounded-full bg-[var(--bg-elevated)] px-2 py-0.5 text-[9px] font-semibold text-[var(--text-faint)]">+{yearIssues.length - 5} more</span>}</div>}</div><ChevronDown size={18} className={`mt-1 shrink-0 transition-transform ${yearOpen ? "rotate-180" : ""}`}/></div>
              </button>

              {yearOpen && <div className="mt-3 ml-1 sm:ml-3 space-y-3">
                {monthNums.map((month) => {
                  const key = `${year}-${String(month).padStart(2, "0")}`;
                  const monthOpen = expandedMonths.has(key);
                  const monthCheckups = yearCheckups.filter((x) => Number(x.date.slice(5, 7)) === month);
                  const monthIssueIdsFromCheckups = new Set(monthCheckups.flatMap((c) => c.healthIssueIds?.length ? c.healthIssueIds : (c.healthIssueId ? [c.healthIssueId] : [])));
                  // A checkup can be the evidence for an issue whose own date is in another
                  // month/year. In that case the issue is still shown in the checkup's month/year.
                  const monthIssues = issues.filter((x) => (x.date.startsWith(`${year}-${String(month).padStart(2, "0")}`)) || monthIssueIdsFromCheckups.has(x.id || ""));
                  const monthName = new Date(year, month - 1, 1).toLocaleString(undefined, { month: "long" });
                  return (
                    <div key={key} className="relative pl-7 sm:pl-9">
                      <div className="absolute left-2 sm:left-4 top-5 bottom-0 w-px bg-[var(--border)]" />
                      <div className="absolute left-0 top-3 h-5 w-5 rounded-full border-2 border-[var(--bg-elevated)] bg-[var(--accent-blue)] z-10 flex items-center justify-center"><CircleDot size={9} className="text-white"/></div>
                      <button type="button" onClick={() => toggleMonth(key)} className="w-full text-left rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3.5 py-2.5 hover:border-[var(--accent-blue)] transition">
                        <div className="flex items-start gap-2"><div className="min-w-0 flex-1"><div className="text-sm font-bold text-[var(--text-primary)]">{monthName}</div><div className="text-[9px] text-[var(--text-faint)]">{monthIssues.length} issues · {monthCheckups.length} checkups</div>{monthIssues.length > 0 && <div className="mt-1.5 flex flex-wrap gap-1"><span className="text-[8px] font-bold uppercase tracking-wide text-[var(--danger)] mr-0.5">Issues</span>{monthIssues.slice(0, 4).map((item) => <span key={item.id} className="rounded-full border border-[var(--danger-soft)] bg-[var(--danger-soft)]/30 px-1.5 py-0.5 text-[8px] font-semibold text-[var(--danger)]">{item.title}</span>)}{monthIssues.length > 4 && <span className="rounded-full bg-[var(--bg-card)] px-1.5 py-0.5 text-[8px] font-semibold text-[var(--text-faint)]">+{monthIssues.length - 4}</span>}</div>}</div><ChevronDown size={15} className={`mt-0.5 shrink-0 transition-transform ${monthOpen ? "rotate-180" : ""}`}/></div>
                      </button>
                      {monthOpen && <div className="mt-3 grid grid-cols-1 xl:grid-cols-2 gap-3 ml-1 sm:ml-2">
                        {monthIssues.length > 0 && <div className="rounded-2xl border border-[var(--danger-soft)] bg-[var(--danger-soft)]/20 p-3"><div className="text-[10px] font-black uppercase tracking-wider text-[var(--danger)] mb-2">Health Issues</div><div className="space-y-2">{monthIssues.map((item) => <button type="button" key={item.id} onClick={() => item.id && onOpenTarget("issue", item.id)} className="w-full text-left rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2.5 hover:border-[var(--danger)] transition"><div className="flex items-center gap-2"><Heart size={14} className="text-[var(--danger)]"/><span className="min-w-0 flex-1 truncate text-xs font-bold text-[var(--text-primary)]">{item.title}</span><span className="text-[9px] text-[var(--text-faint)]">{item.date}</span></div></button>)}</div></div>}
                        {monthCheckups.length > 0 && <div className="rounded-2xl border border-[var(--accent-pink-soft)] bg-[var(--accent-pink-soft)]/30 p-3"><div className="text-[10px] font-black uppercase tracking-wider text-[var(--accent-pink)] mb-2">Health Checkups</div><div className="space-y-2">{monthCheckups.map((item) => { const meta = CHECKUP_META[item.category] || CHECKUP_META.other; return <button type="button" key={item.id} onClick={() => item.id && onOpenTarget("checkup", item.id)} className="w-full text-left rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2.5 hover:border-[var(--accent-pink)] transition"><div className="flex items-center gap-2"><span className="text-sm">{meta.emoji}</span><span className="min-w-0 flex-1 truncate text-xs font-bold text-[var(--text-primary)]">{item.title}</span><span className="text-[9px] text-[var(--text-faint)]">{item.date}</span></div></button>; })}</div></div>}
                        {!monthIssues.length && !monthCheckups.length && <p className="text-xs text-[var(--text-faint)]">No records.</p>}
                      </div>}
                    </div>
                  );
                })}
                {!monthNums.length && <div className="rounded-2xl border border-dashed border-[var(--border)] p-4 text-xs text-[var(--text-faint)]">No health records in this year.</div>}
              </div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EmptyMedical({ title, text, onClick }: { title: string; text: string; onClick: () => void }) {
  return <div className="rounded-3xl border border-dashed border-[var(--border)] bg-[var(--bg-elevated)] p-10 text-center"><ClipboardList size={28} className="mx-auto text-[var(--accent-pink)]"/><h4 className="mt-3 font-bold text-[var(--text-primary)]">{title}</h4><p className="mt-1 text-xs text-[var(--text-secondary)]">{text}</p><button type="button" onClick={onClick} className="mt-4 rounded-xl bg-[var(--accent-pink)] px-4 py-2 text-xs font-semibold text-white">Get started</button></div>;
}

function AttachmentList({ attachments, onPreview, referenced = false }: { attachments: MedicalAttachment[]; onPreview: (url: string) => void; referenced?: boolean }) {
  if (!attachments.length) return null;
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">{attachments.map((a) => <a key={`${a.storagePath}-${a.url}`} href={a.url} target="_blank" rel="noreferrer" onClick={(e) => { if (isImage(a.type)) { e.preventDefault(); onPreview(a.url); } }} className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2.5 hover:border-[var(--accent-pink)]">{isImage(a.type) ? <ImageIcon size={16} className="text-[var(--accent-blue)]"/> : <FileText size={16} className="text-[var(--accent-yellow)]"/>}<span className="min-w-0 flex-1 truncate text-xs font-semibold text-[var(--text-primary)]">{a.name}</span>{referenced && <span className="text-[9px] font-bold text-[var(--accent-pink)]">linked</span>}</a>)}</div>;
}

function CheckupCard({ item, issues, expanded, onExpand, onEdit, onDelete, onPreview }: { item: HealthCheckup; issues: HealthIssue[]; expanded: boolean; onExpand: () => void; onEdit: () => void; onDelete: () => void; onPreview: (url: string) => void }) {
  const meta = CHECKUP_META[item.category] || CHECKUP_META.other;
  return <div className="rounded-3xl border border-[var(--border)] bg-[var(--bg-elevated)] overflow-hidden shadow-sm"><button type="button" onClick={onExpand} className="w-full flex items-center gap-3 p-4 text-left"><div className="h-10 w-10 rounded-2xl bg-[var(--accent-pink-soft)] flex items-center justify-center text-lg">{meta.emoji}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-1.5"><h4 className="font-bold text-sm text-[var(--text-primary)] truncate">{item.title}</h4>{issues.map((issue) => <span key={issue.id} className="rounded-full bg-[var(--accent-blue-soft)] px-2 py-0.5 text-[9px] font-bold text-[var(--accent-blue)]">↗ {issue.title}</span>)}</div><p className="text-[10px] text-[var(--text-faint)] mt-0.5">{meta.label} · {item.date} · {issues.length} linked issue{issues.length === 1 ? "" : "s"}</p></div><ChevronRight size={17} className={`text-[var(--text-faint)] transition ${expanded ? "rotate-90" : ""}`}/></button>{expanded && <div className="border-t border-[var(--border)] px-4 pb-4 pt-3 space-y-3"><p className="text-sm text-[var(--text-secondary)] whitespace-pre-wrap">{item.notes || "No notes added."}</p><AttachmentList attachments={item.attachments || []} onPreview={onPreview}/><div className="flex justify-between pt-1"><button type="button" onClick={onEdit} className="rounded-xl border border-[var(--border)] px-3 py-2 text-xs font-semibold text-[var(--text-secondary)]">Edit</button><button type="button" onClick={onDelete} className="rounded-xl border border-[var(--danger-soft)] px-3 py-2 text-xs font-semibold text-[var(--danger)]">Delete</button></div></div>}</div>;
}

function IssueCard({ item, linked, expanded, onExpand, onEdit, onDelete, onPreview, onAddCheckup }: { item: HealthIssue; linked: HealthCheckup[]; expanded: boolean; onExpand: () => void; onEdit: () => void; onDelete: () => void; onPreview: (url: string) => void; onAddCheckup: () => void }) {
  return <div className="rounded-3xl border border-[var(--border)] bg-[var(--bg-elevated)] overflow-hidden shadow-sm"><button type="button" onClick={onExpand} className="w-full flex items-center gap-3 p-4 text-left"><div className="h-10 w-10 rounded-2xl bg-[var(--danger-soft)] flex items-center justify-center"><Heart size={19} className="text-[var(--danger)]"/></div><div className="min-w-0 flex-1"><h4 className="font-bold text-sm text-[var(--text-primary)] truncate">{item.title}</h4><p className="text-[10px] text-[var(--text-faint)] mt-0.5">Started {item.date} · {linked.length} linked checkup{linked.length === 1 ? "" : "s"}</p></div><ChevronRight size={17} className={`text-[var(--text-faint)] transition ${expanded ? "rotate-90" : ""}`}/></button>{expanded && <div className="border-t border-[var(--border)] px-4 pb-4 pt-3 space-y-4"><p className="text-sm text-[var(--text-secondary)] whitespace-pre-wrap">{item.notes || "No notes added."}</p>{item.referencedAttachments?.length > 0 && <div><p className="mb-2 text-xs font-bold text-[var(--text-primary)]">Referenced checkup evidence</p><AttachmentList attachments={item.referencedAttachments} onPreview={onPreview} referenced/></div>}{item.attachments?.length > 0 && <div><p className="mb-2 text-xs font-bold text-[var(--text-primary)]">Issue attachments</p><AttachmentList attachments={item.attachments} onPreview={onPreview}/></div>}<div className="rounded-2xl border border-[var(--accent-pink)] bg-[var(--accent-pink-soft)] p-3"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold text-[var(--text-primary)]">Health Checkup timeline</p><p className="text-[10px] text-[var(--text-secondary)]">Add a checkup now and it will automatically refer to this issue.</p></div><button type="button" onClick={onAddCheckup} className="shrink-0 rounded-xl bg-[var(--accent-pink)] px-3 py-2 text-[10px] font-bold text-white"><Plus size={13} className="inline mr-1"/>Add Checkup</button></div>{linked.length > 0 && <div className="mt-3 space-y-3">{linked.map((c) => <div key={c.id} className="rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-3"><div className="flex items-center gap-2"><span className="text-sm">{CHECKUP_META[c.category]?.emoji || "📄"}</span><span className="min-w-0 flex-1 text-xs font-semibold text-[var(--text-primary)] truncate">{c.title}</span><span className="text-[9px] text-[var(--text-faint)]">{c.date}</span></div>{c.attachments?.length > 0 && <div className="mt-2 space-y-1.5"><p className="text-[9px] font-bold uppercase tracking-wide text-[var(--text-faint)]">Documents ({c.attachments.length})</p>{c.attachments.map((a) => <a key={`${c.id}-${a.storagePath}`} href={a.url} target="_blank" rel="noreferrer" onClick={(e) => { if (isImage(a.type)) { e.preventDefault(); onPreview(a.url); } }} className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-2.5 py-2 hover:border-[var(--accent-pink)]"><span className="shrink-0">{isImage(a.type) ? <ImageIcon size={14} className="text-[var(--accent-blue)]"/> : <FileText size={14} className="text-[var(--accent-yellow)]"/>}</span><span className="min-w-0 flex-1 truncate text-[10px] font-semibold text-[var(--text-primary)]">{a.name}</span><span className="shrink-0 text-[9px] font-semibold text-[var(--accent-pink)]">Open ↗</span></a>)}</div>}{!c.attachments?.length && <p className="mt-2 text-[9px] text-[var(--text-faint)]">No documents attached to this checkup.</p>}</div>)}</div>}</div><div className="flex justify-between"><button type="button" onClick={onEdit} className="rounded-xl border border-[var(--border)] px-3 py-2 text-xs font-semibold text-[var(--text-secondary)]">Edit</button><button type="button" onClick={onDelete} className="rounded-xl border border-[var(--danger-soft)] px-3 py-2 text-xs font-semibold text-[var(--danger)]">Delete</button></div></div>}</div>;
}


// ── Main ProfileView ───────────────────────────────────────

export function ProfileView({ userId, userName, onNameChange, onSignOut }: ProfileViewProps) {
  const [profile, setProfile]           = useState<FitnessProfile | null>(null);
  const [liveWeightKg, setLiveWeightKg] = useState<number | null>(null);
  const [editing, setEditing]           = useState(false);
  const [draft, setDraft]               = useState<FitnessProfile>(EMPTY_PROFILE);
  const [step, setStep]                 = useState<Step>("personal");
  const [loading, setLoading]           = useState(true);
  const [saving, setSaving]             = useState(false);
  const [error, setError]               = useState("");
  const [success, setSuccess]           = useState(false);
  const [activeTab, setActiveTab]       = useState<ProfileTab>("profile");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const p = await getProfile(userId);
        if (!cancelled) {
          setProfile(p);
          if (!p) {
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

  useEffect(() => {
    let cancelled = false;
    async function fetchLiveWeight() {
      try {
        const routine = await getWeightRoutine(userId);
        if (!routine || cancelled) return;
        const entries = await getWeightEntries(userId, routine.id);
        if (!cancelled && entries.length > 0) {
          setLiveWeightKg(entries[entries.length - 1].value);
        }
      } catch {
        // non-critical
      }
    }
    void fetchLiveWeight();
    return () => { cancelled = true; };
  }, [userId]);

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
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--accent-pink)]" />
      </div>
    );
  }

  // ── Profile setup / edit wizard ────────────────────────

  if (editing) {
    const stepIdx = STEPS.indexOf(step);

    return (
      <div className="mx-auto max-w-lg">
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xl font-bold text-[var(--text-primary)]">
              {profile ? "Edit Profile" : "Set Up Your Profile"}
            </h2>
            {profile && (
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition"
              >
                Cancel
              </button>
            )}
          </div>

          {/* Progress bar */}
          <div className="flex items-center gap-2 mb-2">
            {STEPS.filter((s) => s !== "done").map((s, i) => (
              <div
                key={s}
                className={`flex-1 h-1.5 rounded-full transition-all ${
                  i <= stepIdx ? "bg-[var(--accent-pink)]" : "bg-[var(--border)]"
                }`}
              />
            ))}
          </div>
          <p className="text-sm font-semibold text-[var(--text-secondary)]">
            {stepIdx + 1} of {STEPS.length} — {STEP_LABELS[step]}
          </p>
        </div>

        <div className="rounded-3xl border border-[var(--border)] bg-[var(--bg-elevated)] p-6 shadow-sm">
          {step === "personal"  && <StepPersonal  draft={draft} update={update} />}
          {step === "body"      && <StepBody      draft={draft} update={update} />}
          {step === "goals"     && <StepGoals     draft={draft} update={update} />}
          {step === "lifestyle" && <StepLifestyle draft={draft} update={update} />}
          {step === "health"    && <StepHealth    draft={draft} update={update} toggleCondition={toggleCondition} />}
          {step === "done"      && <StepSummary   draft={draft} />}

          {error && (
            <div className="mt-4 flex items-center gap-2 rounded-xl bg-[var(--danger-soft)] border border-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          <div className="mt-6 flex items-center justify-between gap-3">
            {stepIdx > 0 ? (
              <button
                type="button"
                onClick={prevStep}
                className="flex items-center gap-2 rounded-xl border border-[var(--border)] px-4 py-2.5 text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition"
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
                className="flex items-center gap-2 rounded-xl bg-[var(--accent-pink)] px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 transition"
              >
                Continue
                <ChevronRight size={16} />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 rounded-xl bg-[var(--accent-pink)] px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 transition disabled:opacity-60"
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

  // ── No profile yet ─────────────────────────────────────

  if (!profile) {
    return (
      <div className="space-y-5">
        <div className="flex flex-col items-center py-16 text-center">
          <div className="h-16 w-16 rounded-2xl bg-[var(--accent-pink-soft)] flex items-center justify-center mb-4">
            <User size={28} className="text-[var(--accent-pink)]" />
          </div>
          <h3 className="font-bold text-[var(--text-primary)] text-lg">No profile yet</h3>
          <p className="text-sm text-[var(--text-secondary)] mt-1 mb-4">
            Set up your fitness profile to unlock analytics.
          </p>
          <button
            type="button"
            onClick={startEdit}
            className="rounded-xl bg-[var(--accent-pink)] px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 transition"
          >
            Set up profile
          </button>
        </div>
        {onSignOut && (
          <button
            type="button"
            onClick={onSignOut}
            className="flex w-full items-center justify-center gap-2 rounded-3xl border border-[var(--danger-soft)] bg-[var(--bg-elevated)] px-5 py-3.5 text-sm font-semibold text-[var(--danger)] hover:bg-[var(--danger-soft)] transition shadow-sm"
          >
            <LogOut size={16} />
            Sign Out
          </button>
        )}
      </div>
    );
  }

  // ── Profile view ───────────────────────────────────────

  const effectiveWeightKg = liveWeightKg ?? profile.weightKg;
  const bmi     = effectiveWeightKg && profile.heightCm
    ? calculateBMI(effectiveWeightKg, profile.heightCm) : null;
  const bmiCat  = bmi ? getBMICategory(bmi) : null;
  const age     = profile.dateOfBirth ? calculateAge(profile.dateOfBirth) : null;
  const bmr     = effectiveWeightKg && profile.heightCm && age && profile.gender
    ? calculateBMR(effectiveWeightKg, profile.heightCm, age, profile.gender) : null;
  const tdee    = bmr && profile.activityLevel ? calculateTDEE(bmr, profile.activityLevel) : null;

  return (
    <div className="space-y-5">
      {success && (
        <div className="flex items-center gap-2 rounded-2xl bg-[var(--success-soft)] border border-[var(--success-soft)] px-4 py-3 text-sm text-[var(--success)] font-medium">
          <Check size={16} />
          Profile saved successfully!
        </div>
      )}

      {/* Identity card */}
      <div className="rounded-3xl border border-[var(--border)] bg-[var(--bg-elevated)] p-6 shadow-sm">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-2xl bg-[var(--accent-pink)] flex items-center justify-center text-white text-2xl font-bold">
              {(profile.name || userName).charAt(0).toUpperCase()}
            </div>
            <div>
              <h2 className="text-xl font-bold text-[var(--text-primary)]">{profile.name || userName}</h2>
              {age && (
                <p className="text-sm text-[var(--text-secondary)] capitalize">
                  {age} yrs · {profile.gender || "—"} · {profile.activityLevel?.replace(/_/g, " ") || "—"}
                </p>
              )}
              {profile.fitnessGoal && (
                <span className="mt-1 inline-block rounded-full bg-[var(--bg-elevated)] px-3 py-0.5 text-xs font-semibold text-[var(--accent-pink)] capitalize">
                  Goal: {profile.fitnessGoal.replace(/_/g, " ")}
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={startEdit}
            className="flex items-center gap-2 rounded-xl border border-[var(--border)] px-3 py-2 text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition"
          >
            <Edit3 size={15} />
            Edit
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-1 gap-1">
        <button
          type="button"
          onClick={() => setActiveTab("profile")}
          className={`flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition ${
            activeTab === "profile"
              ? "bg-[var(--accent-pink)] text-white shadow-sm"
              : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          }`}
        >
          <User size={15} />
          Profile
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("medical")}
          className={`flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition ${
            activeTab === "medical"
              ? "bg-[var(--accent-pink)] text-white shadow-sm"
              : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          }`}
        >
          <FileText size={15} />
          Medical Reports
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("general")}
          className={`flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition ${
            activeTab === "general"
              ? "bg-[var(--accent-pink)] text-white shadow-sm"
              : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          }`}
        >
          <FileCheck size={15} />
          General Documents
        </button>
      </div>

      {/* Tab content */}
      {activeTab === "profile" && (
        <>
          {/* BMI card */}
          {bmi && bmiCat && (
            <div className="rounded-3xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <Scale size={18} className="text-[var(--accent-pink)]" />
                <h3 className="font-bold text-[var(--text-primary)]">Body Metrics</h3>
                {liveWeightKg && liveWeightKg !== profile.weightKg && (
                  <span className="ml-auto text-[10px] font-semibold rounded-full px-2 py-0.5 bg-[var(--accent-blue-soft)] text-[var(--accent-blue)]">
                    live weight
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <BMIBlock label="BMI"    value={bmi.toFixed(1)}                                          sub={bmiCat.label} subColor={bmiCat.color} />
                <BMIBlock label="Height" value={`${profile.heightCm}`}                                  sub="cm" />
                <BMIBlock label="Weight" value={`${effectiveWeightKg}`}                                 sub="kg" />
                <BMIBlock label="Target" value={profile.targetWeightKg ? `${profile.targetWeightKg}` : "—"} sub="kg" />
              </div>
              <div className="mt-4 space-y-1">
                <div
                  className="relative h-3 rounded-full overflow-hidden"
                  style={{ background: "linear-gradient(to right, var(--accent-blue) 0%, var(--success) 30%, var(--warning) 60%, var(--danger) 100%)" }}
                >
                  <div
                    className="absolute top-0 h-full w-1 bg-[var(--bg-elevated)] rounded-full shadow"
                    style={{
                      left: `${Math.min(100, Math.max(0, ((bmi - 10) / 30) * 100))}%`,
                      transform: "translateX(-50%)",
                    }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-[var(--text-muted)]">
                  <span>Underweight</span><span>Normal</span><span>Overweight</span><span>Obese</span>
                </div>
              </div>
            </div>
          )}

          {/* Daily energy card */}
          {tdee && (
            <div className="rounded-3xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <Activity size={18} className="text-[var(--accent-yellow)]" />
                <h3 className="font-bold text-[var(--text-primary)]">Daily Energy</h3>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 sm:col-span-1 rounded-2xl bg-[var(--accent-pink)] p-4 text-white">
                  <p className="text-xs text-[var(--text-faint)]">Maintenance Calories</p>
                  <p className="text-3xl font-bold mt-1">{Math.round(tdee)}</p>
                  <p className="text-xs text-[var(--text-faint)]">kcal / day</p>
                </div>
                <BMIBlock label="Basal Rate" value={`${Math.round(bmr!)}`} sub="kcal BMR" />
              </div>
            </div>
          )}

          {/* Goals grid */}
          <div className="rounded-3xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <Target size={18} className="text-[var(--accent-pink)]" />
              <h3 className="font-bold text-[var(--text-primary)]">Goals & Lifestyle</h3>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <GoalItem icon={<Target size={15} />}   label="Goal"          value={profile.fitnessGoal?.replace(/_/g, " ") || "—"} />
              <GoalItem icon={<Activity size={15} />} label="Workouts/week" value={profile.weeklyWorkoutDays ? `${profile.weeklyWorkoutDays} days` : "—"} />
              <GoalItem icon={<Activity size={15} />} label="Daily steps"   value={profile.dailyStepsGoal ? profile.dailyStepsGoal.toLocaleString() : "—"} />
              <GoalItem icon={<Droplets size={15} />} label="Water"         value={profile.dailyWaterLiters ? `${profile.dailyWaterLiters} L` : "—"} />
              <GoalItem icon={<Moon size={15} />}     label="Sleep"         value={profile.sleepHoursGoal ? `${profile.sleepHoursGoal}h` : "—"} />
              <GoalItem icon={<Utensils size={15} />} label="Diet"          value={profile.dietaryPreference || "—"} />
            </div>
          </div>

          {/* Health conditions */}
          {profile.healthConditions && profile.healthConditions.length > 0 && (
            <div className="rounded-3xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <Heart size={18} className="text-[var(--danger)]" />
                <h3 className="font-bold text-[var(--text-primary)]">Health Conditions</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {profile.healthConditions.map((c) => (
                  <span
                    key={c}
                    className="rounded-full bg-[var(--danger-soft)] border border-[var(--danger-soft)] px-3 py-1 text-xs font-semibold text-[var(--danger)]"
                  >
                    {c}
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {activeTab === "medical" && <MedicalReportTab userId={userId} />}
      {activeTab === "general" && <GeneralDocumentsTab userId={userId} />}

      {/* Sign out */}
      {onSignOut && (
        <button
          type="button"
          onClick={onSignOut}
          className="flex w-full items-center justify-center gap-2 rounded-3xl border border-[var(--danger-soft)] bg-[var(--bg-elevated)] px-5 py-3.5 text-sm font-semibold text-[var(--danger)] hover:bg-[var(--danger-soft)] transition shadow-sm"
        >
          <LogOut size={16} />
          Sign Out
        </button>
      )}
    </div>
  );
}

// ── Step components ────────────────────────────────────────

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
                  ? "border-[var(--accent-pink)] bg-[var(--bg-elevated)] text-[var(--accent-pink)]"
                  : "border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]"
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
  const bmi    = draft.weightKg && draft.heightCm ? calculateBMI(draft.weightKg, draft.heightCm) : null;
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
        <div
          className="rounded-2xl p-4"
          style={{ backgroundColor: `${bmiCat.color}15`, border: `1px solid ${bmiCat.color}40` }}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-[var(--text-secondary)]">Your BMI</p>
              <p className="text-2xl font-bold mt-0.5" style={{ color: bmiCat.color }}>{bmi.toFixed(1)}</p>
            </div>
            <div className="text-right">
              <p className="font-bold text-sm" style={{ color: bmiCat.color }}>{bmiCat.label}</p>
              <p className="text-xs text-[var(--text-secondary)]">{bmiCat.description}</p>
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
    { value: "lose_weight",       label: "Lose Weight",    emoji: "⬇️" },
    { value: "gain_muscle",       label: "Gain Muscle",    emoji: "💪" },
    { value: "maintain",          label: "Maintain",       emoji: "⚖️" },
    { value: "improve_endurance", label: "Endurance",      emoji: "🏃" },
    { value: "general_health",    label: "General Health", emoji: "❤️" },
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
                ? "border-[var(--accent-pink)] bg-[var(--bg-elevated)] text-[var(--accent-pink)]"
                : "border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]"
            }`}
          >
            <span className="text-lg">{g.emoji}</span>
            {g.label}
            {draft.fitnessGoal === g.value && <Check size={16} className="ml-auto text-[var(--accent-pink)]" />}
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
                  ? "border-[var(--accent-pink)] bg-[var(--accent-pink)] text-white"
                  : "border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]"
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
    { value: "sedentary",         label: "Sedentary",         sub: "Little or no exercise" },
    { value: "lightly_active",    label: "Lightly Active",    sub: "Light exercise 1–3 days/week" },
    { value: "moderately_active", label: "Moderately Active", sub: "Moderate exercise 3–5 days/week" },
    { value: "very_active",       label: "Very Active",       sub: "Hard exercise 6–7 days/week" },
    { value: "extra_active",      label: "Extra Active",      sub: "Physical job or twice-daily training" },
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
                  ? "border-[var(--accent-pink)] bg-[var(--bg-elevated)]"
                  : "border-[var(--border)] hover:bg-[var(--bg-elevated)]"
              }`}
            >
              <div>
                <p className="text-sm font-semibold text-[var(--text-primary)]">{a.label}</p>
                <p className="text-xs text-[var(--text-secondary)]">{a.sub}</p>
              </div>
              {draft.activityLevel === a.value && <Check size={16} className="text-[var(--accent-pink)] shrink-0" />}
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
                  ? "border-[var(--accent-pink)] bg-[var(--bg-elevated)] text-[var(--accent-pink)]"
                  : "border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]"
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
                    ? "border-[var(--danger)] bg-[var(--danger-soft)] text-[var(--danger)]"
                    : "border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]"
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
              ? "border-[var(--accent-pink)] bg-[var(--bg-elevated)] text-[var(--accent-pink)]"
              : "border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]"
          }`}
        >
          {draft.reminderEnabled
            ? <Check size={16} />
            : <span className="h-4 w-4 rounded-sm border border-[var(--text-faint)]" />}
          Enable daily reminders
        </button>
      </Field>
    </div>
  );
}

function StepSummary({ draft }: { draft: FitnessProfile }) {
  const bmi    = draft.weightKg && draft.heightCm ? calculateBMI(draft.weightKg, draft.heightCm) : null;
  const bmiCat = bmi ? getBMICategory(bmi) : null;
  const age    = draft.dateOfBirth ? calculateAge(draft.dateOfBirth) : null;

  return (
    <div className="space-y-4">
      <StepHeading icon={<Check size={20} />} title="Looking good!" subtitle="Review your details before saving" />
      <div className="space-y-2 text-sm">
        <SummaryRow label="Name"          value={draft.name || "—"} />
        <SummaryRow label="Age"           value={age ? `${age} yrs` : "—"} />
        <SummaryRow label="Gender"        value={draft.gender || "—"} />
        <SummaryRow label="Height"        value={draft.heightCm ? `${draft.heightCm} cm` : "—"} />
        <SummaryRow label="Weight"        value={draft.weightKg ? `${draft.weightKg} kg` : "—"} />
        {bmi && bmiCat && (
          <div className="flex justify-between py-1.5">
            <span className="text-[var(--text-secondary)] font-medium">BMI</span>
            <span className="font-bold" style={{ color: bmiCat.color }}>
              {bmi.toFixed(1)} ({bmiCat.label})
            </span>
          </div>
        )}
        <SummaryRow label="Goal"          value={draft.fitnessGoal?.replace(/_/g, " ") || "—"} />
        <SummaryRow label="Activity"      value={draft.activityLevel?.replace(/_/g, " ") || "—"} />
        <SummaryRow label="Diet"          value={draft.dietaryPreference || "—"} />
        <SummaryRow label="Workouts/week" value={draft.weeklyWorkoutDays ? `${draft.weeklyWorkoutDays} days` : "—"} />
      </div>
    </div>
  );
}

// ── Shared UI helpers ──────────────────────────────────────

const inputCls =
  "w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2.5 text-sm font-medium text-[var(--text-primary)] placeholder-[var(--text-faint)] focus:border-[var(--accent-pink)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-pink)]/20 transition";
const selectCls =
  "w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2.5 text-sm font-medium text-[var(--text-primary)] focus:border-[var(--accent-pink)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-pink)]/20 transition";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wide">{label}</label>
      {children}
    </div>
  );
}

function StepHeading({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div className="flex items-start gap-3 mb-2">
      <div className="h-10 w-10 rounded-xl bg-[var(--bg-elevated)] flex items-center justify-center text-[var(--accent-pink)] shrink-0">
        {icon}
      </div>
      <div>
        <h3 className="font-bold text-[var(--text-primary)]">{title}</h3>
        <p className="text-xs text-[var(--text-secondary)]">{subtitle}</p>
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-1.5 border-b border-[var(--bg-elevated)]">
      <span className="text-[var(--text-secondary)] font-medium">{label}</span>
      <span className="font-semibold text-[var(--text-primary)] capitalize">{value}</span>
    </div>
  );
}

function BMIBlock({ label, value, sub, subColor }: {
  label: string; value: string; sub: string; subColor?: string;
}) {
  return (
    <div className="rounded-2xl bg-[var(--bg-elevated)] p-3">
      <p className="text-xs text-[var(--text-secondary)]">{label}</p>
      <p className="text-2xl font-bold text-[var(--text-primary)] mt-0.5">{value}</p>
      <p className="text-xs font-semibold mt-0.5 capitalize" style={{ color: subColor ?? "var(--text-secondary)" }}>
        {sub}
      </p>
    </div>
  );
}

function GoalItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[var(--accent-pink-soft)] bg-[var(--bg-elevated)] p-3">
      <div className="flex items-center gap-1.5 mb-1 text-[var(--accent-pink)]">
        {icon}
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">{label}</p>
      </div>
      <p className="text-sm font-semibold text-[var(--text-secondary)] capitalize">{value}</p>
    </div>
  );
}