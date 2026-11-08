-- المرحلة 2: إسقاط الدوال المنقولة إلى Backend بعد إثبات صفر استخدام
-- (set_profile_active، save_batch_settings، fn_set_document_numbering)
-- سلوكها مُعاد تنفيذه في src/server/domains/{identity,inventory,catalog} مع
-- 12/12 اختبار تكافؤ ناجح (src/server/__tests__/phase2-equivalence.test.ts).
-- دوال الترقيم القرائية (fn_resolve/fn_format/fn_document_numbering_sequence_name)
-- تبقى: تستخدمها دوال الترقيم داخل القاعدة وسياسات RLS.

DO $$
DECLARE
  r record;
  targets text[] := ARRAY[
    'set_profile_active',
    'save_batch_settings',
    'fn_set_document_numbering'
  ];
  t text;
BEGIN
  FOREACH t IN ARRAY targets LOOP
    FOR r IN
      SELECT p.oid
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = t
    LOOP
      EXECUTE format('DROP FUNCTION %s', r.oid::regprocedure);
    END LOOP;
  END LOOP;
END $$;
