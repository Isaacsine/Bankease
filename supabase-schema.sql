create extension if not exists pgcrypto;

create table if not exists public.users (
    id uuid primary key default gen_random_uuid(),
    full_name text not null,
    email text not null unique,
    phone text not null,
    password_hash text not null,
    created_at timestamptz not null default now()
);

create table if not exists public.password_reset_tokens (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.users(id) on delete cascade,
    token_hash text not null unique,
    expires_at timestamptz not null,
    created_at timestamptz not null default now()
);

alter table public.password_reset_tokens enable row level security;

create table if not exists public.banks (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.users(id) on delete cascade,
    name text not null,
    last_digits text not null check (last_digits ~ '^[0-9]{4}$'),
    balance numeric(12, 2) not null default 0 check (balance >= 0),
    full_name text not null,
    account_type text not null default 'savings',
    created_at timestamptz not null default now()
);

create table if not exists public.transactions (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.users(id) on delete cascade,
    from_bank_id uuid references public.banks(id),
    to_bank_id uuid references public.banks(id),
    title text not null,
    amount numeric(12, 2) not null,
    status text not null default 'completed',
    created_at timestamptz not null default now()
);

create index if not exists banks_user_id_idx on public.banks(user_id);
create index if not exists transactions_user_id_idx on public.transactions(user_id);
create index if not exists password_reset_tokens_user_id_idx on public.password_reset_tokens(user_id);
create index if not exists password_reset_tokens_expires_at_idx on public.password_reset_tokens(expires_at);
create unique index if not exists users_email_lower_idx on public.users(lower(email));
create unique index if not exists banks_user_name_idx on public.banks(user_id, name);

create or replace function public.transfer_between_banks(
    p_user_id uuid,
    p_from_bank_id uuid,
    p_to_bank_id uuid,
    p_amount numeric
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
    source_bank public.banks;
    destination_bank public.banks;
begin
    if p_amount is null or p_amount <= 0 then
        raise exception 'Transfer amount must be greater than zero.' using errcode = '22023';
    end if;
    if p_from_bank_id = p_to_bank_id then
        raise exception 'Source and destination banks must be different.' using errcode = '22023';
    end if;

    select * into source_bank from public.banks
    where id = p_from_bank_id and user_id = p_user_id for update;
    select * into destination_bank from public.banks
    where id = p_to_bank_id and user_id = p_user_id for update;

    if source_bank.id is null or destination_bank.id is null then
        raise exception 'Source or destination bank was not found.' using errcode = 'P0002';
    end if;
    if source_bank.balance < p_amount then
        raise exception 'Insufficient balance.' using errcode = '22003';
    end if;

    update public.banks set balance = balance - p_amount where id = source_bank.id;
    update public.banks set balance = balance + p_amount where id = destination_bank.id;
    insert into public.transactions(user_id, from_bank_id, to_bank_id, title, amount)
    values (p_user_id, source_bank.id, destination_bank.id, 'Transfer to ' || destination_bank.name, -p_amount);

    return json_build_object('from', source_bank.name, 'to', destination_bank.name, 'amount', p_amount, 'status', 'completed');
end;
$$;

create or replace function public.purchase_airtime(
    p_user_id uuid,
    p_bank_id uuid,
    p_network text,
    p_phone text,
    p_amount numeric
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
    source_bank public.banks;
begin
    if p_amount is null or p_amount <= 0 then
        raise exception 'Airtime amount must be greater than zero.' using errcode = '22023';
    end if;
    if nullif(trim(p_network), '') is null or nullif(trim(p_phone), '') is null then
        raise exception 'Network and cellphone number are required.' using errcode = '22023';
    end if;

    select * into source_bank from public.banks
    where id = p_bank_id and user_id = p_user_id for update;

    if source_bank.id is null then
        raise exception 'Bank was not found.' using errcode = 'P0002';
    end if;
    if source_bank.balance < p_amount then
        raise exception 'Insufficient balance.' using errcode = '22003';
    end if;

    update public.banks set balance = balance - p_amount where id = source_bank.id;
    insert into public.transactions(user_id, from_bank_id, title, amount)
    values (p_user_id, source_bank.id, 'Airtime Purchase - ' || trim(p_network), -p_amount);

    return json_build_object('bank', source_bank.name, 'network', trim(p_network), 'phone', trim(p_phone), 'amount', p_amount, 'status', 'completed');
end;
$$;
