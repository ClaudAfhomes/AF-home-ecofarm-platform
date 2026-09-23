-- Transactional integration checks for the Super Admin workflow.
-- The final ROLLBACK guarantees that fixture Auth users and business rows are not retained.
begin;

do $$
declare
  v_super uuid := gen_random_uuid();
  v_admin uuid := gen_random_uuid();
  v_vd_a uuid := gen_random_uuid();
  v_vd_b uuid := gen_random_uuid();
  v_senior uuid := gen_random_uuid();
  v_manager uuid := gen_random_uuid();
  v_ost uuid := gen_random_uuid();
  v_invitee uuid := gen_random_uuid();
  v_customer uuid;
  v_sale uuid;
  v_super_role uuid;
  v_admin_role uuid;
  v_vd_role uuid;
  v_senior_role uuid;
  v_manager_role uuid;
  v_ost_role uuid;
  v_denied boolean := false;
  v_update_denied boolean := false;
  v_invalid boolean := false;
  v_cycle boolean := false;
begin
  select id into v_super_role from public.roles where slug='super_admin';
  select id into v_admin_role from public.roles where slug='admin';
  select id into v_vd_role from public.roles where slug='vice_director';
  select id into v_senior_role from public.roles where slug='senior_sales_manager';
  select id into v_manager_role from public.roles where slug='sales_manager';
  select id into v_ost_role from public.roles where slug='ost';

  insert into auth.users(id,email) values
    (v_super,'test-super@example.invalid'),(v_admin,'test-admin@example.invalid'),
    (v_vd_a,'test-vda@example.invalid'),(v_vd_b,'test-vdb@example.invalid'),
    (v_senior,'test-senior@example.invalid'),(v_manager,'test-manager@example.invalid'),
    (v_ost,'test-ost@example.invalid'),(v_invitee,'test-invitee@example.invalid');
  insert into public.profiles(id,email,full_name,role_id,genealogy_parent_id,vice_director_id,referral_depth) values
    (v_super,'test-super@example.invalid','Test Super',v_super_role,null,null,0),
    (v_admin,'test-admin@example.invalid','Test Admin',v_admin_role,null,null,0),
    (v_vd_a,'test-vda@example.invalid','Test VD A',v_vd_role,null,v_vd_a,0),
    (v_vd_b,'test-vdb@example.invalid','Test VD B',v_vd_role,null,v_vd_b,0),
    (v_senior,'test-senior@example.invalid','Test Senior',v_senior_role,v_vd_a,v_vd_a,1),
    (v_manager,'test-manager@example.invalid','Test Manager',v_manager_role,v_senior,v_vd_a,2),
    (v_ost,'test-ost@example.invalid','Test OST',v_ost_role,v_manager,v_vd_a,3);

  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_admin,'role','authenticated')::text,true);
  begin
    perform public.admin_create_profile(v_invitee,'test-invitee@example.invalid','Denied Invite',v_admin_role,null,null,null,null);
  exception when others then v_denied := sqlerrm like 'Only Super Admin%'; end;
  if not v_denied then raise exception 'Non-Super Admin invite was not rejected'; end if;
  begin
    perform public.admin_update_profile(v_ost,'Test OST',v_ost_role,null,'active',null,null,v_manager,'Unauthorized role test');
  exception when others then v_update_denied := sqlerrm like 'Only Super Admin%'; end;
  if not v_update_denied then raise exception 'Non-Super Admin profile update was not rejected'; end if;

  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_super,'role','authenticated')::text,true);
  begin
    perform public.admin_update_profile(v_ost,'Test OST',v_ost_role,null,'active',null,null,v_senior,'Invalid parent test');
  exception when others then v_invalid := sqlerrm like 'An OST member must%'; end;
  if not v_invalid then raise exception 'Invalid hierarchy was not rejected'; end if;

  update public.profiles set genealogy_parent_id=v_manager,vice_director_id=v_vd_a,referral_depth=3 where id=v_senior;
  begin
    perform public.admin_update_profile(v_manager,'Test Manager',v_manager_role,null,'active',null,null,v_senior,'Cycle rejection test');
  exception when others then v_cycle := sqlerrm like '%cycle%'; end;
  if not v_cycle then raise exception 'Circular hierarchy was not rejected'; end if;
  update public.profiles set genealogy_parent_id=v_vd_a,referral_depth=1 where id=v_senior;

  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_vd_a,'role','authenticated')::text,true);
  if exists(select 1 from public.genealogy_tree() where id=v_vd_b or vice_director_id=v_vd_b) then
    raise exception 'Vice Director isolation failed';
  end if;

  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_super,'role','authenticated')::text,true);
  insert into public.customers(first_name,last_name,phone,address,id_type,created_by)
  values('Preserved','Customer','000','Test','test',v_manager) returning id into v_customer;
  insert into public.sales(customer_id,product_id,salesperson_id,vice_director_id,transaction_type,total_amount,created_by)
  select v_customer,id,v_manager,v_vd_a,'installment',1,v_manager from public.products limit 1 returning id into v_sale;
  perform public.admin_update_profile(v_manager,'Test Manager',v_manager_role,null,'inactive',null,null,v_senior,'Preserve history test');
  if not exists(select 1 from public.profiles where id=v_manager and employment_status='inactive')
     or not exists(select 1 from public.sales where id=v_sale) then
    raise exception 'Deactivation did not preserve profile and sales history';
  end if;
end;
$$;

select 'PASS' as super_admin_workflow_invariants;
rollback;
