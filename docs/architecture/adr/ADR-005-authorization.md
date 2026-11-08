# ADR-005 — الصلاحيات: Authorization في Backend + RLS دفاع ثانٍ

**الحالة:** معتمد | **التاريخ:** 2026-11-07

## القرار
طبقتان مستقلتان:
1. **Authorization Layer (Backend)**: `authorize(session, capability, resource)`
   عند بداية كل Use Case — تنقل دلالات دوال الصلاحيات الحالية
   (`expense_assert_capability`, `can_operate_milling`, `can_author_payment_methods`…)
   إلى TS مع اختباراتها.
2. **RLS في القاعدة (يبقى ولا يُحذف)**: كل معاملة pg تُفتح بهوية المستخدم:
   `SET LOCAL role authenticated; SET LOCAL request.jwt.claims = '…'` فتبقى
   سياسات القاعدة مطبقة على كل استعلام. لو سقط منطق Backend، القاعدة ترفض.

## القواعد
- ما لا يمكن للقاعدة التحقق منه (دلالات سير عمل مثل "لا ترحيل قبل اعتماد") يبقى
  في Backend ويُختبر.
- service_role يُستخدم فقط للمسارات غير الهووية (Webhook/Backup) ويُوثق كل استخدام.
- لا ترقية صلاحية ضمنية: Use Case لا يستدعي الآخر بتجاوز `authorize`.
