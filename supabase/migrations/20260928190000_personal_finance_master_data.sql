-- TUAN OS Personal Finance canonical Master Data + safe record lifecycle
-- Additive only. Depends on 20260928133000 and 20260928170000.
-- Production apply remains backup-gated.

create table if not exists public.finance_master_data (
  id uuid primary key default gen_random_uuid(),
  master_data_type text not null check (master_data_type in (
    'TRANSACTION_TYPE','EXPENSE_CATEGORY','INCOME_CATEGORY','ACCOUNT_TYPE',
    'INSTITUTION','DEBT_TYPE','ASSET_TYPE','CURRENCY','PAYMENT_METHOD',
    'INCOME_SOURCE','TRANSACTION_SOURCE','VERIFICATION_STATUS'
  )),
  code text not null,
  name text not null,
  parent_code text,
  display_order integer not null default 100,
  is_active boolean not null default true,
  record_status text not null default 'ACTIVE' check (record_status in ('ACTIVE','INACTIVE','SUPERSEDED')),
  effective_from date,
  effective_to date,
  source text not null,
  source_reference text,
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(master_data_type,code)
);

create index if not exists finance_master_data_type_active_idx
  on public.finance_master_data(master_data_type,is_active,display_order,code);

alter table public.finance_master_data enable row level security;
revoke all on public.finance_master_data from anon, authenticated;
grant select,insert,update on public.finance_master_data to authenticated;
grant all on public.finance_master_data to service_role;

create policy "finance master owner select" on public.finance_master_data
  for select to authenticated using (public.is_personal_finance_owner());
create policy "finance master owner insert" on public.finance_master_data
  for insert to authenticated with check (public.is_personal_finance_owner());
create policy "finance master owner update" on public.finance_master_data
  for update to authenticated using (public.is_personal_finance_owner())
  with check (public.is_personal_finance_owner());

create trigger personal_finance_audit
after insert or update on public.finance_master_data
for each row execute function private.personal_finance_audit_trigger();

alter table public.personal_finance_transactions
  add column if not exists category_code text,
  add column if not exists subcategory_code text,
  add column if not exists currency_code text not null default 'VND',
  add column if not exists payment_method_code text,
  add column if not exists income_source_code text,
  add column if not exists transaction_source_code text,
  add column if not exists status_reason text,
  add column if not exists status_changed_at timestamptz,
  add column if not exists status_changed_by uuid references public.users(id) on delete set null;

alter table public.personal_finance_accounts
  add column if not exists account_type_code text,
  add column if not exists institution_code text,
  add column if not exists status_reason text,
  add column if not exists record_status text not null default 'ACTIVE'
    check (record_status in ('ACTIVE','INACTIVE','SUPERSEDED')),
  add column if not exists status_changed_at timestamptz,
  add column if not exists status_changed_by uuid references public.users(id) on delete set null;

alter table public.personal_finance_debts
  add column if not exists debt_type_code text,
  add column if not exists lender_institution_code text,
  add column if not exists status_reason text,
  add column if not exists status_changed_at timestamptz,
  add column if not exists status_changed_by uuid references public.users(id) on delete set null;

alter table public.personal_finance_assets
  add column if not exists asset_type_code text,
  add column if not exists status_reason text,
  add column if not exists status_changed_at timestamptz,
  add column if not exists status_changed_by uuid references public.users(id) on delete set null;

alter table public.owner_business_transfers
  add column if not exists currency_code text not null default 'VND',
  add column if not exists status_reason text,
  add column if not exists status_changed_at timestamptz,
  add column if not exists status_changed_by uuid references public.users(id) on delete set null;

alter table public.personal_finance_audit_log drop constraint if exists personal_finance_audit_log_action_check;
alter table public.personal_finance_audit_log add constraint personal_finance_audit_log_action_check
  check (action in ('INSERT','UPDATE','IMPORT','VERIFY','SUPERSEDE','VOID','INACTIVATE'));

