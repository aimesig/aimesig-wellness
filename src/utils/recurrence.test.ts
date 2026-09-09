import {
  describe,
  expect,
  it,
} from "vitest";

import { Timestamp } from "firebase/firestore";

import {
  getRoutinesForDate,
  isRoutineScheduledForDate,
} from "./recurrence";

import type { Routine } from "../types/routine";

function createRoutine(
  overrides: Partial<Routine> = {},
): Routine {
  return {
    id: "test",
    title: "Test Routine",
    description: "",
    frequency: "daily",
    schedule: {},
    alternateDay: false,
    inputType: "none",
    unit: "",
    startDate: Timestamp.fromDate(
      new Date(2026, 8, 7),
    ),
    endDate: null,
    active: true,
    deletedAt: null,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    ...overrides,
  };
}

describe("routine recurrence", () => {
  it("matches daily routines", () => {
    const routine = createRoutine();

    expect(
      isRoutineScheduledForDate(
        routine,
        new Date(2026, 8, 8),
      ),
    ).toBe(true);
  });

  it("does not match before start date", () => {
    const routine = createRoutine();

    expect(
      isRoutineScheduledForDate(
        routine,
        new Date(2026, 8, 6),
      ),
    ).toBe(false);
  });

  it("matches weekly routines", () => {
    const routine = createRoutine({
      frequency: "weekly",
      schedule: {
        weekdays: [1, 3, 5],
      },
    });

    expect(
      isRoutineScheduledForDate(
        routine,
        new Date(2026, 8, 7),
      ),
    ).toBe(true);

    expect(
      isRoutineScheduledForDate(
        routine,
        new Date(2026, 8, 8),
      ),
    ).toBe(false);
  });

  it("matches monthly routines", () => {
    const routine = createRoutine({
      frequency: "monthly",
      schedule: {
        monthDay: 15,
      },
    });

    expect(
      isRoutineScheduledForDate(
        routine,
        new Date(2026, 8, 15),
      ),
    ).toBe(true);

    expect(
      isRoutineScheduledForDate(
        routine,
        new Date(2026, 8, 16),
      ),
    ).toBe(false);
  });

  it("matches yearly routines", () => {
    const routine = createRoutine({
      frequency: "yearly",
      schedule: {
        yearMonth: 9,
        yearDay: 7,
      },
    });

    expect(
      isRoutineScheduledForDate(
        routine,
        new Date(2027, 8, 7),
      ),
    ).toBe(true);

    expect(
      isRoutineScheduledForDate(
        routine,
        new Date(2027, 8, 8),
      ),
    ).toBe(false);
  });

  it("matches alternate-day routines", () => {
    const routine = createRoutine({
      alternateDay: true,
    });

    expect(
      isRoutineScheduledForDate(
        routine,
        new Date(2026, 8, 7),
      ),
    ).toBe(true);

    expect(
      isRoutineScheduledForDate(
        routine,
        new Date(2026, 8, 8),
      ),
    ).toBe(false);

    expect(
      isRoutineScheduledForDate(
        routine,
        new Date(2026, 8, 9),
      ),
    ).toBe(true);
  });

  it("filters a routine list by date", () => {
    const daily = createRoutine({
      id: "daily",
    });

    const weekly = createRoutine({
      id: "weekly",
      frequency: "weekly",
      schedule: {
        weekdays: [1],
      },
    });

    const routines = getRoutinesForDate(
      [daily, weekly],
      new Date(2026, 8, 7),
    );

    expect(routines).toHaveLength(2);
  });
});