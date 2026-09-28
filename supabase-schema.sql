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

create table if not exists public.passkeys (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.users(id) on delete cascade,
    credential_id text not null unique,
    public_key text not null,
    counter bigint not null default 0,
    transports text[] not null default '{}',
    device_type text not null check (device_type in ('singleDevice', 'multiDevice')),
    backed_up boolean not null default false,
    created_at timestamptz not null default now(),
    last_used_at timestamptz
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
alter table public.passkeys enable row level security;
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

create table if not exists public.banks (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.users(id) on delete cascade,
    name text not null,
    custom_name text,
    last_digits text not null check (last_digits ~ '^[0-9]{4}$'),
    balance numeric(12, 2) not null default 0 check (balance >= 0),
    full_name text not null,
    account_type text not null default 'savings',
    is_active boolean not null default true,
    low_balance_threshold numeric(12, 2) check (low_balance_threshold is null or low_balance_threshold >= 0),
    created_at timestamptz not null default now()
);

alter table public.banks add column if not exists custom_name text;
alter table public.banks add column if not exists is_active boolean not null default true;
alter table public.banks add column if not exists low_balance_threshold numeric(12, 2) check (low_balance_threshold is null or low_balance_threshold >= 0);
alter table public.users add column if not exists default_bank_id uuid references public.banks(id) on delete set null;

create table if not exists public.beneficiaries (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.users(id) on delete cascade,
    name text not null check (length(trim(name)) between 1 and 100),
    bank_name text not null check (length(trim(bank_name)) between 1 and 80),
    account_last_digits text not null check (account_last_digits ~ '^[0-9]{4}$'),
    contact text check (contact is null or length(contact) <= 100),
    created_at timestamptz not null default now(),
    unique (user_id, bank_name, account_last_digits)
);

alter table public.beneficiaries enable row level security;

create table if not exists public.transactions (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.users(id) on delete cascade,
    from_bank_id uuid references public.banks(id) on delete set null,
    to_bank_id uuid references public.banks(id) on delete set null,
    beneficiary_id uuid references public.beneficiaries(id) on delete set null,
    recipient_name text,
    memo text,
    title text not null,
    amount numeric(12, 2) not null,
    status text not null default 'completed',
    created_at timestamptz not null default now()
);

alter table public.transactions add column if not exists beneficiary_id uuid references public.beneficiaries(id) on delete set null;
alter table public.transactions add column if not exists recipient_name text;
alter table public.transactions add column if not exists memo text;
alter table public.transactions drop constraint if exists transactions_from_bank_id_fkey;
alter table public.transactions add constraint transactions_from_bank_id_fkey foreign key (from_bank_id) references public.banks(id) on delete set null;
alter table public.transactions drop constraint if exists transactions_to_bank_id_fkey;
alter table public.transactions add constraint transactions_to_bank_id_fkey foreign key (to_bank_id) references public.banks(id) on delete set null;

alter table public.banks enable row level security;
alter table public.transactions enable row level security;

create index if not exists banks_user_id_idx on public.banks(user_id);
create index if not exists transactions_user_id_idx on public.transactions(user_id);
create index if not exists beneficiaries_user_id_idx on public.beneficiaries(user_id);
create index if not exists password_reset_tokens_user_id_idx on public.password_reset_tokens(user_id);
create index if not exists password_reset_tokens_expires_at_idx on public.password_reset_tokens(expires_at);
create unique index if not exists users_email_lower_idx on public.users(lower(email));
create index if not exists users_role_idx on public.users(role);
create index if not exists users_created_at_idx on public.users(created_at desc);
create unique index if not exists banks_user_name_idx on public.banks(user_id, name);
create index if not exists user_sessions_user_id_idx on public.user_sessions(user_id);
create index if not exists user_sessions_last_seen_at_idx on public.user_sessions(last_seen_at desc);
create index if not exists passkeys_user_id_idx on public.passkeys(user_id);
create index if not exists audit_logs_created_at_idx on public.audit_logs(created_at desc);
create index if not exists audit_logs_target_user_id_idx on public.audit_logs(target_user_id);

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
    transaction_id uuid;
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
    if not source_bank.is_active or not destination_bank.is_active then
        raise exception 'Paused accounts cannot be used for transfers.' using errcode = '55000';
    end if;
    if source_bank.balance < p_amount then
        raise exception 'Insufficient balance.' using errcode = '22003';
    end if;

    update public.banks set balance = balance - p_amount where id = source_bank.id;
    update public.banks set balance = balance + p_amount where id = destination_bank.id;
    insert into public.transactions(user_id, from_bank_id, to_bank_id, title, amount)
    values (p_user_id, source_bank.id, destination_bank.id, 'Transfer to ' || destination_bank.name, -p_amount)
    returning id into transaction_id;

    insert into public.audit_logs(actor_user_id, action, metadata)
    values (p_user_id, 'bank_transfer', jsonb_build_object('transactionId', transaction_id, 'fromBankId', source_bank.id, 'toBankId', destination_bank.id, 'amount', p_amount));

    return json_build_object('from', source_bank.name, 'to', destination_bank.name, 'amount', p_amount, 'status', 'completed');
end;
$$;

create or replace function public.transfer_to_beneficiary(
    p_user_id uuid,
    p_from_bank_id uuid,
    p_beneficiary_id uuid,
    p_amount numeric,
    p_note text default null
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
    source_bank public.banks;
    recipient public.beneficiaries;
    transaction_id uuid;
    transfer_note text := nullif(trim(p_note), '');
begin
    if p_amount is null or p_amount <= 0 then
        raise exception 'Transfer amount must be greater than zero.' using errcode = '22023';
    end if;
    if length(coalesce(transfer_note, '')) > 240 then
        raise exception 'Transfer note must be 240 characters or fewer.' using errcode = '22023';
    end if;

    select * into recipient from public.beneficiaries
    where id = p_beneficiary_id and user_id = p_user_id for share;
    select * into source_bank from public.banks
    where id = p_from_bank_id and user_id = p_user_id for update;

    if recipient.id is null or source_bank.id is null then
        raise exception 'Source bank or beneficiary was not found.' using errcode = 'P0002';
    end if;
    if not source_bank.is_active then
        raise exception 'Paused accounts cannot be used for transfers.' using errcode = '55000';
    end if;
    if source_bank.balance < p_amount then
        raise exception 'Insufficient balance.' using errcode = '22003';
    end if;

    update public.banks set balance = balance - p_amount where id = source_bank.id;
    insert into public.transactions(user_id, from_bank_id, beneficiary_id, recipient_name, memo, title, amount, status)
    values (p_user_id, source_bank.id, recipient.id, recipient.name, transfer_note, 'Transfer to ' || recipient.name, -p_amount, 'recorded')
    returning id into transaction_id;

    insert into public.audit_logs(actor_user_id, action, metadata)
    values (p_user_id, 'beneficiary_transfer', jsonb_build_object('transactionId', transaction_id, 'fromBankId', source_bank.id, 'beneficiaryId', recipient.id, 'recipientName', recipient.name, 'amount', p_amount));

    return json_build_object('transactionId', transaction_id, 'from', source_bank.name, 'recipient', recipient.name, 'amount', p_amount, 'note', transfer_note, 'status', 'recorded');
end;
$$;

create or replace function public.set_bank_active_state(
    p_user_id uuid,
    p_bank_id uuid,
    p_is_active boolean
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
    account public.banks;
begin
    if p_is_active is null then
        raise exception 'Choose whether to pause or reactivate the account.' using errcode = '22023';
    end if;

    select * into account from public.banks
    where id = p_bank_id and user_id = p_user_id for update;
    if account.id is null then
        raise exception 'Linked account was not found.' using errcode = 'P0002';
    end if;

    update public.banks set is_active = p_is_active where id = account.id;
    if not p_is_active then
        update public.users set default_bank_id = null where id = p_user_id and default_bank_id = account.id;
    end if;

    insert into public.audit_logs(actor_user_id, action, metadata)
    values (p_user_id, case when p_is_active then 'bank_reactivated' else 'bank_paused' end, jsonb_build_object('bankId', account.id, 'bankName', account.name));

    return json_build_object('id', account.id, 'is_active', p_is_active);
end;
$$;

create or replace function public.set_default_bank(
    p_user_id uuid,
    p_bank_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
    account public.banks;
begin
    if p_bank_id is not null then
        select * into account from public.banks
        where id = p_bank_id and user_id = p_user_id for share;
        if account.id is null or not account.is_active then
            raise exception 'Choose one of your active linked accounts.' using errcode = 'P0002';
        end if;
    end if;

    update public.users set default_bank_id = p_bank_id where id = p_user_id;
    if not found then
        raise exception 'User was not found.' using errcode = 'P0002';
    end if;

    insert into public.audit_logs(actor_user_id, action, metadata)
    values (p_user_id, case when p_bank_id is null then 'default_bank_cleared' else 'default_bank_changed' end, jsonb_build_object('bankId', p_bank_id));

    return p_bank_id;
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
    transaction_id uuid;
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
    if not source_bank.is_active then
        raise exception 'Paused accounts cannot be used for purchases.' using errcode = '55000';
    end if;
    if source_bank.balance < p_amount then
        raise exception 'Insufficient balance.' using errcode = '22003';
    end if;

    update public.banks set balance = balance - p_amount where id = source_bank.id;
    insert into public.transactions(user_id, from_bank_id, title, amount)
    values (p_user_id, source_bank.id, 'Airtime Purchase - ' || trim(p_network), -p_amount)
    returning id into transaction_id;

    insert into public.audit_logs(actor_user_id, action, metadata)
    values (p_user_id, 'airtime_purchase', jsonb_build_object('transactionId', transaction_id, 'bankId', source_bank.id, 'network', trim(p_network), 'amount', p_amount));

    return json_build_object('bank', source_bank.name, 'network', trim(p_network), 'phone', trim(p_phone), 'amount', p_amount, 'status', 'completed');
end;
$$;

revoke all on table public.users, public.banks, public.beneficiaries, public.transactions, public.user_sessions, public.passkeys, public.audit_logs, public.password_reset_tokens from anon, authenticated;
revoke execute on function public.transfer_between_banks(uuid, uuid, uuid, numeric) from public, anon, authenticated;
revoke execute on function public.transfer_to_beneficiary(uuid, uuid, uuid, numeric, text) from public, anon, authenticated;
revoke execute on function public.set_bank_active_state(uuid, uuid, boolean) from public, anon, authenticated;
revoke execute on function public.set_default_bank(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.purchase_airtime(uuid, uuid, text, text, numeric) from public, anon, authenticated;
grant execute on function public.transfer_between_banks(uuid, uuid, uuid, numeric) to service_role;
grant execute on function public.transfer_to_beneficiary(uuid, uuid, uuid, numeric, text) to service_role;
grant execute on function public.set_bank_active_state(uuid, uuid, boolean) to service_role;
grant execute on function public.set_default_bank(uuid, uuid) to service_role;
grant execute on function public.purchase_airtime(uuid, uuid, text, text, numeric) to service_role;
