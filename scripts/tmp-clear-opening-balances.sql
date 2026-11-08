-- إزالة مستندي الأرصدة الافتتاحية التجريبيين اللذين يحجبان بذور العرض.
DELETE FROM public.opening_balance_lines
WHERE document_id IN (
  SELECT id FROM public.opening_balance_documents
  WHERE document_number IN ('OB-20261105-001', 'OB-20261106-002')
);
DELETE FROM public.opening_balance_documents
WHERE document_number IN ('OB-20261105-001', 'OB-20261106-002');
