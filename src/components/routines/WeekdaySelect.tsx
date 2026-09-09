interface WeekdaySelectProps {
  selectedWeekdays: number[]; // 0=Sun … 6=Sat
  onChange: (weekdays: number[]) => void;
}

const WEEKDAYS = [
  { label: "Sun", value: 0 },
  { label: "Mon", value: 1 },
  { label: "Tue", value: 2 },
  { label: "Wed", value: 3 },
  { label: "Thu", value: 4 },
  { label: "Fri", value: 5 },
  { label: "Sat", value: 6 },
];

export function WeekdaySelect({
  selectedWeekdays,
  onChange,
}: WeekdaySelectProps) {
  function toggle(value: number) {
    if (selectedWeekdays.includes(value)) {
      onChange(selectedWeekdays.filter((d) => d !== value));
    } else {
      onChange([...selectedWeekdays, value].sort((a, b) => a - b));
    }
  }

  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-[var(--text-secondary)]">
        Repeat on
      </label>

      <div className="flex flex-wrap gap-2">
        {WEEKDAYS.map(({ label, value }) => {
          const selected = selectedWeekdays.includes(value);

          return (
            <button
              key={value}
              type="button"
              onClick={() => toggle(value)}
              className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
                selected
                  ? "bg-[var(--accent-pink)] text-white"
                  : "border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--surface-strong)]"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {selectedWeekdays.length === 0 && (
        <p className="mt-1.5 text-xs text-[var(--text-faint)]">
          Select at least one day, or leave empty to repeat on the start day.
        </p>
      )}
    </div>
  );
}
