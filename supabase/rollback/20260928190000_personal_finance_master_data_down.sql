-- DOWN for Personal Finance Master Data migration.
-- Export post-migration master data / code assignments before rollback if production data exists.

drop trigger if exists personal_finance_audit on public.finance_master_data;
drop table if exists public.finance_master_data;

alter table public.personal_finance_transactions
  drop column if exists category_code,
  drop column if exists subcategory_code,
  drop column if exists currency_code,
  drop column if exists payment_method_code,
  drop column if exists income_source_code,
  drop column if exists transaction_source_code,
  drop column if exists status_reason,
  drop column if exists status_changed_at,
  drop column if exists status_changed_by;

alter table public.personal_finance_accounts
  drop column if exists account_type_code,
  drop column if exists institution_code,
  drop column if exists status_reason,
  drop column if exists record_status,
  drop column if exists status_changed_at,
  drop column if exists status_changed_by;

alter table public.personal_finance_debts
  drop column if exists debt_type_code,
  drop column if exists lender_institution_code,
  drop column if exists status_reason,
  drop column if exists status_changed_at,
  drop column if exists status_changed_by;

alter table public.personal_finance_assets
  drop column if exists asset_type_code,
  drop column if exists status_reason,
  drop column if exists status_changed_at,
  drop column if exists status_changed_by;

alter table public.owner_business_transfers
  drop column if exists currency_code,
  drop column if exists status_reason,
  drop column if exists status_changed_at,
  drop column if exists status_changed_by;

alter table public.personal_finance_audit_log drop constraint if exists personal_finance_audit_log_action_check;
alter table public.personal_finance_audit_log add constraint personal_finance_audit_log_action_check
  check (action in ('INSERT','UPDATE','IMPORT','VERIFY','SUPERSEDE'));

alter table public.personal_finance_transactions drop constraint if exists personal_finance_transactions_record_status_check;
alter table public.personal_finance_transactions add constraint personal_finance_transactions_record_status_check
  check (record_status in ('ACTIVE','INACTIVE','SUPERSEDED'));
alter table public.owner_business_transfers drop constraint if exists owner_business_transfers_record_status_check;
alter table public.owner_business_transfers add constraint owner_business_transfers_record_status_check
  check (record_status in ('ACTIVE','INACTIVE','SUPERSEDED'));