alter table public.personal_finance_transactions drop constraint if exists personal_finance_transactions_record_status_check;
alter table public.personal_finance_transactions add constraint personal_finance_transactions_record_status_check
  check (record_status in ('ACTIVE','INACTIVE','SUPERSEDED','VOIDED'));

alter table public.owner_business_transfers drop constraint if exists owner_business_transfers_record_status_check;
alter table public.owner_business_transfers add constraint owner_business_transfers_record_status_check
  check (record_status in ('ACTIVE','INACTIVE','SUPERSEDED','VOIDED'));

insert into public.finance_master_data(master_data_type,code,name,display_order,source,source_reference)
values
 ('TRANSACTION_TYPE','INCOME','Thu',10,'CEO_DIRECTIVE_20260928','TUAN_OS — HOÀN THIỆN PERSONAL FINANCE INPUT & MASTER DATA'),
 ('TRANSACTION_TYPE','EXPENSE','Chi',20,'CEO_DIRECTIVE_20260928','TUAN_OS — HOÀN THIỆN PERSONAL FINANCE INPUT & MASTER DATA'),
 ('TRANSACTION_TYPE','TRANSFER','Chuyển tiền',30,'CEO_DIRECTIVE_20260928','TUAN_OS — HOÀN THIỆN PERSONAL FINANCE INPUT & MASTER DATA'),
 ('TRANSACTION_TYPE','DEBT_PAYMENT','Trả nợ',40,'CEO_DIRECTIVE_20260928','TUAN_OS — HOÀN THIỆN PERSONAL FINANCE INPUT & MASTER DATA'),
 ('TRANSACTION_TYPE','OTHER','Khác',90,'CEO_DIRECTIVE_20260928','TUAN_OS — HOÀN THIỆN PERSONAL FINANCE INPUT & MASTER DATA'),
 ('ACCOUNT_TYPE','CASH','Tiền mặt',10,'CEO_DIRECTIVE_20260928','TUAN_OS — HOÀN THIỆN PERSONAL FINANCE INPUT & MASTER DATA'),
 ('ACCOUNT_TYPE','BANK','Tài khoản ngân hàng',20,'CEO_DIRECTIVE_20260928','TUAN_OS — HOÀN THIỆN PERSONAL FINANCE INPUT & MASTER DATA'),
 ('ACCOUNT_TYPE','E_WALLET','Ví điện tử',30,'CEO_DIRECTIVE_20260928','TUAN_OS — HOÀN THIỆN PERSONAL FINANCE INPUT & MASTER DATA'),
 ('ACCOUNT_TYPE','DEPOSIT','Tiền gửi',40,'CEO_DIRECTIVE_20260928','TUAN_OS — HOÀN THIỆN PERSONAL FINANCE INPUT & MASTER DATA'),
 ('ACCOUNT_TYPE','OTHER','Tài khoản khác',90,'CEO_DIRECTIVE_20260928','TUAN_OS — HOÀN THIỆN PERSONAL FINANCE INPUT & MASTER DATA'),
 ('DEBT_TYPE','OVERDRAFT','Thấu chi',10,'CEO_DIRECTIVE_20260928','TUAN_OS — HOÀN THIỆN PERSONAL FINANCE INPUT & MASTER DATA'),
 ('DEBT_TYPE','BANK_LOAN','Vay ngân hàng',20,'CEO_DIRECTIVE_20260928','TUAN_OS — HOÀN THIỆN PERSONAL FINANCE INPUT & MASTER DATA'),
 ('DEBT_TYPE','ASSET_LOAN','Vay mua tài sản',30,'CEO_DIRECTIVE_20260928','TUAN_OS — HOÀN THIỆN PERSONAL FINANCE INPUT & MASTER DATA'),
 ('DEBT_TYPE','BUSINESS_LOAN','Vay kinh doanh',40,'CEO_DIRECTIVE_20260928','TUAN_OS — HOÀN THIỆN PERSONAL FINANCE INPUT & MASTER DATA'),
 ('DEBT_TYPE','FAMILY_LOAN','Vay cá nhân/người thân',50,'CEO_DIRECTIVE_20260928','TUAN_OS — HOÀN THIỆN PERSONAL FINANCE INPUT & MASTER DATA'),
 ('DEBT_TYPE','CREDIT_CARD','Thẻ tín dụng',60,'CEO_DIRECTIVE_20260928','TUAN_OS — HOÀN THIỆN PERSONAL FINANCE INPUT & MASTER DATA'),
 ('DEBT_TYPE','OTHER','Nghĩa vụ khác',90,'CEO_DIRECTIVE_20260928','TUAN_OS — HOÀN THIỆN PERSONAL FINANCE INPUT & MASTER DATA'),
 ('ASSET_TYPE','CASH','Tiền mặt',10,'CEO_DIRECTIVE_20260928','TUAN_OS — HOÀN THIỆN PERSONAL FINANCE INPUT & MASTER DATA'),
 ('ASSET_TYPE','DEPOSIT','Tiền gửi',20,'CEO_DIRECTIVE_20260928','TUAN_OS — HOÀN THIỆN PERSONAL FINANCE INPUT & MASTER DATA'),
 ('ASSET_TYPE','REAL_ESTATE','Bất động sản',30,'CEO_DIRECTIVE_20260928','TUAN_OS — HOÀN THIỆN PERSONAL FINANCE INPUT & MASTER DATA'),
 ('ASSET_TYPE','VEHICLE','Phương tiện',40,'CEO_DIRECTIVE_20260928','TUAN_OS — HOÀN THIỆN PERSONAL FINANCE INPUT & MASTER DATA'),
 ('ASSET_TYPE','FINANCIAL_ASSET','Tài sản tài chính',50,'CEO_DIRECTIVE_20260928','TUAN_OS — HOÀN THIỆN PERSONAL FINANCE INPUT & MASTER DATA'),
 ('ASSET_TYPE','BUSINESS_ASSET','Tài sản kinh doanh',60,'CEO_DIRECTIVE_20260928','TUAN_OS — HOÀN THIỆN PERSONAL FINANCE INPUT & MASTER DATA'),
 ('ASSET_TYPE','OTHER','Tài sản khác',90,'CEO_DIRECTIVE_20260928','TUAN_OS — HOÀN THIỆN PERSONAL FINANCE INPUT & MASTER DATA'),
 ('CURRENCY','VND','Việt Nam đồng',10,'SCHEMA_DEFAULT','personal_finance currency default'),
 ('VERIFICATION_STATUS','VERIFIED','Đã xác minh',10,'SCHEMA_CANONICAL','Personal Finance schema'),
 ('VERIFICATION_STATUS','NEED_VERIFY','Cần xác minh',20,'SCHEMA_CANONICAL','Personal Finance schema'),
 ('VERIFICATION_STATUS','HOLD','Tạm dừng',30,'SCHEMA_CANONICAL','Personal Finance schema'),
 ('INCOME_CATEGORY','PERSONAL_INCOME_OTHER','Thu nhập cá nhân khác',900,'CEO_DIRECTIVE_20260928','Canonical fallback; business distributions use owner_business_transfers'),
 ('TRANSACTION_SOURCE','APP_OWNER','Nhập tại Tài chính cá nhân',10,'APP_CANONICAL','/personal-finance'),
 ('TRANSACTION_SOURCE','SHEET_LEGACY','Dữ liệu lịch sử từ Sheet',20,'TUAN OS — Mô hình tài chính gia đình','04_GiaoDich')
