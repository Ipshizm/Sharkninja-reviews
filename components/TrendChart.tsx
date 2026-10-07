"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TrendPoint } from "@/lib/aggregate";
import { Legend } from "./Stat";

/**
 * Monthly verified average, with the number of reviews behind each month drawn
 * underneath it. The bars matter: a line dropping from 4.7 to 3.4 reads very
 * differently when the later month is 43 reviews rather than three, and
 * without them a reader cannot tell which they are looking at.
 */
export function TrendChart({ points }: { points: TrendPoint[] }) {
  const overall =
    points.reduce((a, p) => a + p.avg * p.n, 0) /
    Math.max(1, points.reduce((a, p) => a + p.n, 0));
  const maxN = Math.max(...points.map((p) => p.n));

  return (
    <div>
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={points}
            margin={{ top: 8, right: 12, bottom: 4, left: 0 }}
          >
            <CartesianGrid stroke="#f1f1f1" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 12, fill: "#6b6b6b" }}
              tickLine={false}
              axisLine={{ stroke: "#e4e4e4" }}
            />
            <YAxis
              yAxisId="rating"
              orientation="left"
              width={32}
              domain={[1, 5]}
              ticks={[1, 2, 3, 4, 5]}
              interval={0}
              tickMargin={4}
              tick={{ fontSize: 12, fill: "#6b6b6b" }}
              tickLine={false}
              axisLine={false}
            />
            {/* Review volume, scaled to sit in the bottom third and stay out
                of the line's way. It is context, not a competing series. */}
            <YAxis
              yAxisId="count"
              orientation="right"
              domain={[0, maxN * 3]}
              width={0}
              hide
            />
            <Tooltip
              cursor={{ fill: "#f7f7f7" }}
              contentStyle={{
                border: "1px solid #e4e4e4",
                borderRadius: 8,
                fontSize: 12,
                fontFamily: "var(--font-jakarta), sans-serif",
              }}
              formatter={(value, name) => {
                if (name === "Verified reviews that month") {
                  return [`${value}`, name] as [string, string];
                }
                const avg =
                  typeof value === "number" ? value.toFixed(2) : String(value);
                return [`${avg} out of 5`, "Verified average"] as [string, string];
              }}
            />
            <ReferenceLine
              yAxisId="rating"
              y={overall}
              stroke="#6b6b6b"
              strokeDasharray="4 4"
            />
            <Bar
              yAxisId="count"
              dataKey="n"
              name="Verified reviews that month"
              fill="#bbbdc0"
              fillOpacity={0.55}
              radius={[2, 2, 0, 0]}
              maxBarSize={28}
            />
            <Line
              yAxisId="rating"
              type="monotone"
              dataKey="avg"
              name="Verified average"
              stroke="#00a5af"
              strokeWidth={2.5}
              dot={{ r: 3.5, fill: "#00a5af", strokeWidth: 0 }}
              activeDot={{ r: 6 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <Legend
        className="mt-3 border-t border-line pt-3"
        items={[
          { colour: "#00a5af", label: "Verified average that month (left scale, 1–5)" },
          { colour: "#bbbdc0", label: "How many verified reviews that month" },
          {
            colour: "#6b6b6b",
            label: "Average across the whole period",
            value: overall.toFixed(2),
          },
        ]}
        note="Verified purchases only, so a month of unverified reviews cannot move the line. Hover any month for its exact figures."
      />
    </div>
  );
}
