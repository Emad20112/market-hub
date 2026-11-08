# ADR-001 — Backend داخل TanStack Start (Server Functions)

**الحالة:** معتمد | **التاريخ:** 2026-11-07 | **البديل المختار:** من 4 بدائل
**المصدر:** `docs/ARCHITECTURE_REVIEW_V2.md` §3 (المقارنة الكاملة)

## السياق
النظام TanStack Start + React Query + Supabase (Postgres). المنطق الحالي في دوال
Postgres (296 دالة). المطلوب Backend حقيقي هو مركز قواعد العمل، دون كسر النظام الحي.

## القرار
Backend داخلي: طبقات سداسية (Transport → Application → Domain → Infrastructure)
تعمل داخل TanStack Start عبر `createServerFn`. التصميم يجعل طبقة النقل رقيقة
و Domain نقية بلا إطار، بحيث يمكن استخراج Backend لاحقًا إلى خدمة مستقلة (NestJS
أو غيرها) بنقل الطبقات لا بإعادة كتابتها.

## لماذا هذا الخيار (ملخص المقارنة)
- **ذرّية كاملة:** اتصال pg مباشر + `BEGIN/COMMIT` — Edge Functions لا تتيح ذلك.
- **صفر بنية نشر جديدة:** البناء عبر Nitro قائم؛ NestJS/Fastify = خدمة + Docker + CI + جسور أنواع.
- **أنواع مشتركة:** استيراد عقود المجال مباشرة في الواجهة، لا نسخ عقود.
- **أقل مخاطرة سلوكية:** لا تشغيل موازٍ لبنية جديدة أثناء الانتقال.
- **React Query/Loaders:** تكامل جاهز بدل جسور يدوية.

## العيوب المقبولة
- الارتباط بمشروع Vite/Nitro (مقبول: النظام مبني عليه أصلًا).
- لا فصل فيزيائي بين الواجهة والمنطق (يُعالج بحدود ESLint و`src/server/` كمساحة منفصلة).

## القواعد الملزمة
1. لا Route/Component يستدعي قاعدة البيانات أو RPC مباشرة — عبر server functions فقط.
2. server function لا تحوي منطق عمل — فقط تحقق مدخل + استدعاء Use Case.
3. Domain لا تستورد أي شيء من Vite/React/Supabase.
