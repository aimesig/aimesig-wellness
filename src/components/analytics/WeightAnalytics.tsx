import { useEffect, useState } from "react";
import {
  Activity,
  ArrowDown,
  ArrowUp,
  BarChart3,
  Loader2,
  Minus,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  getWeightAnalytics,
  type WeightAnalytics as WeightAnalyticsData,
} from "../../services/weightService";

interface WeightAnalyticsProps {
  userId: string;
}

type WeightRange = "7d" | "30d" | "3m" | "6m" | "1y" | "all";

function formatWeight(value: number | null): string {
  if (value === null) {
    return "--";
  }

  return `${value.toFixed(1)} kg`;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
  });
}

export function WeightAnalytics({
  userId,
}: WeightAnalyticsProps) {
  const [analytics, setAnalytics] =
    useState<WeightAnalyticsData | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [refreshKey, setRefreshKey] = useState(0);

  const [range, setRange] =
    useState<WeightRange>("30d");

  useEffect(() => {
    let cancelled = false;

    async function loadAnalytics() {
      try {
        setLoading(true);
        setError("");

        const data = await getWeightAnalytics(userId);

        if (!cancelled) {
          setAnalytics(data);
        }
      } catch (err) {
        console.error(
          "Failed to load weight analytics:",
          err,
        );

        if (!cancelled) {
          setError(
            "Unable to load weight analytics.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadAnalytics();

    return () => {
      cancelled = true;
    };
  }, [userId, refreshKey]);

  useEffect(() => {
    function handleRoutineLogSaved() {
      setRefreshKey((current) => current + 1);
    }

    window.addEventListener(
      "routine-log-saved",
      handleRoutineLogSaved,
    );

    return () => {
      window.removeEventListener(
        "routine-log-saved",
        handleRoutineLogSaved,
      );
    };
  }, []);

  if (loading) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-center py-12">
          <Loader2
            size={28}
            className="animate-spin text-slate-500"
          />
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-2xl border border-red-200 bg-red-50 p-6">
        <p className="text-sm text-red-700">
          {error}
        </p>
      </section>
    );
  }

  if (!analytics) {
    return null;
  }

  /*
   * Filter entries according to selected range.
   */
  const filteredEntries =
    analytics.entries.filter((entry) => {
      if (range === "all") {
        return true;
      }

      const now = new Date();
      const entryDate = entry.date.toDate();
      const startDate = new Date(now);

      switch (range) {
        case "7d":
          startDate.setDate(
            now.getDate() - 7,
          );
          break;

        case "30d":
          startDate.setDate(
            now.getDate() - 30,
          );
          break;

        case "3m":
          startDate.setMonth(
            now.getMonth() - 3,
          );
          break;

        case "6m":
          startDate.setMonth(
            now.getMonth() - 6,
          );
          break;

        case "1y":
          startDate.setFullYear(
            now.getFullYear() - 1,
          );
          break;
      }

      return entryDate >= startDate;
    });

  /*
   * Calculate metrics for selected range.
   */
  const filteredValues =
    filteredEntries.map(
      (entry) => entry.value,
    );

  const filteredStarting =
    filteredValues.length > 0
      ? filteredValues[0]
      : null;

  const filteredLatest =
    filteredValues.length > 0
      ? filteredValues[
          filteredValues.length - 1
        ]
      : null;

  const filteredMinimum =
    filteredValues.length > 0
      ? Math.min(...filteredValues)
      : null;

  const filteredMaximum =
    filteredValues.length > 0
      ? Math.max(...filteredValues)
      : null;

  const filteredAverage =
    filteredValues.length > 0
      ? filteredValues.reduce(
          (sum, value) => sum + value,
          0,
        ) / filteredValues.length
      : null;

  const filteredChange =
    filteredLatest !== null &&
    filteredStarting !== null
      ? filteredLatest - filteredStarting
      : null;

  const chartData = filteredEntries.map(
    (entry) => ({
      date: formatDate(
        entry.date.toDate(),
      ),
      weight: entry.value,
    }),
  );

  const change = filteredChange ?? 0;

  const ChangeIcon =
    change > 0
      ? ArrowUp
      : change < 0
        ? ArrowDown
        : Minus;

  return (
    <section className="space-y-5">
      <div>
        <div className="flex items-center gap-2">
          <BarChart3
            size={22}
            className="text-slate-700"
          />

          <h2 className="text-xl font-bold text-slate-900">
            Weight Analytics
          </h2>
        </div>

        <p className="mt-1 text-sm text-slate-500">
          Track your weight progress over time.
        </p>
      </div>

      {/* Date Range Filter */}
      <div className="flex flex-wrap gap-2">
        {[
          ["7d", "7 Days"],
          ["30d", "30 Days"],
          ["3m", "3 Months"],
          ["6m", "6 Months"],
          ["1y", "1 Year"],
          ["all", "All Time"],
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() =>
              setRange(
                value as WeightRange,
              )
            }
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              range === value
                ? "bg-slate-900 text-white"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* No weight data at all */}
      {analytics.entries.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
          <Activity
            size={36}
            className="mx-auto text-slate-400"
          />

          <h3 className="mt-4 font-semibold text-slate-900">
            No weight data yet
          </h3>

          <p className="mt-1 text-sm text-slate-500">
            Create a numeric routine with the
            unit "kg" and start recording your
            weight.
          </p>
        </div>
      ) : filteredEntries.length === 0 ? (
        /* No data in selected range */
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
          <Activity
            size={36}
            className="mx-auto text-slate-400"
          />

          <h3 className="mt-4 font-semibold text-slate-900">
            No weight data in this period
          </h3>

          <p className="mt-1 text-sm text-slate-500">
            Try selecting a longer time period.
          </p>
        </div>
      ) : (
        <>
          {/* Metrics */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">
                Current Weight
              </p>

              <p className="mt-2 text-2xl font-bold text-slate-900">
                {formatWeight(
                  filteredLatest,
                )}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">
                Starting Weight
              </p>

              <p className="mt-2 text-2xl font-bold text-slate-900">
                {formatWeight(
                  filteredStarting,
                )}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">
                Change
              </p>

              <div className="mt-2 flex items-center gap-2">
                <ChangeIcon size={22} />

                <p className="text-2xl font-bold text-slate-900">
                  {change === 0
                    ? "0.0 kg"
                    : `${Math.abs(change).toFixed(1)} kg`}
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">
                Minimum
              </p>

              <p className="mt-2 text-xl font-bold text-slate-900">
                {formatWeight(
                  filteredMinimum,
                )}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">
                Maximum
              </p>

              <p className="mt-2 text-xl font-bold text-slate-900">
                {formatWeight(
                  filteredMaximum,
                )}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">
                Average
              </p>

              <p className="mt-2 text-xl font-bold text-slate-900">
                {formatWeight(
                  filteredAverage,
                )}
              </p>
            </div>
          </div>

          {/* Chart */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900">
                  Weight Trend
                </h3>

                <p className="mt-1 text-xs text-slate-500">
                  {filteredEntries.length} recorded{" "}
                  {filteredEntries.length === 1
                    ? "entry"
                    : "entries"}
                </p>
              </div>
            </div>

            <div className="h-72 w-full">
              <ResponsiveContainer
                width="100%"
                height="100%"
              >
                <LineChart
                  data={chartData}
                  margin={{
                    top: 10,
                    right: 10,
                    left: 0,
                    bottom: 10,
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" />

                  <XAxis dataKey="date" />

                  <YAxis
                    domain={[
                      "dataMin - 1",
                      "dataMax + 1",
                    ]}
                    tickFormatter={(value) =>
                      `${value} kg`
                    }
                  />

                  <Tooltip
                    formatter={(value) => [
                      `${Number(value).toFixed(1)} kg`,
                      "Weight",
                    ]}
                  />

                  <Line
                    type="monotone"
                    dataKey="weight"
                    strokeWidth={2}
                    dot
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </section>
  );
}