-- ============================================================================
-- accounting-phase3-tests.sql — اختبارات المرحلة 3 (T-19 / T-20)
-- يعمل على قاعدة محلية/اختبارية فقط. لا يلمس الإنتاج.
-- يتطلب: تطبيق المهاجرات حتى 21_accounting_phase3_fiscal_periods.sql ثم بذور
-- النظام (accounts + مستخدم اختباري بأدوار owner/manager/accountant).
-- الحالات:
--   1) يُرفض قيد يدوي بتاريخ داخل فترة مقفلة، ويُقبل في فترة مفتوحة.
--   2) close_fiscal_year يقفل 4xxx/5xxx إلى 3911 ويصفّرها، ويصبح كل صف من
--      السنة المرحَّل REVERSED، ويُسجَّل سجل تدقيق، والسنة تصير CLOSED.
--   3) close ثانٍ لنفس السنة يُرفض.
--   4) open_fiscal_year يُرفض إن وُجد قيد افتتاحي سابق لنفس السنة (مصدر وحيد).
--   5) فتح فترة جديدة داخل السنة المقفلة يُرفض؛ إعادة فتح السنة المقفلة ممكنة.
-- ============================================================================

DO $$
DECLARE
  v_user        uuid := '11111111-1111-1111-1111-111111111111';
  v_year        integer := date_part('year', CURRENT_DATE)::int;
  v_period      uuid;
  v_entry       uuid;
  v_open_entry  uuid;
  v_close_id    uuid;
  v_rev         numeric;
  v_cap         numeric;
  v_status      text;
  v_post_status text;
  v_count       integer;
