-- Apply the same abuse limit to direct learner inserts as to the app endpoint.
create or replace function public.limit_direct_issue_insert() returns trigger language plpgsql set search_path = public as $$
begin
  if current_user = 'authenticated' and not public.reserve_issue_report() then
    raise exception 'Too many reports. Please try again later.' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists limit_direct_issue_insert on public.issue_reports;
create trigger limit_direct_issue_insert before insert on public.issue_reports for each row execute function public.limit_direct_issue_insert();
