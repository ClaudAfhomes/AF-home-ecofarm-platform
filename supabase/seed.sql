insert into public.permissions(key,name,module) values
('dashboard.view','View dashboard','dashboard'),('users.manage','Manage users','organization'),('roles.manage','Manage roles','organization'),('departments.manage','Manage departments','organization'),('hr.manage','Manage employees','hr'),('products.manage','Manage products','catalog'),('customers.manage','Manage customers','sales'),('sales.manage','Manage sales','sales'),('finance.manage','Manage finance','finance'),('reports.view','View reports','finance'),('genealogy.view','View genealogy','genealogy'),('genealogy.manage','Manage genealogy','genealogy'),('qr_credits.manage','Manage QR credits','genealogy'),('audit.view','View audit log','governance'),('settings.manage','Manage business rules','governance') on conflict(key) do nothing;
insert into public.roles(slug,name,description,is_system) values
('super_admin','Super Admin','Full platform governance',true),('admin','Admin','Operational administration',true),('finance','Finance','Payments and reporting',true),('hr','HR','Employee lifecycle',true),('vice_director','Vice Director','Genealogy owner and analytics',true),('senior_sales_manager','Senior Sales Manager','Sales hierarchy management',true),('sales_manager','Sales Manager','Sales and referrals',true),('ost','OST','Referred sales member',true) on conflict(slug) do nothing;
insert into public.departments(name,description) values
('Administration','Platform administration and governance'),
('Finance','Payments, reconciliation, and reporting'),
('Human Resources','Employee lifecycle and records'),
('Sales','Customer acquisition and sales operations')
on conflict(name) do nothing;
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p where
r.slug='super_admin' or
(r.slug='admin' and p.key in ('dashboard.view','users.manage','departments.manage','products.manage','customers.manage','sales.manage','genealogy.view','audit.view')) or
(r.slug='finance' and p.key in ('dashboard.view','finance.manage','reports.view','customers.manage')) or
(r.slug='hr' and p.key in ('dashboard.view','hr.manage','departments.manage')) or
(r.slug='vice_director' and p.key in ('dashboard.view','genealogy.view','genealogy.manage','reports.view','qr_credits.manage')) or
(r.slug='senior_sales_manager' and p.key in ('dashboard.view','genealogy.view','customers.manage','sales.manage')) or
(r.slug='sales_manager' and p.key in ('dashboard.view','genealogy.view','customers.manage','sales.manage','qr_credits.manage')) or
(r.slug='ost' and p.key in ('dashboard.view','customers.manage','sales.manage'))
on conflict do nothing;
insert into public.product_categories(name,description) values('Membership Cards','AFhomes Ecofarm card products') on conflict(name) do nothing;
insert into public.products(category_id,name,description,price,down_payment_type,down_payment_value)
select c.id,v.name,v.description,0,'fixed',0 from public.product_categories c cross join (values('Bronze','Entry membership card'),('Silver','Mid-tier membership card'),('Gold','Premium membership card')) v(name,description) where c.name='Membership Cards' on conflict(name) do nothing;
insert into public.business_rules(key,value,description) values
('spot_cash_deadline_days','7','Days allowed for spot-cash completion'),
('referral_credit_policy','{"maximum_eligible_referral_number":3,"maximum_depth":1,"manager_shoulders_payment":false}','Configurable QR/referral credit eligibility'),
('ocr_provider','{"enabled":false,"provider":null}','OCR remains manual until a provider is approved') on conflict(key) do nothing;
