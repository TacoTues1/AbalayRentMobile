
grant usage on schema public to authenticated;

do $$
declare
  v_table_name text;
  v_user_column text;
  v_table_names text[] := array[
    'subscriptions',
    'subscription_payments',
    'subscribtion',
    'subscription',
    'subscribtion_payments',
    'subscription_payment',
    'subscribtion_payment'
  ];
  v_user_columns text[] := array[
    'tenant_id',
    'user_id',
    'owner_id',
    'payer_id',
    'profile_id',
    'landlord_id',
    'mother_id'
  ];
begin
  foreach v_table_name in array v_table_names loop
    if not exists (
      select 1
      from information_schema.tables
      where table_schema = 'public'
        and table_name = v_table_name
    ) then
      continue;
    end if;

    select c.column_name
      into v_user_column
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = v_table_name
      and c.column_name = any(v_user_columns)
    order by array_position(v_user_columns, c.column_name)
    limit 1;

    if v_user_column is null then
      raise notice 'Skipping %. No supported ownership column found.', v_table_name;
      continue;
    end if;

    execute format('alter table public.%I enable row level security', v_table_name);
    execute format(
      'grant select, insert, update on table public.%I to authenticated',
      v_table_name
    );

    execute format(
      'drop policy if exists %I on public.%I',
      'mobile_select_own_rows',
      v_table_name
    );
    execute format(
      'drop policy if exists %I on public.%I',
      'mobile_insert_own_rows',
      v_table_name
    );
    execute format(
      'drop policy if exists %I on public.%I',
      'mobile_update_own_rows',
      v_table_name
    );

    execute format(
      'create policy %I on public.%I for select to authenticated using (auth.uid() = %I)',
      'mobile_select_own_rows',
      v_table_name,
      v_user_column
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (auth.uid() = %I)',
      'mobile_insert_own_rows',
      v_table_name,
      v_user_column
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (auth.uid() = %I) with check (auth.uid() = %I)',
      'mobile_update_own_rows',
      v_table_name,
      v_user_column,
      v_user_column
    );

    raise notice 'Applied family-slot RLS fix on %. Owner column: %', v_table_name, v_user_column;
  end loop;
end
$$;
