create extension if not exists pgcrypto;

create table public.ingredients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  quantity_in_stock numeric not null default 0,
  unit text not null,
  minimum_stock numeric not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ingredient_purchase_units (
  id uuid primary key default gen_random_uuid(),
  ingredient_id uuid not null references public.ingredients(id),
  label text not null,
  quantity_per_unit numeric not null check (quantity_per_unit > 0),
  base_unit text not null,
  active boolean not null default true
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price numeric not null check (price >= 0),
  category text not null,
  active boolean not null default true
);

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id),
  ingredient_id uuid not null references public.ingredients(id),
  quantity_used numeric not null check (quantity_used >= 0)
);

create table public.modifiers (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  modifier_group text not null default 'addon',
  price_delta numeric not null default 0,
  active boolean not null default true
);

create table public.product_modifiers (
  product_id uuid not null references public.products(id),
  modifier_id uuid not null references public.modifiers(id),
  primary key (product_id, modifier_id)
);

create table public.modifier_recipes (
  id uuid primary key default gen_random_uuid(),
  modifier_id uuid not null references public.modifiers(id),
  ingredient_id uuid not null references public.ingredients(id),
  quantity_delta numeric not null
);

create table public.shifts (
  id uuid primary key default gen_random_uuid(),
  opened_at timestamptz not null default now(),
  opening_cash numeric not null default 0,
  closed_at timestamptz,
  closing_cash numeric,
  cash_sales numeric not null default 0,
  transfer_sales numeric not null default 0,
  expected_cash numeric not null default 0,
  cash_difference numeric not null default 0,
  order_count int not null default 0,
  status text not null default 'OPEN' check (status in ('OPEN', 'CLOSED'))
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid references public.shifts(id),
  order_no text not null unique,
  total_amount numeric not null,
  payment_status text not null check (payment_status in ('PENDING', 'COMPLETED', 'VOIDED')),
  created_at timestamptz not null default now()
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  product_id uuid not null references public.products(id),
  quantity numeric not null check (quantity > 0),
  unit_price numeric not null check (unit_price >= 0),
  line_total numeric not null check (line_total >= 0)
);

create table public.order_item_modifiers (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references public.order_items(id),
  modifier_id uuid not null references public.modifiers(id),
  price_delta numeric not null default 0
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  method text not null check (method in ('CASH', 'TRANSFER')),
  amount numeric not null,
  cash_received numeric,
  change_due numeric,
  created_at timestamptz not null default now()
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  expense_no text not null unique,
  expense_date date not null default current_date,
  total_amount numeric not null default 0,
  note text,
  created_at timestamptz not null default now()
);

create table public.expense_items (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.expenses(id),
  ingredient_id uuid references public.ingredients(id),
  item_name text not null,
  purchase_quantity numeric not null default 0,
  purchase_unit text,
  stock_quantity numeric not null default 0,
  unit_price numeric not null default 0,
  line_total numeric not null default 0
);

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  ingredient_id uuid not null references public.ingredients(id),
  movement_type text not null check (movement_type in ('SALE', 'PURCHASE', 'ADJUSTMENT', 'STOCK_EDIT', 'INITIAL_STOCK', 'VOID')),
  quantity_before numeric,
  quantity_delta numeric not null,
  quantity_after numeric not null,
  source_table text not null,
  source_id text not null,
  reason text,
  created_at timestamptz not null default now()
);

create table public.printer_settings (
  id uuid primary key default gen_random_uuid(),
  station_name text not null default 'หน้าร้าน',
  bridge_url text not null default 'http://127.0.0.1:8080/print',
  printer_ip text,
  paper_size text not null default '80mm',
  buzzer_enabled boolean not null default true,
  kitchen_template text,
  receipt_template text,
  updated_at timestamptz not null default now()
);

create table public.print_jobs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id),
  job_type text not null check (job_type in ('KITCHEN', 'RECEIPT')),
  status text not null default 'PENDING' check (status in ('PENDING', 'PRINTING', 'PRINTED', 'FAILED')),
  payload jsonb not null,
  retry_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.sheet_sync_jobs (
  id uuid primary key default gen_random_uuid(),
  job_type text not null check (job_type in ('ORDER', 'EXPENSE', 'STOCK_MOVEMENT', 'SUMMARY')),
  status text not null default 'PENDING' check (status in ('PENDING', 'SYNCED', 'FAILED')),
  payload jsonb not null,
  retry_count int not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.record_expense_purchase(payload jsonb)
returns uuid
language plpgsql
as $$
declare
  new_expense_id uuid;
  item jsonb;
  target_ingredient public.ingredients%rowtype;
  quantity_to_add numeric;
  next_stock numeric;
begin
  insert into public.expenses (expense_no, total_amount, note)
  values (
    coalesce(payload->>'expense_no', 'EXP-' || extract(epoch from now())::bigint),
    coalesce((payload->>'total_amount')::numeric, 0),
    payload->>'note'
  )
  returning id into new_expense_id;

  for item in select * from jsonb_array_elements(payload->'items') loop
    quantity_to_add := coalesce((item->>'stock_quantity')::numeric, 0);

    insert into public.expense_items (
      expense_id, ingredient_id, item_name, purchase_quantity, purchase_unit,
      stock_quantity, unit_price, line_total
    )
    values (
      new_expense_id,
      nullif(item->>'ingredient_id', '')::uuid,
      item->>'item_name',
      coalesce((item->>'purchase_quantity')::numeric, 0),
      item->>'purchase_unit',
      quantity_to_add,
      coalesce((item->>'unit_price')::numeric, 0),
      coalesce((item->>'line_total')::numeric, 0)
    );

    if item ? 'ingredient_id' and nullif(item->>'ingredient_id', '') is not null then
      select * into target_ingredient
      from public.ingredients
      where id = (item->>'ingredient_id')::uuid
      for update;

      next_stock := target_ingredient.quantity_in_stock + quantity_to_add;
      update public.ingredients
      set quantity_in_stock = next_stock, updated_at = now()
      where id = target_ingredient.id;

      insert into public.stock_movements (
        ingredient_id, movement_type, quantity_before, quantity_delta, quantity_after, source_table, source_id, reason
      )
      values (target_ingredient.id, 'PURCHASE', target_ingredient.quantity_in_stock, quantity_to_add, next_stock, 'expenses', new_expense_id::text, 'บันทึกรายจ่ายซื้อวัตถุดิบ');
    end if;
  end loop;

  insert into public.sheet_sync_jobs (job_type, payload)
  values ('EXPENSE', jsonb_build_object('expense_id', new_expense_id));

  return new_expense_id;
end;
$$;

create or replace function public.create_order(payload jsonb)
returns uuid
language plpgsql
as $$
declare
  new_order_id uuid;
begin
  -- Production implementation should expand payload items into a temp BOM table,
  -- lock ingredient rows with `for update`, reject negative stock, then insert
  -- order rows, payments, stock_movements, print_jobs, and sheet_sync_jobs.
  insert into public.orders (order_no, total_amount, payment_status)
  values (
    coalesce(payload->>'order_no', 'ORD-' || extract(epoch from now())::bigint),
    (payload->>'total_amount')::numeric,
    'COMPLETED'
  )
  returning id into new_order_id;

  insert into public.sheet_sync_jobs (job_type, payload)
  values ('ORDER', jsonb_build_object('order_id', new_order_id));

  insert into public.print_jobs (order_id, job_type, payload)
  values (new_order_id, 'KITCHEN', payload);

  return new_order_id;
end;
$$;
