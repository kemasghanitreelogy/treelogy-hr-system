"use client";

import { useMemo, useRef, useState } from "react";
import { CalendarRange, FilePlus2, Loader2, ShieldCheck, Trash2, Wallet } from "lucide-react";
import type { TravelRequest, TravelTransport } from "@/lib/types";
import type { Locale } from "@/lib/i18n";
import { apiErrorMessage } from "@/lib/api-error";
import { prepareFileForBucket } from "@/lib/upload";
import { rupiah } from "@/lib/utils";
import { TRANSPORTS, TRANSPORT_LABEL, travelDuration, travelTotal } from "@/lib/travel";
import { useLocale } from "@/components/layout/locale-context";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";

export interface TravelEmployeeOption {
  id: string;
  name: string;
  position: string;
}

const STR: Record<
  Locale,
  {
    secEmployee: string;
    employee: string;
    jobTitle: string;
    jobTitleAuto: string;
    secTravel: string;
    purpose: string;
    purposePh: string;
    destination: string;
    destinationPh: string;
    departure: string;
    ret: string;
    duration: string;
    durationValue: (n: number) => string;
    durationAuto: string;
    transport: string;
    transportOther: string;
    transportOtherPh: string;
    accommodation: string;
    accYes: string;
    accNo: string;
    accDetails: string;
    accDetailsPh: string;
    secCost: string;
    costTransport: string;
    costAccommodation: string;
    costPerDiem: string;
    costOther: string;
    total: string;
    totalAuto: string;
    secAdvance: string;
    advanceQ: string;
    advanceAmount: string;
    advanceHint: (max: string) => string;
    secMore: string;
    proof: string;
    proofHint: string;
    proofAdd: string;
    proofReplace: string;
    proofRemove: string;
    proofUploaded: string;
    proofRequired: string;
    uploading: string;
    remarks: string;
    remarksPh: string;
    confirm: string;
    confirmText: string;
    cancel: string;
    submit: string;
    resubmit: string;
    submitting: string;
    connection: string;
  }
