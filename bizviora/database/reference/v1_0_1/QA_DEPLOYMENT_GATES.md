# BIZVIORA DB + AI Agent V1.0.1 — QA reference only
NO production or staging migration has been performed.
This directory is deliberately NOT under supabase/migrations.
Migration 10 reference fixes 31 CREATE INDEX placeholders found in V1.0.
Local PostgreSQL 16 isolated QA: schema 38 tables, 4 synthetic tenants, 7 templates,
9 disabled agents, 18 denied tool grants, role-simulated isolation and
synthetic pg_dump/pg_restore passed. NO real signed-JWT E2E on this schema.
Deployment gates: full Core+Auth staging clone & restore; Supabase signed-JWT RLS;
security-definer exposure review; performance / cost; written staging approval.
QA seed 90 is forbidden on real TUAN OS and staging production databases.
Do not activate automation/tools or expose private schemas to PostgREST.
