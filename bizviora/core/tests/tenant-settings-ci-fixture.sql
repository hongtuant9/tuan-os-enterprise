\set ON_ERROR_STOP on
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA auth;
CREATE ROLE authenticated NOLOGIN;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE TABLE public.bv_tenants(id uuid PRIMARY KEY,name text NOT NULL,slug text NOT NULL);
CREATE TABLE public.bv_memberships(tenant_id uuid NOT NULL,user_id uuid NOT NULL,role text NOT NULL);
INSERT INTO auth.users VALUES ('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222'),('33333333-3333-4333-8333-333333333333');
INSERT INTO public.bv_tenants VALUES
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','TUAN OS synthetic','tuan-synthetic'),
('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Tenant B synthetic','b-synthetic');
INSERT INTO public.bv_memberships VALUES
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','owner'),
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','33333333-3333-4333-8333-333333333333','staff'),
('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222','owner');
