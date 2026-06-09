# Treelogy HR — UX Psychology & User-Journey Rationale

Placement of every menu/feature is driven by **who uses it, how often, and with which hand** — grounded in established UX laws. Research notes below each decision.

## Core insight: the app is role-adaptive
The majority of users are **front-line workers** (factory/farm) whose #1 daily action is **clock-in/out** — not viewing analytics. So navigation **and the home screen** change by audience:

| Audience | Detected by | Home screen | Nav order (most-used first) |
|----------|-------------|-------------|------------------------------|
| **Worker** (`self`) | no ops permission | **Clock-in + my status** (`SelfDashboard`) | Beranda · Absensi · Cuti · (Slip) |
| **HR / Manager / Admin** (`ops`) | has `employees.manage` / `leave.approve` / `payroll.process` / `access.*` | **Action-first ops dashboard** | Beranda · Absensi · Cuti · Payroll · Karyawan · Shift · KPI · Akses |

## Decisions → law → where

1. **Frequency-ordered navigation** — *Hick's Law* (fewer/ordered choices = faster decisions) + *Serial Position Effect* (first item = primacy). Most-used module is first; rare config (Peran & Akses) is last. → `nav-items.ts` `ORDER`.
2. **Role-based menu (hide what you can't use)** — *Hick's Law* + *Tesler's Law* (don't push complexity onto the worker). Workers never see Payroll/Employees/Access. → `visibleNav()`.
3. **Mobile bottom bar = 4 thumb-zone items** — *Fitts's Law* / thumb-zone research (49% navigate one-thumbed; bottom third is the natural zone; 3–5 items, 4 is the sweet spot). → `bottomNav()` + `app-shell.tsx`.
4. **Clock-in is big, bottom-reachable, visually isolated** — *Fitts's Law* (large target) + *Von Restorff* (the standout CTA) + *Doherty Threshold* (instant feedback, loading states). → `ClockWidget`, `SelfDashboard` (clock at top, full-width).
5. **Action before analytics (HR home)** — *Zeigarnik Effect* & *Goal-Gradient* (unfinished tasks pull attention): a "needs approval" banner + Quick Actions + today's attendance and approval list sit **above** the charts. Charts (monitoring) are last. → `dashboard/page.tsx`.
6. **Quick Actions row** — *Recognition over Recall* (show the path, don't make users remember it) + reduces navigation depth to the top HR tasks (approve, payroll, attendance, employees).
7. **Worker home = personal status, not company KPIs** — *Jakob's Law* / self-service convention (clock, leave balance, tabungan libur, payslip). Irrelevant analytics removed → less cognitive load (*Miller's Law*).
8. **Peak-End** — clock-in/out ends on a clear success confirmation ("Clock-in berhasil ✓").
9. **Consistency & a11y** — same patterns/icons across pages (*Law of Uniform Connectedness*), 44px+ targets, focus states, `prefers-reduced-motion`.

## Sources
- Laws of UX — https://lawsofux.com/ (Hick, Fitts, Serial Position, Zeigarnik, Goal-Gradient, Jakob, Von Restorff, Miller, Doherty, Tesler)
- UX Design Institute — laws of UX: https://www.uxdesigninstitute.com/blog/laws-of-ux/
- NN/g tap-target sizing (≥44px); thumb-zone research (bottom third = natural zone; 4-item bottom nav): https://www.designstudiouiux.com/blog/mobile-navigation-ux/ , https://parachutedesign.ca/blog/thumb-zone-ux/
- HR self-service primary tasks (clock, time-off, payslip): https://www.business.com/hr-software/employee-self-service/