> = {
  id: {
    secEmployee: "I. Informasi Karyawan",
    employee: "Karyawan",
    jobTitle: "Jabatan",
    jobTitleAuto: "Diambil otomatis dari data karyawan.",
    secTravel: "II. Rincian Perjalanan",
    purpose: "Keperluan perjalanan",
    purposePh: "cth. Kunjungan klien & negosiasi kontrak",
    destination: "Tujuan",
    destinationPh: "cth. Surabaya, Jawa Timur",
    departure: "Tanggal berangkat",
    ret: "Tanggal kembali",
    duration: "Lama perjalanan",
    durationValue: (n) => (n > 0 ? `${n} hari` : "—"),
    durationAuto: "Dihitung otomatis dari kedua tanggal (termasuk hari berangkat & kembali).",
    transport: "Moda transportasi",
    transportOther: "Sebutkan transportasinya",
    transportOtherPh: "cth. Kapal laut",
    accommodation: "Butuh penginapan?",
    accYes: "Ya",
    accNo: "Tidak",
    accDetails: "Detail penginapan",
    accDetailsPh: "cth. Hotel dekat kantor klien, 2 malam",
    secCost: "III. Estimasi Biaya",
    costTransport: "Biaya transportasi",
    costAccommodation: "Biaya penginapan",
    costPerDiem: "Uang harian (makan, dll)",
    costOther: "Biaya lain-lain",
    total: "Total estimasi",
    totalAuto: "Jumlah keempat biaya di atas — tidak perlu dihitung manual.",
    secAdvance: "IV. Uang Muka",
    advanceQ: "Minta uang muka?",
    advanceAmount: "Nominal diminta",
    advanceHint: (max) => `Maksimal ${max} (total estimasi).`,
    secMore: "V. Informasi Tambahan",
    proof: "Bukti persetujuan atasan (wajib)",
    proofHint: "Contoh: foto/tangkapan layar persetujuan dari atasan (WA atau lainnya). Satu berkas gambar atau PDF.",
    proofAdd: "Pilih berkas",
    proofReplace: "Ganti berkas",
    proofRemove: "Hapus",
    proofUploaded: "Bukti terunggah",
    proofRequired: "Bukti persetujuan atasan wajib dilampirkan.",
    uploading: "Mengunggah…",
    remarks: "Catatan",
    remarksPh: "cth. Bawa sampel produk baru",
    confirm: "Konfirmasi karyawan",
    confirmText:
      "Saya menyatakan informasi di atas benar dan memahami bahwa pengajuan ini tunduk pada persetujuan manajemen.",
    cancel: "Batal",
    submit: "Kirim pengajuan",
    resubmit: "Kirim ulang perbaikan",
    submitting: "Mengirim…",
    connection: "Koneksi bermasalah. Coba lagi.",
  },
  en: {
    secEmployee: "I. Employee Information",
    employee: "Employee",
    jobTitle: "Job title",
    jobTitleAuto: "Taken automatically from the employee record.",
    secTravel: "II. Travel Details",
    purpose: "Purpose of travel",
    purposePh: "e.g. Client visit & contract negotiation",
    destination: "Destination",
    destinationPh: "e.g. Surabaya, East Java",
    departure: "Departure date",
    ret: "Return date",
    duration: "Duration",
    durationValue: (n) => (n > 0 ? `${n} day${n === 1 ? "" : "s"}` : "—"),
    durationAuto: "Computed from both dates (departure and return days included).",
    transport: "Mode of transportation",
    transportOther: "Specify the transport",
    transportOtherPh: "e.g. Ferry",
    accommodation: "Accommodation required?",
    accYes: "Yes",
    accNo: "No",
    accDetails: "Accommodation details",
    accDetailsPh: "e.g. Hotel near the client office, 2 nights",
    secCost: "III. Estimated Expenses",
    costTransport: "Transportation cost",
    costAccommodation: "Accommodation cost",
    costPerDiem: "Per diem (meals, etc)",
    costOther: "Other expenses",
    total: "Estimated total",
    totalAuto: "Sum of the four costs above — no manual maths needed.",
    secAdvance: "IV. Travel Advance",
    advanceQ: "Request a travel advance?",
    advanceAmount: "Amount requested",
    advanceHint: (max) => `At most ${max} (the estimated total).`,
    secMore: "V. Additional Information",
    proof: "Proof of supervisor approval (required)",
    proofHint: "e.g. a photo/screenshot of the written approval (WA or else). One image or PDF file.",
    proofAdd: "Choose file",
    proofReplace: "Replace file",
    proofRemove: "Remove",
    proofUploaded: "Proof uploaded",
    proofRequired: "Proof of supervisor approval is required.",
    uploading: "Uploading…",
    remarks: "Remarks",
    remarksPh: "e.g. Bring the new product samples",
    confirm: "Employee confirmation",
    confirmText:
      "I confirm that the information provided is accurate and understand that this request is subject to management approval.",
    cancel: "Cancel",
    submit: "Submit request",
    resubmit: "Resubmit correction",
    submitting: "Submitting…",
    connection: "Connection problem. Try again.",
  },
};

/** Judul seksi — meniru penomoran form aslinya agar HR langsung mengenalinya. */
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="border-b border-line pb-1.5 text-xs font-semibold uppercase tracking-wide text-faint">
      {children}
    </p>
  );
}

function YesNo({
  value,
  onChange,
  yes,
  no,
  name,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  yes: string;
  no: string;
  name: string;
}) {
  return (
    <div className="inline-flex rounded-xl border border-line bg-cream/50 p-0.5">
      {[true, false].map((v) => (
        <button
          key={String(v)}
          type="button"
          aria-pressed={value === v}
          onClick={() => onChange(v)}
          className={`cursor-pointer rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
            value === v ? "bg-panel text-ink shadow-sm" : "text-muted hover:text-ink"
          }`}
        >
          {v ? yes : no}
        </button>
      ))}
      <input type="hidden" name={name} value={String(value)} />
    </div>
  );
}

type FormState = {
  employeeId: string;
  purpose: string;
  destination: string;
  departureDate: string;
  returnDate: string;
  transport: TravelTransport;
  transportOther: string;
  accommodationRequired: boolean;
  accommodationDetails: string;
  costTransport: string;
  costAccommodation: string;
  costPerDiem: string;
  costOther: string;
  advanceRequired: boolean;
  advanceAmount: string;
  remarks: string;
  confirmed: boolean;
};

