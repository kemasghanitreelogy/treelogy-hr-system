import { Banknote, Briefcase, Mail, ShieldCheck, UserRound, Wallet } from "lucide-react";
import type { Employee } from "@/lib/types";
import { TEAM_META } from "@/lib/constants";
import { cn, formatDate, rupiah } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";

function Info({ label, value }: { label: string; value?: string | number | null }) {
  const v = value === 0 ? "0" : value;
  return (
    <div className="py-2.5">
      <dt className="text-xs text-faint">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-ink">{v || "—"}</dd>
    </div>
  );
}

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof UserRound;
  children: React.ReactNode;
}) {
  return (
    <section className="card overflow-hidden">
      <header className="flex items-center gap-2 border-b border-line px-5 py-3.5">
        <Icon className="h-4 w-4 text-forest-600" />
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
      </header>
      <dl className="grid grid-cols-1 gap-x-6 px-5 py-2 sm:grid-cols-2">{children}</dl>
    </section>
  );
}

export function ProfileView({
  emp,
  manager,
  roleName,
  fallbackName,
  fallbackEmail,
}: {
  emp?: Employee;
  manager?: Employee;
  roleName: string;
  fallbackName: string;
  fallbackEmail: string;
}) {
  const name = emp?.name ?? fallbackName;
  const team = emp ? TEAM_META[emp.team] : null;

  return (
    <div className="mx-auto max-w-3xl space-y-4 fade-up">
      {/* Header */}
      <section className="card overflow-hidden">
        <div className="flex flex-col items-center gap-4 bg-bark px-6 py-7 text-center text-cream sm:flex-row sm:gap-5 sm:text-left">
          <Avatar name={name} size="lg" className="h-20 w-20 shrink-0 text-2xl ring-4 ring-forest-700" />
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-bold">{name}</h1>
            <p className="text-forest-100/80">{emp?.position ?? roleName}</p>
            <div className="mt-2.5 flex flex-wrap justify-center gap-2 sm:justify-start">
              <span className="inline-flex items-center gap-1 rounded-full bg-forest-700 px-2.5 py-1 text-xs font-medium text-cream">
                <ShieldCheck className="h-3.5 w-3.5 text-lime" /> {roleName}
              </span>
              {team && (
                <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", team.chip)}>{team.label}</span>
              )}
              {emp && (
                <span
                  className={cn(
                    "rounded-full px-2.5 py-1 text-xs font-medium",
                    emp.status === "active" ? "bg-forest-700 text-lime" : "bg-clay-soft text-clay",
                  )}
                >
                  {emp.status === "active" ? "Aktif" : "Nonaktif"}
                </span>
              )}
            </div>
          </div>
        </div>
      </section>

      {!emp ? (
        <div className="card px-5 py-8 text-center text-sm text-faint">
          Akun ini belum tertaut ke data karyawan. Hubungi HR untuk menautkan di menu Peran &amp; Akses.
        </div>
      ) : (
        <>
          <Section title="Kepegawaian" icon={Briefcase}>
            <Info label="NIK" value={emp.nik} />
            <Info label="Jabatan" value={emp.position} />
            <Info label="Divisi" value={team?.label} />
            <Info label="Atasan langsung" value={manager ? `${manager.name} · ${manager.position}` : "— (kepala divisi)"} />
            <Info label="Tanggal bergabung" value={formatDate(emp.joinDate, "long")} />
            <Info label="Lokasi" value={emp.location} />
            <Info label="Jam kerja" value={`${emp.workStart ?? "08:00"} – ${emp.workEnd ?? "17:00"} WITA`} />
            <Info label="Status" value={emp.status === "active" ? "Aktif" : "Nonaktif"} />
          </Section>

          <Section title="Kontak" icon={Mail}>
            <Info label="Email" value={emp.email} />
            <Info label="Telepon" value={emp.phone} />
          </Section>

          <Section title="Kompensasi" icon={Banknote}>
            <Info label="Gaji pokok" value={rupiah(emp.baseSalary)} />
            <Info label="Tunjangan" value={rupiah(emp.allowance)} />
            <Info label="PTKP" value={emp.ptkp} />
            <Info label="NPWP" value={emp.npwp} />
            <Info label="BPJS Kesehatan" value={emp.bpjsKes ? "Aktif" : "Tidak"} />
            <Info label="BPJS Ketenagakerjaan" value={emp.bpjsTk ? "Aktif" : "Tidak"} />
          </Section>

          <Section title="Rekening Bank" icon={Wallet}>
            <Info label="Bank" value={emp.bankName} />
            <Info label="Nomor rekening" value={emp.bankAccount} />
          </Section>
        </>
      )}

      <p className="px-1 text-center text-xs text-faint">
        {emp ? "Perubahan data dilakukan oleh HR di menu Karyawan." : `Email: ${fallbackEmail}`}
      </p>
    </div>
  );
}