on conflict(master_data_type,code) do nothing;

insert into public.finance_master_data(master_data_type,code,name,display_order,source,source_reference)
values
 ('EXPENSE_CATEGORY','PERSONAL_EXPENSE_FOOD_HOUSEHOLD','Ăn uống + nhu yếu phẩm gia đình',10,'TUAN OS — Mô hình tài chính gia đình','01_NganSach_DongTien!A5:A22'),
 ('EXPENSE_CATEGORY','PERSONAL_EXPENSE_HOME_UTILITIES','Điện, nước, phí sinh hoạt nhà',20,'TUAN OS — Mô hình tài chính gia đình','01_NganSach_DongTien!A5:A22'),
 ('EXPENSE_CATEGORY','PERSONAL_EXPENSE_CONNECTIVITY','Internet + điện thoại',30,'TUAN OS — Mô hình tài chính gia đình','01_NganSach_DongTien!A5:A22'),
 ('EXPENSE_CATEGORY','PERSONAL_EXPENSE_TRANSPORT','Đi lại/xăng/xe',40,'TUAN OS — Mô hình tài chính gia đình','01_NganSach_DongTien!A5:A22'),
 ('EXPENSE_CATEGORY','PERSONAL_EXPENSE_CLOTHING_PERSONAL','Quần áo + chi cá nhân chung',50,'TUAN OS — Mô hình tài chính gia đình','01_NganSach_DongTien!A5:A22'),
 ('EXPENSE_CATEGORY','PERSONAL_EXPENSE_HOME_MAINTENANCE','Bảo trì nhà/đồ dùng',60,'TUAN OS — Mô hình tài chính gia đình','01_NganSach_DongTien!A5:A22'),
 ('EXPENSE_CATEGORY','PERSONAL_EXPENSE_SOCIAL','Hiếu hỉ/đối ngoại',70,'TUAN OS — Mô hình tài chính gia đình','01_NganSach_DongTien!A5:A22'),
 ('EXPENSE_CATEGORY','PERSONAL_EXPENSE_LEISURE','Giải trí/ăn ngoài/gia đình',80,'TUAN OS — Mô hình tài chính gia đình','01_NganSach_DongTien!A5:A22'),
 ('EXPENSE_CATEGORY','PERSONAL_EXPENSE_SMALL_RESERVE','Dự phòng sinh hoạt nhỏ',90,'TUAN OS — Mô hình tài chính gia đình','01_NganSach_DongTien!A5:A22'),
 ('EXPENSE_CATEGORY','PERSONAL_EXPENSE_EDUCATION_SON','Con trai — Ban Mai lớp 11A, chi thường xuyên',100,'TUAN OS — Mô hình tài chính gia đình','01_NganSach_DongTien!A5:A22'),
 ('EXPENSE_CATEGORY','PERSONAL_EXPENSE_EDUCATION_MIDDLE','Con gái giữa — Tiểu học Yên Xá',110,'TUAN OS — Mô hình tài chính gia đình','01_NganSach_DongTien!A5:A22'),
 ('EXPENSE_CATEGORY','PERSONAL_EXPENSE_EDUCATION_YOUNGEST','Con út — Tiểu học Ban Mai',120,'TUAN OS — Mô hình tài chính gia đình','01_NganSach_DongTien!A5:A22'),
 ('EXPENSE_CATEGORY','PERSONAL_EXPENSE_TUTORING','Học thêm 3 con',130,'TUAN OS — Mô hình tài chính gia đình','01_NganSach_DongTien!A5:A22'),
 ('EXPENSE_CATEGORY','PERSONAL_EXPENSE_HEALTH_INSURANCE','Y tế + bảo hiểm',140,'TUAN OS — Mô hình tài chính gia đình','01_NganSach_DongTien!A5:A22'),
 ('EXPENSE_CATEGORY','PERSONAL_EXPENSE_OTHER_ESSENTIAL','Chi bắt buộc không đều khác',150,'TUAN OS — Mô hình tài chính gia đình','01_NganSach_DongTien!A5:A22'),
 ('EXPENSE_CATEGORY','PERSONAL_EXPENSE_OWNER_ALLOWANCE','Ngân sách cá nhân bổ sung của Tuấn',160,'TUAN OS — Mô hình tài chính gia đình','01_NganSach_DongTien!A5:A22'),
 ('EXPENSE_CATEGORY','PERSONAL_DEBT_PRINCIPAL','Trả bớt gốc thấu chi',170,'TUAN OS — Mô hình tài chính gia đình','04_GiaoDich!C3:E8')
