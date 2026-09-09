interface MonthDayMultiSelectProps {
  selectedDays: number[]; // 1–31
  onChange: (days: number[]) => void;
}

export function MonthDayMultiSelect({
  selectedDays,
  onChange,
}: MonthDayMultiSelectProps) {
  function toggle(day: number) {
    if (selectedDays.includes(day)) {
      onChange(selectedDays.filter((d) => d !== day));
    } else {
      onChange([...selectedDays, day].sort((a, b) => a - b));
    }
  }

  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-[var(--text-secondary)]">
        Repeat on days of month
      </label>

      <div className="grid grid-cols-7 gap-1.5">
        {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => {
          const selected = selectedDays.includes(day);

          return (
            <button
              key={day}
              type="button"
              onClick={() => toggle(day)}
              className={`aspect-square rounded-xl text-sm font-medium transition ${
                selected
                  ? "bg-[var(--accent-pink)] text-white"
                  : "border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--surface-strong)]"
              }`}
            >
              {day}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex items-center justify-between rounded-xl bg-[var(--bg-elevated)] px-3 py-2">
        <span className="text-sm text-[var(--text-secondary)]">Selected days</span>
        <span className="font-bold text-[var(--text-primary)]">{selectedDays.length}</span>
      </div>

      {selectedDays.length === 0 && (
        <p className="mt-1.5 text-xs text-[var(--text-faint)]">
          Select at least one day, or leave empty to repeat on the start date's day.
        </p>
      )}
    </div>
  );
}
