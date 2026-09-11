import { useEffect, useRef, useState } from "react";
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
  Sun,
  Utensils,
  Heart,
  Edit3,
  Save,
  Loader2,
  AlertCircle,
  LogOut,
  FileText,
  Upload,
  Trash2,
  Plus,
  X,
  Image as ImageIcon,
  FileCheck,
  Calendar,
  ClipboardList,
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
import { useTheme } from "../../context/ThemeContext";
import { saveUserTheme } from "../../services/themeService";
import { getWeightRoutine, getWeightEntries } from "../../services/weightService";
import {
  getMedicalReports,
  saveMedicalReport,
  updateMedicalReport,
  deleteMedicalReport,
  uploadMedicalFile,
  type MedicalReport,
  type ReportCategory,
  type MedicalAttachment,
} from "../../services/medicalReportService";

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

type ProfileTab = "profile" | "medical";

const CATEGORY_META: Record<ReportCategory, { label: string; emoji: string; color: string }> = {
  checkup:      { label: "Health Checkup", emoji: "🩺", color: "var(--accent-blue)" },
  issue:        { label: "Health Issue",   emoji: "🤒", color: "var(--danger)" },
  lab:          { label: "Lab Report",     emoji: "🧪", color: "var(--accent-yellow)" },
  prescription: { label: "Prescription",   emoji: "💊", color: "var(--success)" },
  other:        { label: "Other",          emoji: "📋", color: "var(--text-secondary)" },
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImage(mime: string) {
  return mime.startsWith("image/");
}

// ── Medical Report Tab ─────────────────────────────────────

interface MedicalReportTabProps {
  userId: string;
}

function MedicalReportTab({ userId }: MedicalReportTabProps) {
  const [reports, setReports]           = useState<MedicalReport[]>([]);
  const [loading, setLoading]           = useState(true);
  const [deletingId, setDeletingId]     = useState<string | null>(null);
  const [expandedId, setExpandedId]     = useState<string | null>(null);
  const [lightboxUrl, setLightboxUrl]   = useState<string | null>(null);

  // Form mode: null = closed, "new" = adding, "edit" = editing
  const [formMode, setFormMode]               = useState<"new" | "edit" | null>(null);
  const [editingReportId, setEditingReportId] = useState<string | null>(null);

  // Form fields
  const [title, setTitle]       = useState("");
  const [category, setCategory] = useState<ReportCategory>("checkup");
  const [date, setDate]         = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes]       = useState("");

  // Attachment state
  // attachments already saved to Storage (shown in edit mode)
  const [existingAttachments, setExistingAttachments] = useState<MedicalAttachment[]>([]);
  // attachments removed during this edit session (to be deleted from Storage on save)
  const [removedAttachments, setRemovedAttachments]   = useState<MedicalAttachment[]>([]);
  // newly picked files that haven't been uploaded yet
  const [selectedFiles, setSelectedFiles]             = useState<File[]>([]);
  const [uploadProgress, setUploadProgress]           = useState<Record<string, number>>({});

  const [saving, setSaving]       = useState(false);
  const [formError, setFormError] = useState("");

  // Keep a single file input mounted at all times so the ref is always valid
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Data loading ────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const data = await getMedicalReports(userId);
        if (!cancelled) setReports(data);
      } catch {
        // silently ignore
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [userId]);

  // ── Form helpers ────────────────────────────────────────

  /**
   * Reset all form fields to blank defaults.
   * Does NOT touch formMode or editingReportId — callers manage those.
   */
  function clearFormFields() {
    setTitle("");
    setCategory("checkup");
    setDate(new Date().toISOString().split("T")[0]);
    setNotes("");
    setExistingAttachments([]);
    setRemovedAttachments([]);
    setSelectedFiles([]);
    setUploadProgress({});
    setFormError("");
    // Reset the hidden file input so the same file can be re-selected later
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function openNewForm() {
    clearFormFields();
    setEditingReportId(null);
    setFormMode("new");
  }

  function openEditForm(report: MedicalReport) {
    // Populate fields first, then set the mode so the form renders with data
    setTitle(report.title);
    setCategory(report.category);
    setDate(report.date);
    setNotes(report.notes);
    setExistingAttachments(report.attachments ?? []);
    setRemovedAttachments([]);
    setSelectedFiles([]);
    setUploadProgress({});
    setFormError("");
    if (fileInputRef.current) fileInputRef.current.value = "";

    setEditingReportId(report.id ?? null);
    setExpandedId(null);
    setFormMode("edit");
  }

  function closeForm() {
    clearFormFields();
    setEditingReportId(null);
    setFormMode(null);
  }

  // ── File picking ────────────────────────────────────────

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const picked = Array.from(files);
    setSelectedFiles((prev) => [...prev, ...picked]);
    // Reset so the same file can be re-selected if the user removes and re-adds it
    e.target.value = "";
  }

  function removeSelectedFile(idx: number) {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== idx));
    setUploadProgress((prev) => {
      // Clean up any progress entry keyed by the removed file's name
      const next = { ...prev };
      // We don't have the file name here, but the progress map will be
      // reset on next save anyway — nothing to do.
      return next;
    });
  }

  function removeExistingAttachment(att: MedicalAttachment) {
    setExistingAttachments((prev) => prev.filter((a) => a.storagePath !== att.storagePath));
    setRemovedAttachments((prev) => [...prev, att]);
  }

  // ── Save ────────────────────────────────────────────────

  async function handleSave() {
    if (!title.trim()) { setFormError("Please enter a title."); return; }
    if (!date)         { setFormError("Please select a date."); return; }

    // Snapshot mutable state before any awaits so React state changes
    // during the async operation don't silently mutate what we're saving.
    const filesToUpload      = [...selectedFiles];
    const attachmentsToKeep  = [...existingAttachments];
    const attachmentsToRemove = [...removedAttachments];
    const reportIdToEdit     = editingReportId; // capture before any state reset
    const currentMode        = formMode;

    setSaving(true);
    setFormError("");

    try {
      // Upload newly selected files sequentially
      const newAttachments: MedicalAttachment[] = [];
      for (const file of filesToUpload) {
        const att = await uploadMedicalFile(userId, file, (pct) => {
          setUploadProgress((prev) => ({ ...prev, [file.name]: pct }));
        });
        newAttachments.push(att);
      }

      const finalAttachments = [...attachmentsToKeep, ...newAttachments];
      const reportPayload: Omit<MedicalReport, "id" | "createdAt" | "updatedAt"> = {
        title:       title.trim(),
        category,
        date,
        notes,
        attachments: finalAttachments,
      };

      if (currentMode === "edit" && reportIdToEdit) {
        await updateMedicalReport(userId, reportIdToEdit, reportPayload, attachmentsToRemove);
        // Optimistically update local state
        setReports((prev) =>
          prev.map((r) => (r.id === reportIdToEdit ? { ...r, ...reportPayload } : r))
        );
      } else {
        const savedId = await saveMedicalReport(userId, reportPayload);
        // Re-fetch to get the server timestamp; fall back to local insert on error
        try {
          const updated = await getMedicalReports(userId);
          setReports(updated);
        } catch {
          setReports((prev) => [{ id: savedId, ...reportPayload }, ...prev]);
        }
      }

      closeForm();
    } catch (err) {
      console.error("handleSave failed:", err);
      setFormError("Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  // ── Delete ──────────────────────────────────────────────

  async function handleDelete(report: MedicalReport) {
    if (!report.id) return;
    setDeletingId(report.id);
    try {
      await deleteMedicalReport(userId, report.id, report.attachments);
      setReports((prev) => prev.filter((r) => r.id !== report.id));
      if (expandedId === report.id) setExpandedId(null);
    } catch {
      // silently ignore
    } finally {
      setDeletingId(null);
    }
  }

  // ── Render ──────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--accent-pink)]" />
      </div>
    );
  }

  const showForm = formMode !== null;

  return (
    <div className="space-y-5">
      {/*
       * The file input is always mounted outside the conditional form block.
       * This ensures fileInputRef.current is never null when the upload
       * button is clicked, regardless of how the form toggled since last render.
       */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,.pdf,.doc,.docx,.txt,.xls,.xlsx"
        className="hidden"
        onChange={handleFileSelect}
      />

      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold text-[var(--text-primary)] text-base">Medical Reports</h3>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            Store health checkups, lab results, prescriptions & more
          </p>
        </div>
        {!showForm && (
          <button
            type="button"
            onClick={openNewForm}
            className="flex items-center gap-2 rounded-xl bg-[var(--accent-pink)] px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 transition shadow-sm"
          >
            <Plus size={15} />
            Add Report
          </button>
        )}
      </div>

      {/* Add / Edit Form */}
      {showForm && (
        <div className="rounded-3xl border border-[var(--accent-pink)] bg-[var(--bg-elevated)] p-5 shadow-sm space-y-4">
          {/* Form header */}
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-[var(--text-primary)]">
              {formMode === "edit" ? "Edit Medical Report" : "New Medical Report"}
            </h4>
            <button
              type="button"
              onClick={closeForm}
              className="text-[var(--text-faint)] hover:text-[var(--text-secondary)] transition"
            >
              <X size={18} />
            </button>
          </div>

          {/* Category picker */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wide">
              Category
            </label>
            <div className="flex flex-wrap gap-2">
              {(Object.entries(CATEGORY_META) as [ReportCategory, typeof CATEGORY_META[ReportCategory]][]).map(
                ([val, meta]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setCategory(val)}
                    className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                      category === val
                        ? "border-[var(--accent-pink)] bg-[var(--bg-elevated)] text-[var(--accent-pink)]"
                        : "border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-card)]"
                    }`}
                  >
                    <span>{meta.emoji}</span> {meta.label}
                  </button>
                )
              )}
            </div>
          </div>

          {/* Title */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wide">
              Title *
            </label>
            <input
              className={inputCls}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Annual Blood Test, Thyroid Checkup"
            />
          </div>

          {/* Date */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wide">
              Date *
            </label>
            <input
              type="date"
              className={inputCls}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wide">
              Notes
            </label>
            <textarea
              className={`${inputCls} resize-none`}
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Symptoms, doctor notes, observations…"
            />
          </div>

          {/* Attachments section */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wide">
              Attachments (images, PDFs, documents)
            </label>

            {/* Already-saved attachments (edit mode) */}
            {existingAttachments.length > 0 && (
              <div className="space-y-2">
                {existingAttachments.map((att, idx) => (
                  <div
                    key={`existing-${idx}-${att.storagePath}`}
                    className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2.5"
                  >
                    {isImage(att.type) ? (
                      <ImageIcon size={16} className="text-[var(--accent-blue)] shrink-0" />
                    ) : (
                      <FileText size={16} className="text-[var(--accent-yellow)] shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-[var(--text-primary)] truncate">{att.name}</p>
                      <p className="text-[10px] text-[var(--text-faint)]">{formatBytes(att.size)}</p>
                    </div>
                    <span className="text-[10px] font-semibold text-[var(--success)] shrink-0">saved</span>
                    <button
                      type="button"
                      onClick={() => removeExistingAttachment(att)}
                      className="text-[var(--text-faint)] hover:text-[var(--danger)] transition shrink-0"
                      title="Remove attachment"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Upload zone — triggers the always-mounted hidden input */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[var(--border)] py-5 text-sm font-semibold text-[var(--text-secondary)] hover:border-[var(--accent-pink)] hover:text-[var(--accent-pink)] transition"
            >
              <Upload size={18} />
              Click to upload files
            </button>

            {/* Newly selected (not yet uploaded) files */}
            {selectedFiles.length > 0 && (
              <div className="space-y-2">
                {selectedFiles.map((file, idx) => (
                  <div
                    key={`new-${idx}-${file.name}-${file.size}`}
                    className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2.5"
                  >
                    {isImage(file.type) ? (
                      <ImageIcon size={16} className="text-[var(--accent-blue)] shrink-0" />
                    ) : (
                      <FileText size={16} className="text-[var(--accent-yellow)] shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-[var(--text-primary)] truncate">{file.name}</p>
                      <p className="text-[10px] text-[var(--text-faint)]">{formatBytes(file.size)}</p>
                      {uploadProgress[file.name] !== undefined && (
                        <div className="mt-1 h-1 w-full rounded-full bg-[var(--border)] overflow-hidden">
                          <div
                            className="h-full bg-[var(--accent-pink)] rounded-full transition-all"
                            style={{ width: `${uploadProgress[file.name]}%` }}
                          />
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeSelectedFile(idx)}
                      className="text-[var(--text-faint)] hover:text-[var(--danger)] transition shrink-0"
                      title="Remove file"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Error banner */}
          {formError && (
            <div className="flex items-center gap-2 rounded-xl bg-[var(--danger-soft)] border border-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">
              <AlertCircle size={16} />
              {formError}
            </div>
          )}

          {/* Action row */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={closeForm}
              className="flex-1 rounded-xl border border-[var(--border)] py-2.5 text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-card)] transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-[var(--accent-pink)] py-2.5 text-sm font-semibold text-white hover:opacity-90 transition disabled:opacity-60"
            >
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
              {saving ? "Saving…" : formMode === "edit" ? "Update Report" : "Save Report"}
            </button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {reports.length === 0 && !showForm && (
        <div className="flex flex-col items-center py-16 text-center rounded-3xl border border-dashed border-[var(--border)] bg-[var(--bg-elevated)]">
          <div className="h-14 w-14 rounded-2xl bg-[var(--accent-pink-soft)] flex items-center justify-center mb-3">
            <ClipboardList size={26} className="text-[var(--accent-pink)]" />
          </div>
          <h4 className="font-bold text-[var(--text-primary)]">No reports yet</h4>
          <p className="text-sm text-[var(--text-secondary)] mt-1 max-w-xs">
            Upload health checkup logs, lab results, prescriptions, or any medical documents.
          </p>
          <button
            type="button"
            onClick={openNewForm}
            className="mt-4 flex items-center gap-2 rounded-xl bg-[var(--accent-pink)] px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 transition"
          >
            <Plus size={15} />
            Add your first report
          </button>
        </div>
      )}

      {/* Reports list */}
      {reports.map((report) => {
        const meta          = CATEGORY_META[report.category];
        const isExpanded    = expandedId === report.id;
        const isBeingEdited = formMode === "edit" && editingReportId === report.id;

        return (
          <div
            key={report.id}
            className={`rounded-3xl border bg-[var(--bg-elevated)] shadow-sm overflow-hidden transition ${
              isBeingEdited
                ? "border-[var(--accent-pink)] opacity-50 pointer-events-none"
                : "border-[var(--border)]"
            }`}
          >
            {/* Collapse / expand header */}
            <button
              type="button"
              onClick={() => setExpandedId(isExpanded ? null : (report.id ?? null))}
              className="w-full flex items-center gap-3 p-4 text-left hover:bg-[var(--bg-card)] transition"
            >
              <div
                className="h-10 w-10 rounded-xl flex items-center justify-center text-lg shrink-0"
                style={{ backgroundColor: `${meta.color}18` }}
              >
                {meta.emoji}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-[var(--text-primary)] truncate">{report.title}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span
                    className="text-[10px] font-semibold uppercase tracking-wide"
                    style={{ color: meta.color }}
                  >
                    {meta.label}
                  </span>
                  <span className="text-[var(--text-faint)] text-[10px]">·</span>
                  <span className="flex items-center gap-1 text-[10px] text-[var(--text-secondary)]">
                    <Calendar size={10} />
                    {new Date(report.date + "T00:00:00").toLocaleDateString("en-IN", {
                      day: "numeric", month: "short", year: "numeric",
                    })}
                  </span>
                  {report.attachments.length > 0 && (
                    <>
                      <span className="text-[var(--text-faint)] text-[10px]">·</span>
                      <span className="text-[10px] text-[var(--text-secondary)]">
                        {report.attachments.length} file{report.attachments.length > 1 ? "s" : ""}
                      </span>
                    </>
                  )}
                </div>
              </div>
              <ChevronRight
                size={16}
                className={`text-[var(--text-faint)] shrink-0 transition-transform ${isExpanded ? "rotate-90" : ""}`}
              />
            </button>

            {/* Expanded detail */}
            {isExpanded && (
              <div className="px-4 pb-4 space-y-4 border-t border-[var(--border)]">
                {report.notes && (
                  <div className="pt-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)] mb-1">
                      Notes
                    </p>
                    <p className="text-sm text-[var(--text-secondary)] whitespace-pre-wrap">{report.notes}</p>
                  </div>
                )}

                {report.attachments.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)] mb-2">
                      Attachments
                    </p>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {report.attachments.map((att, idx) =>
                        isImage(att.type) ? (
                          <button
                            key={`img-${idx}-${att.storagePath}`}
                            type="button"
                            onClick={() => setLightboxUrl(att.url)}
                            className="relative rounded-xl overflow-hidden border border-[var(--border)] aspect-square group"
                          >
                            <img
                              src={att.url}
                              alt={att.name}
                              className="w-full h-full object-cover group-hover:opacity-90 transition"
                            />
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition" />
                            <p className="absolute bottom-0 left-0 right-0 bg-black/50 px-2 py-1 text-[9px] text-white truncate">
                              {att.name}
                            </p>
                          </button>
                        ) : (
                          <a
                            key={`doc-${idx}-${att.storagePath}`}
                            href={att.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-3 hover:border-[var(--accent-pink)] transition group"
                          >
                            <FileCheck size={18} className="text-[var(--accent-yellow)] shrink-0" />
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-[var(--text-primary)] truncate group-hover:text-[var(--accent-pink)]">
                                {att.name}
                              </p>
                              <p className="text-[10px] text-[var(--text-faint)]">{formatBytes(att.size)}</p>
                            </div>
                          </a>
                        )
                      )}
                    </div>
                  </div>
                )}

                {/* Edit / Delete row */}
                <div className="flex items-center justify-between pt-1">
                  <button
                    type="button"
                    onClick={() => openEditForm(report)}
                    disabled={showForm}
                    className="flex items-center gap-1.5 rounded-xl border border-[var(--border)] px-3 py-2 text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-card)] transition disabled:opacity-40"
                  >
                    <Edit3 size={13} />
                    Edit Report
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(report)}
                    disabled={deletingId === report.id || showForm}
                    className="flex items-center gap-1.5 rounded-xl border border-[var(--danger-soft)] px-3 py-2 text-xs font-semibold text-[var(--danger)] hover:bg-[var(--danger-soft)] transition disabled:opacity-50"
                  >
                    {deletingId === report.id ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <Trash2 size={13} />
                    )}
                    Delete
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Image lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            type="button"
            onClick={() => setLightboxUrl(null)}
            className="absolute top-4 right-4 h-9 w-9 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition"
          >
            <X size={18} />
          </button>
          <img
            src={lightboxUrl}
            alt="Preview"
            className="max-h-[90vh] max-w-full rounded-2xl object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

// ── Main ProfileView ───────────────────────────────────────

export function ProfileView({ userId, userName, onNameChange, onSignOut }: ProfileViewProps) {
  const { theme, setTheme } = useTheme();
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

  function handleThemeSelect(next: "light" | "dark") {
    setTheme(next);
    void saveUserTheme(userId, next);
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
        <AppearanceCard theme={theme} onSelect={handleThemeSelect} />
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

      <AppearanceCard theme={theme} onSelect={handleThemeSelect} />

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

function AppearanceCard({ theme, onSelect }: {
  theme: "light" | "dark";
  onSelect: (t: "light" | "dark") => void;
}) {
  return (
    <div className="rounded-3xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5 shadow-sm">
      <p className="text-sm font-bold text-[var(--text-primary)]">Appearance</p>
      <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
        This device remembers your pick — it's saved to your account too.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {(["dark", "light"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => onSelect(t)}
            className={`flex items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-semibold transition ${
              theme === t
                ? "border-[var(--accent-pink)] bg-[var(--accent-pink-soft)] text-[var(--accent-pink)]"
                : "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--accent-pink)]"
            }`}
          >
            {t === "dark" ? <Moon size={15} /> : <Sun size={15} />}
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
    </div>
  );
}

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