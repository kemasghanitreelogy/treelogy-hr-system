/* Singleton loader for the Google Maps JS SDK (+ Places). Multiple pickers on
   one page share a single <script> load via the cached promise. */
let loader: Promise<typeof google.maps> | null = null;

export function loadGoogleMaps(apiKey: string): Promise<typeof google.maps> {
  if (typeof window === "undefined") return Promise.reject(new Error("no_window"));
  if (!apiKey) return Promise.reject(new Error("no_api_key"));
  const w = window as typeof window & { google?: { maps?: typeof google.maps }; __gmapsInit?: () => void };
  if (w.google?.maps?.places) return Promise.resolve(w.google.maps);
  if (loader) return loader;

  loader = new Promise<typeof google.maps>((resolve, reject) => {
    w.__gmapsInit = () => {
      if (w.google?.maps) resolve(w.google.maps);
      else reject(new Error("maps_unavailable"));
    };
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&loading=async&callback=__gmapsInit`;
    script.async = true;
    script.onerror = () => {
      loader = null; // allow a later retry
      reject(new Error("maps_load_failed"));
    };
    document.head.appendChild(script);
  });
  return loader;
}
