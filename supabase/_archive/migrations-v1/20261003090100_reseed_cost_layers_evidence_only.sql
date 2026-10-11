-- إعادة زرع طبقات التكلفة بقاعدة "الدليل فقط": لا طبقة بلا تكلفة فعلية موثقة
DELETE FROM public.item_cost_layers WHERE total_value = 0 OR last_unit_cost = 0;

INSERT INTO public.item_cost_layers
  (product_id, warehouse_id, owner_type, owner_id, quantity, total_value,
   valuation_method, last_unit_cost, last_movement_at)
SELECT i.product_id, i.warehouse_id, i.owner_type, i.owner_id,
       i.quantity, round(i.quantity * v.unit_cost, 2),
       public.company_costing_method(), v.unit_cost, v.as_of
  FROM public.inventory i
  JOIN LATERAL (
    SELECT m.unit_cost, m.created_at AS as_of
      FROM public.stock_movements m
     WHERE m.product_id   = i.product_id
       AND m.warehouse_id = i.warehouse_id
       AND m.owner_type   = i.owner_type
       AND m.owner_id IS NOT DISTINCT FROM i.owner_id
       AND m.unit_cost IS NOT NULL AND m.unit_cost > 0
     ORDER BY m.created_at DESC LIMIT 1
  ) v ON TRUE
 WHERE i.quantity <> 0
ON CONFLICT (product_id, warehouse_id, owner_type, owner_id) DO NOTHING;