import { useEffect, useState } from "react";
import {
  CalendarDays,
  Check,
  CircleOff,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { Timestamp } from "firebase/firestore";

import type { Routine, YearDate } from "../../types/routine";
import { DateMultiSelect } from "../calendar/DateMultiSelect";
import { RoutineLogPanel } from "./RoutineLogPanel";
import { WeekdaySelect } from "./WeekdaySelect";
import { MonthDayMultiSelect } from "./MonthDayMultiSelect";
import { YearDateMultiSelect } from "./YearDateMultiSelect";
import {
  createRoutine,
  deleteRoutine,
  getRoutines,
  updateRoutine,
  type RoutineInput,
} from "../../services/routineService";

interface RoutineManagerProps {
  userId: string;
}

interface RoutineForm {
  title: string;
  description: string;
  frequency: Routine["frequency"];
  inputType: Routine["inputType"];
  unit: string;
  startDate: string;
  endDate: string;
  active: boolean;
  selectedDates: Timestamp[];
  weekdays: number[];
  monthDays: number[];
  yearDates: YearDate[];
}

const emptyForm: RoutineForm = {
  title: "",
  description: "",
  frequency: "daily",
  inputType: "none",
  unit: "",
  startDate: new Date().toISOString().split("T")[0],
  endDate: "",
  active: true,
  selectedDates: [],
  weekdays: [],
  monthDays: [],
  yearDates: [],
};

export function RoutineManager({
  userId,
}: RoutineManagerProps) {
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [form, setForm] = useState<RoutineForm>(emptyForm);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [loggingRoutine, setLoggingRoutine] =
  useState<Routine | null>(null);

  const [error, setError] = useState("");

  async function loadRoutines() {
    try {
      setLoading(true);
      setError("");

      const data = await getRoutines(userId);

      setRoutines(data);
    } catch (err) {
      console.error("Failed to load routines:", err);
      setError("Unable to load routines.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadRoutines();
  }, [userId]);

  function openCreateForm() {
    setEditingId(null);
    setForm(emptyForm);
    setError("");
    setShowForm(true);
  }

  function openEditForm(routine: Routine) {
    setEditingId(routine.id);

setForm({
  title: routine.title,
  description: routine.description,
  frequency: routine.frequency,
  inputType: routine.inputType,
  unit: routine.unit,
  startDate: routine.startDate
    .toDate()
    .toISOString()
    .split("T")[0],
  endDate: routine.endDate
    ? routine.endDate
        .toDate()
        .toISOString()
        .split("T")[0]
    : "",
  active: routine.active,
  selectedDates: routine.schedule.selectedDates ?? [],
  weekdays: routine.schedule.weekdays ?? [],
  monthDays: routine.schedule.monthDays ?? [],
  yearDates: routine.schedule.yearDates ?? [],
});

    setError("");
    setShowForm(true);
  }

  function closeForm() {
    if (saving) {
      return;
    }

    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
    setError("");
  }

  function buildRoutineInput(): RoutineInput {
    const startDate = Timestamp.fromDate(
      new Date(`${form.startDate}T00:00:00`),
    );

    const endDate = form.endDate
      ? Timestamp.fromDate(
          new Date(`${form.endDate}T23:59:59`),
        )
      : null;

    const schedule = (() => {
      switch (form.frequency) {
        case "weekly":
          return { weekdays: form.weekdays };
        case "monthly":
          return { monthDays: form.monthDays };
        case "yearly":
          return { yearDates: form.yearDates };
        case "selectedDates":
          return { selectedDates: form.selectedDates };
        default:
          return {};
      }
    })();

    return {
      title: form.title.trim(),
      description: form.description.trim(),
      frequency: form.frequency,
      schedule,
      alternateDay: false,
      inputType: form.inputType,
      unit: form.unit.trim(),
      startDate,
      endDate,
      active: form.active,
    };
  }

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!form.title.trim()) {
      setError("Routine title is required.");
      return;
    }

    if (!form.startDate) {
      setError("Start date is required.");
      return;
    }

    if (
      form.endDate &&
      form.endDate < form.startDate
    ) {
      setError("End date cannot be before start date.");
      return;
    }

    if (
        form.frequency === "selectedDates" &&
        form.selectedDates.length === 0
      ) {
        setError(
          "Please select at least one date.",
        );
        return;
      }

    try {
      setSaving(true);
      setError("");

      const routine = buildRoutineInput();

      if (editingId) {
        await updateRoutine(
          userId,
          editingId,
          routine,
        );
      } else {
        await createRoutine(userId, routine);
      }

      await loadRoutines();

      closeForm();
    } catch (err) {
      console.error("Failed to save routine:", err);
      setError("Unable to save routine.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(routineId: string) {
    const confirmed = window.confirm(
      "Are you sure you want to delete this routine?",
    );

    if (!confirmed) {
      return;
    }

    try {
      setError("");

      await deleteRoutine(userId, routineId);

      setRoutines((current) =>
        current.filter(
          (routine) => routine.id !== routineId,
        ),
      );
    } catch (err) {
      console.error("Failed to delete routine:", err);
      setError("Unable to delete routine.");
    }
  }

  async function handleToggleActive(routine: Routine) {
    try {
      setError("");

      await updateRoutine(userId, routine.id, {
        active: !routine.active,
      });

      setRoutines((current) =>
        current.map((item) =>
          item.id === routine.id
            ? {
                ...item,
                active: !item.active,
              }
            : item,
        ),
      );
    } catch (err) {
      console.error("Failed to update routine:", err);
      setError("Unable to update routine.");
    }
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-[var(--text-primary)]">
            My Routines
          </h2>

          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Create and manage your wellness routines.
          </p>
        </div>

        <button
          type="button"
          onClick={openCreateForm}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--accent-pink)] px-4 py-3 text-sm font-semibold text-white hover:opacity-90"
        >
          <Plus size={18} />
          Add Routine
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-[var(--danger-soft)] bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">
          {error}
        </div>
      )}

      {showForm && (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5 shadow-sm">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-[var(--text-primary)]">
                {editingId
                  ? "Edit Routine"
                  : "Create Routine"}
              </h3>
            </div>

            <button
              type="button"
              onClick={closeForm}
              className="rounded-lg p-2 text-[var(--text-muted)] hover:bg-[var(--surface-strong)]"
            >
              <X size={20} />
            </button>
          </div>

          <form
            onSubmit={handleSubmit}
            className="grid gap-4 md:grid-cols-2"
          >
            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">
                Routine Title
              </label>

              <input
                type="text"
                value={form.title}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
                placeholder="Morning Walk"
                className="w-full rounded-xl border border-[var(--border)] px-4 py-3 text-sm outline-none focus:border-[var(--border-strong)]"
              />
            </div>

            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">
                Description
              </label>

              <textarea
                value={form.description}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    description:
                      event.target.value,
                  }))
                }
                placeholder="30 minute morning walk"
                rows={3}
                className="w-full resize-none rounded-xl border border-[var(--border)] px-4 py-3 text-sm outline-none focus:border-[var(--border-strong)]"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">
                Frequency
              </label>

              <select
                value={form.frequency}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    frequency:
                      event.target.value as Routine["frequency"],
                  }))
                }
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3 text-sm"
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
                <option value="selectedDates">Selected Dates</option>
              </select>
            </div>

            {/* Weekly — multi weekday select */}
            {form.frequency === "weekly" && (
              <div className="md:col-span-2">
                <WeekdaySelect
                  selectedWeekdays={form.weekdays}
                  onChange={(weekdays) =>
                    setForm((current) => ({ ...current, weekdays }))
                  }
                />
              </div>
            )}

            {/* Monthly — multi day-of-month select */}
            {form.frequency === "monthly" && (
              <div className="md:col-span-2">
                <MonthDayMultiSelect
                  selectedDays={form.monthDays}
                  onChange={(monthDays) =>
                    setForm((current) => ({ ...current, monthDays }))
                  }
                />
              </div>
            )}

            {/* Yearly — multi month+day select */}
            {form.frequency === "yearly" && (
              <div className="md:col-span-2">
                <YearDateMultiSelect
                  selectedDates={form.yearDates}
                  onChange={(yearDates) =>
                    setForm((current) => ({ ...current, yearDates }))
                  }
                />
              </div>
            )}

            {/* Selected Dates — arbitrary date picker */}
            {form.frequency === "selectedDates" && (
              <div className="md:col-span-2">
                <label className="mb-2 block text-sm font-medium text-[var(--text-secondary)]">
                  Select Dates
                </label>

                <DateMultiSelect
                  selectedDates={form.selectedDates}
                  onChange={(dates) =>
                    setForm((current) => ({
                      ...current,
                      selectedDates: dates,
                    }))
                  }
                  minDate={form.startDate}
                />
              </div>
            )}

            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">
                Input Type
              </label>

              <select
                value={form.inputType}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    inputType:
                      event.target.value as Routine["inputType"],
                  }))
                }
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3 text-sm"
              >
                <option value="none">Yes / No</option>
                <option value="number">Number</option>
              </select>
            </div>

            {form.inputType === "number" && (
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">
                  Unit
                </label>

                <input
                  type="text"
                  value={form.unit}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      unit: event.target.value,
                    }))
                  }
                  placeholder="kg, ml, minutes..."
                  className="w-full rounded-xl border border-[var(--border)] px-4 py-3 text-sm"
                />
              </div>
            )}

            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">
                Start Date
              </label>

              <div className="relative">
                <CalendarDays
                  size={18}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-faint)]"
                />

                <input
                  type="date"
                  value={form.startDate}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      startDate:
                        event.target.value,
                    }))
                  }
                  className="w-full rounded-xl border border-[var(--border)] px-4 py-3 pl-10 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">
                End Date
              </label>

              <input
                type="date"
                value={form.endDate}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    endDate: event.target.value,
                  }))
                }
                className="w-full rounded-xl border border-[var(--border)] px-4 py-3 text-sm"
              />
            </div>

            <div className="flex items-center gap-3 md:col-span-2">
              <input
                id="routine-active"
                type="checkbox"
                checked={form.active}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    active: event.target.checked,
                  }))
                }
                className="h-4 w-4"
              />

              <label
                htmlFor="routine-active"
                className="text-sm font-medium text-[var(--text-secondary)]"
              >
                Active routine
              </label>
            </div>

            <div className="flex justify-end gap-3 md:col-span-2">
              <button
                type="button"
                onClick={closeForm}
                disabled={saving}
                className="rounded-xl border border-[var(--border)] px-5 py-3 text-sm font-semibold text-[var(--text-secondary)]"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent-pink)] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
              >
                {saving && (
                  <Loader2
                    size={17}
                    className="animate-spin"
                  />
                )}

                {editingId
                  ? "Update Routine"
                  : "Create Routine"}
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] py-16">
          <Loader2
            size={28}
            className="animate-spin text-[var(--text-muted)]"
          />
        </div>
      ) : routines.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--bg-elevated)] px-6 py-14 text-center">
          <CalendarDays
            size={36}
            className="mx-auto text-[var(--text-faint)]"
          />

          <h3 className="mt-4 font-semibold text-[var(--text-primary)]">
            No routines yet
          </h3>

          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Create your first wellness routine.
          </p>

          <button
            type="button"
            onClick={openCreateForm}
            className="mt-5 rounded-xl bg-[var(--accent-pink)] px-5 py-3 text-sm font-semibold text-white"
          >
            Create Routine
          </button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {routines.map((routine) => (
            <div
              key={routine.id}
              className="rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5 shadow-sm"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-[var(--text-primary)]">
                      {routine.title}
                    </h3>

                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                        routine.active
                          ? "bg-[var(--success-soft)] text-[var(--success)]"
                          : "bg-[var(--surface-strong)] text-[var(--text-muted)]"
                      }`}
                    >
                      {routine.active
                        ? "Active"
                        : "Inactive"}
                    </span>
                  </div>

                  {routine.description && (
                    <p className="mt-2 text-sm text-[var(--text-muted)]">
                      {routine.description}
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl bg-[var(--bg-elevated)] p-3">
                  <p className="text-xs text-[var(--text-faint)]">
                    Frequency
                  </p>

                  <p className="mt-1 font-semibold capitalize text-[var(--text-secondary)]">
                    {routine.frequency}
                  </p>

                  {routine.frequency === "weekly" &&
                    routine.schedule.weekdays &&
                    routine.schedule.weekdays.length > 0 && (
                      <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                        {routine.schedule.weekdays
                          .map((d) => ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d])
                          .join(", ")}
                      </p>
                    )}

                  {routine.frequency === "monthly" &&
                    routine.schedule.monthDays &&
                    routine.schedule.monthDays.length > 0 && (
                      <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                        Day {routine.schedule.monthDays.join(", ")}
                      </p>
                    )}

                  {routine.frequency === "yearly" &&
                    routine.schedule.yearDates &&
                    routine.schedule.yearDates.length > 0 && (
                      <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                        {routine.schedule.yearDates
                          .map((yd) =>
                            `${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][yd.month - 1]} ${yd.day}`
                          )
                          .join(", ")}
                      </p>
                    )}
                </div>

                <div className="rounded-xl bg-[var(--bg-elevated)] p-3">
                  <p className="text-xs text-[var(--text-faint)]">
                    Input
                  </p>

                  <p className="mt-1 font-semibold text-[var(--text-secondary)]">
                    {routine.inputType === "number"
                      ? routine.unit || "Number"
                      : "Yes / No"}
                  </p>
                </div>

                <div className="rounded-xl bg-[var(--bg-elevated)] p-3">
                  <p className="text-xs text-[var(--text-faint)]">
                    Start Date
                  </p>

                  <p className="mt-1 font-semibold text-[var(--text-secondary)]">
                    {routine.startDate
                      .toDate()
                      .toLocaleDateString()}
                  </p>
                </div>

                <div className="rounded-xl bg-[var(--bg-elevated)] p-3">
                  <p className="text-xs text-[var(--text-faint)]">
                    End Date
                  </p>

                  <p className="mt-1 font-semibold text-[var(--text-secondary)]">
                    {routine.endDate
                      ? routine.endDate
                          .toDate()
                          .toLocaleDateString()
                      : "No end date"}
                  </p>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">

                <button
                  type="button"
                  onClick={() => setLoggingRoutine(routine)}
                  className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent-pink)] px-3 py-2 text-xs font-semibold text-white"
                >
                  <Check size={15} />
                  Log Today
                </button>
                <button
                  type="button"
                  onClick={() =>
                    openEditForm(routine)
                  }
                  className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-semibold text-[var(--text-secondary)]"
                >
                  <Pencil size={15} />
                  Edit
                </button>

                <button
                  type="button"
                  onClick={() =>
                    void handleToggleActive(routine)
                  }
                  className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-semibold text-[var(--text-secondary)]"
                >
                  {routine.active ? (
                    <>
                      <CircleOff size={15} />
                      Disable
                    </>
                  ) : (
                    <>
                      <Check size={15} />
                      Enable
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() =>
                    void handleDelete(routine.id)
                  }
                  className="inline-flex items-center gap-2 rounded-lg border border-[var(--danger-soft)] px-3 py-2 text-xs font-semibold text-[var(--danger)]"
                >
                  <Trash2 size={15} />
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {loggingRoutine && (
  <RoutineLogPanel
    userId={userId}
    routine={loggingRoutine}
    date={new Date()}
    onSaved={() => {
      setLoggingRoutine(null);
    }}
  />
)}
    </section>
  );
}