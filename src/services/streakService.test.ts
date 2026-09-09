import { describe, expect, it } from "vitest";

import { computeStreakStats } from "./streakService";

function d(y: number, m: number, day: number): Date {
  return new Date(y, m - 1, day);
}

describe("computeStreakStats", () => {
  it("counts a day as a streak day with just one 'yes' log, even if other routines were missed that day", () => {
    // Only one "yes" log exists for Sep 8 (other routines that day were
    // "no" / never logged, so they never made it into activeDateKeys).
    const active = new Set(["2026-09-06", "2026-09-07", "2026-09-08"]);
    const today = d(2026, 9, 8);

    const result = computeStreakStats(active, today);

    expect(result.currentStreak).toBe(3);
  });

  it("closes the streak on a day where every routine was missed", () => {
    // Sep 7 has no "yes" log at all -> streak breaks there.
    const active = new Set(["2026-09-04", "2026-09-05", "2026-09-06"]);
    const today = d(2026, 9, 8); // two days after the last active day

    const result = computeStreakStats(active, today);

    expect(result.currentStreak).toBe(0);
  });

  it("gives today a grace period: streak stays alive if yesterday was active but today isn't logged yet", () => {
    const active = new Set(["2026-09-06", "2026-09-07"]);
    const today = d(2026, 9, 8); // today has no log yet

    const result = computeStreakStats(active, today);

    expect(result.currentStreak).toBe(2);
  });

  it("does not extend the grace period two days in a row", () => {
    // Missed both yesterday and today -> streak is closed, not just paused.
    const active = new Set(["2026-09-04", "2026-09-05"]);
    const today = d(2026, 9, 7);

    const result = computeStreakStats(active, today);

    expect(result.currentStreak).toBe(0);
  });

  it("computes the longest streak across the whole history, not just the current run", () => {
    const active = new Set([
      "2026-01-01",
      "2026-01-02",
      "2026-01-03",
      "2026-01-04",
      "2026-01-05",
      // gap (missed) on 01-06
      "2026-09-08",
    ]);
    const today = d(2026, 9, 8);

    const result = computeStreakStats(active, today);

    expect(result.longestStreak).toBe(5);
    expect(result.currentStreak).toBe(1);
  });

  it("stays correct across a DST transition (23-hour day)", () => {
    // US spring-forward 2026: clocks skip ahead on Mar 8. A naive
    // "subtract 86400000ms" walk can miscount here; calendar-based
    // day stepping should not.
    const active = new Set(["2026-03-06", "2026-03-07", "2026-03-08", "2026-03-09"]);
    const today = d(2026, 3, 9);

    const result = computeStreakStats(active, today);

    expect(result.currentStreak).toBe(4);
  });

  it("reports no streak and no last active date when nothing was ever logged", () => {
    const result = computeStreakStats(new Set(), d(2026, 9, 8));

    expect(result.currentStreak).toBe(0);
    expect(result.longestStreak).toBe(0);
    expect(result.lastActiveDate).toBeNull();
  });
});
