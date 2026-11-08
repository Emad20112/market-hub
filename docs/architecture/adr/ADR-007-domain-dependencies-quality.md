# ADR-007 — قواعد الاعتماد بين النطاقات وقواعد الجودة

**الحالة:** معتمد | **التاريخ:** 2026-11-07
**المصدر:** خريطة الاعتماديات المستخرجة فعليًا `supabase/arch-dep-scan.md`.

## طبقات النطاقات (من الأسفل للأعلى)
```
L0 shared-light (وقت، ترقيم، أخطاء)   L6 expenses   L10 treasury
L1 identity                           L7 sales      L11 milling
L2 catalog                            L8 purchasing L12 production
L3 partners                           L9 accounting
L4 inventory  L5 stock
```
## القواعد
1. النطاق يستدعي ما دونه فقط. الاستدعاء للجنب أو للأعلى = انتهاك؛ الحل نقل
   المنطق للنطاق الأعلى أو إخراجه إلى shared-light.
2. الاتصال بين المجالات عبر **واجهة النطاق** (`index.ts` يصدّر Use Cases فقط)،
   لا عبر repositories بعضه.
3. **ESLint تُشدد تدريجيًا (warn → error) مع كل مرحلة:**
   - `supabase.rpc` خارج `src/server/**` → ممنوع (المرحلة الحالية: warn قائم).
   - SQL خام خارج `infrastructure/` → ممنوع.
   - استيراد repository من Transport/شاشات → ممنوع.
4. مجال جديد = مجلد + MANIFEST (owner، حدود، عقود) + اختبارات، قبل أول دالة.
5. الجودة لكل مرحلة: لا منطق مكرر (قاعدة عمل في مكان واحد)، لا DB logic في
   Routes/Components، كل Use Case له اختبار، كل حذف/تغيير موثق في سجل القرارات.