BEGIN
  RAISE NOTICE '── اختبارات المرحلة 3 (الفترات المالية والإقفال) ──';

  ----------------------------------------------------------------
  -- 1) قيد يدوي داخل فترة مقفلة يُرفض، وفي فترة مفتوحة يُقبل
  ----------------------------------------------------------------
  -- ننشئ فترة مقفلة يغذّيها تاريخ قديم صريح.
  INSERT INTO public.fiscal_periods (tenant_id, year, status, opened_at)
  VALUES (NULL, v_year - 2, 'CLOSED', CURRENT_DATE)
  RETURNING id INTO v_period;

  BEGIN
    PERFORM public.create_journal_entry('قيد في فترة مقفلة', (date_trunc('year', CURRENT_DATE) - interval '2 years')::date + 15,
      NULL, NULL, false,
      '[{"account_code":"1101","debit":10},{"account_code":"4111","credit":10}]'::jsonb);
    RAISE EXCEPTION 'FAIL T-19: ترحيل داخل فترة مقفلة مُرضِي!';
  EXCEPTION WHEN others THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE EXCEPTION '%', SQLERRM; END IF;
    RAISE NOTICE 'PASS T-19: رفض القيد داخل فترة مقفلة (%)', SQLERRM;
  END;

  BEGIN
    v_entry := public.create_journal_entry('قيد في فترة مفتوحة', CURRENT_DATE,
      NULL, NULL, false,
      '[{"account_code":"1101","debit":10},{"account_code":"4111","credit":10}]'::jsonb);
    IF v_entry IS NULL THEN
      RAISE EXCEPTION 'FAIL T-19: قيد الفترة المفتوحة لم يُنشأ';
    END IF;
  END;
  RAISE NOTICE 'PASS T-19: القيد داخل الفترة المفتوحة مقبول';

  ----------------------------------------------------------------
  -- 2) close_fiscal_year: يقفل 4xxx/5xxx في 3911 ويصفّرها ويرحّل السنة
  ----------------------------------------------------------------
  -- قيد إيراد/مصروف صريح للسنة الحالية (منفصل عن قيد الفترة المفتوحة):
  v_open_entry := public.create_journal_entry('إيراد ومصروف للإقفال', CURRENT_DATE,
    NULL, NULL, false,
    '[{"account_code":"4111","debit":20},{"account_code":"5111","credit":5},
      {"account_code":"1101","debit":15}]'::jsonb);
  IF v_open_entry IS NULL THEN
    RAISE EXCEPTION 'FAIL T-20: قيد إيراد/مصروف لم يُنشأ';
  END IF;

  v_close_id := public.close_fiscal_year(v_year);
  IF v_close_id IS NULL THEN
    RAISE EXCEPTION 'FAIL T-20: close_fiscal_year أعاد NULL';
  END IF;

  -- كل صف من قيد الإيراد/المصروف أصبح REVERSED (متوازن في السنة المرحَّلة)
  SELECT count(*) INTO v_count
    FROM public.journal_lines jl
   WHERE jl.entry_id = v_open_entry
     AND jl.status <> 'REVERSED';
  IF v_count > 0 THEN
    RAISE EXCEPTION 'FAIL T-20: % صف/أصفار من قيد الإيراد لم تُقلب REVERSED', v_count;
  END IF;

  -- 4111 و5111 مُصفَّران (صافي مدين = صافي دائن)
  SELECT coalesce(sum(natural_balance),0) INTO v_rev
    FROM public.trial_balance
   WHERE code IN ('4111','5111');
  IF v_rev <> 0 THEN
    RAISE EXCEPTION 'FAIL T-20: أرصدة 4111/5111 بعد الإقفال = % والمتوقع 0', v_rev;
  END IF;

  -- 3911 حمل الارباح المُرحَّلة: يجب أن يكون له رصيد
  SELECT coalesce(sum(natural_balance),0) INTO v_cap
    FROM public.trial_balance WHERE code = '3911';
  IF v_cap = 0 THEN
    RAISE EXCEPTION 'FAIL T-20: 3911 بلا رصيد بعد الإقفال';
  END IF;

  -- السنة أصبحت CLOSED
  SELECT status INTO v_status FROM public.fiscal_periods WHERE year = v_year;
  IF v_status <> 'CLOSED' THEN
    RAISE EXCEPTION 'FAIL T-20: حالة السنة % والمتوقعة CLOSED', v_status;
  END IF;

  -- سجل تدقيق
  IF NOT EXISTS (SELECT 1 FROM public.audit_logs
                 WHERE entity_type = 'fiscal_period'
                   AND entity_id = v_close_id
                   AND action = 'fiscal_year.closed') THEN
    RAISE EXCEPTION 'FAIL T-20: لا سجل تدقيق للإقفال';
  END IF;
  RAISE NOTICE 'PASS T-20: إقفال السنة يصفّر 4xxx/5xxx إلى 3911 + REVERSED + سجل تدقيق';

  ----------------------------------------------------------------
  -- 3) إقفال ثانٍ لنفس السنة يُرفض
  ----------------------------------------------------------------
  BEGIN
    PERFORM public.close_fiscal_year(v_year);
    RAISE EXCEPTION 'FAIL T-20: إقفال مزدوج مُرضِي!';
  EXCEPTION WHEN others THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE EXCEPTION '%', SQLERRM; END IF;
    RAISE NOTICE 'PASS T-20: رفض الإقفال المزدوج (%)', SQLERRM;
  END;

  ----------------------------------------------------------------
  -- 4) open_fiscal_year يُرفض إن وُجد قيد افتتاحي سابق لنفس السنة
  ----------------------------------------------------------------
  BEGIN
    PERFORM public.open_fiscal_year(v_year);
    RAISE EXCEPTION 'FAIL T-20: افتتاحي مزدوج مُرضِي!';
  EXCEPTION WHEN others THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE EXCEPTION '%', SQLERRM; END IF;
    RAISE NOTICE 'PASS T-20: رفض الافتتاحي المزدوج (%)', SQLERRM;
  END;

  ----------------------------------------------------------------
  -- 5) فتح فترة داخل سنة مقفلة يُرفض؛ إعادة فتح السنة المقفلة ممكنة
  ----------------------------------------------------------------
  BEGIN
    INSERT INTO public.fiscal_periods (tenant_id, year, status, opened_at)
    VALUES (NULL, v_year, 'OPEN', CURRENT_DATE);
    RAISE EXCEPTION 'FAIL T-19: فتح فترة داخل سنة مقفلة مُرضِي!';
  EXCEPTION WHEN others THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE EXCEPTION '%', SQLERRM; END IF;
    RAISE NOTICE 'PASS T-19: رفض فتح فترة داخل سنة مقفلة';
  END;

  -- إعادة فتح السنة المقفلة ( reopen ) ممكنة لإصلاح خطأ
  UPDATE public.fiscal_periods SET status = 'OPEN' WHERE year = v_year;
  -- يجب أن ينجح القيد الآن داخلها
  v_entry := public.create_journal_entry('قيد بعد إعادة الفتح', CURRENT_DATE,
    NULL, NULL, false,
    '[{"account_code":"1101","debit":3},{"account_code":"4111","credit":3}]'::jsonb);
  IF v_entry IS NULL THEN
    RAISE EXCEPTION 'FAIL T-19: قيد بعد إعادة الفتح فشل';
  END IF;
  RAISE NOTICE 'PASS T-19: إعادة فتح السنة تسمح بالترحيل';

  ----------------------------------------------------------------
  -- تنظيف بيانات الاختبار (اختبار فقط — لا يبقى في القاعدة)
  ----------------------------------------------------------------
  DELETE FROM public.journal_lines
   WHERE entry_id IN (SELECT id FROM public.journal_entries
                       WHERE created_by = v_user
                         AND memo IN ('قيد في فترة مفتوحة','إيراد ومصروف للإقفال','قيد بعد إعادة الفتح'));
  DELETE FROM public.journal_entries
   WHERE created_by = v_user
     AND memo IN ('قيد في فترة مفتوحة','إيراد ومصروف للإقفال','قيد بعد إعادة الفتح');
  DELETE FROM public.fiscal_periods WHERE year IN (v_year, v_year - 2);
  DELETE FROM public.audit_logs WHERE actor_id = v_user
     AND action IN ('journal_entry.posted','fiscal_year.closed');
  RAISE NOTICE '── اكتملت اختبارات المرحلة 3: جميعها PASS ──';
END $$;
