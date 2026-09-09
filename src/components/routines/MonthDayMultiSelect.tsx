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
      <label className="mb-2 block text-sm font-medium text-slate-700">
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
                  ? "bg-slate-900 text-white"
                  : "border border-slate-200 text-slate-700 hover:bg-slate-100"
              }`}
            >
              {day}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
        <span className="text-sm text-slate-600">Selected days</span>
        <span className="font-bold text-slate-900">{selectedDays.length}</span>
      </div>

      {selectedDays.length === 0 && (
        <p className="mt-1.5 text-xs text-slate-400">
          Select at least one day, or leave empty to repeat on the start date's day.
        </p>
      )}
    </div>
  );
}
