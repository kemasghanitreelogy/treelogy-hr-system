# 🌿 Treelogy HR System

A world-class, **mobile-first** HR system for **Treelogy** (premium organic moringa, Bali) — built with
**Next.js 15 (App Router) + TypeScript + Tailwind v4**, backed by **Supabase** (Postgres + Auth + RLS).

Designed for three workforce types: **factory**, **farm**, and **sales/office** teams.
Planning was done with **SuperClaude** (`/sc:workflow`) and the UI with **ui-ux-pro-max** using the
Treelogy organic-green palette.

## ✨ Modules

| Module | Features |
|--------|----------|
| **Attendance & Time** | Live clock in/out widget, daily attendance recap, late & overtime tracking, per-team filters |
| **Shifts** | Shift definitions (factory pagi/siang/malam, farm, office), **day-off in lieu / tukar libur** approvals |
| **Leave** | Annual & sick leave requests + approvals, leave balances, **tabungan libur** (saved day-off bank) |
| **Payroll** | Auto payroll from attendance recap, **BPJS** & **PPh 21 (TER 2024)**, payslip detail, **bank-transfer CSV export** |
| **Employees** | Centralized DB, search & filters, active/inactive toggle, compensation & tax profile |
| **KPI** | Per-employee scorecards with weighted achievement (lower priority module) |

## 🎨 Design system

Organic-green Treelogy palette (`src/app/globals.css`):
`forest #3d5a2e` · `olive #6b7548` · `matcha #8ba859` · `lime #a4c26a` · `cream #f6f4ea` · `bark #26331e`.
Fonts: **Sora** (display) + **Inter** (body). Data-dense dashboard pattern, WCAG-AA contrast.

**Mobile-first:** collapsible drawer sidebar + bottom tab bar, card layouts replace tables on small
screens, 44px+ touch targets, `prefers-reduced-motion` respected.

## 🚀 Getting started

```bash
npm install
npm run dev          # http://localhost:3000  → redirects to /dashboard
```

The app runs immediately with **built-in seed data** (no backend required).

## 🔌 Connect Supabase (optional but recommended)

