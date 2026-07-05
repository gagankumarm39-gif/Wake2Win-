"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const BRAND = "#6d5efc";
const GREEN = "#34d399";
const RED = "#f87171";

export function StudyBarChart({ data }: { data: { label: string; minutes: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.15} vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
        <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} unit="m" />
        <Tooltip
          formatter={(v: number) => [`${v} min`, "Study time"]}
          contentStyle={{ borderRadius: 12, border: "1px solid rgba(109,94,252,.3)" }}
        />
        <Bar dataKey="minutes" fill={BRAND} radius={[6, 6, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function AccuracyDonut({ correct, wrong }: { correct: number; wrong: number }) {
  const data =
    correct + wrong === 0
      ? [{ name: "No attempts yet", value: 1, color: "#94a3b8" }]
      : [
          { name: "Correct", value: correct, color: GREEN },
          { name: "Wrong", value: wrong, color: RED },
        ];

  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          innerRadius={70}
          outerRadius={100}
          paddingAngle={correct + wrong === 0 ? 0 : 3}
          strokeWidth={0}
        >
          {data.map((d) => (
            <Cell key={d.name} fill={d.color} />
          ))}
        </Pie>
        <Tooltip contentStyle={{ borderRadius: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
