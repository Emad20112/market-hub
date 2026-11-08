-- المرحلة 9 (النواة): إسقاط دوال المحاسبة المنقولة إلى Backend
-- (create_journal_entry، reverse_journal_entry، set_period_status، next_journal_number،
--  assert_period_open)
-- إثبات التكافؤ: 4/4 سيناريوهات (src/server/__tests__/phase9-equivalence.test.ts)
-- ملاحظات انتقالية حاسمة (DECISIONS-LOG):
--  - لا يمكن إسقاط create_journal_entry بعدُ: دوال باقية في القاعدة تستدعيها
--    (post_sales_invoice، balance_and_post_return، الطحن، الإنتاج، الإقفال، المصاريف)
--    + Use Cases القديمة قاعدة القيد عبر SQL — نُبقيها كجسر حتى المرحلة 13.
--  - assert_period_open تُستدعى من دوال باقية أيضًا — تبقى جسرًا.
--  - لذا هذا الترحيل إعلاني فقط (لا يُسقط شيئًا الآن) ويوثّق نية الإسقاط النهائي
--    بعد انتقال آخر مستدعي SQL.

DO $$
BEGIN
  RAISE NOTICE 'Phase 9: accounting core moved to Backend. Drops deferred to Phase 13 (SQL callers remain).';
END $$;
