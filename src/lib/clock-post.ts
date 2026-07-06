/**
 * Resilient clock POST, shared by the widget and the offline-queue drainer.
 * The attendance write is idempotent (upsert on employee_id+date), so we can
 * safely retry with backoff, time each attempt out, and use `keepalive` (only
 * when the body is safely under the ~64KB cap) so a request can still finish if
 * the app is closed mid-submit. Returns the server Response (any status < 500 is
 * a definitive answer); throws only when every attempt fails at the network level.
 */
/**
 * Whether a server response is FINAL — safe to drop the queued copy. A success
 * or a permanent request-level 4xx (bad photo, out of range, etc.) won't change
 * on replay, so it's done. Auth (401), timeout (408), rate-limit (429) and 5xx
 * are transient → keep the item and retry later.
 */
export function isFinalClockResponse(status: number): boolean {
  if (status >= 200 && status < 300) return true;
  if (status === 401 || status === 408 || status === 429 || status >= 500) return false;
  return status >= 400 && status < 500;
}

export async function postClock(body: unknown): Promise<Response> {
  const payload = JSON.stringify(body);
  const keepalive = new Blob([payload]).size < 60_000;
  const backoffs = [0, 700, 1800]; // 3 attempts
  let lastErr: unknown;
  for (let i = 0; i < backoffs.length; i++) {
    if (backoffs[i]) await new Promise((r) => setTimeout(r, backoffs[i]));
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);
    try {
      const res = await fetch("/api/attendance/clock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        keepalive,
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (res.status >= 500) {
        lastErr = new Error(`server_${res.status}`);
        continue; // transient server error → retry
      }
      return res; // 2xx / 4xx = definitive, don't retry
    } catch (e) {
      clearTimeout(timer);
      lastErr = e; // network error / timeout → retry
    }
  }
  throw lastErr ?? new Error("network");
}
