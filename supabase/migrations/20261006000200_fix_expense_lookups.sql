-- ============================================================================
-- 20261006000200_fix_expense_lookups.sql
-- إصلاح expense_lookups: «more than one row returned by a subquery»
-- ============================================================================
-- الخطأ: القسم «employees» كان يعيد صفوفًا متعددة داخل scalar subquery —
-- أي موظف له أكثر من دور يظهر صفًّا لكل دور، فينهار الـ jsonb_build_object
-- الخارجي بخطأ «more than one row returned by a subquery used as an
-- expression» وترجع نداءات 500 من PostgREST.
--
-- الإصلاح: إزالة GROUP BY الخاطئ، والتمييز DISTINCT على الموظف نفسه.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.expense_lookups(p_include_archived boolean DEFAULT false)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = 'public'
AS $function$
  SELECT jsonb_build_object(
    'categories', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', c.id, 'name', c.name, 'name_ar', c.name_ar,
               'is_active', c.is_active, 'sort_order', c.sort_order,
               'usage_count', (SELECT count(*) FROM public.expense_lines l WHERE l.category_id = c.id)
             ) ORDER BY c.sort_order, c.name)
      FROM public.expense_categories c
      WHERE p_include_archived OR c.is_active
    ), '[]'::jsonb),
    'warehouses', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', w.id, 'name', w.name, 'name_ar', w.name_ar, 'is_default', w.is_default
             ) ORDER BY w.name)
      FROM public.warehouses w
      WHERE w.is_active IS NOT FALSE
    ), '[]'::jsonb),
    'cost_centers', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', cc.id, 'code', cc.code, 'name', cc.name, 'name_ar', cc.name_ar
             ) ORDER BY cc.name)
      FROM public.expense_cost_centers cc
      WHERE cc.is_active
    ), '[]'::jsonb),
    'projects', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', pj.id, 'code', pj.code, 'name', pj.name, 'name_ar', pj.name_ar
             ) ORDER BY pj.name)
      FROM public.expense_projects pj
      WHERE pj.is_active
    ), '[]'::jsonb),
    'suppliers', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name) ORDER BY s.name)
      FROM public.suppliers s
      WHERE s.is_active IS NOT FALSE
    ), '[]'::jsonb),
    'employees', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', p.id, 'name', p.full_name) ORDER BY p.full_name)
      FROM public.profiles p
      WHERE p.is_active IS NOT FALSE
        AND EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = p.id)
    ), '[]'::jsonb),
    'financial_accounts', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', a.id, 'code', a.code, 'name_ar', a.name_ar,
               'account_type', a.account_type,
               'requires_reconciliation', a.requires_reconciliation
             ) ORDER BY a.code)
      FROM public.accounts a
      WHERE a.is_active IS NOT FALSE
        AND (a.requires_reconciliation IS TRUE OR a.code LIKE '11%')
    ), '[]'::jsonb)
  )
$function$;
