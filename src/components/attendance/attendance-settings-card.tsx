"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, RotateCcw, Save, SlidersHorizontal } from "lucide-react";
import type { AttendanceSettings, Team } from "@/lib/types";
import { TEAM_META, TEAMS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { useLocale } from "@/components/layout/locale-context";
import { apiErrorMessage } from "@/lib/api-error";
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
    unsaved: string;
    discard: string;
    saveShort: string;
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
    unsaved: "Ada perubahan belum disimpan",
    discard: "Batalkan",
    saveShort: "Simpan",
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
    unsaved: "You have unsaved changes",
    discard: "Discard",
    saveShort: "Save",
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
  // Saved baseline — the floating bar appears whenever `form` drifts from this.
  const [baseline, setBaseline] = useState(initial);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const dirty = JSON.stringify(form) !== JSON.stringify(baseline);

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

  function discard() {
    setForm(baseline);
  }

  async function save() {
    setBusy(true);
    try {
      const res = await fetch("/api/attendance/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(apiErrorMessage(data?.error, locale, res.status));
        return;
      }
      setBaseline(form); // changes are now the saved state → hide the bar
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
        </CardContent>
      )}
      <UnsavedBar
        visible={open && dirty}
        busy={busy}
        onSave={save}
        onDiscard={discard}
        labels={{ unsaved: t.unsaved, discard: t.discard, save: t.saveShort }}
      />
    </Card>
  );
}

/**
 * Floating "unsaved changes" bar that glides down from the top whenever the
 * settings drift from the last saved state. Portaled to <body> so it floats
 * above everything and is unaffected by ancestor transforms.
 */
function UnsavedBar({
  visible,
  busy,
  onSave,
  onDiscard,
  labels,
}: {
  visible: boolean;
  busy: boolean;
  onSave: () => void;
  onDiscard: () => void;
  labels: { unsaved: string; discard: string; save: string };
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return createPortal(
    <div
      className={cn(
        "pointer-events-none fixed inset-x-0 top-[4.5rem] z-[70] flex justify-center px-4 transition-all duration-300 ease-out",
        visible ? "translate-y-0 opacity-100" : "-translate-y-6 opacity-0",
      )}
    >
      <div
        className={cn(
          "flex items-center gap-3 rounded-2xl border border-line bg-panel/90 py-2 pl-4 pr-2 shadow-pop ring-1 ring-black/5 backdrop-blur-md transition-transform",
          visible ? "pointer-events-auto" : "pointer-events-none",
        )}
      >
        <span className="flex items-center gap-2 text-sm font-medium text-ink">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gold opacity-70" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-gold" />
          </span>
          {labels.unsaved}
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onDiscard}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-sand hover:text-ink disabled:opacity-50"
          >
            <RotateCcw className="h-3.5 w-3.5" /> {labels.discard}
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-xl bg-forest-600 px-3.5 py-1.5 text-sm font-semibold text-cream shadow-sm transition-all hover:bg-forest-700 active:scale-95 disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {labels.save}
          </button>
        </div>
      </div>
    </div>,
    document.body,
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
