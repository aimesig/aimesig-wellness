import type { Routine } from "../types/routine";

export interface DateParts {
  year: number;
  month: number;
  day: number;
  weekday: number;
}

/**
 * Converts a Date into local calendar parts.
 *
 * weekday:
 * 0 = Sunday
 * 1 = Monday
 * ...
 * 6 = Saturday
 */
function getDateParts(date: Date): DateParts {
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
    weekday: date.getDay(),
  };
}

/**
 * Converts a Firestore Timestamp to a JavaScript Date.
 */
function timestampToDate(
  timestamp: Routine["startDate"],
): Date {
  return timestamp.toDate();
}

/**
 * Returns the number of calendar days between two dates.
 *
 * Time-of-day is ignored.
 */
function daysBetween(
  start: Date,
  end: Date,
): number {
  const startDate = new Date(
    start.getFullYear(),
    start.getMonth(),
    start.getDate(),
  );

  const endDate = new Date(
    end.getFullYear(),
    end.getMonth(),
    end.getDate(),
  );

  const millisecondsPerDay = 24 * 60 * 60 * 1000;

  return Math.floor(
    (endDate.getTime() - startDate.getTime()) /
      millisecondsPerDay,
  );
}

/**
 * Checks whether a routine has started by the selected date.
 */
function isAfterStartDate(
  routine: Routine,
  date: Date,
): boolean {
  const startDate = timestampToDate(routine.startDate);

  return (
    daysBetween(startDate, date) >= 0
  );
}

/**
 * Checks whether a routine has already ended.
 */
function isBeforeEndDate(
  routine: Routine,
  date: Date,
): boolean {
  if (!routine.endDate) {
    return true;
  }

  const endDate = timestampToDate(routine.endDate);

  return daysBetween(date, endDate) >= 0;
}

/**
 * Checks whether an alternate-day routine occurs
 * on the selected date.
 *
 * Example:
 *
 * Start date: Monday
 *
 * Monday  -> true
 * Tuesday -> false
 * Wednesday -> true
 * Thursday -> false
 */
function matchesAlternateDay(
  routine: Routine,
  date: Date,
): boolean {
  const startDate = timestampToDate(routine.startDate);

  const difference = daysBetween(startDate, date);

  return difference % 2 === 0;
}

/**
 * Checks daily recurrence.
 */
function matchesDaily(
  routine: Routine,
  date: Date,
): boolean {
  if (routine.alternateDay) {
    return matchesAlternateDay(routine, date);
  }

  return true;
}

/**
 * Checks weekly recurrence.
 *
 * schedule.weekdays contains JavaScript weekday numbers:
 *
 * Sunday = 0
 * Monday = 1
 * Tuesday = 2
 * Wednesday = 3
 * Thursday = 4
 * Friday = 5
 * Saturday = 6
 */
function matchesWeekly(
  routine: Routine,
  dateParts: DateParts,
): boolean {
  const weekdays = routine.schedule.weekdays;

  if (!weekdays || weekdays.length === 0) {
    return dateParts.weekday ===
      timestampToDate(routine.startDate).getDay();
  }

  return weekdays.includes(dateParts.weekday);
}

/**
 * Checks monthly recurrence.
 *
 * schedule.monthDay:
 * 1 = first day of month
 * 15 = fifteenth day
 * etc.
 */
function matchesMonthly(
  routine: Routine,
  dateParts: DateParts,
): boolean {
  const { monthDays, monthDay } = routine.schedule;

  // Multi-select: array of days
  if (monthDays && monthDays.length > 0) {
    return monthDays.includes(dateParts.day);
  }

  // Legacy single day
  if (monthDay !== undefined && monthDay !== null) {
    return dateParts.day === monthDay;
  }

  return (
    dateParts.day ===
    timestampToDate(routine.startDate).getDate()
  );
}

/**
 * Checks yearly recurrence.
 *
 * schedule.yearMonth:
 * 1 = January
 * ...
 * 12 = December
 *
 * schedule.yearDay:
 * 1 = first day of month
 * ...
 */
function matchesYearly(
  routine: Routine,
  dateParts: DateParts,
): boolean {
  const { yearDates, yearMonth, yearDay } = routine.schedule;

  // Multi-select: array of {month, day} pairs
  if (yearDates && yearDates.length > 0) {
    return yearDates.some(
      (yd) => yd.month === dateParts.month && yd.day === dateParts.day,
    );
  }

  // Legacy single date
  const startDate = timestampToDate(routine.startDate);
  const resolvedMonth = yearMonth ?? startDate.getMonth() + 1;
  const resolvedDay = yearDay ?? startDate.getDate();

  return (
    dateParts.month === resolvedMonth &&
    dateParts.day === resolvedDay
  );
}

/**
 * Checks selected-date recurrence.
 */
function matchesSelectedDates(
  routine: Routine,
  date: Date,
): boolean {
  const selectedDates =
    routine.schedule.selectedDates;

  if (
    !selectedDates ||
    selectedDates.length === 0
  ) {
    return false;
  }

  const targetYear = date.getFullYear();
  const targetMonth = date.getMonth();
  const targetDay = date.getDate();

  return selectedDates.some(
    (timestamp) => {
      const selectedDate = timestamp.toDate();

      return (
        selectedDate.getFullYear() === targetYear &&
        selectedDate.getMonth() === targetMonth &&
        selectedDate.getDate() === targetDay
      );
    },
  );
}

/**
 * Main recurrence function.
 *
 * Returns true when the routine should appear
 * on the supplied calendar date.
 */
export function isRoutineScheduledForDate(
  routine: Routine,
  date: Date,
): boolean {
  if (!routine.active) {
    return false;
  }

  if (!isAfterStartDate(routine, date)) {
    return false;
  }

  if (!isBeforeEndDate(routine, date)) {
    return false;
  }

  const dateParts = getDateParts(date);

  switch (routine.frequency) {
    case "daily":
      return matchesDaily(routine, date);

    case "weekly":
      return matchesWeekly(
        routine,
        dateParts,
      );

    case "monthly":
      return matchesMonthly(
        routine,
        dateParts,
      );

    case "yearly":
      return matchesYearly(
        routine,
        dateParts,
      );

    case "selectedDates":
      return matchesSelectedDates(
        routine,
        date,
      );

    default:
      return false;
  }
}

/**
 * Returns all routines scheduled for a particular date.
 */
export function getRoutinesForDate(
  routines: Routine[],
  date: Date,
): Routine[] {
  return routines.filter((routine) =>
    isRoutineScheduledForDate(
      routine,
      date,
    ),
  );
}