-- Store staff-reviewed identity fields extracted locally in the browser.
-- Raw images remain in the private customer-documents bucket.
-- Down: drop customers.birth_date, customers.sex, customers.id_expiration_date.

alter table public.customers
  add column if not exists birth_date date,
  add column if not exists sex text,
  add column if not exists id_expiration_date date;

alter table public.customers
  drop constraint if exists customers_sex_check;
alter table public.customers
  add constraint customers_sex_check
  check (sex is null or sex in ('female','male','x','other','prefer_not_to_say'));

notify pgrst, 'reload schema';
