import { useState } from "react";
import { Plus, X } from "lucide-react";
import type { YearDate } from "../../types/routine";

interface YearDateMultiSelectProps {
  selectedDates: YearDate[];
  onChange: (dates: YearDate[]) => void;
}

const MONTHS = [
  "January", "February", "March", "April",
  "May", "June", "July", "August",
  "September", "October", "November", "December",
];

function daysInMonth(month: number): number {
  // Use a leap year (2000) so Feb has 29 days as the max
  return new Date(2000, month, 0).getDate();
}

function yearDateKey(yd: YearDate): string {
  return `${yd.month}-${yd.day}`;
}

export function YearDateMultiSelect({
  selectedDates,
  onChange,
}: YearDateMultiSelectProps) {
  const [pickMonth, setPickMonth] = useState(1);
  const [pickDay, setPickDay] = useState(1);

  const selectedKeys = new Set(selectedDates.map(yearDateKey));

  function addDate() {
    const key = yearDateKey({ month: pickMonth, day: pickDay });

    if (selectedKeys.has(key)) {
      return; // already present
    }

    const updated = [
      ...selectedDates,
      { month: pickMonth, day: pickDay },
    ].sort((a, b) => a.month !== b.month ? a.month - b.month : a.day - b.day);

    onChange(updated);
  }

  function removeDate(index: number) {
    onChange(selectedDates.filter((_, i) => i !== index));
  }

  const maxDay = daysInMonth(pickMonth);
  const clampedDay = Math.min(pickDay, maxDay);

  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-[var(--text-secondary)]">
        Repeat on dates each year
      </label>

      {/* Picker row */}
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <label className="mb-1 block text-xs text-[var(--text-muted)]">Month</label>
          <select
            value={pickMonth}
            onChange={(e) => {
              const m = Number(e.target.value);
              setPickMonth(m);
              setPickDay((d) => Math.min(d, daysInMonth(m)));
            }}
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2.5 text-sm"
          >
            {MONTHS.map((name, i) => (
              <option key={i + 1} value={i + 1}>
                {name}
              </option>
            ))}
          </select>
        </div>

        <div className="w-24">
          <label className="mb-1 block text-xs text-[var(--text-muted)]">Day</label>
          <select
            value={clampedDay}
            onChange={(e) => setPickDay(Number(e.target.value))}
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2.5 text-sm"
          >
            {Array.from({ length: maxDay }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={addDate}
          className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--accent-pink)] px-3 py-2.5 text-sm font-semibold text-white hover:opacity-90"
        >
          <Plus size={16} />
          Add
        </button>
      </div>

      {/* Selected list */}
      {selectedDates.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {selectedDates.map((yd, i) => (
            <span
              key={yearDateKey(yd)}
              className="inline-flex items-center gap-1.5 rounded-full bg-[var(--accent-pink)] px-3 py-1 text-xs font-semibold text-white"
            >
              {MONTHS[yd.month - 1]} {yd.day}
              <button
                type="button"
                onClick={() => removeDate(i)}
                className="ml-0.5 rounded-full hover:text-[var(--text-faint)]"
                aria-label={`Remove ${MONTHS[yd.month - 1]} ${yd.day}`}
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between rounded-xl bg-[var(--bg-elevated)] px-3 py-2">
        <span className="text-sm text-[var(--text-secondary)]">Selected dates</span>
        <span className="font-bold text-[var(--text-primary)]">{selectedDates.length}</span>
      </div>

      {selectedDates.length === 0 && (
        <p className="mt-1.5 text-xs text-[var(--text-faint)]">
          Pick a month and day, then press Add. Leave empty to repeat on the start date.
        </p>
      )}
    </div>
  );
}
