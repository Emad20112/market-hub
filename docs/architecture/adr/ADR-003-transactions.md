# ADR-003 — إدارة المعاملات (Transactions)

**الحالة:** معتمد | **التاريخ:** 2026-11-07
**الشرط:** لا تُنقل أي عملية مالية/مخزون قبل اختبار هذه الطبقة وتثبيتها.

## السياق
كانت الذرّية مضمونة لأن العملية متعددة الجداول داخل دالة Postgres واحدة
(`create_sale`: قيد + مخزون + رصيد عميل في معاملة واحدة). بعد الخروج من القاعدة
يجب استنساخ هذا الضمان في Backend.

## القرار
`src/server/shared/db/transaction.ts` — وحدة Unit of Work مركزية:

```ts
withTransaction(async (tx) => {
  await salesRepo.insertInvoice(tx, ...);      // فاتورة البيع
  await stockRepo.postDelta(tx, ...);          // حركة المخزون
  await accountingRepo.postJournal(tx, ...);   // القيد المحاسبي
  await partnersRepo.updateCustomerBalance(tx, ...); // رصيد العميل
}); // BEGIN ... COMMIT | ROLLBACK عند أول خطأ
```

### القواعد
1. **كل Repository يقبل `tx` (DbExecutor) كوسيط أول** ولا يفتح اتصالًا خاصًا
   عندما يعمل داخل معاملة. الواجهة: `DbExecutor = PoolClient | Pool` مع
   `isTx` للفحص.
2. **حفظ جزئي:** التعشيش يُترجم إلى `SAVEPOINT` تلقائيًا (use case يستدعي
   use case فرعي) — خطأ فرعي يعود لسماوه دون إسقاط المعاملة كلها.
3. **الأقفال:** ما كان داخل دوال SQL (`SELECT … FOR UPDATE`,
   `pg_advisory_xact_lock` كما في `customer_balance_lock`) يُترجم حرفيًا داخل
   نفس المعاملة — لا تغيير في دلالات تزامن.
4. **توليد الأرقام:** sequence/قفل صف القائمة عبر Repository — بلا سباق جديد.
5. **RLS داخل المعاملة:** قبل التنفيذ: `SET LOCAL role authenticated` +
   `SET LOCAL request.jwt.claims = '<هوية المستخدم>'` (ADR-005).
6. **المهلة:** `statement_timeout` محدود للمعاملات (مثلًا 15s) لمنع الانتظار اللانهائي.
7. **Retry:** عند خطأ `40P01` (deadlock) إعادة واحدة تلقائية بترتيب أقفال موحد.

### بوابات التبني
- اختبار تكامل: معاملة تعمل، وفشل جزئي يعود كل شيء (rollback كامل).
- اختبار تزامن: عمليتان على نفس العميل لا تتلفان الرصيد.
- مقارنة كاملة لمخرجات العملية القديمة (RPC) والجديدة قبل إسقاط القديمة.
