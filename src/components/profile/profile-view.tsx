import { Banknote, Briefcase, CalendarClock, FileSignature, Mail, ShieldCheck, UserRound, Wallet } from "lucide-react";
import type { ContractType, Employee, EmployeeContract } from "@/lib/types";
import { TEAM_META } from "@/lib/constants";
import { cn, formatDate, rupiah } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { ContractsCard } from "@/components/employees/contracts-card";
import type { Locale } from "@/lib/i18n";

/** Headline employment status shown on the profile. */
const CT_LABEL: Record<Locale, Record<ContractType, string>> = {
  id: { pkwt: "PKWT (Kontrak)", pkwtt: "PKWTT (Tetap)" },
  en: { pkwt: "Fixed-term (PKWT)", pkwtt: "Permanent (PKWTT)" },
};

const STR: Record<Locale, {
  active: string;
  inactive: string;
  notLinked: string;
  employment: string;
  nik: string;
  position: string;
  division: string;
  directManager: string;
  divisionHead: string;
  joinDate: string;
  location: string;
  workHours: string;
  status: string;
  contact: string;
  email: string;
  phone: string;
  compensation: string;
  baseSalary: string;
  allowance: string;
  bpjsYes: string;
  bpjsNo: string;
  bankAccountSection: string;
  bank: string;
  accountNumber: string;
  footer: string;
}> = {
  id: {
    active: "Aktif",
    inactive: "Nonaktif",
    notLinked: "Akun ini belum tertaut ke data karyawan. Hubungi HR untuk menautkan di menu Peran & Akses.",
    employment: "Kepegawaian",
    nik: "NIK",
    position: "Jabatan",
    division: "Divisi",
    directManager: "Atasan langsung",
    divisionHead: "— (kepala divisi)",
    joinDate: "Tanggal bergabung",
    location: "Lokasi",
    workHours: "Jam kerja",
    status: "Status",
    contact: "Kontak",
    email: "Email",
    phone: "Telepon",
    compensation: "Kompensasi",
    baseSalary: "Gaji pokok",
    allowance: "Tunjangan",
    bpjsYes: "Aktif",
    bpjsNo: "Tidak",
    bankAccountSection: "Rekening Bank",
    bank: "Bank",
    accountNumber: "Nomor rekening",
    footer: "Perubahan data dilakukan oleh HR di menu Karyawan.",
  },
  en: {
    active: "Active",
    inactive: "Inactive",
    notLinked: "This account is not linked to an employee record yet. Contact HR to link it in the Roles & Access menu.",
    employment: "Employment",
    nik: "Employee ID (NIK)",
    position: "Position",
    division: "Division",
    directManager: "Direct manager",
    divisionHead: "— (division head)",
    joinDate: "Join date",
    location: "Location",
    workHours: "Work hours",
    status: "Status",
    contact: "Contact",
    email: "Email",
    phone: "Phone",
    compensation: "Compensation",
    baseSalary: "Base salary",
    allowance: "Allowance",
    bpjsYes: "Active",
    bpjsNo: "No",
    bankAccountSection: "Bank Account",
    bank: "Bank",
    accountNumber: "Account number",
    footer: "Data changes are made by HR in the Employees menu.",
  },
};

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
  contracts = [],
  contractType = null,
  contractEndDate = null,
  contractEndsInDays = null,
  locale = "id",
}: {
  emp?: Employee;
  manager?: Employee;
  roleName: string;
  fallbackName: string;
  fallbackEmail: string;
  contracts?: EmployeeContract[];
  contractType?: ContractType | null;
  contractEndDate?: string | null;
  contractEndsInDays?: number | null;
  locale?: Locale;
}) {
  const t = STR[locale];
  const name = emp?.name ?? fallbackName;
  const team = emp ? TEAM_META[emp.team] : null;
  const contractLabel = contractType ? CT_LABEL[locale][contractType] : null;
  // Show a heads-up when the active fixed-term contract ends within ~2 months.
  const endingSoon = contractEndDate != null && contractEndsInDays != null && contractEndsInDays >= 0 && contractEndsInDays <= 60;
  const endsText =
    contractEndsInDays === 0
      ? locale === "en" ? "today" : "hari ini"
      : contractEndsInDays === 1
        ? locale === "en" ? "tomorrow" : "besok"
        : locale === "en" ? `in ${contractEndsInDays} days` : `dalam ${contractEndsInDays} hari`;

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
                  {emp.status === "active" ? t.active : t.inactive}
                </span>
              )}
              {contractLabel && (
                <span className="inline-flex items-center gap-1 rounded-full bg-cream/15 px-2.5 py-1 text-xs font-semibold text-cream ring-1 ring-cream/25">
                  <FileSignature className="h-3.5 w-3.5 text-lime" /> {contractLabel}
                </span>
              )}
            </div>
          </div>
        </div>
      </section>

      {!emp ? (
        <div className="card px-5 py-8 text-center text-sm text-faint">
          {t.notLinked}
        </div>
      ) : (
        <>
          {endingSoon && (
            <div className="flex items-start gap-2.5 rounded-2xl border border-gold/40 bg-gold-soft/60 px-4 py-3">
              <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-[#8a6512]" />
              <p className="text-sm text-[#8a6512]">
                {locale === "en"
                  ? `Your contract ends ${endsText} (${formatDate(contractEndDate!, "long", locale)}). HR will reach out about renewal.`
                  : `Kontrak kamu berakhir ${endsText} (${formatDate(contractEndDate!, "long", locale)}). HR akan menghubungimu terkait perpanjangan.`}
              </p>
            </div>
          )}

          <Section title="Kepegawaian" icon={Briefcase}>
            <Info label="NIK" value={emp.nik} />
            <Info label="Jabatan" value={emp.position} />
            <Info label="Divisi" value={team?.label} />
            <Info label="Atasan langsung" value={manager ? `${manager.name} · ${manager.position}` : "— (kepala divisi)"} />
            <Info label="Tanggal bergabung" value={formatDate(emp.joinDate, "long")} />
            <Info label="Lokasi" value={emp.location} />
            <Info label="Jam kerja" value={`${emp.workStart ?? "08:00"} – ${emp.workEnd ?? "17:00"} WITA`} />
            <Info label="Status" value={emp.status === "active" ? "Aktif" : "Nonaktif"} />
            <Info label={locale === "en" ? "Employment status" : "Status kepegawaian"} value={contractLabel} />
          </Section>

          <Section title="Kontak" icon={Mail}>
            <Info label="Email" value={emp.email} />
            <Info label="Telepon" value={emp.phone} />
          </Section>

          <Section title="Identitas (KTP)" icon={UserRound}>
            <Info label="NIK KTP" value={emp.ktpNik || "—"} />
            <div className="flex items-center justify-between gap-3 py-1.5">
              <span className="text-sm text-muted">Foto KTP</span>
              {emp.ktpPhotoPath ? (
                <a
                  href={`/api/ktp/photo?path=${encodeURIComponent(emp.ktpPhotoPath)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-sky hover:underline"
                >
                  Lihat foto
                </a>
              ) : (
                <span className="text-sm text-faint">—</span>
              )}
            </div>
          </Section>

          <Section title="Kompensasi" icon={Banknote}>
            <Info label="Gaji pokok" value={rupiah(emp.baseSalary)} />
            <Info label="Tunjangan" value={rupiah(emp.allowance)} />
            <Info label="NPWP" value={emp.npwp} />
            <Info label="BPJS Kesehatan" value={emp.bpjsKes ? "Aktif" : "Tidak"} />
            <Info label="BPJS Ketenagakerjaan" value={emp.bpjsTk ? "Aktif" : "Tidak"} />
          </Section>

          <Section title="Rekening Bank" icon={Wallet}>
            <Info label="Bank" value={emp.bankName} />
            <Info label="Nomor rekening" value={emp.bankAccount} />
          </Section>

          {/* Own contracts — read-only history (type, dates, document). */}
          <ContractsCard employeeId={emp.id} contracts={contracts} canManage={false} />
        </>
      )}

      <p className="px-1 text-center text-xs text-faint">
        {emp ? "Perubahan data dilakukan oleh HR di menu Karyawan." : `Email: ${fallbackEmail}`}
      </p>
    </div>
  );
}