1. Create a project at [supabase.com](https://supabase.com).
2. Apply the schema & seed:
   ```bash
   # with the Supabase CLI
   supabase db reset            # runs migrations + seed.sql
   # or manually
   psql "$DATABASE_URL" -f supabase/migrations/0001_init.sql
   psql "$DATABASE_URL" -f supabase/seed.sql
   ```
3. Copy env and fill in keys:
   ```bash
   cp .env.example .env.local
   ```
   ```
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   ```
4. Restart. `isSupabaseConfigured` flips on and `src/lib/supabase/{client,server}.ts` are ready to use.

The data layer (`src/lib/data.ts`) exposes the same shapes whether reading seed data or Supabase, so
swapping queries in is incremental — no page changes required. RLS policies (`is_hr()`, `my_employee_id()`)
already gate access by role.

## 📱 PWA (installable + offline)

Fully installable, mobile-optimized PWA:

- **Manifest** (`src/app/manifest.ts`) — standalone display, Treelogy theme, app **shortcuts** (Absensi / Cuti / Payroll).
- **Icons** (`public/icons/`) — 192/512 + **maskable** + Apple touch icon + favicons, generated from the brand sprout mark via `npm run generate:icons`.
- **Service worker** (`public/sw.js`) — offline-first: app-shell precache, **navigation network-first** with `/offline` fallback, **stale-while-revalidate** for static assets, navigation preload, auto-update.
- **Install prompt** (`InstallPrompt`) — Android/desktop A2HS button + iOS “Add to Home Screen” hint, dismiss-aware.
- iOS meta (`apple-web-app`), `theme-color`, `viewport-fit=cover` for notch devices.

> The service worker registers only in **production** (`npm run build && npm run start`) to keep dev HMR clean.

## 📍 Clock-in/out: selfie + geofence

Every clock-in/out enforces **face photo + location** (configurable by HR):

- **Face selfie** — full-screen camera with an oval face guide. *Photo only — no face detection/recognition.* Mirrored capture, center-cropped, uploaded to a private Supabase Storage bucket (`attendance-selfies`).
- **Mandatory GPS** — uses the browser Geolocation API; blocked if location is off/denied.
- **Geofence** — Haversine distance to the office point; clock-in/out rejected outside the allowed radius (server re-validates, never trusting the client).
- **HR settings** (`attendance.manage` permission) — on the Attendance page: set office name, lat/lng (or "use my location"), **max radius (e.g. 10 m)**, and toggle photo/location requirements. Stored in `attendance_settings`.

Flow: `ClockWidget` → check geolocation → distance ≤ radius → `CameraCapture` → `POST /api/attendance/clock` (re-validates geofence, uploads selfie, records `attendance` with coords + distance + photo).

## 🔐 Authentication & roles

- **Supabase Auth** (email/password) with cookie sessions via `@supabase/ssr`.
- **`middleware.ts`** refreshes the session and gates every route — unauthenticated users are redirected to `/login`; public paths: `/login`, `/offline`, icons, manifest, `sw.js`.
- **Permission-aware UI**: the sidebar/bottom-nav only shows modules the user's role permits (`visibleNav`), driven by `getSessionUser()` → profile → role permissions.
- **RLS** enforces access at the database — verified: authenticated admin reads all; anon reads nothing.

Default admin (created during setup — credentials shared privately; **change the password on first login**):
```
email:    kemas@treelogy.com
password: <set during setup — see .env.local / ask admin>
```
Create more users: `node --env-file=.env.local scripts/create-admin.mjs <email> <password>`, then assign a role in **Peran & Akses**, or insert a `profiles` row.

> Seed mode (no Supabase env) skips the auth gate so the app stays demoable offline.

## 🚀 Deploy to production (Vercel)

1. Push the repo and import it in Vercel.
2. Set Environment Variables (Production + Preview):
   ```
   NEXT_PUBLIC_SUPABASE_URL
   NEXT_PUBLIC_SUPABASE_ANON_KEY      # Supabase "publishable" key
   SUPABASE_SERVICE_ROLE_KEY          # Supabase "secret" key (server only)
   NEXT_PUBLIC_VAPID_PUBLIC_KEY
   VAPID_PRIVATE_KEY
   VAPID_SUBJECT
   ```
3. Deploy. HTTPS is automatic → PWA install, offline, and Web Push all work in production.
4. Health checks:
   ```
   node --env-file=.env.local scripts/check-supabase.mjs    # schema + seed
   node --env-file=.env.local scripts/check-auth-rls.mjs     # auth + RLS
   ```

Migrations live in `supabase/migrations/` (0001–0005). Dynamic demo data: `node --experimental-strip-types --env-file=.env.local scripts/seed-dynamic.ts`.

## 🔔 Web Push notifications (native, no third-party)

Self-hosted Web Push using **VAPID** — no OneSignal/Firebase needed.

- **Opt-in UI** (`PushManager` on the dashboard): aktifkan/matikan + kirim notifikasi uji.
- **Service worker** handles `push` (show notification) and `notificationclick` (focus/open app).
- **API**: `POST /api/push/subscribe` (save), `DELETE` (remove), `POST /api/push/send` (broadcast or per-user).
- **Store**: in-memory by default (works offline-of-Supabase); table `push_subscriptions` (`0003_push.sql`) for persistence.

Setup:
```bash
npx web-push generate-vapid-keys --json   # already generated into .env.local
# .env.local:
# NEXT_PUBLIC_VAPID_PUBLIC_KEY=...
# VAPID_PRIVATE_KEY=...
# VAPID_SUBJECT=mailto:hr@treelogy.com
npm run build && npm run start            # SW + push only run in production
```

> **iOS:** Web Push hanya bekerja jika PWA **sudah di-Install ke Home Screen** (Safari 16.4+). Android/desktop langsung jalan. Butuh HTTPS (otomatis di Vercel) atau `localhost`.

Trigger ideas: reminder clock-in (Vercel Cron → `/api/push/send`), notifikasi approval cuti, payroll selesai.

## 🧮 Payroll engine (`src/lib/payroll.ts`)

- **BPJS Kesehatan** 1%/4% (cap Rp 12 jt) · **JHT** 2%/3.7% · **JP** 1%/2% (cap Rp 10.5 jt) · **JKK/JKM** by team risk.
- **PPh 21** via the **TER** monthly method (PP 58/2023) — categories A/B/C by PTKP status.
- **Overtime** per Kepmenaker: 1.5× first hour, 2× subsequent (hourly = monthly / 173).

## 📁 Structure

```
src/
  app/(dashboard)/       dashboard, attendance, shifts, leave, payroll, employees, kpi
  components/            layout, ui primitives, per-module views
  lib/                   types, seed, data API, payroll engine, supabase clients
supabase/                migrations + seed.sql
claudedocs/              SuperClaude workflow plan
```

## 🛠️ Scripts

```bash
npm run dev        # dev server
npm run build      # production build
npm run typecheck  # tsc --noEmit
```
