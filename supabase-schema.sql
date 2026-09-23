create extension if not exists pgcrypto;

create table if not exists public.users (
    id uuid primary key default gen_random_uuid(),
    full_name text not null,
    email text not null unique,
    phone text not null,
    password_hash text not null,
    role text not null default 'user' check (role in ('user', 'support', 'admin')),
    status text not null default 'active' check (status in ('active', 'suspended')),
    last_login_at timestamptz,
    created_at timestamptz not null default now()
);

alter table public.users add column if not exists role text not null default 'user';
alter table public.users add column if not exists status text not null default 'active';
alter table public.users add column if not exists last_login_at timestamptz;
alter table public.users drop constraint if exists users_role_check;
alter table public.users add constraint users_role_check check (role in ('user', 'support', 'admin'));
alter table public.users drop constraint if exists users_status_check;
alter table public.users add constraint users_status_check check (status in ('active', 'suspended'));

create table if not exists public.user_sessions (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.users(id) on delete cascade,
    login_at timestamptz not null default now(),
    last_seen_at timestamptz not null default now(),
    ip_address inet,
    user_agent text,
    is_active boolean not null default true
);

create table if not exists public.audit_logs (
    id uuid primary key default gen_random_uuid(),
    actor_user_id uuid references public.users(id) on delete set null,
    action text not null,
    target_user_id uuid references public.users(id) on delete set null,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

alter table public.user_sessions enable row level security;
alter table public.audit_logs enable row level security;

create table if not exists public.password_reset_tokens (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.users(id) on delete cascade,
    token_hash text not null unique,
    expires_at timestamptz not null,
    created_at timestamptz not null default now()
);

alter table public.password_reset_tokens enable row level security;

alter table public.users enable row level security;
alter table public.banks enable row level security;
alter table public.transactions enable row level security;

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
create index if not exists users_role_idx on public.users(role);
create index if not exists users_created_at_idx on public.users(created_at desc);
create unique index if not exists banks_user_name_idx on public.banks(user_id, name);
create index if not exists user_sessions_user_id_idx on public.user_sessions(user_id);
create index if not exists user_sessions_last_seen_at_idx on public.user_sessions(last_seen_at desc);
create index if not exists audit_logs_created_at_idx on public.audit_logs(created_at desc);
create index if not exists audit_logs_target_user_id_idx on public.audit_logs(target_user_id);

revoke all on table public.users, public.banks, public.transactions, public.user_sessions, public.audit_logs, public.password_reset_tokens from anon, authenticated;
revoke execute on function public.transfer_between_banks(uuid, uuid, uuid, numeric) from public, anon, authenticated;
revoke execute on function public.purchase_airtime(uuid, uuid, text, text, numeric) from public, anon, authenticated;
grant execute on function public.transfer_between_banks(uuid, uuid, uuid, numeric) to service_role;
grant execute on function public.purchase_airtime(uuid, uuid, text, text, numeric) to service_role;

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
