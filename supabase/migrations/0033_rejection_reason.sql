-- Rejection notes: when an approver rejects a request that needs confirmation,
-- they must explain why. The note is shown back to the requester (with who
-- rejected it) so they understand the decision. One column per request type.

alter table leave_requests          add column if not exists rejection_reason text;
alter table overtime_requests       add column if not exists rejection_reason text;
alter table tabungan_libur_entries  add column if not exists rejection_reason text;
alter table clock_approval_requests add column if not exists rejection_reason text;
