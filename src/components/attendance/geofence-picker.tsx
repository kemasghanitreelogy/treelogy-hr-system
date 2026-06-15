"use client";

import { useEffect, useRef, useState } from "react";
import { Crosshair, Loader2, MapPin, Search, X } from "lucide-react";
import { loadGoogleMaps } from "@/lib/google-maps";
import { Field, Input } from "@/components/ui/field";

export interface GeofencePickerLabels {
  searchPlaceholder: string;
  hint: string;
  useMyLocation: string;
  locating: string;
  loadError: string;
  latLabel: string;
  lngLabel: string;
}

type Status = "loading" | "ready" | "error";

/**
 * Map-based geofence point picker: drag the pin, tap the map, or search an
 * address (Places autocomplete). Replaces raw lat/long entry. Falls back to
 * manual coordinate inputs if the Maps SDK can't load.
 */
export function GeofencePicker({
  apiKey,
  lat,
  lng,
  radiusM,
  onChange,
  onPickName,
  labels,
}: {
  apiKey: string;
  lat: number;
  lng: number;
  radiusM: number;
  onChange: (p: { lat: number; lng: number }) => void;
  onPickName?: (name: string) => void;
  labels: GeofencePickerLabels;
}) {
  const mapEl = useRef<HTMLDivElement>(null);
  const searchEl = useRef<HTMLInputElement>(null);
  const gm = useRef<{
    map?: google.maps.Map;
    marker?: google.maps.Marker;
    circle?: google.maps.Circle;
  }>({});

  // Latest values/handlers via refs so the one-time init effect never goes stale.
  const valueRef = useRef({ lat, lng, radiusM });
  valueRef.current = { lat, lng, radiusM };
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onPickNameRef = useRef(onPickName);
  onPickNameRef.current = onPickName;

  const [status, setStatus] = useState<Status>(apiKey ? "loading" : "error");
  const [locating, setLocating] = useState(false);

  // ---- One-time map init ----
  useEffect(() => {
    if (!apiKey || !mapEl.current) return;
    let cancelled = false;

    loadGoogleMaps(apiKey)
      .then((maps) => {
        if (cancelled || !mapEl.current) return;
        const { lat, lng, radiusM } = valueRef.current;
        const center = { lat, lng };

        const map = new maps.Map(mapEl.current, {
          center,
          zoom: 16,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          clickableIcons: false,
          gestureHandling: "greedy",
          zoomControl: true,
          zoomControlOptions: { position: maps.ControlPosition.RIGHT_BOTTOM },
        });

        const marker = new maps.Marker({
          map,
          position: center,
          draggable: true,
          animation: maps.Animation.DROP,
          icon: {
            path: "M12 0C7.03 0 3 4.03 3 9c0 6.08 7.6 14.1 8.27 14.79a1 1 0 0 0 1.46 0C13.4 23.1 21 15.08 21 9c0-4.97-4.03-9-9-9z",
            fillColor: "#3d5a2e",
            fillOpacity: 1,
            strokeColor: "#ffffff",
            strokeWeight: 2,
            scale: 1.7,
            anchor: new maps.Point(12, 23),
          },
          title: labels.hint,
        });

        const circle = new maps.Circle({
          map,
          center,
          radius: radiusM,
          fillColor: "#4d7c3a",
          fillOpacity: 0.12,
          strokeColor: "#4d7c3a",
          strokeOpacity: 0.55,
          strokeWeight: 1.5,
          clickable: false,
        });

        const commit = (pos: { lat: number; lng: number }, pan = false) => {
          marker.setPosition(pos);
          circle.setCenter(pos);
          if (pan) map.panTo(pos);
          onChangeRef.current({ lat: Number(pos.lat.toFixed(6)), lng: Number(pos.lng.toFixed(6)) });
        };

        marker.addListener("dragend", () => {
          const p = marker.getPosition();
          if (p) commit({ lat: p.lat(), lng: p.lng() });
        });
        map.addListener("click", (e: google.maps.MapMouseEvent) => {
          if (e.latLng) commit({ lat: e.latLng.lat(), lng: e.latLng.lng() }, true);
        });

        // Places autocomplete on the search box.
        if (searchEl.current && maps.places?.Autocomplete) {
          const ac = new maps.places.Autocomplete(searchEl.current, {
            fields: ["geometry", "name", "formatted_address"],
          });
          ac.bindTo("bounds", map);
          ac.addListener("place_changed", () => {
            const place = ac.getPlace();
            const loc = place.geometry?.location;
            if (!loc) return;
            const pos = { lat: loc.lat(), lng: loc.lng() };
            map.setZoom(17);
            commit(pos, true);
            if (place.name) onPickNameRef.current?.(place.name);
          });
        }

        gm.current = { map, marker, circle };
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey]);

  // External coordinate changes (e.g. "use my location") → move pin + recenter.
  useEffect(() => {
    const { map, marker, circle } = gm.current;
    if (!map || !marker || !circle) return;
    const pos = { lat, lng };
    marker.setPosition(pos);
    circle.setCenter(pos);
    map.panTo(pos);
  }, [lat, lng]);

  // Radius changes → resize the circle smoothly.
  useEffect(() => {
    gm.current.circle?.setRadius(radiusM);
  }, [radiusM]);

  function useMyLocation() {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onChange({
          lat: Number(pos.coords.latitude.toFixed(6)),
          lng: Number(pos.coords.longitude.toFixed(6)),
        });
        gm.current.map?.setZoom(17);
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 12000 },
    );
  }

  // ---- Fallback: no key or SDK failed → manual lat/long ----
  if (status === "error") {
    return (
      <div className="space-y-3">
        <div className="flex items-start gap-2 rounded-xl border border-gold/40 bg-gold-soft/40 px-3 py-2 text-xs text-[#7a5b12]">
          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{labels.loadError}</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={labels.latLabel}>
            <Input type="number" step="any" value={lat} onChange={(e) => onChange({ lat: Number(e.target.value), lng })} />
          </Field>
          <Field label={labels.lngLabel}>
            <Input type="number" step="any" value={lng} onChange={(e) => onChange({ lat, lng: Number(e.target.value) })} />
          </Field>
        </div>
        <button
          type="button"
          onClick={useMyLocation}
          disabled={locating}
          className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-panel px-3 py-2 text-sm font-medium text-ink transition-colors hover:bg-sand disabled:opacity-60"
        >
          {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crosshair className="h-4 w-4" />}
          {locating ? labels.locating : labels.useMyLocation}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative overflow-hidden rounded-2xl border border-line bg-sand/40 shadow-sm">
        {/* Floating search bar */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-[2] flex justify-center p-2.5">
          <div className="pointer-events-auto flex w-full max-w-md items-center gap-2 rounded-xl border border-line bg-panel/95 px-3 py-2 shadow-md backdrop-blur supports-[backdrop-filter]:bg-panel/80">
            <Search className="h-4 w-4 shrink-0 text-faint" />
            <input
              ref={searchEl}
              type="text"
              placeholder={labels.searchPlaceholder}
              className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-faint"
              onKeyDown={(e) => {
                if (e.key === "Enter") e.preventDefault(); // let autocomplete own Enter
              }}
            />
            <button
              type="button"
              aria-label="clear"
              onClick={() => {
                if (searchEl.current) searchEl.current.value = "";
              }}
              className="shrink-0 rounded-md p-0.5 text-faint transition-colors hover:bg-sand hover:text-ink"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Map canvas */}
        <div ref={mapEl} className="h-[300px] w-full transition-opacity duration-500" style={{ opacity: status === "ready" ? 1 : 0 }} />

        {/* Loading skeleton */}
        {status === "loading" && (
          <div className="absolute inset-0 z-[1] flex items-center justify-center bg-sand/60">
            <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-sand/30 via-cream/40 to-sand/30" />
            <div className="relative flex items-center gap-2 text-sm text-muted">
              <Loader2 className="h-4 w-4 animate-spin" /> {labels.locating}
            </div>
          </div>
        )}

        {/* Use-my-location pill (bottom-left, opposite the zoom controls) */}
        {status === "ready" && (
          <button
            type="button"
            onClick={useMyLocation}
            disabled={locating}
            className="absolute bottom-3 left-3 z-[2] inline-flex items-center gap-1.5 rounded-full border border-line bg-panel/95 px-3 py-1.5 text-xs font-semibold text-ink shadow-md backdrop-blur transition-all hover:bg-sand active:scale-95 disabled:opacity-60"
          >
            {locating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Crosshair className="h-3.5 w-3.5" />}
            {locating ? labels.locating : labels.useMyLocation}
          </button>
        )}
      </div>

      <p className="flex items-center gap-1.5 px-0.5 text-xs text-faint">
        <MapPin className="h-3 w-3" /> {labels.hint}
        <span className="ml-auto font-mono tabular-nums text-muted/80">
          {lat.toFixed(5)}, {lng.toFixed(5)}
        </span>
      </p>
    </div>
  );
}
