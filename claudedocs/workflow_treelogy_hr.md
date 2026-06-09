# Treelogy HR System — Implementation Workflow

> Generated via `/sc:workflow`. Frontend design via `ui-ux-pro-max`. Backend: **Supabase** (Postgres + Auth + RLS).
> Strategy: systematic · Depth: deep

## 1. Product Context

**Treelogy** — premium organic moringa brand (Bali, Indonesia). HR system serves three workforce types:
- **Factory team** — shift-based, overtime, swap-day / day-off-in-lieu, leave-balance savings (*tabungan libur*).
- **Farm team** — shift-based, attendance.
- **Sales / office team** — standard, leave-balance savings.

## 2. Tech Stack (decided)

| Layer | Choice | Reason |
|-------|--------|--------|
| Framework | Next.js 15 (App Router, TS) | SSR, server actions, Vercel-native |
| Styling | Tailwind CSS v4 + CSS variables | Design tokens, fast |
| Components | shadcn-style primitives (local) | Full control, no lock-in |
| Charts | Recharts | KPI / attendance trends |
| Backend | **Supabase** (Postgres, Auth, RLS, Storage) | Requested; managed Postgres + auth |
| Data layer | `@supabase/ssr` + typed repos, seed fallback | Runs offline for demo, Supabase when env set |
| Icons | lucide-react | SVG, consistent |
| Fonts | Sora (headings) + Inter (body) | Clean, data-friendly, organic-modern |

## 3. Design System (from ui-ux-pro-max + Treelogy brand)

Pattern: **Data-Dense + Drill-Down dashboard**. Style: Data-Dense Dashboard (KPI cards, tables, minimal padding).

Treelogy organic-green palette (extracted from brand):

| Token | Hex | Use |
|-------|-----|-----|
| `forest` (primary) | `#3D5A2E` | primary actions, headings |
| `olive` | `#6B7548` | secondary / banner |
| `matcha` (accent) | `#8BA859` | accents, positive |
| `lime` | `#A4C26A` | highlights, charts |
| `cream` (bg) | `#F6F4EA` | app background |
| `bark` (dark card) | `#26331E` | dark cards, sidebar |
| `gold` (CTA) | `#E0A82E` | warnings / pending |
| `clay` (danger) | `#C2603F` | errors / absent |

## 4. Data Model (Supabase / Postgres)

- `employees` (active/inactive, team: factory|farm|sales|office, salary, bank, BPJS/NPWP, PTKP status)
- `shifts` (name, team, start/end, break, overtime_after)
- `shift_assignments` (employee ↔ shift ↔ date)
- `attendance` (clock_in/out, status, late_min, overtime_min, source)
- `leave_requests` (annual|sick|unpaid, dates, status, approver)
- `leave_balances` (employee, annual_quota, used, tabungan_libur)
- `day_off_in_lieu` (swap requests for factory — worked_date ↔ off_date)
- `payroll_runs` (period, status)
- `payslips` (employee, run, gross, bpjs breakdown, pph21, net, working days)
- `kpis` (employee, metric, target, actual, period)
- `profiles` (auth user ↔ employee, role: admin|hr|manager|employee)

## 5. Indonesian Payroll Rules (implemented)

- **BPJS Kesehatan**: 4% employer + 1% employee (cap salary 12,000,000).
- **BPJS Ketenagakerjaan**: JHT 3.7%/2%, JKK 0.24–1.74%, JKM 0.3%, JP 2%/1% (cap 10,547,400).
- **PPh 21**: TER (Tarif Efektif Rata-rata) monthly method 2024 — category A/B/C by PTKP, plus year-end progressive reconciliation logic.
- **Overtime**: Govt formula — 1.5× first hour, 2× subsequent hours (hourly = monthly/173).

## 6. Phases & Execution Order

### Phase 0 — Scaffold ✅ gate: `npm run dev` boots
- Next.js + TS + Tailwind v4 config, design tokens, fonts, base UI primitives.

### Phase 1 — App shell & layout
- Sidebar nav, topbar, dashboard route group, auth-aware layout.

### Phase 2 — Employee Management
- Employee DB list/table, filters (team, status), detail drawer, add/edit form, active/inactive toggle.

### Phase 3 — Attendance & Time
- Clock in/out widget, attendance table, late/overtime calc, shift management CRUD, shift assignment calendar, day-off-in-lieu (swap) flow.

### Phase 4 — Leave Management
- Leave request + approval, annual/sick tracking, leave balances + *tabungan libur* view.

### Phase 5 — Payroll
- Payroll run from attendance recap, BPJS + PPh21 auto-calc, payslip view/print, salary-transfer export (bank CSV).

### Phase 6 — KPI / Performance (lower priority)
- KPI cards + table, per-employee scorecard, charts.

### Phase 7 — Supabase wiring
- SQL migrations, RLS policies, seed, `@supabase/ssr` clients, repo layer with seed fallback, `.env.example`.

## 7. Quality Gates
- Type-checks clean · responsive 375/768/1024/1440 · WCAG AA contrast · no emoji icons · cursor-pointer + focus states · `npm run build` passes.

## Next Step
Execute Phases 0→7 (per `/sc:implement`).
