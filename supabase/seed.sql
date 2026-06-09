-- ============================================================
-- Treelogy HR — Seed data
-- Run after 0001_init.sql:  supabase db reset  (or psql -f)
-- ============================================================

-- Shifts -------------------------------------------------------
insert into shifts (name, team, start_time, end_time, break_minutes, overtime_after, color) values
  ('Factory Pagi',  'factory', '07:00', '15:00', 60, '15:00', '#3d5a2e'),
  ('Factory Siang', 'factory', '15:00', '23:00', 60, '23:00', '#6b7548'),
  ('Factory Malam', 'factory', '23:00', '07:00', 60, '07:00', '#26331e'),
  ('Farm Pagi',     'farm',    '06:00', '14:00', 60, '14:00', '#8ba859'),
  ('Office Reguler','office',  '08:00', '17:00', 60, '17:00', '#4a7ba6');

-- Employees ----------------------------------------------------
insert into employees (nik, name, email, phone, team, position, status, join_date, end_date, base_salary, allowance, ptkp, npwp, bpjs_kes, bpjs_tk, bank_name, bank_account, location) values
  ('TRL-0101','Putu Ariana','putu.ariana@treelogy.com','0812-3400-0101','factory','Production Operator','active','2022-03-01',null,3600000,650000,'K/1','09.123.456.7-901.000',true,true,'BCA','7720113401','Factory · Bali'),
  ('TRL-0102','Made Surya','made.surya@treelogy.com','0812-3400-0102','factory','Production Operator','active','2021-07-15',null,3800000,650000,'TK/0',null,true,true,'BCA','7720113402','Factory · Bali'),
  ('TRL-0103','Kadek Wirawan','kadek.wirawan@treelogy.com','0812-3400-0103','factory','Production Supervisor','active','2020-01-10',null,6800000,1200000,'K/2','09.223.456.7-901.000',true,true,'Mandiri','1450099103','Factory · Bali'),
  ('TRL-0201','Wayan Sukerti','wayan.sukerti@treelogy.com','0812-3400-0201','farm','Field Worker','active','2022-09-01',null,3200000,500000,'K/0',null,true,true,'BRI','338201004401','Farm · Bali'),
  ('TRL-0202','Komang Adi','komang.adi@treelogy.com','0812-3400-0202','farm','Field Lead','active','2019-05-20',null,5400000,900000,'K/3','09.323.456.7-901.000',true,true,'BRI','338201004402','Farm · Bali'),
  ('TRL-0301','Ni Luh Sari','niluh.sari@treelogy.com','0812-3400-0301','sales','Sales Executive','active','2023-02-01',null,4500000,1500000,'TK/0','09.423.456.7-901.000',true,true,'BCA','7720113406','Office · Bali'),
  ('TRL-0302','I Gede Bagus','gede.bagus@treelogy.com','0812-3400-0302','sales','Sales Lead','active','2020-11-03',null,7500000,2500000,'K/2','09.523.456.7-901.000',true,true,'Mandiri','1450099107','Office · Bali'),
  ('TRL-0401','Dewi Lestari','dewi.lestari@treelogy.com','0812-3400-0401','office','HR Officer','active','2021-04-12',null,6200000,1000000,'TK/1','09.623.456.7-901.000',true,true,'BCA','7720113408','Office · Bali'),
  ('TRL-0402','Agus Pratama','agus.pratama@treelogy.com','0812-3400-0402','office','Finance Officer','active','2020-08-17',null,7800000,1200000,'K/1','09.723.456.7-901.000',true,true,'Mandiri','1450099109','Office · Bali'),
  ('TRL-0104','Ketut Mahendra','ketut.mahendra@treelogy.com','0812-3400-0104','factory','Quality Control','active','2022-06-01',null,4200000,700000,'K/0',null,true,true,'BCA','7720113410','Factory · Bali'),
  ('TRL-0403','Ni Made Ayu','nimade.ayu@treelogy.com','0812-3400-0403','office','Admin Staff','active','2023-09-04',null,4800000,700000,'TK/0',null,true,true,'BCA','7720113411','Office · Bali'),
  ('TRL-0203','Putu Eka','putu.eka@treelogy.com','0812-3400-0203','farm','Field Worker','active','2023-01-09',null,3300000,500000,'TK/1',null,true,true,'BRI','338201004412','Farm · Bali'),
  ('TRL-0105','Kadek Yoga','kadek.yoga@treelogy.com','0812-3400-0105','factory','Packaging Operator','active','2022-11-21',null,3500000,600000,'TK/0',null,true,true,'BCA','7720113413','Factory · Bali'),
  ('TRL-0303','Sang Ayu Putri','sangayu.putri@treelogy.com','0812-3400-0303','sales','Sales Executive','inactive','2021-03-15','2026-02-28',4500000,1500000,'TK/0',null,false,false,'BCA','7720113414','Office · Bali');

-- Leave balances (one per employee) ----------------------------
insert into leave_balances (employee_id, annual_quota, annual_used, sick_used, tabungan_libur)
select id, 12, 2, 0, 2 from employees;

-- Sample leave requests ----------------------------------------
insert into leave_requests (employee_id, type, start_date, end_date, days, reason, status, approver, requested_at)
select id, 'annual', '2026-06-12', '2026-06-13', 2, 'Family event in Singaraja', 'pending', null, '2026-06-05T09:12:00+08' from employees where nik='TRL-0301';
insert into leave_requests (employee_id, type, start_date, end_date, days, reason, status, approver, requested_at)
select id, 'sick', '2026-06-08', '2026-06-08', 1, 'Fever — clinic note attached', 'approved', 'Dewi Lestari', '2026-06-08T07:01:00+08' from employees where nik='TRL-0102';

-- Day-off in lieu ----------------------------------------------
insert into day_off_in_lieu (employee_id, worked_date, off_date, reason, status)
select id, '2026-06-01', '2026-06-16', 'Sunday harvest — extra demand', 'approved' from employees where nik='TRL-0202';
insert into day_off_in_lieu (employee_id, worked_date, off_date, reason, status)
select id, '2026-06-08', '2026-06-19', 'Maintenance shift on rest day', 'pending' from employees where nik='TRL-0103';

-- Payroll runs -------------------------------------------------
insert into payroll_runs (period, status, employee_count, created_at, paid_at) values
  ('2026-04','paid',14,'2026-04-28T10:00:00+08','2026-04-30T15:00:00+08'),
  ('2026-05','paid',13,'2026-05-28T10:00:00+08','2026-05-30T15:00:00+08'),
  ('2026-06','draft',13,'2026-06-09T08:00:00+08',null);

-- KPIs ---------------------------------------------------------
insert into kpis (employee_id, metric, period, target, actual, unit, weight)
select id, 'Production output (tons)', '2026-06', 18, 19.4, 'ton', 40 from employees where nik='TRL-0103';
insert into kpis (employee_id, metric, period, target, actual, unit, weight)
select id, 'Revenue', '2026-06', 120, 134, 'jt', 60 from employees where nik='TRL-0301';
insert into kpis (employee_id, metric, period, target, actual, unit, weight)
select id, 'Harvest yield', '2026-06', 92, 95, '%', 50 from employees where nik='TRL-0202';
