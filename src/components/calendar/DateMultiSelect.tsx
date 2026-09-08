import { useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Check,
} from "lucide-react";
import { Timestamp } from "firebase/firestore";

interface DateMultiSelectProps {
  selectedDates: Timestamp[];
  onChange: (dates: Timestamp[]) => void;
  minDate?: string;
}

function dateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function timestampToKey(timestamp: Timestamp): string {
  return dateKey(timestamp.toDate());
}

function keyToDate(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);

  return new Date(year, month - 1, day);
}

function isSameDay(
  first: Date,
  second: Date,
): boolean {
  return (
    first.getFullYear() === second.getFullYear() &&
    first.getMonth() === second.getMonth() &&
    first.getDate() === second.getDate()
  );
}

export function DateMultiSelect({
  selectedDates,
  onChange,
  minDate,
}: DateMultiSelectProps) {
  const today = new Date();

  const [currentMonth, setCurrentMonth] = useState(
    new Date(
      today.getFullYear(),
      today.getMonth(),
      1,
    ),
  );

  const selectedKeys = useMemo(
    () =>
      new Set(
        selectedDates.map(timestampToKey),
      ),
    [selectedDates],
  );

  const firstDay = new Date(
    currentMonth.getFullYear(),
    currentMonth.getMonth(),
    1,
  );

  const firstWeekday = firstDay.getDay();

  const daysInMonth = new Date(
    currentMonth.getFullYear(),
    currentMonth.getMonth() + 1,
    0,
  ).getDate();

  const calendarDays: Array<Date | null> = [];

  for (let index = 0; index < firstWeekday; index += 1) {
    calendarDays.push(null);
  }

  for (
    let day = 1;
    day <= daysInMonth;
    day += 1
  ) {
    calendarDays.push(
      new Date(
        currentMonth.getFullYear(),
        currentMonth.getMonth(),
        day,
      ),
    );
  }

  function isBeforeMinimum(date: Date): boolean {
    if (!minDate) {
      return false;
    }

    const minimum = keyToDate(minDate);

    return (
      date.getFullYear() < minimum.getFullYear() ||
      (
        date.getFullYear() === minimum.getFullYear() &&
        date.getMonth() < minimum.getMonth()
      ) ||
      (
        date.getFullYear() === minimum.getFullYear() &&
        date.getMonth() === minimum.getMonth() &&
        date.getDate() < minimum.getDate()
      )
    );
  }

  function toggleDate(date: Date) {
    if (isBeforeMinimum(date)) {
      return;
    }

    const key = dateKey(date);

    if (selectedKeys.has(key)) {
      onChange(
        selectedDates.filter(
          (timestamp) =>
            timestampToKey(timestamp) !== key,
        ),
      );

      return;
    }

    const updated = [
      ...selectedDates,
      Timestamp.fromDate(
        new Date(
          date.getFullYear(),
          date.getMonth(),
          date.getDate(),
        ),
      ),
    ];

    updated.sort(
      (first, second) =>
        first.toMillis() - second.toMillis(),
    );

    onChange(updated);
  }

  function previousMonth() {
    setCurrentMonth(
      new Date(
        currentMonth.getFullYear(),
        currentMonth.getMonth() - 1,
        1,
      ),
    );
  }

  function nextMonth() {
    setCurrentMonth(
      new Date(
        currentMonth.getFullYear(),
        currentMonth.getMonth() + 1,
        1,
      ),
    );
  }

  function goToToday() {
    setCurrentMonth(
      new Date(
        today.getFullYear(),
        today.getMonth(),
        1,
      ),
    );
  }

  const monthLabel = currentMonth.toLocaleDateString(
    undefined,
    {
      month: "long",
      year: "numeric",
    },
  );

  const selectedCount = selectedDates.length;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={previousMonth}
          className="rounded-xl p-2 text-slate-600 hover:bg-slate-100"
          aria-label="Previous month"
        >
          <ChevronLeft size={20} />
        </button>

        <div className="text-center">
          <h3 className="font-bold text-slate-900">
            {monthLabel}
          </h3>

          <button
            type="button"
            onClick={goToToday}
            className="mt-1 text-xs font-semibold text-emerald-700 hover:underline"
          >
            Today
          </button>
        </div>

        <button
          type="button"
          onClick={nextMonth}
          className="rounded-xl p-2 text-slate-600 hover:bg-slate-100"
          aria-label="Next month"
        >
          <ChevronRight size={20} />
        </button>
      </div>

      <div className="mt-5 grid grid-cols-7 gap-1 text-center">
        {[
          "Sun",
          "Mon",
          "Tue",
          "Wed",
          "Thu",
          "Fri",
          "Sat",
        ].map((day) => (
          <div
            key={day}
            className="py-2 text-xs font-semibold text-slate-400"
          >
            {day}
          </div>
        ))}

        {calendarDays.map((date, index) => {
          if (!date) {
            return (
              <div
                key={`empty-${index}`}
                className="aspect-square"
              />
            );
          }

          const key = dateKey(date);
          const selected = selectedKeys.has(key);
          const disabled = isBeforeMinimum(date);
          const todayDate = isSameDay(date, today);

          return (
            <button
              key={key}
              type="button"
              disabled={disabled}
              onClick={() => toggleDate(date)}
              className={`relative aspect-square rounded-xl text-sm font-medium transition ${
                disabled
                  ? "cursor-not-allowed text-slate-300"
                  : selected
                    ? "bg-slate-900 text-white"
                    : "text-slate-700 hover:bg-slate-100"
              }`}
            >
              {date.getDate()}

              {todayDate && !selected && (
                <span className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-emerald-600" />
              )}

              {selected && (
                <Check
                  size={12}
                  className="absolute right-1 top-1"
                />
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
        <span className="text-sm text-slate-600">
          Selected dates
        </span>

        <span className="font-bold text-slate-900">
          {selectedCount}
        </span>
      </div>
    </div>
  );
}
