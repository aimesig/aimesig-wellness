import type { Timestamp } from "firebase/firestore";

export type RoutineFrequency =
  | "daily"
  | "weekly"
  | "monthly"
  | "yearly"
  | "selectedDates";

export type RoutineInputType = "none" | "number";

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
  inputType: RoutineInputType;
  unit: string;
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
  value: number | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}