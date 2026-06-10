"use client";

import { useState } from "react";
import { Crosshair, Loader2, MapPin, Save, SlidersHorizontal } from "lucide-react";
import type { AttendanceSettings } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";

export function AttendanceSettingsCard({ initial }: { initial: AttendanceSettings }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const toast = useToast();

  function set<K extends keyof AttendanceSettings>(k: K, v: AttendanceSettings[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function useMyLocation() {
    setLocating(true);
    setMsg(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        set("officeLat", Number(pos.coords.latitude.toFixed(6)));
        set("officeLng", Number(pos.coords.longitude.toFixed(6)));
        setLocating(false);
        setMsg({ tone: "ok", text: "Koordinat kantor diisi dari lokasi Anda saat ini." });
      },
      () => {
        setLocating(false);
        setMsg({ tone: "error", text: "Gagal mengambil lokasi. Izinkan akses lokasi." });
      },
      { enableHighAccuracy: true, timeout: 12000 },
    );
  }

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/attendance/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error();
      toast.success("Pengaturan absensi tersimpan ✓");
    } catch {
      toast.error("Gagal menyimpan pengaturan (perlu izin HR).");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Pengaturan Lokasi Absensi (HR)</CardTitle>
          <p className="mt-0.5 text-sm text-muted">
            Atur titik kantor &amp; radius maksimal clock-in/out, foto wajah, dan lokasi.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setOpen((o) => !o)}>
          <SlidersHorizontal className="h-4 w-4" /> {open ? "Tutup" : "Atur"}
        </Button>
      </CardHeader>
      {open && (
        <CardContent className="space-y-4">
          <Field label="Nama lokasi kantor">
            <Input value={form.officeLabel} onChange={(e) => set("officeLabel", e.target.value)} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Latitude">
              <Input type="number" step="any" value={form.officeLat} onChange={(e) => set("officeLat", Number(e.target.value))} />
            </Field>
            <Field label="Longitude">
              <Input type="number" step="any" value={form.officeLng} onChange={(e) => set("officeLng", Number(e.target.value))} />
            </Field>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={useMyLocation} disabled={locating}>
              {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crosshair className="h-4 w-4" />}
              Gunakan lokasi saya sebagai kantor
            </Button>
            <a
              href={`https://www.openstreetmap.org/?mlat=${form.officeLat}&mlon=${form.officeLng}#map=18/${form.officeLat}/${form.officeLng}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-line bg-panel px-3 text-xs font-medium text-muted hover:bg-sand"
            >
              <MapPin className="h-3.5 w-3.5" /> Lihat di peta
            </a>
          </div>

          <Field label="Radius maksimal (meter)" hint="Clock-in/out hanya diterima dalam radius ini dari titik kantor.">
            <Input type="number" min={1} value={form.maxRadiusM} onChange={(e) => set("maxRadiusM", Number(e.target.value))} />
          </Field>

          <div className="space-y-2">
            <Toggle label="Wajib foto wajah saat clock-in/out" checked={form.requirePhoto} onChange={(v) => set("requirePhoto", v)} />
            <Toggle label="Wajib lokasi aktif (geofence)" checked={form.requireLocation} onChange={(v) => set("requireLocation", v)} />
          </div>

          {msg && (
            <p className={msg.tone === "ok" ? "text-sm text-forest-600" : "text-sm text-clay"}>{msg.text}</p>
          )}

          <Button onClick={save} disabled={busy} className="w-full sm:w-auto">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Simpan pengaturan
          </Button>
        </CardContent>
      )}
    </Card>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full cursor-pointer items-center justify-between rounded-xl border border-line bg-panel px-3 py-2.5 text-left text-sm text-ink"
    >
      {label}
      <span className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? "bg-forest-600" : "bg-sand"}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? "left-[22px]" : "left-0.5"}`} />
      </span>
    </button>
  );
}
