# دليل تشغيل قاعدة البيانات — Market Hub ERP

> **الملف:** `supabase/DATABASE_OPERATIONS_GUIDE.md`
> **الجمهور:** من يدير قاعدة البيانات أو ينقل النظام لعميل جديد
> **المتطلبات المسبقة:** قراءة `supabase/MIGRATIONS_RULES.md`

هذا الدليل يشرح **كل أمر تحتاجه**، ومتى تستخدمه، وما يفعله بالضبط. لا يفترض
معرفة سابقة بـ Supabase أو PostgreSQL.

---

## الفهرس

1. [المفاهيم الأساسية](#1-المفاهيم-الأساسية)
2. [الإعداد الأول للمشروع](#2-الإعداد-الأول-للمشروع)
3. [إنشاء قاعدة بيانات جديدة من الصفر](#3-إنشاء-قاعدة-بيانات-جديدة-من-الصفر)
4. [تشغيل ملفات البيانات (Seeds)](#4-تشغيل-ملفات-البيانات-seeds)
5. [نقل النظام إلى عميل جديد](#5-نقل-النظام-إلى-عميل-جديد)
6. [النسخ الاحتياطي والاسترجاع](#6-النسخ-الاحتياطي-والاسترجاع)
7. [استكشاف الأخطاء](#7-استكشاف-الأخطاء)
8. [مرجع الأوامر](#8-مرجع-الأوامر)
9. [أخطاء لا تفعلها](#9-أخطاء-لا-تفعلها)
10. [المراجع](#10-المراجع)

---

## 1. المفاهيم الأساسية

### البنية مقابل البيانات

| | البنية (Schema) | البيانات (Data) |
|---|---|---|
| **أين** | `supabase/migrations/` | `supabase/seeds/` |
| **ما هي** | الجداول، الأعمدة، الدوال، السياسات | الصفوف: حسابات، وحدات، منتجات |
| **تتغير؟** | نادرًا، وبترحيل جديد | كثيرًا |
| **مشتركة؟** | نفسها لكل عميل | مختلفة لكل عميل |

**القاعدة الذهبية:** البنية في الترحيلات، والبيانات في الـ seeds. **لا تخلط.**

### الثلاث بيئات

| البيئة | الغرض | من يستخدمها |
|---|---|---|
| **محلية** (Local) | تطوير واختبار | المبرمج |
| **تجريبية** (Staging) | اختبار قبل النشر | الفريق |
| **إنتاجية** (Production) | عميل حقيقي | العميل |

**لا تُشغّل أبدًا** ملفًا تجريبيًا على بيئة إنتاجية.

---

## 2. الإعداد الأول للمشروع

### 2.1 المتطلبات

قاعدة البيانات المحلية تعمل داخل حاويات Docker، فأدوات التطوير مطلوبة على جهاز
المبرمج. **جهاز العميل النهائي لا يحتاج أياً منها** — التطبيق يوزَّع كبرنامج
Windows يعمل بقاعدة بياناته الخاصة (راجع
`docs/architecture/offline-first-architecture-audit-ar.md`).

| الأداة | لماذا | كيف تتحقق |
|---|---|---|
| **Docker Desktop** | يشغّل حاويات Supabase المحلية (Postgres، Auth، Storage…) | `docker --version` |
| **Node.js 18+** | يشغّل التطبيق ويمدّ `npx supabase` بالـ CLI | `node --version` |
| **Supabase CLI** | إدارة الترحيلات والبذور والنسخ الاحتياطي | `npx supabase --version` |
| **psql** (اختياري) | تشغيل ملفات SQL مباشرةً على السحابة | `psql --version` |
| **Git** | تتبّع التغييرات | `git --version` |

#### على Windows — تنبيه عملي

بيئة التشغيل هذه على Windows، ولها ثلاث مفاجآت متكررة:

1. **Docker Desktop يجب أن يكون قيد التشغيل** قبل أي أمر `supabase`.
   إن رأيت `error during connect` أو `Cannot connect to the Docker daemon`،
   فالمشكلة أن Docker لم يبدأ بعد — افتحه وانتظر حتى تصبح أيقونته خضراء.

2. **Supabase CLI لا يوجد كأمر عالمي في هذا المشروع.** استخدم `npx supabase`
   الذي ينزّل النسخة المثبّتة تلقائياً. أو حدّث PATH ليشمل
   `C:\Program Files\Docker\Docker\resources\bin` و`C:\Program Files\Git\cmd`
   و`C:\Program Files\nodejs`.

3. **لا تستخدم `< redirect` في PowerShell** لتمرير ملف إلى `psql` أو
   `docker exec -i`. المشغّل لا يدعم `<` ويرفضها:
   ```
   The '<' operator is reserved for future use.
   ```
   البديل الصحيح واحد من اثنين:
   ```powershell
   # الأفضل: انسخ الملف داخل الحاوية ثم شغّله
   docker cp supabase\seeds\01_system\05_expense_categories.sql supabase_db_<ref>:/tmp/seed.sql
   docker exec supabase_db_<ref> psql -U postgres -d postgres -f /tmp/seed.sql

   # أو مرّر المحتوى عبر الأنبوب
   Get-Content file.sql -Raw | docker exec -i supabase_db_<ref> psql -U postgres -d postgres
   ```
   > إن مرّرت الملف عبر `Get-Content -Raw`، فقد يسبق المحتوى علامة BOM
   > (`\uFEFF`) فيرفضها Postgres بـ `syntax error at or near ""`. عندها
   > استخدم `docker cp` فهو يحفظ الملف كما هو بلا BOM.

#### أول تشغيل لـ `supabase start`

المرة الأولى تنزّل صور Docker (نحو 1 غيغابايت)، وقد تستغرق **عدة دقائق**.
شغّلها في الخلفية إن أردت:

```powershell
npx supabase start | Out-File supabase-start.log -Encoding utf8
```

واتبع التقدم بـ `Get-Content supabase-start.log -Tail 10`. عند الانتهاء سيُطبع
جدول فيه عنوان القاعدة ومفاتيحها المحلية.

### 2.2 الملفات المطلوبة في المشروع

```
supabase/
├── config.toml          ← إعدادات المشروع ومسارات الـ seeds
├── migrations/          ← 13 ملف بنية
├── seeds/               ← البيانات
├── DATABASE_OPERATIONS_GUIDE.md  ← هذا الدليل
└── MIGRATIONS_RULES.md  ← القانون
```

### 2.3 ملف المتغيرات `.env`

يحتوي مفاتيح الاتصال. **لا يُرفع إلى المستودع أبدًا.**

```bash
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_PUBLISHABLE_KEY=eyJ...
SUPABASE_DB_PASSWORD=...
```

---

## 3. إنشاء قاعدة بيانات جديدة من الصفر

### 3.1 الطريقة الأولى: Supabase محلي (للتطوير)

```bash
# ابدأ Docker Desktop أولًا، ثم:
supabase start
```

سيطبع لك عناوين لوحة التحكم المحلية وقاعدة البيانات، ومنها:

| الخدمة | العنوان |
|---|---|
| API | `http://127.0.0.1:54321` |
| Database | `postgresql://postgres:postgres@127.0.0.1:5432/postgres` |
| Studio | `http://127.0.0.1:54323` |

**لبناء المخطط والبيانات معًا:**

```bash
supabase db reset
```

**ما يفعله هذا الأمر بالضبط:**

| الخطوة | ما يحدث |
|---|---|
| 1 | يحذف قاعدة البيانات المحلية **بالكامل** |
| 2 | ينشئ قاعدة فارغة |
| 3 | يطبّق كل ملف في `migrations/` بالترتيب الرقمي |
| 4 | يطبّق ملفات `seeds/01_system/*.sql` |

**للتحقق من عدد الترحيلات المطبَّقة:**

```powershell
npx supabase db query "SELECT count(*) AS migrations FROM supabase_migrations.schema_migrations;"
```

النتيجة المتوقعة: **13**.

> ⚠️ **`db reset` يحذف كل شيء.** لا تشغّله على إنتاج أبدًا.

### 3.2 الطريقة الثانية: مشروع Supabase سحابي جديد

**الخطوة 1 — أنشئ المشروع** من [supabase.com](https://supabase.com):
New Project ← اختر المنطقة الأقرب لعميلك.

**الخطوة 2 — اربط المشروع محليًا:**

```bash
supabase link --project-ref <معرف-المشروع>
```

المعرف في رابط لوحة التحكم:
`https://supabase.com/dashboard/project/**abcdefghijk**`

**الخطوة 3 — طبّق الترحيلات:**

```bash
supabase db push
```

**ما يفعله:** يطبّق ملفات `migrations/` الجديدة فقط على القاعدة السحابية.

> ⚠️ **`db push` لا يُشغّل الـ seeds.** البيانات تُشغَّل يدويًا (القسم 4).

**الخطوة 4 — شغّل بيانات النظام:**

```bash
psql "$DATABASE_URL" -f supabase/seeds/01_system/01_modules.sql
psql "$DATABASE_URL" -f supabase/seeds/01_system/02_plans.sql
psql "$DATABASE_URL" -f supabase/seeds/01_system/03_chart_of_accounts.sql
psql "$DATABASE_URL" -f supabase/seeds/01_system/04_units.sql
psql "$DATABASE_URL" -f supabase/seeds/01_system/05_expense_categories.sql
```

أو شغّل كل الملفات بأمر واحد (PowerShell):

```powershell
Get-ChildItem supabase\seeds\01_system\*.sql | Sort-Object Name | ForEach-Object {
  Write-Host "تشغيل: $($_.Name)"
  psql "$env:DATABASE_URL" -f $_.FullName
}
```

أو Bash:

```bash
for f in supabase/seeds/01_system/*.sql; do psql "$DATABASE_URL" -f "$f"; done
```

### 3.3 متى يستخدم كل أمر؟

| الحالة | الأمر |
|---|---|
| قاعدة محلية جديدة | `supabase db reset` |
| قاعدة سحابية جديدة | `supabase db push` ثم الـ seeds يدويًا |
| تعديل ملف migration قديم | **ممنوع** — أنشئ migration جديدًا |
| إعادة بناء كاملة محليًا | `supabase db reset` |

---

## 4. تشغيل ملفات البيانات (Seeds)

### 4.1 الأنواع الأربعة

| المجلد | يُشغَّل | متى |
|---|---|---|
| `01_system/` | **تلقائيًا** في `db reset` | لا تفعل شيئًا محليًا |
| `02_company/` | يدويًا | مرة لكل عميل جديد |
| `03_samples/` | يدويًا | عند الحاجة لبيانات عرض |
| `04_tests/` | من الاختبارات | آليًا |

### 4.2 تشغيل ملف واحد

**على قاعدة محلية (Docker) — الطريقة المضمونة على Windows:**

```powershell
# اعرف اسم حاوية قاعدة البيانات أولاً
docker ps --format "{{.Names}}" | Select-String supabase_db

# انسخ الملف داخل الحاوية ثم شغّله
docker cp supabase\seeds\03_samples\sample-mill.sql supabase_db_<ref>:/tmp/seed.sql
docker exec supabase_db_<ref> psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/seed.sql
```

> **لماذا `docker cp` تحديداً؟** لأنه ينسخ الملف بايتاً ببايت بلا BOM، بخلاف
> `Get-Content -Raw | docker exec -i` الذي قد يضيف BOM فيرفضه Postgres.
> و`-v ON_ERROR_STOP=1` يجعل psql يتوقف عند أول خطأ بدل أن يكمل بصمت.

**على قاعدة سحابية:**

```powershell
psql "$env:DATABASE_URL" -f supabase\seeds\03_samples\sample-mill.sql
```

```bash
psql "$DATABASE_URL" -f supabase/seeds/03_samples/sample-mill.sql
```

**أو من لوحة Supabase:** SQL Editor ← الصق محتوى الملف ← Run.

### 4.3 ملفات النظام — بالترتيب

الترتيب **مقصود**، كل ملف يعتمد على ما قبله:

```bash
psql "$DATABASE_URL" -f supabase/seeds/01_system/01_modules.sql
psql "$DATABASE_URL" -f supabase/seeds/01_system/02_plans.sql
psql "$DATABASE_URL" -f supabase/seeds/01_system/03_chart_of_accounts.sql
psql "$DATABASE_URL" -f supabase/seeds/01_system/04_units.sql
psql "$DATABASE_URL" -f supabase/seeds/01_system/05_expense_categories.sql
```

**لماذا هذا الترتيب؟** لأن `02_plans.sql` يفحص أن كل وحدة تفتحها الباقة مسجّلة
في `platform_modules` — والوحدات في `01`. و`05_expense_categories.sql` يحلّ
الحساب **بالكود** من `accounts`، فلو شُغّل قبل `03_chart_of_accounts.sql` لما
وجد الحساب، ولرفع فحصه الذاتي استثناءً. لو عكست الترتيب، يفشل الملف برسالة:

```
باقة تشير إلى وحدات غير مسجّلة في platform_modules: ...
```

**تشغيلها كلها محليًا بأمر واحد:**

```powershell
$ref = (docker ps --format "{{.Names}}" | Select-String "supabase_db_").ToString()
foreach ($f in @("01_modules","02_plans","03_chart_of_accounts","04_units","05_expense_categories")) {
  Write-Host "--- $f ---"
  docker cp "supabase\seeds\01_system\$f.sql" "${ref}:/tmp/$f.sql"
  docker exec $ref psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f "/tmp/$f.sql"
}
```

### 4.4 التحقق بعد التشغيل

```powershell
npx supabase db query "SELECT 'الوحدات' AS البيان, count(*) FROM public.units UNION ALL SELECT 'الحسابات', count(*) FROM public.accounts UNION ALL SELECT 'وحدات النظام', count(*) FROM public.platform_modules UNION ALL SELECT 'الباقات', count(*) FROM public.platform_plans UNION ALL SELECT 'تصنيفات المصروف', count(*) FROM public.expense_categories;"
```

**الأرقام المتوقعة** (مقيسة على `db reset` نظيف):

| البيان | العدد |
|---|---|
| الوحدات | 13 |
| الحسابات | 53 |
| وحدات النظام | 14 |
| الباقات | 3 |
| تصنيفات المصروف | 11 |

### 4.5 هل البيانات صحيحة؟

هذا فحص مهم — يجب أن يكون **صفرًا** في قاعدة جديدة:

```sql
SELECT
  (SELECT count(*) FROM public.products)         AS المنتجات,   -- 0
  (SELECT count(*) FROM public.customers)        AS العملاء,     -- 0
  (SELECT count(*) FROM public.inventory)        AS المخزون,     -- 0
  (SELECT count(*) FROM public.sales_invoices)   AS الفواتير,    -- 0
  (SELECT count(*) FROM public.company_settings) AS هوية_الشركة; -- 0
```

إن ظهر أي رقم غير صفر، فمعنى ذلك أن بيانات أعمال تسرّبت إلى ملفات النظام.

### 4.6 فحص ربط تصنيفات المصروف بالحسابات

التصنيفات صارت تحمل `account_id`، فيجب ألّا يبقى تصنيف نشط بلا حساب:

```sql
SELECT
  c.name_ar,
  a.code  AS كود_الحساب,
  a.name_ar AS اسم_الحساب
FROM public.expense_categories c
LEFT JOIN public.accounts a ON a.id = c.account_id
ORDER BY c.sort_order;
```

النتيجة الصحيحة: **11 صفاً، كلها بكود حساب غير فارغ**. ولو بقي تصنيف بلا
حساب، فقد فشل ربطه — ولن يسكت الملف نفسه عن ذلك لأنه يرفع استثناءً.

### 4.7 الثبات (Idempotency) — شغّل الملف مرتين

كل ملف نظام يجب أن يُشغَّل مرتين بلا خطأ أو تكرار:

```powershell
docker cp supabase\seeds\01_system\05_expense_categories.sql supabase_db_<ref>:/tmp/seed05.sql
docker exec supabase_db_<ref> psql -U postgres -d postgres -f /tmp/seed05.sql   # INSERT 0 11
docker exec supabase_db_<ref> psql -U postgres -d postgres -f /tmp/seed05.sql   # INSERT 0 0
```

المرة الثانية تعطي `INSERT 0 0` — أي لا جديد. إن أعطت `INSERT 0 11` فقد
تضاعفت الصفوف، وإن رمت `duplicate key` فقد غاب `ON CONFLICT`.

---

## 5. نقل النظام إلى عميل جديد

### 5.1 الخطوات بالترتيب

```
1. أنشئ مشروع Supabase جديد للعميل
2. اربطه: supabase link --project-ref <المعرف>
3. طبّق البنية: supabase db push
4. شغّل بيانات النظام (5 ملفات من 01_system)
5. العميل يسجّل من التطبيق
6. رقّ المستخدم الأول إلى مالك: bootstrap_first_owner()
7. أنشئ المستودع الأول من شاشة المستودعات
8. أدخل الأرصدة الافتتاحية إن وُجدت (قسم 5.3)
9. العميل يحرّر هوية شركته من شاشة الإعدادات
```

### 5.2 إنشاء المالك الأول — **بلا كلمات مرور**

**لا تضع مسؤولًا في ملف بيانات أبدًا.** النظام يوفّر دالة مخصّصة:

```sql
-- بعد أن يسجّل العميل من التطبيق:
SELECT public.bootstrap_first_owner();
```

**ما تفعله:** ترقّي المستخدم الحالي إلى `owner`، **وتنجح فقط ما دام لا يوجد
مالك**. فإن حاول شخص ثانٍ، ترفض.

**لماذا هذه الطريقة؟** لأن أي كلمة مرور في ملف تُرفع إلى المستودع تبقى في
تاريخ المشروع إلى الأبد. وهذا أخطر من أي خطأ آخر.

### 5.3 الأرصدة الافتتاحية

إن كان للعميل أرصدة سابقة (مخزون، ذمم، نقدية)، استخدم قالب العميل:

```bash
cp supabase/seeds/02_company/customer-template.sql.example acme-2026.sql
# عدّل الأرقام والمعرفات
psql "$DATABASE_URL" -f acme-2026.sql
```

> ⚠️ **أبقِ الملف المعبّأ خارج المستودع.** أضف `seeds/02_company/*.sql` إلى
> `.gitignore`.

### 5.4 ما لا يجب فعله عند نقل النظام

| ❌ لا تفعل | لماذا |
|---|---|
| تشغيل `sample-mill.sql` على قاعدة العميل | يُدخل منتجات وهمية في دفاتره |
| تشغيل `db reset` على الإنتاج | يحذف كل شيء |
| وضع كلمة مرور في ملف | تبقى في تاريخ المستودع |
| نسخ بيانات عميل آخر | ممنوع قانونيًا ومحاسبيًا |
| تشغيل `db push` على قاعدة مبنية | يحاول إنشاء كائنات موجودة فيفشل |

---

## 6. النسخ الاحتياطي والاسترجاع

### 6.1 نسخة كاملة من البنية والبيانات

```bash
supabase db dump -f backup-$(date +%Y%m%d).sql
```

على PowerShell (لا يوجد `$(date)`):

```powershell
npx supabase db dump -f "backup-$(Get-Date -Format 'yyyyMMdd').sql"
```

### 6.2 البنية فقط

```bash
supabase db dump --schema public -f schema-backup.sql
```

### 6.3 البيانات فقط

```bash
supabase db dump --data-only -f data-backup.sql
```

### 6.4 استرجاع نسخة

```bash
psql "$DATABASE_URL" -f backup-20261008.sql
```

> ⚠️ **الاسترجاع لا يحذف ما هو موجود.** إن أردت استرجاعًا نظيفًا، أنشئ قاعدة
> جديدة ثم استرجع فيها.

### 6.5 متى تأخذ نسخة؟

- **قبل** أي `db push` على الإنتاج
- **قبل** تشغيل أي ملف بيانات
- **قبل** أي `supabase db reset` على قاعدة فيها بيانات تهمّك
- **دوريًا** — أسبوعيًا على الأقل للإنتاج

---

## 7. استكشاف الأخطاء

### 7.1 `duplicate key value violates unique constraint`

**السبب:** ملف بيانات يُشغَّل مرتين بلا `ON CONFLICT`.

**الحل:** كل ملف يجب أن ينتهي إدخالاته بـ:
```sql
ON CONFLICT (name) DO NOTHING;   -- أو (code) أو (sku)
```

### 7.2 `relation "X" does not exist`

**السبب:** استعلام أو دالة تشير إلى جدول لم يُنشأ.

**الحل:** تأكد أن كل الترحيلات طُبّقت:
```bash
supabase migration list
```

### 7.3 `function "is_staff" does not exist`

**السبب:** سياسة RLS تعمل قبل تعريف الدالة.

**الحل:** الدوال في الملف `02` والسياسات في الملف `13`. تحقق من الترتيب.

### 7.4 `violates foreign key constraint`

**السبب:** ملف بيانات يحتوي معرّف UUID ثابتًا من قاعدة أخرى.

**الحل:** حلّ المعرّف بالاسم لا بالرقم:
```sql
-- ❌ خطأ
VALUES ('ac4a1521-8e10-47ee-8da1-8c4aa7dcc645', ...)

-- ✅ صحيح
SELECT (SELECT id FROM public.categories WHERE name = 'Wheat')
```

### 7.5 `column "X" is of type text[] but expression is of type jsonb`

**السبب:** مصفاة Postgres كُتبت كنص.

**الحل:**
```sql
VALUES ('{"core","pos"}'::text[])   -- مع التحويل الصريح
```

### 7.6 فشل `db reset` بلا رسالة واضحة

**الحل:** طبّق كل ملف منفردًا لتعرف أين يفشل:

```bash
for f in supabase/migrations/*.sql; do
  echo "=== $f ==="
  psql "$DATABASE_URL" -f "$f" || break
done
```

### 7.7 الاتصال بقاعدة Supabase يفشل من الشبكة المحلية

**السبب:** عنوان `db.<ref>.supabase.co` يعمل على IPv6 فقط، وكثير من الشبكات لا
تدعمه.

**الحل:** استخدم **Connection Pooler** (IPv4):

```
Host:     aws-0-<المنطقة>.pooler.supabase.com
Port:     5432
User:     postgres.<project-ref>
Database: postgres
```

المنطقة تجدها في: لوحة التحكم ← Project Settings ← General ← Region.

### 7.8 `Cannot connect to the Docker daemon` / `error during connect`

**السبب:** Docker Desktop ليس قيد التشغيل.

**الحل:** افتح Docker Desktop وانتظر حتى تصبح أيقونته في شريط المهام خضراء، ثم
أعد الأمر. تحقّق بـ:

```powershell
docker info --format "{{.ServerVersion}}"
```

### 7.9 `syntax error at or near ""` عند تمرير ملف عبر الأنبوب

**السبب:** علامة BOM (`\uFEFF`) في أول الملف، أضافها PowerShell عند تمريره عبر
الأنبوب.

**الحل:** استخدم `docker cp` بدل الأنبوب:

```powershell
docker cp file.sql supabase_db_<ref>:/tmp/file.sql
docker exec supabase_db_<ref> psql -U postgres -d postgres -f /tmp/file.sql
```

### 7.10 حاوية `supabase_vector_...` تُعيد التشغيل باستمرار

**السبب:** خدمة التحليلات (Analytics) تحتاج Docker daemon مكشوفاً على
`tcp://localhost:2375`، وهو غير مفعّل افتراضياً على Windows.

**الأثر:** **لا شيء يمسّ قاعدة البيانات.** التحليلات فقط معطّلة. كل الحاويات
الأخرى (db، auth، rest، storage…) تعمل سليمة. تجاهلها، أو فعّل
`Expose daemon on tcp://localhost:2375 without TLS` من إعدادات Docker Desktop
إن أردت إسكاتها.

---

## 8. مرجع الأوامر

### أوامر Supabase

| الأمر | ما يفعله | خطير؟ |
|---|---|---|
| `supabase start` | يشغّل البيئة المحلية | لا |
| `supabase stop` | يوقفها | لا |
| `supabase status` | يعرض عناوين ومفاتيح محلية | لا |
| `supabase db reset` | **يحذف ويعيد البناء محليًا** | ⚠️ **نعم** |
| `supabase db push` | يطبّق الترحيلات على السحابة | متوسط |
| `supabase db pull` | يسحب البنية من السحابة | ⚠️ يعدّل ملفاتك |
| `supabase migration list` | يعرض المطبَّق وغير المطبَّق | لا |
| `supabase db dump` | نسخة احتياطية | لا |
| `supabase link` | يربط المشروع | لا |
| `supabase db diff` | يعرض الفرق بين Local والسحابة | لا |
| `supabase db query "<SQL>"` | ينفّذ استعلاماً على القاعدة المحلية | لا |

> على هذا المشروع، سبق كل أمر بـ `npx` — مثل `npx supabase start`.

### أوامر psql

| الأمر | ما يفعله |
|---|---|
| `psql "$DATABASE_URL" -f file.sql` | يشغّل ملف |
| `psql "$DATABASE_URL" -c "SELECT ..."` | يشغّل أمرًا |
| `psql "$DATABASE_URL"` | جلسة تفاعلية |
| `\dt` | يعرض الجداول |
| `\d table_name` | يعرض أعمدة جدول |
| `\q` | خروج |

### أوامر npm

| الأمر | ما يفعله |
|---|---|
| `npm run dev` | يشغّل التطبيق للتطوير |
| `npm run build` | بناء الإنتاج |
| `npm run lint` | فحص الكود |

### متغيّر `DATABASE_URL`

صيغته:
```
postgresql://postgres.<ref>:<كلمة-المرور>@aws-0-<المنطقة>.pooler.supabase.com:5432/postgres
```

**PowerShell:**
```powershell
$env:DATABASE_URL = "postgresql://postgres.xxxx:pass@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres"
```

**Bash:**
```bash
export DATABASE_URL="postgresql://postgres.xxxx:pass@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres"
```

> **للقاعدة المحلية** لا تحتاج `DATABASE_URL` أصلاً؛ الاتصال ثابت:
> `postgresql://postgres:postgres@127.0.0.1:5432/postgres`.

---

## 9. أخطاء لا تفعلها

| ❌ لا تفعل | ⚠️ النتيجة |
|---|---|
| `supabase db reset` على الإنتاج | **حذف كل بيانات العميل** |
| `supabase db push` على قاعدة مبنية | أخطاء «already exists» |
| تشغيل `03_samples/` على عميل | منتجات وهمية في دفاتره |
| كلمة مرور في ملف seed | تبقى في تاريخ المستودع للأبد |
| تعديل migration مطبَّق | يكسر تتبّع Supabase |
| وضع بيانات أعمال في `01_system` | كل عميل يستلمها |
| نسخ بيانات عميل لعميل آخر | ممنوع قانونيًا |
| تخطي النسخ الاحتياطي قبل تغيير | لا سبيل للرجوع |

### القاعدة الحاكمة

> **عند الشك، خُذ نسخة احتياطية أولًا.**
> النسخة الاحتياطية تستغرق دقيقة، والاسترجاع من خطأ يستغرق أيامًا.

---

## 10. المراجع

| الملف | الدور |
|---|---|
| `supabase/MIGRATIONS_RULES.md` | قانون الترحيلات والبيانات (ملزم) |
| `supabase/migrations/README.md` | الدليل المعماري للبنية |
| `supabase/SCHEMA_REFERENCE.md` | مرجع الجداول والدوال |
| `supabase/seeds/README.md` | دليل البيانات |
| `supabase/SEEDS_AND_REFERENCE_REFACTOR_PLAN.md` | خطة تنظيم البيانات |
| `supabase/SYSTEM_DATA_AUDIT_PLAN.md` | خطة تدقيق بيانات النظام |
