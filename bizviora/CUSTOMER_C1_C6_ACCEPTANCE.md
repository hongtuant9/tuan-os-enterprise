# BIZVIORA C1–C6 Customer Workspace Implementation Tracking

Spec: SPEC-BV-CWS-20261010-v1. Canonical pilot tenant: T009 tamcocexperience. No TUAN OS production mutation.

## C1 Reference baseline (IN PROGRESS)
Screens specified in supplied visual conversation: T01 Tổng quan, T02 AI, T03 Công việc, T04 Phê duyệt, T05 Khách hàng & Marketing, T06 Homestay Insights, T07 F&B Insights, T08 Tài chính doanh nghiệp, T09 Tài chính cá nhân, T10 Báo cáo & KPI. Reference images supplied in chat, but original image bytes/checksums not yet verified in GitHub/Drive, so pixel diff cannot be claimed.
Canonical palette: navy #0B2140, primary #1266E8, canvas #F4F8FD, white #FFFFFF, border #E1EAF6, text #11284F, muted #7085A1, success #0BA96B, warning #F59A1D, danger #EF4B58, violet #793CE7, teal #11BFC9. Desktop reference 1600–1680px; mobile reference is inferred, not original screenshot.

## C2 Common shell (IN PROGRESS)
Tenant T009 uses own customer shell; dark nav, topbar, 10 canonical tabs, source state and role demo warning; shared KPI/card/chart/table primitives. Retain client-only prototype limits.

## C3 Vertical Slice (IN PROGRESS)
T01 Overview then T03 Tasks and T04 Approvals; shared organization fixture and synthetic test data, read-only meaningful navigation. No production-safe auth, CRUD, server-side RBAC or audit yet.

## C4 Industry + CRM (NOT ACCEPTED)
T05 marketing, T06 Homestay, T07 F&B need end-to-end, unified source fixtures and reference screenshot comparisons. Do not replace HotelLink/KiotViet.

## C5 Finance + AI + KPI (NOT ACCEPTED)
T02/T08/T09/T10; personal finance must remain owner private at backend. Browser-only display check is not security proof.

## C6 Acceptance (HOLD)
Each 10 tabs: screenshot 1600x900 and 390x844, compare original, no console JS errors, all controls test, data roll-up equality and tenant membership/RLS with signed-in A/B accounts, restore and secret gates before real import. CEO final sign-off after C1-C5 pass.

## Mandatory safety
All current displays are SYNTHETIC. TUAN OS production unchanged; no migration of real PII, booking or finance into Render STATIC_SITE. Security gate = HOLD. Declare any demo UI success separately from production-readiness.
