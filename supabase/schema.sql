-- Enable UUID generation
create extension if not exists "uuid-ossp";

-- Products table (managed by store owner via Supabase dashboard)
create table public.products (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  description text not null default '',
  price       numeric(10,2) not null check (price >= 0),
  category    text not null,
  brand       text not null default '',
  image_url   text not null default '',
  stock       integer not null default 0 check (stock >= 0),
  featured    boolean not null default false,
  created_at  timestamptz not null default now()
);

-- Profiles table (one row per registered user)
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null default '',
  created_at  timestamptz not null default now()
);

-- Orders table (written by Stripe webhook)
create table public.orders (
  id                  uuid primary key default uuid_generate_v4(),
  user_id             uuid not null references auth.users(id),
  items               jsonb not null,
  total               numeric(10,2) not null,
  status              text not null default 'pending' check (status in ('pending','paid','failed')),
  stripe_payment_id   text,
  shipping_address    jsonb not null,
  created_at          timestamptz not null default now()
);

-- Row Level Security
alter table public.products  enable row level security;
alter table public.profiles  enable row level security;
alter table public.orders    enable row level security;

-- Products: anyone can read, only service role can write
create policy "products_read_all"  on public.products for select using (true);

-- Profiles: users can read and update their own
create policy "profiles_select_own" on public.profiles for select using (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id);

-- Orders: users can read their own orders; only service role can insert/update
create policy "orders_select_own" on public.orders for select using (auth.uid() = user_id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- SEED: Run this separately in Supabase SQL Editor after schema
-- ============================================================
-- insert into public.products (name, description, price, category, brand, image_url, stock, featured)
-- values
--   ('iPhone 15 Pro', 'A17 Pro chip, 48MP camera system, titanium design.', 999.00, 'Phones', 'Apple', 'https://images.unsplash.com/photo-1695048133142-1a20484d2569?w=400', 50, true),
--   ('MacBook Air M3', '13-inch, 8GB RAM, 256GB SSD, all-day battery.', 1299.00, 'Laptops', 'Apple', 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=400', 30, true),
--   ('AirPods Pro (2nd gen)', 'Active noise cancellation, spatial audio.', 249.00, 'Audio', 'Apple', 'https://images.unsplash.com/photo-1606220588913-b3aacb4d2f46?w=400', 100, true),
--   ('Samsung Galaxy S24', '6.2-inch display, 50MP camera, 7 years of updates.', 799.00, 'Phones', 'Samsung', 'https://images.unsplash.com/photo-1610945415295-d9bbf067e59c?w=400', 40, false),
--   ('Dell XPS 15', '15.6-inch OLED, Core i7, 16GB RAM, NVIDIA GPU.', 1799.00, 'Laptops', 'Dell', 'https://images.unsplash.com/photo-1593642632559-0c6d3fc62b89?w=400', 20, false),
--   ('USB-C Charging Cable 2m', 'Braided, 100W fast charge.', 19.99, 'Accessories', 'Generic', 'https://images.unsplash.com/photo-1588872657578-7efd1f1555ed?w=400', 500, false);

-- Stock decrement function (called by webhook)
create or replace function public.decrement_stock(product_id uuid, amount integer)
returns void language plpgsql security definer as $$
begin
  update public.products
  set stock = greatest(stock - amount, 0)
  where id = product_id;
end;
$$;
