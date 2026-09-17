begin;

drop policy if exists "Users can update their own row" on public.users;
create policy "Users can update their own row"
on public.users
for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

drop policy if exists "Users can view their own Google connection" on public.google_oauth_connections;
create policy "Users can view their own Google connection"
on public.google_oauth_connections
for select
to authenticated
using ((select auth.uid()) = user_id);

commit;
