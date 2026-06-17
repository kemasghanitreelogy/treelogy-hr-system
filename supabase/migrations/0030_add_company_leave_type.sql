-- ============================================================
-- Treelogy HR — add the 'company' leave type.
-- Company leave: granted by the company, with NO tenure rule and NO annual
-- quota cap (unlike annual leave). Non-destructive & idempotent.
-- ============================================================

alter type leave_type_t add value if not exists 'company';
