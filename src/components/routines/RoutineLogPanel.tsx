import { useEffect, useState } from "react";
import { CalendarDays, Check, Loader2, Save, Trash2, X } from "lucide-react";
import { Timestamp } from "firebase/firestore";

import type { Routine, RoutineStatus } from "../../types/routine";
import {
  deleteRoutineLog,
  getRoutineLog,
  saveRoutineLog,
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
    new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
    ),
  );
}

export function RoutineLogPanel({
  userId,
  routine,
  date,
  onSaved,
}: RoutineLogPanelProps) {
  const [selectedDate, setSelectedDate] = useState(
    formatDateForInput(date),
  );

  const [status, setStatus] =
    useState<RoutineStatus>("pending");

  const [remark, setRemark] = useState("");
  const [value, setValue] = useState("");

  const [existingLogId, setExistingLogId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const selectedDateObject = dateFromInput(selectedDate);



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

        if (cancelled) {
          return;
        }

        if (log) {
          setExistingLogId(log.id);
          setStatus(log.status);
          setRemark(log.remark ?? "");

          setValue(
            log.value === null || log.value === undefined
              ? ""
              : String(log.value),
          );
        } else {
          setExistingLogId(null);
          setStatus("pending");
          setRemark("");
          setValue("");
        }
      } catch (err) {
        console.error(
          "Failed to load routine log:",
          err,
        );

        if (!cancelled) {
          setError("Unable to load routine log.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadLog();

    return () => {
      cancelled = true;
    };
  }, [
    userId,
    routine.id,
    selectedDate,
  ]);
  

  function handleDateChange(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    setSelectedDate(event.target.value);
    setError("");
    setMessage("");
  }

  async function handleDelete() {
    if (!existingLogId) return;
    setError("");
    setMessage("");
    try {
      setDeleting(true);
      await deleteRoutineLog(userId, existingLogId);
      setExistingLogId(null);
      setStatus("pending");
      setRemark("");
      setValue("");
      window.dispatchEvent(new CustomEvent("routine-log-saved", { detail: { routineId: routine.id, value: null } }));
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

    let numericValue: number | null = null;

    if (routine.inputType === "number") {
      if (!value.trim()) {
        setError("Please enter a value.");
        return;
      }

      numericValue = Number(value);

      if (!Number.isFinite(numericValue)) {
        setError("Please enter a valid number.");
        return;
      }
    }

    try {
      setSaving(true);

      await saveRoutineLog(userId, {
        routineId: routine.id,
        date: toDayTimestamp(selectedDateObject),
        status,
        remark,
        value: numericValue,
      });

      window.dispatchEvent(
        new CustomEvent("routine-log-saved", {
          detail: {
            routineId: routine.id,
            value: numericValue,
          },
        }),
      );

      setMessage("Routine log saved successfully.");

      onSaved?.();
    } catch (err) {
      console.error(
        "Failed to save routine log:",
        err,
      );

      setError("Unable to save routine log.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-6">
        <Loader2
          size={24}
          className="animate-spin text-[var(--text-muted)]"
        />
      </div>
    );
  }

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

      {/* Selected Date */}
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
            min={formatDateForInput(
              routine.startDate.toDate(),
            )}
            max={
              routine.endDate
                ? formatDateForInput(
                    routine.endDate.toDate(),
                  )
                : undefined
            }
            onChange={handleDateChange}
            className="w-full rounded-xl border border-[var(--border)] px-4 py-3 pl-10 text-sm outline-none focus:border-[var(--border-strong)]"
          />
        </div>

        <p className="mt-1 text-xs text-[var(--text-faint)]">
          Select the date for which you want to record
          this routine.
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
            <Check
              size={17}
              className="mr-2 inline-block"
            />
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
            <X
              size={17}
              className="mr-2 inline-block"
            />
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

      {/* Numeric value */}
      {routine.inputType === "number" && (
        <div className="mt-5">
          <label className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">
            Value
            {routine.unit && ` (${routine.unit})`}
          </label>

          <input
            type="number"
            value={value}
            onChange={(event) =>
              setValue(event.target.value)
            }
            placeholder={
              routine.unit
                ? `Enter value in ${routine.unit}`
                : "Enter value"
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
          onChange={(event) =>
            setRemark(event.target.value)
          }
          placeholder="Add any remarks..."
          rows={3}
          className="w-full resize-none rounded-xl border border-[var(--border)] px-4 py-3 text-sm outline-none focus:border-[var(--border-strong)]"
        />
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
    </div>
  );
}