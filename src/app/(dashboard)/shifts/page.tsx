import { ShiftsView } from "@/components/shifts/shifts-view";
import { getDayOffInLieu, getEmployees, getShifts } from "@/lib/data";

export const metadata = { title: "Shift & Jadwal — Treelogy HR" };

export default async function ShiftsPage() {
  const [shifts, swaps, employeesAll] = await Promise.all([
    getShifts(),
    getDayOffInLieu(),
    getEmployees(),
  ]);
  const employees = employeesAll.map((e) => ({
    id: e.id,
    name: e.name,
    team: e.team,
    position: e.position,
  }));
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Atur shift untuk tim pabrik &amp; kebun, dan kelola tukar libur (day-off in lieu).
      </p>
      <ShiftsView shifts={shifts} swaps={swaps} employees={employees} />
    </div>
  );
}
