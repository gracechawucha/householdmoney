begin;

create table if not exists public.monthly_totals (
  month          date primary key check (month = date_trunc('month', month)::date),
  period_start   date not null,
  money_in       numeric(12,2) not null,
  money_out      numeric(12,2) not null,
  fuliza_in      numeric(12,2) not null default 0,
  fuliza_repaid  numeric(12,2) not null default 0,
  shwari_in      numeric(12,2) not null default 0,
  shwari_out     numeric(12,2) not null default 0,
  own_till_in    numeric(12,2) not null default 0,
  own_till_out   numeric(12,2) not null default 0,
  reversals      numeric(12,2) not null default 0,
  fees           numeric(12,2) not null default 0,
  tx_count       int not null default 0,
  income   numeric(12,2) generated always as
           (money_in  - fuliza_in - shwari_in - own_till_in - reversals) stored,
  spending numeric(12,2) generated always as
           (money_out - fuliza_repaid - shwari_out - own_till_out - reversals) stored,
  source         text not null default 'mpesa_statement',
  created_at     timestamptz not null default now()
);

alter table public.monthly_totals enable row level security;
drop policy if exists "app key" on public.monthly_totals;
create policy "app key" on public.monthly_totals for all to anon, authenticated
  using (public.app_key_ok()) with check (public.app_key_ok());
grant select, insert, update, delete on public.monthly_totals to anon, authenticated;

insert into public.monthly_totals
  (month, period_start, money_in, money_out, fuliza_in, fuliza_repaid, shwari_in, shwari_out,
   own_till_in, own_till_out, reversals, fees, tx_count)
values
('2025-10-01','2025-10-15','4390.00','4294.00','0.00','0.00','0.00','0.00','990.00','0.00','0.00','22.00',88),
('2025-11-01','2025-11-01','11233.00','11327.00','0.00','0.00','0.00','0.00','3980.00','0.00','23.00','108.00',155),
('2025-12-01','2025-12-01','8359.18','8363.86','1016.18','867.86','0.00','0.00','930.00','900.00','53.00','46.00',189),
('2026-01-01','2026-01-01','17359.91','17359.91','2089.91','1882.91','1050.00','1050.00','11380.00','0.00','0.00','114.00',263),
('2026-02-01','2026-02-01','18439.08','18439.08','2769.08','2914.08','2000.00','2000.00','2980.00','0.00','0.00','87.00',254),
('2026-03-01','2026-03-01','18569.38','18569.38','6270.38','6159.38','0.00','0.00','6749.00','0.00','0.00','65.00',359),
('2026-04-01','2026-04-01','43124.05','43124.05','6554.05','6535.05','7100.00','8250.00','4610.00','1500.00','0.00','210.00',460),
('2026-05-01','2026-05-01','37876.69','37876.69','8081.69','8127.69','7150.00','6000.00','6145.00','0.00','0.00','192.00',461),
('2026-06-01','2026-06-01','34321.17','34261.03','6621.17','7053.03','0.00','0.00','4682.00','0.00','23.00','169.00',415),
('2026-07-01','2026-07-01','47075.34','47135.48','9843.34','9559.48','0.00','0.00','15430.00','10300.00','0.00','300.00',467),
('2026-08-01','2026-08-01','101257.18','101100.29','4862.18','5302.29','4900.00','5800.00','2985.00','0.00','0.00','468.00',432)
on conflict (month) do update set
  period_start = excluded.period_start, money_in = excluded.money_in, money_out = excluded.money_out,
  fuliza_in = excluded.fuliza_in, fuliza_repaid = excluded.fuliza_repaid,
  shwari_in = excluded.shwari_in, shwari_out = excluded.shwari_out,
  own_till_in = excluded.own_till_in, own_till_out = excluded.own_till_out,
  reversals = excluded.reversals, fees = excluded.fees, tx_count = excluded.tx_count;

commit;