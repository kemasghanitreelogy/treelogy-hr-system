import { OvertimeView } from "@/components/overtime/overtime-view";
import { getEmployees, getOvertimeRequests } from "@/lib/data";
import { contractRatePerHour } from "@/lib/overtime";
import { can, getSessionUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { canDecideOwnRequest } from "@/lib/self-approval";

export const metadata = { title: "Lembur — Treelogy Workspace" };

export default async function OvertimePage() {
  const [requests, employeesAll, user] = await Promise.all([
    getOvertimeRequests(),
    getEmployees(),
    getSessionUser(),
  ]);
  const employees = employeesAll
    .filter((e) => e.status === "active")
    .map((e) => ({ id: e.id, name: e.name, team: e.team, position: e.position, managerId: e.managerId ?? null }));

  // Same approval scope as leave: HR/admin org-wide; a manager (leave.approve)
  // scoped to their division. Marking PAID is a payroll action.
  const me = user?.employeeId ? employeesAll.find((e) => e.id === user.employeeId) : undefined;
  const canApproveAll = can(user, "employees.manage");
  const approverTeam = !canApproveAll && can(user, "leave.approve") ? me?.team ?? null : null;

  // Apakah aku boleh memutus pengajuanku sendiri? Ditanyakan ke database, bukan
  // ditebak dari `managerId` yang ada di layar: syaratnya bukan sekadar punya
  // atasan, tapi punya atasan AKTIF yang perannya memang berwenang menyetujui.
  let selfRequiresManager = true;
  if (user?.employeeId) {
    const supabase = await createClient();
    const { data } = (await supabase?.rpc("employee_requires_manager", { emp: user.employeeId })) ?? { data: null };
    selfRequiresManager = data === true;
  }
  const canDecideOwn = canDecideOwnRequest({ isHR: canApproveAll, requiresManager: selfRequiresManager });

  return (
    <div className="space-y-4">
      <OvertimeView
        requests={requests}
        employees={employees}
        currentUserName={user?.name ?? "HR"}
        currentEmployeeId={user?.employeeId ?? null}
        canRequestForOthers={can(user, "leave.approve")}
        canApproveAll={canApproveAll}
        canDecideOwn={canDecideOwn}
        approverTeam={approverTeam}
        selfRatePerHour={me ? contractRatePerHour(me.contractType ?? "pkwt", me.baseSalary, me.hourlyRate ?? 0) : 0}
        selfContractType={me?.contractType ?? "pkwt"}
      />
    </div>
  );
}
