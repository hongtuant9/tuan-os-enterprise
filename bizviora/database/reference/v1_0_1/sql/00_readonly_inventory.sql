-- READ ONLY / No DDL, no mutations. Supabase staging selected project ref must be checked externally.
SELECT table_schema, table_name FROM information_schema.tables
 WHERE table_schema IN ('public','bv_private') AND table_name LIKE 'bv_%' AND table_type='BASE TABLE'
 ORDER BY table_schema, table_name;
SELECT c.conrelid::regclass::text AS object, c.conname, c.contype,
       pg_get_constraintdef(c.oid) AS definition FROM pg_constraint c
 WHERE c.connamespace='public'::regnamespace
 AND c.conrelid::regclass::text LIKE 'bv_%' ORDER BY 1,2;
SELECT schemaname, tablename, rowsecurity, forcerowsecurity FROM pg_tables
 WHERE tablename LIKE 'bv_%' ORDER BY 1,2;
SELECT schemaname, tablename, policyname, cmd, roles, qual, with_check FROM pg_policies
 WHERE tablename LIKE 'bv_%' ORDER BY 1,2;
