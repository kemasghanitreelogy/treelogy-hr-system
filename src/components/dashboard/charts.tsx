"use client";

import {
  Area,
  AreaChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useLocale } from "@/components/layout/locale-context";
import type { Locale } from "@/lib/i18n";

const GREEN = "#3d5a2e";
const LIME = "#a4c26a";
const CLAY = "#c2603f";

const STR: Record<Locale, {
  dateLabel: (l: string) => string;
  present: string;
  late: string;
  absent: string;
  teamLabels: Record<string, string>;
  employees: string;
}> = {
  id: {
    dateLabel: (l) => `Tanggal ${l}`,
    present: "Hadir",
    late: "Terlambat",
    absent: "Alpa",
    teamLabels: { factory: "Pabrik", farm: "Kebun", office: "Kantor" },
    employees: "karyawan",
  },
  en: {
    dateLabel: (l) => `Date ${l}`,
    present: "Present",
    late: "Late",
    absent: "Absent",
    teamLabels: { factory: "Factory", farm: "Farm", office: "Office" },
    employees: "employees",
  },
};

export function AttendanceTrendChart({
  data,
}: {
  data: { date: string; present: number; late: number; absent: number }[];
}) {
  const locale = useLocale();
  const t = STR[locale];
  const fmt = data.map((d) => ({ ...d, label: d.date.slice(8) }));
  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={fmt} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <defs>
          <linearGradient id="gPresent" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={GREEN} stopOpacity={0.35} />
            <stop offset="100%" stopColor={GREEN} stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#8b9082" }} />
        <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#8b9082" }} width={32} />
        <Tooltip
          contentStyle={{
            borderRadius: 12,
            border: "1px solid #e2e0d2",
            fontSize: 12,
            boxShadow: "0 12px 40px rgba(31,46,26,0.14)",
          }}
          labelFormatter={(l) => t.dateLabel(String(l))}
        />
        <Area type="monotone" dataKey="present" name={t.present} stroke={GREEN} strokeWidth={2.5} fill="url(#gPresent)" />
        <Area type="monotone" dataKey="late" name={t.late} stroke="#e0a82e" strokeWidth={2} fill="transparent" />
        <Area type="monotone" dataKey="absent" name={t.absent} stroke={CLAY} strokeWidth={2} fill="transparent" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

const TEAM_COLORS = ["#3d5a2e", "#6b7548", "#4a7ba6", "#e0a82e"];

export function TeamDonut({ data }: { data: { team: string; count: number }[] }) {
  const locale = useLocale();
  const t = STR[locale];
  const labels = t.teamLabels;
  const fmt = data.map((d) => ({ name: labels[d.team] ?? d.team, value: d.count }));
  const total = fmt.reduce((s, d) => s + d.value, 0);
  return (
    <div className="flex items-center gap-4">
      <div className="relative h-[150px] w-[150px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={fmt} dataKey="value" innerRadius={48} outerRadius={70} paddingAngle={2} stroke="none">
              {fmt.map((_, i) => (
                <Cell key={i} fill={TEAM_COLORS[i % TEAM_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ borderRadius: 12, border: "1px solid #e2e0d2", fontSize: 12 }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-2xl font-bold text-ink">{total}</span>
          <span className="text-[11px] text-faint">{t.employees}</span>
        </div>
      </div>
      <ul className="flex-1 space-y-2">
        {fmt.map((d, i) => (
          <li key={d.name} className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 text-muted">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: TEAM_COLORS[i % TEAM_COLORS.length] }} />
              {d.name}
            </span>
            <span className="font-semibold text-ink">{d.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
