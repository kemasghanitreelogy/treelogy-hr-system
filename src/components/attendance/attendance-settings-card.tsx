"use client";

import { useState } from "react";
import { Crosshair, Loader2, MapPin, Save, SlidersHorizontal } from "lucide-react";
import type { AttendanceSettings, Team } from "@/lib/types";
import { TEAM_META, TEAMS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { useLocale } from "@/components/layout/locale-context";
import type { Locale } from "@/lib/i18n";

const STR: Record<
  Locale,
  {
    coordsFilled: (label: string) => string;
    locationFailed: string;
    saved: string;
    saveFailed: string;
    title: string;
    desc: string;
    close: string;
    configure: string;
    locationName: string;
    useMyLocation: string;
    viewOnMap: string;
    maxRadius: string;
    maxRadiusHint: string;
    requirePhoto: string;
    requireLocation: string;
    saveSettings: string;
  }
> = {
  id: {
    coordsFilled: (label) => `Koordinat ${label} diisi dari lokasi Anda saat ini.`,
    locationFailed: "Gagal mengambil lokasi. Izinkan akses lokasi.",
    saved: "Pengaturan absensi tersimpan ✓",
    saveFailed: "Gagal menyimpan pengaturan (perlu izin HR).",
    title: "Pengaturan Lokasi Absensi (HR)",
    desc: "Atur titik & radius clock-in/out per divisi (Pabrik, Kebun, Kantor). Karyawan diabsen terhadap lokasi divisinya.",
    close: "Tutup",
    configure: "Atur",
    locationName: "Nama lokasi",
    useMyLocation: "Gunakan lokasi saya",
    viewOnMap: "Lihat di peta",
    maxRadius: "Radius maksimal (meter)",
    maxRadiusHint: "Clock-in/out hanya diterima dalam radius ini.",
    requirePhoto: "Wajib foto wajah saat clock-in/out",
    requireLocation: "Wajib lokasi aktif (geofence)",
    saveSettings: "Simpan pengaturan",
  },
  en: {
    coordsFilled: (label) => `${label} coordinates filled from your current location.`,
    locationFailed: "Failed to get location. Allow location access.",
    saved: "Attendance settings saved ✓",
    saveFailed: "Failed to save settings (HR permission required).",
    title: "Attendance Location Settings (HR)",
    desc: "Set the clock-in/out point & radius per division (Factory, Estate, Office). Employees are checked in against their division's location.",
    close: "Close",
    configure: "Configure",
    locationName: "Location name",
    useMyLocation: "Use my location",
    viewOnMap: "View on map",
    maxRadius: "Maximum radius (meters)",
    maxRadiusHint: "Clock-in/out is only accepted within this radius.",
    requirePhoto: "Require face photo at clock-in/out",
    requireLocation: "Require active location (geofence)",
    saveSettings: "Save settings",
  },
};

export function AttendanceSettingsCard({ initial }: { initial: AttendanceSettings }) {
  const locale = useLocale();
  const t = STR[locale];
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState<Team | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const toast = useToast();

  function setGeo(team: Team, patch: Partial<AttendanceSettings["geofences"][Team]>) {
    setForm((f) => ({ ...f, geofences: { ...f.geofences, [team]: { ...f.geofences[team], ...patch } } }));
  }

  function useMyLocation(team: Team) {
    setLocating(team);
    setMsg(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeo(team, {
          lat: Number(pos.coords.latitude.toFixed(6)),
          lng: Number(pos.coords.longitude.toFixed(6)),
        });
        setLocating(null);
        setMsg({ tone: "ok", text: t.coordsFilled(TEAM_META[team].label) });
      },
      () => {
        setLocating(null);
        setMsg({ tone: "error", text: t.locationFailed });
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
      toast.success(t.saved);
    } catch {
      toast.error(t.saveFailed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>{t.title}</CardTitle>
          <p className="mt-0.5 text-sm text-muted">{t.desc}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setOpen((o) => !o)}>
          <SlidersHorizontal className="h-4 w-4" /> {open ? t.close : t.configure}
        </Button>
      </CardHeader>
      {open && (
        <CardContent className="space-y-5">
          {TEAMS.map((team) => {
            const g = form.geofences[team];
            return (
              <div key={team} className="space-y-3 rounded-xl border border-line p-4">
                <span className={cn("inline-block rounded-lg px-2.5 py-1 text-xs font-semibold", TEAM_META[team].chip)}>
                  {TEAM_META[team].label}
                </span>

                <Field label={t.locationName}>
                  <Input value={g.label} onChange={(e) => setGeo(team, { label: e.target.value })} />
                </Field>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Latitude">
                    <Input
                      type="number"
                      step="any"
                      value={g.lat}
                      onChange={(e) => setGeo(team, { lat: Number(e.target.value) })}
                    />
                  </Field>
                  <Field label="Longitude">
                    <Input
                      type="number"
                      step="any"
                      value={g.lng}
                      onChange={(e) => setGeo(team, { lng: Number(e.target.value) })}
                    />
                  </Field>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" size="sm" onClick={() => useMyLocation(team)} disabled={locating === team}>
                    {locating === team ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crosshair className="h-4 w-4" />}
                    {t.useMyLocation}
                  </Button>
                  <a
                    href={`https://www.openstreetmap.org/?mlat=${g.lat}&mlon=${g.lng}#map=18/${g.lat}/${g.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-line bg-panel px-3 text-xs font-medium text-muted hover:bg-sand"
                  >
                    <MapPin className="h-3.5 w-3.5" /> {t.viewOnMap}
                  </a>
                </div>

                <Field label={t.maxRadius} hint={t.maxRadiusHint}>
                  <Input
                    type="number"
                    min={1}
                    value={g.radiusM}
                    onChange={(e) => setGeo(team, { radiusM: Number(e.target.value) })}
                  />
                </Field>
              </div>
            );
          })}

          <div className="space-y-2">
            <Toggle
              label={t.requirePhoto}
              checked={form.requirePhoto}
              onChange={(v) => setForm((f) => ({ ...f, requirePhoto: v }))}
            />
            <Toggle
              label={t.requireLocation}
              checked={form.requireLocation}
              onChange={(v) => setForm((f) => ({ ...f, requireLocation: v }))}
            />
          </div>

          {msg && <p className={msg.tone === "ok" ? "text-sm text-forest-600" : "text-sm text-clay"}>{msg.text}</p>}

          <Button onClick={save} disabled={busy} className="w-full sm:w-auto">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {t.saveSettings}
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
