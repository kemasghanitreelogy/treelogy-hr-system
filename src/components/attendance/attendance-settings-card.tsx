"use client";

import { useState } from "react";
import { Loader2, Save, SlidersHorizontal } from "lucide-react";
import type { AttendanceSettings, Team } from "@/lib/types";
import { TEAM_META, TEAMS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { useLocale } from "@/components/layout/locale-context";
import type { Locale } from "@/lib/i18n";
import { GeofencePicker, type GeofencePickerLabels } from "./geofence-picker";

const STR: Record<
  Locale,
  {
    saved: string;
    saveFailed: string;
    title: string;
    desc: string;
    close: string;
    configure: string;
    locationName: string;
    maxRadius: string;
    maxRadiusHint: string;
    requirePhoto: string;
    requireLocation: string;
    saveSettings: string;
    searchPlaceholder: string;
    mapHint: string;
    useMyLocation: string;
    locating: string;
    mapLoadError: string;
  }
> = {
  id: {
    saved: "Pengaturan absensi tersimpan ✓",
    saveFailed: "Gagal menyimpan pengaturan (perlu izin HR).",
    title: "Pengaturan Lokasi Absensi (HR)",
    desc: "Atur titik & radius clock-in/out per divisi (Pabrik, Kebun, Kantor). Karyawan diabsen terhadap lokasi divisinya.",
    close: "Tutup",
    configure: "Atur",
    locationName: "Nama lokasi",
    maxRadius: "Radius maksimal (meter)",
    maxRadiusHint: "Clock-in/out hanya diterima dalam radius ini.",
    requirePhoto: "Wajib foto wajah saat clock-in/out",
    requireLocation: "Wajib lokasi aktif (geofence)",
    saveSettings: "Simpan pengaturan",
    searchPlaceholder: "Cari alamat atau tempat…",
    mapHint: "Geser pin, ketuk peta, atau cari alamat",
    useMyLocation: "Lokasi saya",
    locating: "Mengambil lokasi…",
    mapLoadError: "Peta gagal dimuat. Masukkan koordinat manual.",
  },
  en: {
    saved: "Attendance settings saved ✓",
    saveFailed: "Failed to save settings (HR permission required).",
    title: "Attendance Location Settings (HR)",
    desc: "Set the clock-in/out point & radius per division (Factory, Estate, Office). Employees are checked in against their division's location.",
    close: "Close",
    configure: "Configure",
    locationName: "Location name",
    maxRadius: "Maximum radius (meters)",
    maxRadiusHint: "Clock-in/out is only accepted within this radius.",
    requirePhoto: "Require face photo at clock-in/out",
    requireLocation: "Require active location (geofence)",
    saveSettings: "Save settings",
    searchPlaceholder: "Search an address or place…",
    mapHint: "Drag the pin, tap the map, or search an address",
    useMyLocation: "My location",
    locating: "Getting location…",
    mapLoadError: "Map failed to load. Enter coordinates manually.",
  },
};

export function AttendanceSettingsCard({
  initial,
  googleMapsApiKey = "",
}: {
  initial: AttendanceSettings;
  googleMapsApiKey?: string;
}) {
  const locale = useLocale();
  const t = STR[locale];
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const pickerLabels: GeofencePickerLabels = {
    searchPlaceholder: t.searchPlaceholder,
    hint: t.mapHint,
    useMyLocation: t.useMyLocation,
    locating: t.locating,
    loadError: t.mapLoadError,
    latLabel: "Latitude",
    lngLabel: "Longitude",
  };

  function setGeo(team: Team, patch: Partial<AttendanceSettings["geofences"][Team]>) {
    setForm((f) => ({ ...f, geofences: { ...f.geofences, [team]: { ...f.geofences[team], ...patch } } }));
  }

  async function save() {
    setBusy(true);
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

                <GeofencePicker
                  apiKey={googleMapsApiKey}
                  lat={g.lat}
                  lng={g.lng}
                  radiusM={g.radiusM}
                  onChange={(p) => setGeo(team, p)}
                  onPickName={(name) => setGeo(team, { label: name })}
                  labels={pickerLabels}
                />

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
