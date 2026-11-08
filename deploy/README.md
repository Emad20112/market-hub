# بيئة الإنتاج المحلية

يشغّل هذا المجلد نسخة الإنتاج المعتمدة على جهاز Windows عبر Docker Desktop، وتعمل محليًا دون اعتماد على نطاق عام أو خادم سحابي. بياناتها محفوظة في `deploy/supabase-stack/volumes/db/data`. التطوير يستخدم إعداد Supabase السحابي من `.env`، ولا توجد قاعدة تطوير محلية في Docker.

## المتطلبات

- Windows مع Docker Desktop يعمل وGit for Windows.
- ملفات الإنتاج الخاصة موجودة: `deploy/.env.local-production` و`deploy/supabase-stack/.env`.
- صور Docker المطلوبة موجودة محليًا إذا كان الجهاز بلا إنترنت.

## التشغيل والتحقق

استخدم دليل التشغيل التفصيلي في [`docs/deployment/2026-11-04-local-production-docker-runbook.md`](../docs/deployment/2026-11-04-local-production-docker-runbook.md). التطبيق متاح على `http://localhost:3001`، وواجهة Supabase على `http://localhost:8000`، وقاعدة PostgreSQL محلية فقط على `127.0.0.1:5433`.

تحقق من Compose دون تشغيل أو تعديل البيانات:

```powershell
docker compose --env-file deploy/supabase-stack/.env --project-name supabase `
  -f deploy/supabase-stack/docker-compose.yml `
  -f deploy/supabase-stack/docker-compose.local-production.override.yaml config --quiet

docker compose --env-file deploy/.env.local-production `
  -f deploy/compose.production.yaml `
  -f deploy/compose.local-production.override.yaml config --quiet
```

## بناء تحديثات التطبيق وتشغيلها

بعد تعديل كود التطبيق، ابنِ صورة الإنتاج وشغّل حاوية التطبيق فقط:

```powershell
docker compose --env-file deploy/.env.local-production `
  -f deploy/compose.production.yaml `
  -f deploy/compose.local-production.override.yaml build app

docker compose --env-file deploy/.env.local-production `
  -f deploy/compose.production.yaml `
  -f deploy/compose.local-production.override.yaml up -d --no-deps app
```

يُحدّث البناء الصورة `vortex-erp:local-production` ثم يعيد إنشاء الحاوية `vortex-erp-local-production` دون إيقاف قاعدة البيانات. افتح `http://localhost:3001` لرؤية النسخة المحدّثة. أمر `npm run build` وحده لا يحدّث حاوية الإنتاج.

## التطوير

ملف `.env` في جذر المشروع يخص `npm run dev` فقط، ويمكن توجيهه إلى مشروع Supabase سحابي منفصل. لا تنسخ إعدادات أو أسرار الإنتاج المحلية إليه.

## حماية البيانات

- لا تحذف `deploy/supabase-stack/volumes/db/data`؛ هذا مجلد قاعدة الإنتاج.
- لا تستخدم `docker compose down -v` أو `supabase db reset` على الإنتاج.
- احفظ نسخًا احتياطية مستقلة للتطبيق وقاعدة البيانات وملفات التخزين.
- لا تطبق ترحيلات على قاعدة الإنتاج قبل اعتمادها والتحقق من توافقها مع سجل الترحيلات والبيانات الموجودة.
