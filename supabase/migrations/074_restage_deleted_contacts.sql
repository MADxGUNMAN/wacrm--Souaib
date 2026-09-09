-- ============================================================
-- 074_restage_deleted_contacts.sql
-- Re-offer a phone contact for import when its CRM contact is deleted.
-- ============================================================
--
-- THE BUG
-- -------
-- `coexistence_staged_contacts.contact_id` is ON DELETE SET NULL, so deleting
-- a contact clears the link but leaves `status = 'imported'`. The staged row
-- then claims the number is already in the CRM when it is not, and the review
-- panel reports "1788 imported. Nothing left to review." with zero contacts
-- in the table. The number becomes unimportable: it is filtered out of the
-- pending list forever, and Meta only sends the address book once per
-- onboarding window, so there is no way to get it back.
--
-- Observed exactly that after deleting all 1,788 imported contacts.
--
-- THE FIX
-- -------
-- A BEFORE UPDATE trigger. The FK's SET NULL action performs an UPDATE on
-- this table, so the trigger sees it and returns the row to 'pending'.
--
-- Why a trigger rather than filtering in the API: the invariant is "a row
-- claiming to be imported must point at a contact that exists". Enforcing it
-- next to the data means every path gets it — the contacts page, bulk delete,
-- a cascade from deleting an account member, a manual SQL fix — instead of
-- only the paths someone remembered to update.
--
-- Deliberately narrow. It fires ONLY on the null-ing transition
-- (old.contact_id was set, new.contact_id is null) while status is
-- 'imported'. A row that is 'skipped' stays skipped: the operator rejected
-- that number on purpose and re-offering it would undo a decision they made.
-- A row already 'pending' is untouched.

create or replace function public.fn_restage_orphaned_staged_contact()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'imported'
     and new.contact_id is null
     and old.contact_id is not null
  then
    new.status := 'pending';
    new.reviewed_at := null;
    -- The number is no longer in the CRM, so the "already in your CRM"
    -- badge would be wrong on the review screen.
    new.already_known := false;
  end if;

  return new;
end;
$$;

comment on function public.fn_restage_orphaned_staged_contact() is
  'Returns a staged phone contact to ''pending'' when the CRM contact it was '
  'imported into is deleted. Without this, the row stays ''imported'' with a '
  'null contact_id and the number can never be imported again.';

drop trigger if exists trg_restage_orphaned_staged_contact
  on public.coexistence_staged_contacts;

create trigger trg_restage_orphaned_staged_contact
  before update on public.coexistence_staged_contacts
  for each row
  execute function public.fn_restage_orphaned_staged_contact();

-- ── Repair existing rows ──────────────────────────────────────
-- Rows already broken by deletions that happened before the trigger existed.
-- Scoped to the exact broken shape (imported with no contact) so a healthy
-- row cannot be reset by this statement.
update public.coexistence_staged_contacts
set status = 'pending',
    reviewed_at = null,
    already_known = false
where status = 'imported'
  and contact_id is null;
