import { useEffect, useRef, useState } from "react";
import {
  CalendarDays,
  Check,
  ImagePlus,
  Loader2,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { Timestamp } from "firebase/firestore";

import type { Routine, RoutineStatus } from "../../types/routine";
import { ImageLightbox } from "../ui/ImageLightbox";
import {
  deleteRoutineLog,
  deleteRoutineLogImage,
  getRoutineLog,
  saveRoutineLog,
  uploadRoutineLogImage,
} from "../../services/routineLogService";

interface RoutineLogPanelProps {
  userId: string;
  routine: Routine;
  date: Date;
  onSaved?: () => void;
}

function formatDateForInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateFromInput(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function toDayTimestamp(date: Date): Timestamp {
  return Timestamp.fromDate(
    new Date(date.getFullYear(), date.getMonth(), date.getDate()),
  );
}

export function RoutineLogPanel({
  userId,
  routine,
  date,
  onSaved,
}: RoutineLogPanelProps) {
  const [selectedDate, setSelectedDate] = useState(formatDateForInput(date));
  const [status, setStatus] = useState<RoutineStatus>("pending");
  const [remark, setRemark] = useState("");

  // Legacy single-value (inputType === "number")
  const [value, setValue] = useState("");

  // Multi-field values: Record<fieldKey, stringified number>
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});

  // Image state
  const [savedImageUrl, setSavedImageUrl] = useState<string | null>(null);
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  const [existingLogId, setExistingLogId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const selectedDateObject = dateFromInput(selectedDate);

  const isMulti =
    routine.inputType === "multi" &&
    Array.isArray(routine.inputFields) &&
    routine.inputFields.length > 0;

  const isLegacyNumber = routine.inputType === "number";

  // Clean up local object URL when component unmounts or preview changes.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    let cancelled = false;

    async function loadLog() {
      try {
        setLoading(true);
        setError("");
        setMessage("");

        const log = await getRoutineLog(
          userId,
          routine.id,
          toDayTimestamp(selectedDateObject),
        );

        if (cancelled) return;

        if (log) {
          setExistingLogId(log.id);
          setStatus(log.status);
          setRemark(log.remark ?? "");
          // Legacy single value
          setValue(
            log.value === null || log.value === undefined
              ? ""
              : String(log.value),
          );
          // Multi-field values
          const loaded: Record<string, string> = {};
          if (isMulti && log.values) {
            for (const field of routine.inputFields) {
              const v = log.values[field.key];
              loaded[field.key] = v !== undefined ? String(v) : "";
            }
          }
          setFieldValues(loaded);
          setSavedImageUrl(log.imageUrl ?? null);
        } else {
          setExistingLogId(null);
          setStatus("pending");
          setRemark("");
          setValue("");
          const empty: Record<string, string> = {};
          if (isMulti) {
            for (const f of routine.inputFields) empty[f.key] = "";
          }
          setFieldValues(empty);
          setSavedImageUrl(null);
        }

        setPendingImage(null);
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
        setRemoveImage(false);
      } catch (err) {
        console.error("Failed to load routine log:", err);
        if (!cancelled) setError("Unable to load routine log.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadLog();

    return () => {
      cancelled = true;
    };
  }, [userId, routine.id, selectedDate]);

  function handleDateChange(event: React.ChangeEvent<HTMLInputElement>) {
    setSelectedDate(event.target.value);
    setError("");
    setMessage("");
  }

  function handleImagePick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPendingImage(file);
    setPreviewUrl(URL.createObjectURL(file));
    setRemoveImage(false);
    event.target.value = "";
  }

  function handleClearPending() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPendingImage(null);
    setPreviewUrl(null);
  }

  function handleRemoveSaved() {
    setRemoveImage(true);
    setSavedImageUrl(null);
  }

  async function handleDelete() {
    if (!existingLogId) return;
    setError("");
    setMessage("");
    try {
      setDeleting(true);
      if (savedImageUrl) await deleteRoutineLogImage(savedImageUrl);
      await deleteRoutineLog(userId, existingLogId);
      setExistingLogId(null);
      setStatus("pending");
      setRemark("");
      setValue("");
      const empty: Record<string, string> = {};
      if (isMulti) {
        for (const f of routine.inputFields) empty[f.key] = "";
      }
      setFieldValues(empty);
      setSavedImageUrl(null);
      setPendingImage(null);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      setRemoveImage(false);
      window.dispatchEvent(
        new CustomEvent("routine-log-saved", {
          detail: { routineId: routine.id, value: null },
        }),
      );
      setMessage("Log deleted successfully.");
      onSaved?.();
    } catch (err) {
      console.error("Failed to delete routine log:", err);
      setError("Unable to delete routine log.");
    } finally {
      setDeleting(false);
    }
  }

  async function handleSave() {
    setError("");
    setMessage("");

    // Validate + collect values
    let legacyNumericValue: number | null = null;
    const multiValues: Record<string, number> = {};

    if (isMulti) {
      for (const field of routine.inputFields) {
        const raw = (fieldValues[field.key] ?? "").trim();
        if (!raw) {
          setError(
            `Please enter a value for "${field.label || field.key}".`,
          );
          return;
        }
        const n = Number(raw);
        if (!Number.isFinite(n)) {
          setError(
            `"${field.label || field.key}" must be a valid number.`,
          );
          return;
        }
        multiValues[field.key] = n;
      }
    } else if (isLegacyNumber) {
      if (!value.trim()) {
        setError("Please enter a value.");
        return;
      }
      legacyNumericValue = Number(value);
      if (!Number.isFinite(legacyNumericValue)) {
        setError("Please enter a valid number.");
        return;
      }
    }

    try {
      setSaving(true);

      let finalImageUrl: string | null = savedImageUrl;

      if (pendingImage) {
        if (savedImageUrl) await deleteRoutineLogImage(savedImageUrl);
        finalImageUrl = await uploadRoutineLogImage(
          userId,
          routine.id,
          toDayTimestamp(selectedDateObject),
          pendingImage,
        );
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setPendingImage(null);
        setPreviewUrl(null);
        setSavedImageUrl(finalImageUrl);
      } else if (removeImage && savedImageUrl) {
        await deleteRoutineLogImage(savedImageUrl);
        finalImageUrl = null;
      }

      await saveRoutineLog(userId, {
        routineId: routine.id,
        date: toDayTimestamp(selectedDateObject),
        status,
        remark,
        value: legacyNumericValue,
        values: multiValues,
        imageUrl: finalImageUrl,
      });

      setRemoveImage(false);

      window.dispatchEvent(
        new CustomEvent("routine-log-saved", {
          detail: {
            routineId: routine.id,
            value: legacyNumericValue,
            values: multiValues,
          },
        }),
      );

      setMessage("Routine log saved successfully.");
      onSaved?.();
    } catch (err) {
      console.error("Failed to save routine log:", err);
      setError("Unable to save routine log.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-6">
        <Loader2 size={24} className="animate-spin text-[var(--text-muted)]" />
      </div>
    );
  }

  const displayImageUrl = previewUrl ?? (removeImage ? null : savedImageUrl);
  const hasPendingChanges = pendingImage !== null || removeImage;

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5 shadow-sm">
      <div className="mb-5">
        <h3 className="text-lg font-bold text-[var(--text-primary)]">
          {routine.title || "(deleted)"}
          {routine.deletedAt && (
            <span className="ml-2 rounded-full bg-[var(--danger-soft)] px-2 py-0.5 text-xs font-semibold text-[var(--danger)] align-middle">
              deleted
            </span>
          )}
        </h3>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          {routine.deletedAt
            ? "This routine has been deleted, but you can still view and edit its log."
            : "Record your routine status and remarks."}
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-[var(--danger-soft)] bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">
          {error}
        </div>
      )}

      {message && (
        <div className="mb-4 rounded-xl border border-[var(--success-soft)] bg-[var(--success-soft)] px-4 py-3 text-sm text-[var(--success)]">
          {message}
        </div>
      )}

      {/* Date */}
      <div>
        <label className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">
          Date
        </label>
        <div className="relative">
          <CalendarDays
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-faint)]"
          />
          <input
            type="date"
            value={selectedDate}
            min={formatDateForInput(routine.startDate.toDate())}
            max={
              routine.endDate
                ? formatDateForInput(routine.endDate.toDate())
                : undefined
            }
            onChange={handleDateChange}
            className="w-full rounded-xl border border-[var(--border)] px-4 py-3 pl-10 text-sm outline-none focus:border-[var(--border-strong)]"
          />
        </div>
        <p className="mt-1 text-xs text-[var(--text-faint)]">
          Select the date for which you want to record this routine.
        </p>
      </div>

      {/* Status */}
      <div className="mt-5">
        <label className="mb-2 block text-sm font-medium text-[var(--text-secondary)]">
          Status
        </label>
        <div className="grid gap-3 sm:grid-cols-3">
          <button
            type="button"
            onClick={() => setStatus("yes")}
            className={`rounded-xl border px-4 py-3 text-sm font-semibold ${
              status === "yes"
                ? "border-[var(--success)] bg-[var(--success-soft)] text-[var(--success)]"
                : "border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]"
            }`}
          >
            <Check size={17} className="mr-2 inline-block" />
            Yes
          </button>

          <button
            type="button"
            onClick={() => setStatus("no")}
            className={`rounded-xl border px-4 py-3 text-sm font-semibold ${
              status === "no"
                ? "border-[var(--danger)] bg-[var(--danger-soft)] text-[var(--danger)]"
                : "border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]"
            }`}
          >
            <X size={17} className="mr-2 inline-block" />
            No
          </button>

          <button
            type="button"
            onClick={() => setStatus("pending")}
            className={`rounded-xl border px-4 py-3 text-sm font-semibold ${
              status === "pending"
                ? "border-[var(--warning)] bg-[var(--warning-soft)] text-[var(--warning)]"
                : "border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]"
            }`}
          >
            Pending
          </button>
        </div>
      </div>

      {/* ── Multi-field inputs ── */}
      {isMulti && (
        <div className="mt-5 space-y-3">
          <label className="block text-sm font-medium text-[var(--text-secondary)]">
            Values
          </label>
          {routine.inputFields.map((field) => (
            <div key={field.key}>
              <label className="mb-1 block text-xs text-[var(--text-faint)]">
                {field.label || field.key}
                {field.unit && (
                  <span className="ml-1 text-[var(--text-faint)]">
                    ({field.unit})
                  </span>
                )}
              </label>
              <div className="relative">
                <input
                  type="number"
                  value={fieldValues[field.key] ?? ""}
                  onChange={(e) =>
                    setFieldValues((prev) => ({
                      ...prev,
                      [field.key]: e.target.value,
                    }))
                  }
                  placeholder={
                    field.unit
                      ? `Enter value in ${field.unit}`
                      : "Enter value"
                  }
                  className="w-full rounded-xl border border-[var(--border)] px-4 py-3 pr-16 text-sm outline-none focus:border-[var(--border-strong)]"
                />
                {field.unit && (
                  <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs text-[var(--text-faint)]">
                    {field.unit}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Legacy single-value input */}
      {isLegacyNumber && (
        <div className="mt-5">
          <label className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">
            Value{routine.unit && ` (${routine.unit})`}
          </label>
          <input
            type="number"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={
              routine.unit ? `Enter value in ${routine.unit}` : "Enter value"
            }
            className="w-full rounded-xl border border-[var(--border)] px-4 py-3 text-sm outline-none focus:border-[var(--border-strong)]"
          />
        </div>
      )}

      {/* Remarks */}
      <div className="mt-5">
        <label className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">
          Remarks
        </label>
        <textarea
          value={remark}
          onChange={(e) => setRemark(e.target.value)}
          placeholder="Add any remarks..."
          rows={3}
          className="w-full resize-none rounded-xl border border-[var(--border)] px-4 py-3 text-sm outline-none focus:border-[var(--border-strong)]"
        />
      </div>

      {/* Image Attachment */}
      <div className="mt-5">
        <label className="mb-2 block text-sm font-medium text-[var(--text-secondary)]">
          Image
        </label>

        {displayImageUrl ? (
          <div className="relative w-full overflow-hidden rounded-xl border border-[var(--border)]">
            <img
              src={displayImageUrl}
              alt="Routine log attachment"
              className="max-h-64 w-full cursor-zoom-in object-contain"
              onClick={() => setLightboxSrc(displayImageUrl)}
            />
            {pendingImage && (
              <span className="absolute left-2 top-2 rounded-full bg-[var(--warning)] px-2 py-0.5 text-xs font-semibold text-white">
                Not saved yet
              </span>
            )}
            <div className="absolute right-2 top-2 flex gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="rounded-lg bg-[var(--bg-elevated)] p-1.5 shadow hover:bg-[var(--bg-subtle)] transition-colors"
                title="Replace image"
              >
                <ImagePlus size={16} className="text-[var(--text-secondary)]" />
              </button>
              <button
                type="button"
                onClick={pendingImage ? handleClearPending : handleRemoveSaved}
                className="rounded-lg bg-[var(--danger-soft)] p-1.5 shadow hover:bg-[var(--danger)] hover:text-white transition-colors"
                title="Remove image"
              >
                <Trash2 size={16} className="text-[var(--danger)]" />
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--border)] px-4 py-6 text-sm text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text-secondary)] transition-colors"
          >
            <ImagePlus size={20} />
            Attach an image
          </button>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleImagePick}
        />

        {hasPendingChanges && (
          <p className="mt-1 text-xs text-[var(--warning)]">
            {pendingImage
              ? "New image will be uploaded when you save."
              : "Image will be removed when you save."}
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving || deleting}
          className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent-pink)] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving ? (
            <Loader2 size={17} className="animate-spin" />
          ) : (
            <Save size={17} />
          )}
          {saving ? "Saving..." : "Save Log"}
        </button>

        {existingLogId && (
          <button
            type="button"
            onClick={() => void handleDelete()}
            disabled={saving || deleting}
            className="inline-flex items-center gap-2 rounded-xl border border-[var(--danger-soft)] bg-[var(--danger-soft)] px-5 py-3 text-sm font-semibold text-[var(--danger)] disabled:opacity-50 hover:bg-[var(--danger)] hover:text-white transition-colors"
          >
            {deleting ? (
              <Loader2 size={17} className="animate-spin" />
            ) : (
              <Trash2 size={17} />
            )}
            {deleting ? "Deleting..." : "Delete Log"}
          </button>
        )}
      </div>

      {lightboxSrc && (
        <ImageLightbox
          src={lightboxSrc}
          alt="Routine log attachment"
          onClose={() => setLightboxSrc(null)}
        />
      )}
    </div>
  );
}
