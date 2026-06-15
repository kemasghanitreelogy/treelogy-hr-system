-- KTP identity details that were previously unmodeled: birth place, date of
-- birth, and the full KTP address. Sourced from the office master spreadsheet.
alter table employees add column if not exists birth_place   text;
alter table employees add column if not exists date_of_birth date;
alter table employees add column if not exists ktp_address   text;
