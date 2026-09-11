import type { Timestamp } from "firebase/firestore";

export type RoutineFrequency =
  | "daily"
  | "weekly"
  | "monthly"
  | "yearly"
  | "selectedDates";

/** A single named numeric field on a routine (e.g. { key: "consume", label: "Consume", unit: "litres" }). */
export interface RoutineInputField {
  /** Machine key — unique within the routine, used as the Firestore map key in logs. */
  key: string;
  /** Human-readable label shown in the UI. */
  label: string;
  /** Unit string displayed alongside the input, e.g. "litres", "sips". */
  unit: string;
}

/**
 * "none"  → Yes / No only (no numeric fields)
 * "multi" → One or more named numeric fields (replaces the old "number" type)
 *
 * The old "number" type is kept as a union member so existing Firestore docs
 * that still carry inputType:"number" continue to render correctly.
 */
export type RoutineInputType = "none" | "number" | "multi";

export type RoutineStatus = "pending" | "yes" | "no";

export interface YearDate {
  month: number; // 1–12
  day: number;   // 1–31
}

export interface RoutineSchedule {
  weekdays?: number[];
  monthDay?: number;
  monthDays?: number[];   // multi-select for monthly
  yearMonth?: number;
  yearDay?: number;
  yearDates?: YearDate[]; // multi-select for yearly
  selectedDates?: Timestamp[];
}

export interface Routine {
  id: string;
  title: string;
  description: string;
  frequency: RoutineFrequency;
  schedule: RoutineSchedule;
  alternateDay: boolean;
  /**
   * "none"   → Yes / No only
   * "multi"  → named numeric fields defined by `inputFields`
   * "number" → legacy single-value (read-only; new routines use "multi")
   */
  inputType: RoutineInputType;
  /** Legacy single-unit label (inputType === "number"). Empty for "multi"/"none". */
  unit: string;
  /**
   * Named numeric fields used when inputType === "multi".
   * Empty / absent for "none" and legacy "number" routines.
   */
  inputFields: RoutineInputField[];
  startDate: Timestamp;
  endDate: Timestamp | null;
  active: boolean;
  /**
   * Set when the routine is deleted. Routines are soft-deleted (never
   * removed from Firestore) so that past logs can still be attributed to
   * their original routine, shown as "(deleted)", and edited.
   * `null` for routines that have never been deleted.
   */
  deletedAt: Timestamp | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface RoutineLog {
  id: string;
  routineId: string;
  date: Timestamp;
  status: RoutineStatus;
  remark: string;
  /** Legacy single numeric value (inputType === "number"). Null for "multi" logs. */
  value: number | null;
  /**
   * Named numeric values for "multi" routines.
   * Keys match RoutineInputField.key; values are the logged numbers.
   * Absent / empty object for "none" and legacy "number" logs.
   */
  values: Record<string, number>;
  /** Download URL of an attached image stored in Firebase Storage, or null. */
  imageUrl: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