on conflict(master_data_type,code) do nothing;

comment on table public.finance_master_data is 'Canonical runtime taxonomy for Personal Finance dropdowns. Bootstrap sources remain evidence only; UI reads active records from Supabase.';
comment on column public.finance_master_data.code is 'Canonical stable code persisted by Personal Finance records. Display name may change without breaking reporting.';


-- Rebuild consolidated owner view so soft-deleted/inactive records never contribute to Actual.
create or replace view public.owner_finance_position_v
with (security_invoker=true)
as
with non_account_assets as (
  select
    coalesce(sum(value_amount) filter(where record_status='ACTIVE' and verification_status='VERIFIED' and valuation_kind='VERIFIED'),0) as verified_non_account_assets,
    count(*) filter(where record_status='ACTIVE' and verification_status='VERIFIED' and valuation_kind='VERIFIED' and value_amount is not null) as verified_asset_count,
    count(*) filter(where record_status='ACTIVE' and (verification_status<>'VERIFIED' or valuation_kind<>'VERIFIED' or value_amount is null)) as unverified_asset_count
  from public.personal_finance_assets
), accounts as (
  select
    coalesce(sum(current_balance) filter(where record_status='ACTIVE' and verification_status='VERIFIED'),0) as verified_account_balances,
    coalesce(sum(current_balance) filter(where record_status='ACTIVE' and verification_status='VERIFIED' and is_liquid),0) as available_cash,
    coalesce(sum(current_balance) filter(where record_status='ACTIVE' and verification_status='VERIFIED' and is_emergency_fund),0) as emergency_fund,
    count(*) filter(where record_status='ACTIVE' and verification_status='VERIFIED' and current_balance is not null) as verified_account_count,
    count(*) filter(where record_status='ACTIVE' and verification_status='VERIFIED' and is_emergency_fund and current_balance is not null) as emergency_fund_account_count,
    count(*) filter(where record_status='ACTIVE' and (verification_status<>'VERIFIED' or current_balance is null)) as unverified_account_count
  from public.personal_finance_accounts
), d as (
  select
    coalesce(sum(current_principal) filter(where verification_status='VERIFIED' and status='ACTIVE'),0) as verified_liabilities,
    count(*) filter(where verification_status='VERIFIED' and status='ACTIVE' and current_principal is not null) as verified_debt_count,
    count(*) filter(where status='ACTIVE' and (verification_status<>'VERIFIED' or current_principal is null)) as unverified_debt_count,
    coalesce(sum(monthly_debt_service) filter(where verification_status='VERIFIED' and status='ACTIVE'),0) as monthly_debt_service
  from public.personal_finance_debts
), essential as (
  select avg(month_total) as avg_essential_monthly_expense
  from (
    select date_trunc('month',transaction_date),sum(amount) as month_total
    from public.personal_finance_transactions
    where record_status='ACTIVE'
      and verification_status='VERIFIED'
      and transaction_type='EXPENSE'
      and is_essential
      and business_transfer_id is null
      and transaction_date >= (current_date - interval '3 months')
    group by 1
  ) x
)
select
  non_account_assets.verified_non_account_assets + accounts.verified_account_balances as verified_assets,
  non_account_assets.verified_non_account_assets,
  accounts.verified_account_balances,
  d.verified_liabilities,
  case
    when non_account_assets.unverified_asset_count=0
     and accounts.unverified_account_count=0
     and d.unverified_debt_count=0
     and (non_account_assets.verified_asset_count + accounts.verified_account_count) > 0
    then non_account_assets.verified_non_account_assets + accounts.verified_account_balances - d.verified_liabilities
    else null
  end as net_worth,
  non_account_assets.verified_asset_count,non_account_assets.unverified_asset_count,
  accounts.verified_account_count,accounts.emergency_fund_account_count,accounts.unverified_account_count,
  d.verified_debt_count,d.unverified_debt_count,d.monthly_debt_service,
  accounts.available_cash,accounts.emergency_fund,essential.avg_essential_monthly_expense,
  case when essential.avg_essential_monthly_expense>0 then accounts.emergency_fund/essential.avg_essential_monthly_expense else null end as emergency_fund_coverage_months
from non_account_assets cross join accounts cross join d cross join essential;

grant select on public.owner_finance_position_v to authenticated,service_role;
