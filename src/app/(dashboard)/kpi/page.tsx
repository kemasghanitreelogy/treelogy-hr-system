import { Target, TrendingUp } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { TEAM_META } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { getEmployees, getKpis } from "@/lib/data";
import type { Kpi } from "@/lib/types";

export const metadata = { title: "KPI & Kinerja — Treelogy HR" };

/** Lower-is-better metrics where actual below target = good. */
const LOWER_BETTER = new Set(["Defect rate", "Churn"]);

function achievement(k: Kpi): number {
  if (LOWER_BETTER.has(k.metric)) {
    if (k.actual <= 0) return 100;
    return Math.round((k.target / k.actual) * 100);
  }
  return Math.round((k.actual / k.target) * 100);
}

export default async function KpiPage() {
  const [kpis, employees] = await Promise.all([getKpis(), getEmployees()]);
  const empMap = new Map(employees.map((e) => [e.id, e]));
  const byEmployee = new Map<string, Kpi[]>();
  for (const k of kpis) {
    const arr = byEmployee.get(k.employeeId) ?? [];
    arr.push(k);
    byEmployee.set(k.employeeId, arr);
  }

  // Tanpa data KPI halaman ini kosong melompong; beri keadaan kosong yang
  // menjelaskan dirinya, bukan layar putih tanpa penanda apa pun.
  if (byEmployee.size === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-line bg-cream/40 px-5 py-12 text-center fade-up">
        <Target className="mx-auto h-8 w-8 text-faint" />
        <p className="mt-2 text-sm text-faint">Belum ada data KPI.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 fade-up">
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from(byEmployee.entries()).map(([empId, items]) => {
          const emp = empMap.get(empId);
          if (!emp) return null;
          const score = Math.round(
            items.reduce((s, k) => s + (achievement(k) * k.weight) / 100, 0),
          );
          return (
            <Card key={empId}>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <Avatar name={emp.name} />
                  <div>
                    <CardTitle>{emp.name}</CardTitle>
                    <p className="mt-0.5 text-xs text-faint">
                      {emp.position} ·{" "}
                      <span className={TEAM_META[emp.team].tone}>{TEAM_META[emp.team].label}</span>
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p
                    className={cn(
                      "font-display text-2xl font-bold",
                      score >= 100 ? "text-forest-600" : score >= 80 ? "text-[#8a6512]" : "text-clay",
                    )}
                  >
                    {score}%
                  </p>
                  <Badge tone={score >= 100 ? "matcha" : score >= 80 ? "gold" : "clay"}>
                    <TrendingUp className="h-3 w-3" /> Skor
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {items.map((k) => {
                  const ach = achievement(k);
                  return (
                    <div key={k.id}>
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium text-ink">{k.metric}</span>
                        <span className="text-muted">
                          {k.actual}
                          <span className="text-faint">/{k.target} {k.unit}</span>
                        </span>
                      </div>
                      <div className="mt-1.5 flex items-center gap-3">
                        <Progress
                          value={Math.min(ach, 100)}
                          className="flex-1"
                          barClassName={ach >= 100 ? "bg-forest-500" : ach >= 80 ? "bg-gold" : "bg-clay"}
                        />
                        <span className="w-12 text-right text-xs font-semibold text-muted">{ach}%</span>
                        <span className="w-10 text-right text-[11px] text-faint">b.{k.weight}%</span>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
