-- مسح البيانات التشغيلية القديمة التي تحجب بذور العرض التجريبية.
-- (طلب صريح من مالك القاعدة: البيانات السابقة لا تُعتبر.)
DELETE FROM public.sales_invoice_items;
DELETE FROM public.sales_invoices;
DELETE FROM public.purchase_invoice_items;
DELETE FROM public.purchase_invoices;
DELETE FROM public.sales_return_items;
DELETE FROM public.sales_returns;
DELETE FROM public.purchase_return_items;
DELETE FROM public.purchase_returns;
DELETE FROM public.custody_ledger;
DELETE FROM public.stock_movements;
DELETE FROM public.stock_adjustment_items;
DELETE FROM public.stock_adjustments;
DELETE FROM public.stock_transfer_items;
DELETE FROM public.stock_transfers;
DELETE FROM public.stock_opening_items;
DELETE FROM public.stock_openings;
DELETE FROM public.item_cost_transactions;
DELETE FROM public.item_cost_layers;
DELETE FROM public.product_batches;
DELETE FROM public.inventory;
DELETE FROM public.inventory_document_items;
DELETE FROM public.inventory_documents;
DELETE FROM public.production_order_materials;
DELETE FROM public.production_order_outputs;
DELETE FROM public.production_orders;
