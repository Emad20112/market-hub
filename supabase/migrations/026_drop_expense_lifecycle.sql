-- المرحلة 10b: إسقاط دوال دورة حياة المصاريف المنقولة إلى Backend
-- (create_expense_v2، update_expense_v2، submit_expense، decide_expense، post_expense،
--  record_expense_payment، reverse_expense_payment، close_expense، cancel_expense،
--  reverse_expense)
-- إثبات التكافؤ: src/server/__tests__/phase10b-equivalence.test.ts
-- (دورة حياة كاملة على المسار الجديد + توثيق عيب القديمة: decide_expense كانت تسجل
--  'approve'/'reject' فتنهار بقيد expense_approvals_action_known دائمًا).
-- الواجهة تستهلك الآن src/server/api/expenses/* — لا استدعاء RPC حي متبقٍ
-- (تحقق grep على src كاملًا؛ الإشارات الباقية في types.ts المولَّد ولن يُعاد
--  توليدها إلا بعد إسقاط الدوال من القاعدة).
-- ملاحظة: مساعدات 010 (expense_can، expense_round، ...) تبقى جسرًا حتى المرحلة 13
-- لأن دوال القاعدة الباقية ومشغلاتها تستدعيها — ترحيل 025 إعلاني.

DO $$
DECLARE
  v_fn record;
  v_names text[] := ARRAY[
    'create_expense_v2',
    'update_expense_v2',
    'submit_expense',
    'decide_expense',
    'post_expense',
    'record_expense_payment',
    'reverse_expense_payment',
    'close_expense',
    'cancel_expense',
    'reverse_expense'
  ];
  v_dropped int := 0;
BEGIN
  FOR v_fn IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = ANY (v_names)
  LOOP
    EXECUTE 'DROP FUNCTION ' || v_fn.sig;
    v_dropped := v_dropped + 1;
  END LOOP;
  RAISE NOTICE 'Phase 10b: dropped % expense lifecycle overloads.', v_dropped;
END $$;
