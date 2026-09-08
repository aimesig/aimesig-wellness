import type { Timestamp } from "firebase/firestore";

export type RoutineFrequency =
  | "daily"
  | "weekly"
  | "monthly"
  | "yearly"
  | "selectedDates";

export type RoutineInputType = "none" | "number";

export type RoutineStatus = "pending" | "yes" | "no";

export interface RoutineSchedule {
  weekdays?: number[];
  monthDay?: number;
  yearMonth?: number;
  yearDay?: number;
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