/**
 * Form pengajuan perjalanan dinas.
 *
 * Tiga nilai sengaja TIDAK bisa diketik: nama, jabatan, lama perjalanan, dan
 * total biaya. Semuanya diturunkan — di sini untuk pratinjau, dan dihitung ulang
 * di server saat disimpan memakai fungsi yang sama. Jadi yang dilihat pengaju
 * dijamin sama dengan yang masuk database.
 */
export function TravelForm({
  item,
  employees,
  defaultEmployeeId,
  canPickEmployee,
  onSaved,
  onCancel,
}: {
  /** Diisi saat MEMPERBAIKI pengajuan yang dikembalikan penyetuju. */
  item?: TravelRequest;
  employees: TravelEmployeeOption[];
  defaultEmployeeId: string;
  /** HR boleh mengajukan atas nama karyawan lain; karyawan hanya dirinya. */
  canPickEmployee: boolean;
  onSaved: (saved: TravelRequest) => void;
  onCancel: () => void;
}) {
  const locale = useLocale();
  const t = STR[locale];
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const proofRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  // Saat memperbaiki pengajuan, bukti lama ikut terbawa — tak perlu unggah ulang.
  const [proof, setProof] = useState<{ path: string; label: string } | null>(() =>
    item?.approvalPath ? { path: item.approvalPath, label: STR[locale].proofUploaded } : null,
  );
  const money = (n: number) => (n > 0 ? String(n) : "");
  const [form, setForm] = useState<FormState>({
    employeeId: item?.employeeId ?? defaultEmployeeId,
    purpose: item?.purpose ?? "",
    destination: item?.destination ?? "",
    departureDate: item?.departureDate ?? "",
    returnDate: item?.returnDate ?? "",
    transport: item?.transport ?? "company_vehicle",
    transportOther: item?.transportOther ?? "",
    accommodationRequired: item?.accommodationRequired ?? false,
    accommodationDetails: item?.accommodationDetails ?? "",
    costTransport: money(item?.costTransport ?? 0),
    costAccommodation: money(item?.costAccommodation ?? 0),
    costPerDiem: money(item?.costPerDiem ?? 0),
    costOther: money(item?.costOther ?? 0),
    advanceRequired: item?.advanceRequired ?? false,
    advanceAmount: money(item?.advanceAmount ?? 0),
    remarks: item?.remarks ?? "",
    // Wajib dicentang lagi setiap kali dikirim — pernyataan harus disadari ulang.
    confirmed: false,
  });

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const num = (v: string) => (v.trim() === "" ? 0 : Number(v) || 0);

  const duration = useMemo(
    () => travelDuration(form.departureDate, form.returnDate),
    [form.departureDate, form.returnDate],
  );
  const total = useMemo(
    () =>
      travelTotal({
        costTransport: num(form.costTransport),
        costAccommodation: num(form.costAccommodation),
        costPerDiem: num(form.costPerDiem),
        costOther: num(form.costOther),
      }),
    [form.costTransport, form.costAccommodation, form.costPerDiem, form.costOther],
  );

  const selectedEmp = employees.find((e) => e.id === form.employeeId);

  async function pickProof(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      // Folder = karyawan yang DIAJUKAN (bisa berbeda dari pengunggah saat HR
      // mengajukan atas nama orang lain) — server memvalidasi bentuk path ini.
      const prepared = await prepareFileForBucket("travel-files", form.employeeId, file);
      if (prepared.path) setProof({ path: prepared.path, label: file.name });
    } catch (err) {
      toast.error(apiErrorMessage(err instanceof Error ? err.message : null, locale));
    } finally {
      setUploading(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!proof) return toast.error(t.proofRequired);
    setSaving(true);
    try {
      const res = await fetch("/api/travel", {
        method: item ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(item ? { id: item.id } : {}),
          employeeId: form.employeeId,
          purpose: form.purpose,
          destination: form.destination,
          departureDate: form.departureDate,
          returnDate: form.returnDate,
          transport: form.transport,
          transportOther: form.transportOther,
          accommodationRequired: form.accommodationRequired,
          accommodationDetails: form.accommodationDetails,
          costTransport: num(form.costTransport),
          costAccommodation: num(form.costAccommodation),
          costPerDiem: num(form.costPerDiem),
          costOther: num(form.costOther),
          advanceRequired: form.advanceRequired,
          advanceAmount: num(form.advanceAmount),
          remarks: form.remarks,
          approvalPath: proof?.path,
          confirmed: form.confirmed,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.request) {
        toast.error(apiErrorMessage(data?.error, locale, res.status));
        return;
      }
      onSaved(data.request as TravelRequest);
    } catch {
      toast.error(t.connection);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      {/* I. Informasi karyawan — tidak diketik, diambil dari data */}
      <div className="space-y-3">
        <SectionTitle>{t.secEmployee}</SectionTitle>
        {canPickEmployee ? (
          <Field label={t.employee}>
            <Select
              value={form.employeeId}
              onChange={(e) => {
                set("employeeId", e.target.value);
                // Berkas diunggah ke folder karyawan yang dipilih — ganti orang
                // berarti bukti lama salah folder dan harus diunggah ulang.
                setProof(null);
              }}
              required
            >
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <Field label={t.employee}>
            <Input value={selectedEmp?.name ?? "—"} readOnly className="bg-cream/60 text-muted" />
          </Field>
        )}
        <Field label={t.jobTitle} hint={t.jobTitleAuto}>
          <Input value={selectedEmp?.position || "—"} readOnly className="bg-cream/60 text-muted" />
        </Field>
      </div>

      {/* II. Rincian perjalanan */}
      <div className="space-y-3">
        <SectionTitle>{t.secTravel}</SectionTitle>
        <Field label={t.purpose}>
          <Textarea
            value={form.purpose}
            onChange={(e) => set("purpose", e.target.value)}
            placeholder={t.purposePh}
            rows={2}
            required
          />
        </Field>
        <Field label={t.destination}>
          <Input
            value={form.destination}
            onChange={(e) => set("destination", e.target.value)}
            placeholder={t.destinationPh}
            required
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t.departure}>
            <Input
              type="date"
              value={form.departureDate}
              onChange={(e) => set("departureDate", e.target.value)}
              required
            />
          </Field>
          <Field label={t.ret}>
            <Input
              type="date"
              value={form.returnDate}
              min={form.departureDate || undefined}
              onChange={(e) => set("returnDate", e.target.value)}
              required
            />
          </Field>
        </div>

        {/* Durasi = turunan, ditampilkan hidup supaya salah tanggal langsung terlihat */}
        <div className="flex items-center gap-2.5 rounded-xl border border-line bg-cream/50 px-3 py-2.5">
          <CalendarRange className="h-4 w-4 shrink-0 text-forest-600" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-muted">{t.duration}</p>
            <p className="text-sm font-semibold text-ink tabular-nums">{t.durationValue(duration)}</p>
          </div>
        </div>
        <p className="-mt-1.5 text-xs text-faint">{t.durationAuto}</p>

        <Field label={t.transport}>
          <Select
            value={form.transport}
            onChange={(e) => set("transport", e.target.value as TravelTransport)}
          >
            {TRANSPORTS.map((tr) => (
              <option key={tr} value={tr}>
                {TRANSPORT_LABEL[locale][tr]}
              </option>
            ))}
          </Select>
        </Field>
        {form.transport === "other" && (
          <Field label={t.transportOther}>
            <Input
              value={form.transportOther}
              onChange={(e) => set("transportOther", e.target.value)}
              placeholder={t.transportOtherPh}
            />
          </Field>
        )}

        <Field label={t.accommodation}>
          <YesNo
            value={form.accommodationRequired}
            onChange={(v) => set("accommodationRequired", v)}
            yes={t.accYes}
            no={t.accNo}
            name="accommodationRequired"
          />
        </Field>
        {form.accommodationRequired && (
          <Field label={t.accDetails}>
            <Textarea
              value={form.accommodationDetails}
              onChange={(e) => set("accommodationDetails", e.target.value)}
              placeholder={t.accDetailsPh}
              rows={2}
            />
          </Field>
        )}
      </div>

      {/* III. Estimasi biaya */}
      <div className="space-y-3">
        <SectionTitle>{t.secCost}</SectionTitle>
        <div className="grid grid-cols-2 gap-3">
          {(
            [
              ["costTransport", t.costTransport],
              ["costAccommodation", t.costAccommodation],
              ["costPerDiem", t.costPerDiem],
              ["costOther", t.costOther],
            ] as const
          ).map(([key, label]) => (
            <Field
              key={key}
              label={label}
              hint={num(form[key]) > 0 ? rupiah(num(form[key])) : undefined}
            >
              <Input
                type="number"
                min={0}
                inputMode="numeric"
                placeholder="0"
                value={form[key]}
                onChange={(e) => set(key, e.target.value)}
              />
            </Field>
          ))}
        </div>
        <div className="flex items-center justify-between gap-3 rounded-xl border border-forest-200 bg-forest-50 px-3 py-2.5">
          <span className="text-sm font-medium text-forest-700">{t.total}</span>
          <span className="font-display text-lg font-bold text-forest-700 tabular-nums">
            {rupiah(total)}
          </span>
        </div>
        <p className="-mt-1.5 text-xs text-faint">{t.totalAuto}</p>
      </div>

      {/* IV. Uang muka */}
      <div className="space-y-3">
        <SectionTitle>{t.secAdvance}</SectionTitle>
        <Field label={t.advanceQ}>
          <YesNo
            value={form.advanceRequired}
            onChange={(v) => set("advanceRequired", v)}
            yes={t.accYes}
            no={t.accNo}
            name="advanceRequired"
          />
        </Field>
        {form.advanceRequired && (
          <Field label={t.advanceAmount} hint={t.advanceHint(rupiah(total))}>
            <Input
              type="number"
              min={0}
              max={total || undefined}
              inputMode="numeric"
              placeholder="0"
              value={form.advanceAmount}
              onChange={(e) => set("advanceAmount", e.target.value)}
            />
          </Field>
        )}
      </div>

      {/* V. Informasi tambahan + pernyataan */}
      <div className="space-y-3">
        <SectionTitle>{t.secMore}</SectionTitle>

        {/* Bukti persetujuan atasan — WAJIB; tanpa ini tombol kirim tertahan. */}
        <Field label={t.proof} hint={t.proofHint}>
          <div className="flex items-center gap-3">
            <input
              ref={proofRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={pickProof}
            />
            {uploading ? (
              <div className="flex h-9 w-9 shrink-0 animate-pulse items-center justify-center rounded-xl bg-sand">
                <Loader2 className="h-4 w-4 animate-spin text-muted" />
              </div>
            ) : proof ? (
              <span className="flex min-w-0 items-center gap-2">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-forest-50 text-forest-600 ring-1 ring-line">
                  <ShieldCheck className="h-4 w-4" />
                </span>
                <span className="truncate text-xs font-medium text-muted">{proof.label}</span>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => proofRef.current?.click()}
                aria-label={t.proofAdd}
                className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-dashed border-line bg-cream/50 text-faint transition-colors hover:border-forest-300 hover:text-forest-600"
              >
                <FilePlus2 className="h-4 w-4" />
              </button>
            )}
            <div className="ml-auto flex shrink-0 items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => proofRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FilePlus2 className="h-4 w-4" />}
                {uploading ? t.uploading : proof ? t.proofReplace : t.proofAdd}
              </Button>
              {proof && !uploading && (
                <button
                  type="button"
                  onClick={() => setProof(null)}
                  className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-clay-soft hover:text-[#8c3c1f]"
                >
                  <Trash2 className="h-3.5 w-3.5" /> {t.proofRemove}
                </button>
              )}
            </div>
          </div>
        </Field>

        <Field label={t.remarks}>
          <Textarea
            value={form.remarks}
            onChange={(e) => set("remarks", e.target.value)}
            placeholder={t.remarksPh}
            rows={2}
          />
        </Field>
        <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-line bg-panel p-3">
          <input
            type="checkbox"
            checked={form.confirmed}
            onChange={(e) => set("confirmed", e.target.checked)}
            required
            className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-forest-600"
          />
          <span className="min-w-0">
            <span className="block text-sm font-medium text-ink">{t.confirm}</span>
            <span className="mt-0.5 block text-xs leading-snug text-muted">{t.confirmText}</span>
          </span>
        </label>
      </div>

      <div className="flex gap-2 pt-1">
        <Button type="button" variant="outline" className="flex-1" onClick={onCancel} disabled={saving}>
          {t.cancel}
        </Button>
        <Button type="submit" className="flex-1" disabled={saving || uploading || !form.confirmed || !proof}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
          {saving ? t.submitting : item ? t.resubmit : t.submit}
        </Button>
      </div>
    </form>
  );
}
