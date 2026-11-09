-- Execute after the migration in an ephemeral Supabase database. Never production.
begin;
insert into auth.users(id) values('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');
insert into public.devices(user_id,name) values('00000000-0000-0000-0000-000000000001','owner-one'),('00000000-0000-0000-0000-000000000002','owner-two');
set local role authenticated;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
do $$ begin
 if (select count(*) from public.devices) != 1 then raise exception 'RLS isolation failed'; end if;
 if exists(select 1 from public.devices where name='owner-two') then raise exception 'cross-tenant read'; end if;
 begin
 insert into public.devices(user_id,name)values('00000000-0000-0000-0000-000000000001','forbidden');
 raise exception 'unauthorized write permitted';
 exception when insufficient_privilege then null;
 end;
end $$;
reset role;
rollback;
