import { useEffect, useState } from "react";
import {
  CalendarDays,
  Check,
  CircleOff,
  GripVertical,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { Timestamp } from "firebase/firestore";

import type { Routine, RoutineInputField, YearDate } from "../../types/routine";
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
  inputFields: RoutineInputField[];
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
  inputFields: [],
  startDate: new Date().toISOString().split("T")[0],
  endDate: "",
  active: true,
  selectedDates: [],
  weekdays: [],
  monthDays: [],
  yearDates: [],
};

/** Generate a simple slug-style key from a label, made unique within existing keys. */
function labelToKey(label: string, existingKeys: string[]): string {
  const base = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "") || "field";

  if (!existingKeys.includes(base)) return base;

  let n = 2;
  while (existingKeys.includes(`${base}_${n}`)) n++;
  return `${base}_${n}`;
}

export function RoutineManager({ userId }: RoutineManagerProps) {
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [form, setForm] = useState<RoutineForm>(emptyForm);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [loggingRoutine, setLoggingRoutine] = useState<Routine | null>(null);

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
      inputFields: routine.inputFields ?? [],
      startDate: routine.startDate.toDate().toISOString().split("T")[0],
      endDate: routine.endDate
        ? routine.endDate.toDate().toISOString().split("T")[0]
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
    if (saving) return;
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
    setError("");
  }

  // ── InputFields helpers ─────────────────────────────────────────────────

  function addInputField() {
    const newKey = labelToKey(
      "Field",
      form.inputFields.map((f) => f.key),
    );
    setForm((prev) => ({
      ...prev,
      inputFields: [
        ...prev.inputFields,
        { key: newKey, label: "", unit: "" },
      ],
    }));
  }

  function updateInputField(
    index: number,
    patch: Partial<RoutineInputField>,
  ) {
    setForm((prev) => {
      const fields = prev.inputFields.map((f, i) =>
        i === index ? { ...f, ...patch } : f,
      );
      return { ...prev, inputFields: fields };
    });
  }

  function finaliseFieldKey(index: number) {
    // When a label loses focus, auto-derive the key if it's still the
    // default slug or empty, keeping it unique among siblings.
    setForm((prev) => {
      const field = prev.inputFields[index];
      if (!field) return prev;
      const otherKeys = prev.inputFields
        .filter((_, i) => i !== index)
        .map((f) => f.key);
      const derivedKey = labelToKey(field.label || "field", otherKeys);
      const fields = prev.inputFields.map((f, i) =>
        i === index ? { ...f, key: derivedKey } : f,
      );
      return { ...prev, inputFields: fields };
    });
  }

  function removeInputField(index: number) {
    setForm((prev) => ({
      ...prev,
      inputFields: prev.inputFields.filter((_, i) => i !== index),
    }));
  }

  // ── Form submit ──────────────────────────────────────────────────────────

  function buildRoutineInput(): RoutineInput {
    const startDate = Timestamp.fromDate(
      new Date(`${form.startDate}T00:00:00`),
    );

    const endDate = form.endDate
      ? Timestamp.fromDate(new Date(`${form.endDate}T23:59:59`))
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

    // Normalise fields: trim strings, ensure unique non-empty keys.
    const inputFields =
      form.inputType === "multi"
        ? form.inputFields.map((f) => ({
            key: f.key.trim() || "field",
            label: f.label.trim(),
            unit: f.unit.trim(),
          }))
        : [];

    return {
      title: form.title.trim(),
      description: form.description.trim(),
      frequency: form.frequency,
      schedule,
      alternateDay: false,
      inputType: form.inputType,
      unit: form.unit.trim(),
      inputFields,
      startDate,
      endDate,
      active: form.active,
    };
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!form.title.trim()) {
      setError("Routine title is required.");
      return;
    }

    if (!form.startDate) {
      setError("Start date is required.");
      return;
    }

    if (form.endDate && form.endDate < form.startDate) {
      setError("End date cannot be before start date.");
      return;
    }

    if (form.frequency === "selectedDates" && form.selectedDates.length === 0) {
      setError("Please select at least one date.");
      return;
    }

    if (form.inputType === "multi") {
      if (form.inputFields.length === 0) {
        setError("Add at least one input field, or switch to Yes / No.");
        return;
      }
      const labels = form.inputFields.map((f) => f.label.trim());
      if (labels.some((l) => !l)) {
        setError("All input fields must have a label.");
        return;
      }
      const keys = form.inputFields.map((f) => f.key.trim());
      if (new Set(keys).size !== keys.length) {
        setError("Input field keys must be unique.");
        return;
      }
    }

    try {
      setSaving(true);
      setError("");

      const routine = buildRoutineInput();

      if (editingId) {
        await updateRoutine(userId, editingId, routine);
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
    if (!confirmed) return;

    try {
      setError("");
      await deleteRoutine(userId, routineId);
      setRoutines((current) =>
        current.filter((routine) => routine.id !== routineId),
      );
    } catch (err) {
      console.error("Failed to delete routine:", err);
      setError("Unable to delete routine.");
    }
  }

  async function handleToggleActive(routine: Routine) {
    try {
      setError("");
      await updateRoutine(userId, routine.id, { active: !routine.active });
      setRoutines((current) =>
        current.map((item) =>
          item.id === routine.id ? { ...item, active: !item.active } : item,
        ),
      );
    } catch (err) {
      console.error("Failed to update routine:", err);
      setError("Unable to update routine.");
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

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
            <h3 className="text-lg font-bold text-[var(--text-primary)]">
              {editingId ? "Edit Routine" : "Create Routine"}
            </h3>

            <button
              type="button"
              onClick={closeForm}
              className="rounded-lg p-2 text-[var(--text-muted)] hover:bg-[var(--surface-strong)]"
            >
              <X size={20} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2">
            {/* Title */}
            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">
                Routine Title
              </label>
              <input
                type="text"
                value={form.title}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, title: e.target.value }))
                }
                placeholder="Morning Walk"
                className="w-full rounded-xl border border-[var(--border)] px-4 py-3 text-sm outline-none focus:border-[var(--border-strong)]"
              />
            </div>

            {/* Description */}
            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">
                Description
              </label>
              <textarea
                value={form.description}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, description: e.target.value }))
                }
                placeholder="30 minute morning walk"
                rows={3}
                className="w-full resize-none rounded-xl border border-[var(--border)] px-4 py-3 text-sm outline-none focus:border-[var(--border-strong)]"
              />
            </div>

            {/* Frequency */}
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">
                Frequency
              </label>
              <select
                value={form.frequency}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    frequency: e.target.value as Routine["frequency"],
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

            {/* Weekly */}
            {form.frequency === "weekly" && (
              <div className="md:col-span-2">
                <WeekdaySelect
                  selectedWeekdays={form.weekdays}
                  onChange={(weekdays) =>
                    setForm((prev) => ({ ...prev, weekdays }))
                  }
                />
              </div>
            )}

            {/* Monthly */}
            {form.frequency === "monthly" && (
              <div className="md:col-span-2">
                <MonthDayMultiSelect
                  selectedDays={form.monthDays}
                  onChange={(monthDays) =>
                    setForm((prev) => ({ ...prev, monthDays }))
                  }
                />
              </div>
            )}

            {/* Yearly */}
            {form.frequency === "yearly" && (
              <div className="md:col-span-2">
                <YearDateMultiSelect
                  selectedDates={form.yearDates}
                  onChange={(yearDates) =>
                    setForm((prev) => ({ ...prev, yearDates }))
                  }
                />
              </div>
            )}

            {/* Selected Dates */}
            {form.frequency === "selectedDates" && (
              <div className="md:col-span-2">
                <label className="mb-2 block text-sm font-medium text-[var(--text-secondary)]">
                  Select Dates
                </label>
                <DateMultiSelect
                  selectedDates={form.selectedDates}
                  onChange={(dates) =>
                    setForm((prev) => ({ ...prev, selectedDates: dates }))
                  }
                  minDate={form.startDate}
                />
              </div>
            )}

            {/* Input Type */}
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">
                Input Type
              </label>
              <select
                value={form.inputType}
                onChange={(e) => {
                  const inputType = e.target.value as Routine["inputType"];
                  setForm((prev) => ({
                    ...prev,
                    inputType,
                    // Seed one empty field when switching to multi
                    inputFields:
                      inputType === "multi" && prev.inputFields.length === 0
                        ? [{ key: "field_1", label: "", unit: "" }]
                        : prev.inputFields,
                  }));
                }}
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3 text-sm"
              >
                <option value="none">Yes / No</option>
                <option value="multi">Multiple Fields</option>
              </select>
            </div>

            {/* ── Dynamic named input fields ── */}
            {form.inputType === "multi" && (
              <div className="md:col-span-2 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-[var(--text-secondary)]">
                    Input Fields
                  </label>
                  <button
                    type="button"
                    onClick={addInputField}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-strong)]"
                  >
                    <Plus size={13} />
                    Add Field
                  </button>
                </div>

                {form.inputFields.length === 0 && (
                  <p className="rounded-xl border border-dashed border-[var(--border)] px-4 py-4 text-center text-sm text-[var(--text-muted)]">
                    No fields yet. Click "Add Field" to add one.
                  </p>
                )}

                {form.inputFields.map((field, index) => (
                  <div
                    key={index}
                    className="grid grid-cols-[auto_1fr_1fr_auto] items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-subtle,var(--bg-elevated))] px-3 py-3"
                  >
                    {/* Drag handle (decorative — can wire up dnd-kit later) */}
                    <GripVertical
                      size={16}
                      className="text-[var(--text-faint)] cursor-grab"
                    />

                    {/* Label */}
                    <div>
                      <label className="mb-0.5 block text-xs text-[var(--text-faint)]">
                        Label
                      </label>
                      <input
                        type="text"
                        value={field.label}
                        onChange={(e) =>
                          updateInputField(index, { label: e.target.value })
                        }
                        onBlur={() => finaliseFieldKey(index)}
                        placeholder="Consume"
                        className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-[var(--border-strong)]"
                      />
                    </div>

                    {/* Unit */}
                    <div>
                      <label className="mb-0.5 block text-xs text-[var(--text-faint)]">
                        Unit
                      </label>
                      <input
                        type="text"
                        value={field.unit}
                        onChange={(e) =>
                          updateInputField(index, { unit: e.target.value })
                        }
                        placeholder="litres"
                        className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-[var(--border-strong)]"
                      />
                    </div>

                    {/* Remove */}
                    <button
                      type="button"
                      onClick={() => removeInputField(index)}
                      className="rounded-lg p-1.5 text-[var(--danger)] hover:bg-[var(--danger-soft)]"
                      title="Remove field"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}

                <p className="text-xs text-[var(--text-faint)]">
                  Each field gets its own number input when logging. Unit is
                  shown as a suffix (e.g. "2.5 litres").
                </p>
              </div>
            )}

            {/* Start Date */}
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
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, startDate: e.target.value }))
                  }
                  className="w-full rounded-xl border border-[var(--border)] px-4 py-3 pl-10 text-sm"
                />
              </div>
            </div>

            {/* End Date */}
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">
                End Date
              </label>
              <input
                type="date"
                value={form.endDate}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, endDate: e.target.value }))
                }
                className="w-full rounded-xl border border-[var(--border)] px-4 py-3 text-sm"
              />
            </div>

            {/* Active */}
            <div className="flex items-center gap-3 md:col-span-2">
              <input
                id="routine-active"
                type="checkbox"
                checked={form.active}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, active: e.target.checked }))
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

            {/* Actions */}
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
                {saving && <Loader2 size={17} className="animate-spin" />}
                {editingId ? "Update Routine" : "Create Routine"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Routine list */}
      {loading ? (
        <div className="flex justify-center rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] py-16">
          <Loader2 size={28} className="animate-spin text-[var(--text-muted)]" />
        </div>
      ) : routines.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--bg-elevated)] px-6 py-14 text-center">
          <CalendarDays size={36} className="mx-auto text-[var(--text-faint)]" />
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
                      {routine.active ? "Active" : "Inactive"}
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
                  <p className="text-xs text-[var(--text-faint)]">Frequency</p>
                  <p className="mt-1 font-semibold capitalize text-[var(--text-secondary)]">
                    {routine.frequency}
                  </p>
                  {routine.frequency === "weekly" &&
                    routine.schedule.weekdays &&
                    routine.schedule.weekdays.length > 0 && (
                      <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                        {routine.schedule.weekdays
                          .map(
                            (d) =>
                              ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d],
                          )
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
                          .map(
                            (yd) =>
                              `${
                                [
                                  "Jan","Feb","Mar","Apr","May","Jun",
                                  "Jul","Aug","Sep","Oct","Nov","Dec",
                                ][yd.month - 1]
                              } ${yd.day}`,
                          )
                          .join(", ")}
                      </p>
                    )}
                </div>

                <div className="rounded-xl bg-[var(--bg-elevated)] p-3">
                  <p className="text-xs text-[var(--text-faint)]">Input</p>
                  {routine.inputType === "multi" &&
                  routine.inputFields?.length > 0 ? (
                    <ul className="mt-1 space-y-0.5">
                      {routine.inputFields.map((f) => (
                        <li
                          key={f.key}
                          className="text-xs font-medium text-[var(--text-secondary)]"
                        >
                          {f.label || f.key}
                          {f.unit && (
                            <span className="ml-1 text-[var(--text-faint)]">
                              ({f.unit})
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 font-semibold text-[var(--text-secondary)]">
                      {routine.inputType === "number"
                        ? routine.unit || "Number"
                        : "Yes / No"}
                    </p>
                  )}
                </div>

                <div className="rounded-xl bg-[var(--bg-elevated)] p-3">
                  <p className="text-xs text-[var(--text-faint)]">Start Date</p>
                  <p className="mt-1 font-semibold text-[var(--text-secondary)]">
                    {routine.startDate.toDate().toLocaleDateString()}
                  </p>
                </div>

                <div className="rounded-xl bg-[var(--bg-elevated)] p-3">
                  <p className="text-xs text-[var(--text-faint)]">End Date</p>
                  <p className="mt-1 font-semibold text-[var(--text-secondary)]">
                    {routine.endDate
                      ? routine.endDate.toDate().toLocaleDateString()
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
                  onClick={() => openEditForm(routine)}
                  className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-semibold text-[var(--text-secondary)]"
                >
                  <Pencil size={15} />
                  Edit
                </button>

                <button
                  type="button"
                  onClick={() => void handleToggleActive(routine)}
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
                  onClick={() => void handleDelete(routine.id)}
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
          onSaved={() => setLoggingRoutine(null)}
        />
      )}
    </section>
  );
}
