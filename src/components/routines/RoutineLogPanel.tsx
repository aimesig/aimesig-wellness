import { useEffect, useState } from "react";
import { CalendarDays, Check, Loader2, Save, X } from "lucide-react";
import { Timestamp } from "firebase/firestore";

import type { Routine, RoutineStatus } from "../../types/routine";
import {
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

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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
          setStatus(log.status);
          setRemark(log.remark ?? "");

          setValue(
            log.value === null || log.value === undefined
              ? ""
              : String(log.value),
          );
        } else {
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
      <div className="flex items-center justify-center rounded-2xl border border-slate-200 bg-white p-6">
        <Loader2
          size={24}
          className="animate-spin text-slate-500"
        />
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-5">
        <h3 className="text-lg font-bold text-slate-900">
          {routine.title}
        </h3>

        <p className="mt-1 text-sm text-slate-500">
          Record your routine status and remarks.
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {message && (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {message}
        </div>
      )}

      {/* Selected Date */}
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">
          Date
        </label>

        <div className="relative">
          <CalendarDays
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
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
            className="w-full rounded-xl border border-slate-300 px-4 py-3 pl-10 text-sm outline-none focus:border-slate-500"
          />
        </div>

        <p className="mt-1 text-xs text-slate-400">
          Select the date for which you want to record
          this routine.
        </p>
      </div>

      {/* Status */}
      <div className="mt-5">
        <label className="mb-2 block text-sm font-medium text-slate-700">
          Status
        </label>

        <div className="grid gap-3 sm:grid-cols-3">
          <button
            type="button"
            onClick={() => setStatus("yes")}
            className={`rounded-xl border px-4 py-3 text-sm font-semibold ${
              status === "yes"
                ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                : "border-slate-200 text-slate-600 hover:bg-slate-50"
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
                ? "border-red-500 bg-red-50 text-red-700"
                : "border-slate-200 text-slate-600 hover:bg-slate-50"
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
                ? "border-amber-500 bg-amber-50 text-amber-700"
                : "border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            Pending
          </button>
        </div>
      </div>

      {/* Numeric value */}
      {routine.inputType === "number" && (
        <div className="mt-5">
          <label className="mb-1 block text-sm font-medium text-slate-700">
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
            className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-500"
          />
        </div>
      )}

      {/* Remarks */}
      <div className="mt-5">
        <label className="mb-1 block text-sm font-medium text-slate-700">
          Remarks
        </label>

        <textarea
          value={remark}
          onChange={(event) =>
            setRemark(event.target.value)
          }
          placeholder="Add any remarks..."
          rows={3}
          className="w-full resize-none rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-500"
        />
      </div>

      {/* Save */}
      <button
        type="button"
        onClick={() => void handleSave()}
        disabled={saving}
        className="mt-5 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
      >
        {saving ? (
          <Loader2
            size={17}
            className="animate-spin"
          />
        ) : (
          <Save size={17} />
        )}

        {saving ? "Saving..." : "Save Log"}
      </button>
    </div>
  );
}