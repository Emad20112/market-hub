-- ============================================================================
-- platform_plans — subscription tiers
--
-- The plan catalogue the platform offers. Reference data: every installation
-- ships the same tiers, and a customer edits their own subscription.
--
-- AUTO-RUN on `supabase db reset`. Idempotent: ON CONFLICT on a real business
-- key, never on a random UUID. See supabase/MIGRATIONS_RULES.md.
-- ============================================================================

BEGIN;

INSERT INTO public.platform_plans (id, name, description, modules, max_users, max_warehouses, max_products, price_monthly, is_active) VALUES
  ('enterprise', '{"ar":"باقة المؤسسات المتكاملة","en":"Enterprise Plan"}'::jsonb, '{"ar":"نظام ERP كامل يشمل كافة الوحدات والمستودعات والمحاسبة والتحليلات","en":"Full ERP suite with all modules, multi-warehouse, loyalty and accounting"}'::jsonb, '{"advanced_accounting","analytics","audit","barcode","batches","core","expenses","loyalty","milling_operations","multi_warehouse","payments","pos","purchases","returns"}'::text[], 50, 20, NULL, '99.00', true),
  ('professional', '{"ar":"الباقة الاحترافية","en":"Professional Plan"}'::jsonb, '{"ar":"للمتاجر المتنامية: نقطة بيع، مششتريات، تحصيلات ومصروفات","en":"For growing retail: POS, purchases, returns, payments & expenses"}'::jsonb, '{"core","pos","purchases","returns","payments","expenses"}'::text[], 5, 1, 5000, '29.00', true),
  ('starter', '{"ar":"الباقة الأساسية","en":"Starter Plan"}'::jsonb, '{"ar":"للأنشطة الصغيرة: مبيعات ومخزون مبسط ومستودع واحد","en":"For small retail: single warehouse, basic sales and inventory"}'::jsonb, '{"core"}'::text[], 1, 1, 500, '0.00', true)
ON CONFLICT (id) DO NOTHING;

COMMIT;
