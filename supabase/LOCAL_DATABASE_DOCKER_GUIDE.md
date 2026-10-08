# دليل قاعدة البيانات المحلية على Docker — Market Hub ERP

> **الملف:** `supabase/LOCAL_DATABASE_DOCKER_GUIDE.md`
> **الجمهور:** المبرمج الذي يريد تشغيل قاعدة بيانات محلية على جهازه
> **النطاق:** **البيئة المحلية فقط** (Docker). لا يشرح السحابة.
> **الدليل السحابي:** `docs/DATABASE_OPERATIONS_GUIDE.md` — دليل منفصل تماماً،
> لإنشاء مشروع Supabase سحابي ونقل النظام لعميل. لا تخلط بينهما.

هذا الملف مكتوب من تجربة تشغيل حقيقية على Windows، ويسجّل **كل عقبة ظهرت
فعلاً** وكيف حُلّت. اقرأه إذا أردت تشغيل قاعدة محلية، أو إذا واجهت خطأً من
الأخطاء المذكورة هنا.

---

## الفهرس

1. [ما هي القاعدة المحلية ولماذا](#1-ما-هي-القاعدة-المحلية-ولماذا)
2. [المتطلبات](#2-المتطلبات)
3. [التشغيل الأول خطوة بخطوة](#3-التشغيل-الأول-خطوة-بخطوة)
4. [ما يعمل وما لا يعمل بعد التشغيل](#4-ما-يعمل-وما-لا-يعمل-بعد-التشغيل)
5. [المشاكل التي واجهناها فعلاً](#5-المشاكل-التي-واجهناها-فعلاً)
6. [تشغيل الترحيلات والبذور محلياً](#6-تشغيل-الترحيلات-والبذور-محلياً)
7. [التحقق من سلامة البيانات](#7-التحقق-من-سلامة-البيانات)
8. [مرجع سريع](#8-مرجع-سريع)

---

## 1. ما هي القاعدة المحلية ولماذا

`supabase start` يشغّل نسخة كاملة من منصة Supabase **على جهازك** داخل حاويات
Docker. لا اتصال بالإنترنت بعد التنزيل الأول، ولا يمسّ بيانات عملائك.

**لماذا نستخدمها؟** لأنها الطريقة الوحيدة الآمنة للتأكد أن الترحيلات والبذور
تُبنى من الصفر بلا أخطاء (`db reset`) قبل أن نلمس أي شيء سحابي.

الحاويات التي تُشغَّل (11 حاوية):

| الحاوية | الوظيفة |
|---|---|
| `supabase_db_*` | **قاعدة Postgres — هذه ما يهمّنا** |
| `supabase_auth_*` | خدمة المصادقة |
| `supabase_rest_*` | PostgREST (واجهة REST) |
| `supabase_realtime_*` | البثّ اللحظي |
| `supabase_storage_*` | تخزين الملفات |
| `supabase_studio_*` | لوحة تحكم محلية |
| `supabase_kong_*` | البوابة |
| `supabase_inbucket_*` | بريد وهمي للاختبار |
| `supabase_pg_meta_*` | بيانات وصفية |
| `supabase_edge_runtime_*` | الدوال الحافة |
| `supabase_vector_*` | التحليلات |

---

## 2. المتطلبات

| الأداة | الحد الأدنى | كيف تتحقق |
|---|---|---|
| **Docker Desktop** | يعمل ويستجيب | `docker info --format "{{.ServerVersion}}"` |
| **Node.js** | 18+ (المُثبَّت لدينا 22.14.0) | `node --version` |
| **مساحة قرص** | ~3 غيغابايت للصور | — |
| **ذاكرة RAM** | ~4 غيغابايت متاحة | — |

**لا تحتاج** تثبيت Supabase CLI عالمياً. نستخدم `npx supabase` الذي يستعمل
النسخة في `node_modules` أو ينزّلها مؤقتاً.

### إن لم يعمل أمر ما في الطرفية

إن أعطت الطرفية `The term 'docker' is not recognized` أو مثله، فتأكد أن هذه
المسارات في PATH:

```
C:\Program Files\Docker\Docker\resources\bin
C:\Program Files\nodejs
C:\Program Files\Git\cmd
```

للتحقق:

```powershell
[Environment]::GetEnvironmentVariable("Path","User") -split ';' |
  Where-Object { $_ -match "Docker|nodejs|Git" }
```

> **إن كانت المسارات موجودة فعلاً** ومع ذلك لا تعمل الأوامر، فالسبب أن جلستك
> لم تُحدَّث بعد تعديل PATH. **أغلق نافذة الطرفية وافتح واحدة جديدة** — الجلسة
> الجديدة تقرأ PATH المحدّث. هذا ما حدث معنا بالضبط.

---

## 3. التشغيل الأول خطوة بخطوة

### الخطوة 1 — شغّل Docker Desktop

**لا تتخطَّ هذه الخطوة.** أي أمر `supabase` قبل أن يستجيب Docker سيفشل.

```powershell
docker info --format "{{.ServerVersion}}"
```

إن أعطى رقماً (مثل `29.7.2`) فالديمون جاهز. إن أعطى `error during connect`
فانتظر قليلاً وأعد المحاولة — Docker Desktop يستغرق ~دقيقة ليستجيب بعد فتحه.

### الخطوة 2 — شغّل القاعدة

```powershell
cd c:\Users\mousa\Desktop\project\market-hup
npx supabase start
```

**انتبه:** أول تشغيل **ينزّل نحو غيغابايت** من الصور، ويستغرق **عدة دقائق**.
قد تنتهي مهلة طرفيتك قبل أن ينتهي هو — لا يعني ذلك فشلاً، بل استمر في العمل.

**الطريقة الآمنة — شغّله في الخلفية وسجّل مخرجاته:**

```powershell
npx supabase start 2>&1 | Out-File supabase-start.log -Encoding utf8
```

ثم تابع التقدم في نافذة أخرى:

```powershell
Get-Content supabase-start.log -Tail 10
```

> **إن ظهرت رسالة `The process cannot access the file ... because it is being
> used by another process`** فمعناه أن نسخة سابقة من `supabase start` لا تزال
> تكتب في السجل. لا تشغّل نسختين في آن واحد — انظر المشكلة 5.5.

### الخطوة 3 — تحقق من النجاح

عند الانتهاء تطبع الطرفية جدولاً فيه العنوان والمفاتيح:

```
│ URL │ postgresql://postgres:postgres@127.0.0.1:5432/postgres │
```

وتحقق من الحاويات:

```powershell
docker ps --format "{{.Names}}: {{.Status}}"
```

النتيجة السليمة:

```
supabase_db_kwzqvgdyadylwnvjghqn: Up X minutes (healthy)
supabase_auth_kwzqvgdyadylwnvjghqn: Up X minutes (healthy)
...
supabase_vector_kwzqvgdyadylwnvjghqn: Restarting (0) ...   ← هذا عادي، انظر 5.4
```

---

## 4. ما يعمل وما لا يعمل بعد التشغيل

| الخدمة | العنوان |
|---|---|
| API | `http://127.0.0.1:54321` |
| Database | `postgresql://postgres:postgres@127.0.0.1:5432/postgres` |
| Studio | `http://127.0.0.1:54323` |
| Inbucket (بريد) | `http://127.0.0.1:54324` |

> ⚠️ **المفاتيح المطبوعة افتراضية ومشتركة.** كلها للتطوير المحلي فقط. لا
> تستخدمها في أي بيئة حقيقية، وكل الخدمات مرتبطة بـ `0.0.0.0` فهي مرئية من
> شبكتك المحلية.

### الاتصال بقاعدة البيانات المحلية

كلمة المرور ثابتة: `postgres`. ولست بحاجة إلى `DATABASE_URL` معقّد:

```
postgresql://postgres:postgres@127.0.0.1:5432/postgres
```

---

## 5. المشاكل التي واجهناها فعلاً

هذا القسم هو **قلب هذا الملف**: كل مشكلة قابلناها بالحرف، وسببها، وحلّها.

### 5.1 `The term 'docker' is not recognized as the name of a cmdlet`

**الأعراض:** كل أوامر Docker وGit وNode تفشل بالرسالة نفسها، مع أنك تعرف
أنها مثبتة.

**السبب الحقيقي (مهم):** المسارات كانت **موجودة** في PATH على مستوى المستخدم
والنظام، لكن الجلسة الطرفية الحالية **لم تكن تحمّلها**. هذا ما حدث معنا —
والسبب أن بيئة تشغيل الوكيل كانت مُقيَّدة بـ PATH مختصر.

**الحل:**
```powershell
# تحقق هل المسار مكتوب فعلاً
[Environment]::GetEnvironmentVariable("Path","User") -split ';' |
  Where-Object { $_ -match "Docker|nodejs" }
```

إن كانت المسارات موجودة، فالعلاج **إعادة فتح الطرفية**، أو مؤقتاً في الجلسة
الحالية:

```powershell
$env:Path += ";C:\Program Files\Docker\Docker\resources\bin;C:\Program Files\Git\cmd"
```

**درس:** لا تظنّ المسار مفقوداً حتى تتحقق من `GetEnvironmentVariable`. غالباً
هو موجود والمشكلة في الجلسة.

### 5.2 `error during connect` / `Cannot connect to the Docker daemon`

**السبب:** Docker Desktop لم يبدأ بعد.

**الحل:** افتحه وانتظر حتى تصبح أيقونته خضراء، ثم:
```powershell
docker info --format "{{.ServerVersion}}"
```

### 5.3 `The '<' operator is reserved for future use`

**الأعراض:** حاولت تمرير ملف SQL إلى psql:
```powershell
docker exec -i supabase_db_xxx psql -U postgres -d postgres -f - < seed.sql
# The '<' operator is reserved for future use.
```

**السبب:** **PowerShell لا يدعم `<` أصلاً.** هذا عامل مخصص لـ Bash/cmd. ليس
خطأً في Docker ولا في psql — هو قيد في الصدفة نفسها.

**الحل — استخدم `docker cp`:**

```powershell
docker cp supabase\seeds\01_system\05_expense_categories.sql supabase_db_kwzqvgdyadylwnvjghqn:/tmp/seed.sql
docker exec supabase_db_kwzqvgdyadylwnvjghqn psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/seed.sql
```

هذه هي الطريقة التي استخدمناها فعلاً وهي الأكثر موثوقية.

### 5.4 `syntax error at or near ""` — علامة BOM تالفة

**الأعراض:** جرّبت البديل الأنبوبي فظهر:
```
ERROR:  syntax error at or near ""
LINE 1: -- ========================================================...
        ^
```

لاحظ الرمز الغريب `""` قبل التعليق.

**السبب:** الأمر الذي استخدمته كان:
```powershell
Get-Content file.sql -Raw | docker exec -i ...
```
`Get-Content -Raw` في PowerShell **يسبق المحتوى بعلامة BOM** (`U+FEFF`) عند
تمريره عبر الأنبوب. Postgres يراها حرفاً غريباً قبل `--` فيرفض السطر.

**الحل:** استخدم `docker cp` (المشكلة 5.3). فهو ينسخ الملف **بايتاً ببايت**
بلا إضافة أي شيء.

> **بديل جزئي:** إن أضفت تحويل ترميز صريحاً قد يُحَلّ الأمر، لكن `docker cp`
> أنظف وأضمن. لا تعتمد على الأنبوب في ملفات SQL.

### 5.5 `The process cannot access the file 'supabase-start.log' because it is being used by another process`

**السبب:** نسخة سابقة من `supabase start` لا تزال تعمل وتكتب في الملف.

**الحل:** لا تشغّل نسختين في آن واحد. تحقق:
```powershell
Get-Process -Name "supabase","node" -ErrorAction SilentlyContinue |
  Select-Object Name,Id,StartTime | Sort-Object StartTime -Descending
```

إن وُجدت نسختان، أوقف الوكيل القديم أو انتظر انتهاءه. **ملاحظة:** إن كان
`supabase start` يعمل في الخلفية فعلاً، فأنت لا تحتاج تشغيله مجدداً — فقط
راقب السجل:

```powershell
Get-Content supabase-start.log -Tail 10
```

### 5.6 حاوية `supabase_vector_*` تُعيد التشغيل باستمرار

**الأعراض:**
```
supabase_vector_kwzqvgdyadylwnvjghqn: Restarting (0) 47 seconds ago
```
مع تحذير في السجل:
```
WARNING: Analytics on Windows requires Docker daemon exposed on tcp://localhost:2375.
```

**السبب:** خدمة التحليلات تحتاج ديمون Docker مكشوفاً على منفذ TCP، وهو **غير
مفعّل افتراضياً على Windows**.

**الأثر: لا شيء يمسّ قاعدة بياناتك.** التحليلات فقط معطّلة. كل الحاويات الأخرى
تعمل سليمة، و`db reset` يعمل بلا مشكلة. **تجاهل هذا التحذير.**

**إن أردت إسكاته:** Docker Desktop ← Settings ← General ← فعّل
`Expose daemon on tcp://localhost:2375 without TLS` ← Apply & Restart.

> لا تفعل هذا على جهاز بعيد عن الثقة: كشف الديمون على TCP بلا TLS خطر أمني.

### 5.7 الطرفية "تتوقف" عند 120 ثانية

**الأعراض:** ينتهي الأمر برسالة `Command exceeded 120s and was terminated`.
أو بلا مخرجات إطلاقاً.

**السبب:** هذه **مهلة طرفيتك**، لا فشل الأمر. الصور ما زالت تُنزَّل، و`supabase
start` يعمل في الخلفية بحق.

**الحل:** شغّله مسجّلاً المخرجات إلى ملف (الخطوة 2)، وتابع بـ
`Get-Content supabase-start.log -Tail 10`. **لا تُعد التشغيل** — ستتعارض
النسختان (المشكلة 5.5).

### 5.8 `Cannot find project ref. Have you run supabase link?`

**الأعراض:** عند تشغيل `npx supabase migration list`.

**السبب:** هذا الأمر افتراضه مقارنة المحلي بالسحابي، وأنت لم تربط مشروعاً
سحابياً — وهذا **صحيح ومتوقّع** في العمل المحلي.

**الحل:** لمعرفة عدد الترحيلات المطبَّقة محلياً، استعلم القاعدة مباشرة:
```powershell
npx supabase db query "SELECT count(*) FROM supabase_migrations.schema_migrations;"
```

---

## 6. تشغيل الترحيلات والبذور محلياً

### 6.1 إعادة بناء القاعدة من الصفر

```powershell
npx supabase db reset
```

**ما يفعله:** يمحو القاعدة المحلية بالكامل، ويعيد بناءها بتطبيق **13 ترحيلاً**،
ثم يشغّل تلقائياً ملفات `seeds/01_system/*.sql` الخمسة.

> ⚠️ **لا تشغّله على السحابة أبداً.** محلي فقط.

إن أردت البناء بلا بذور (لتشغيلها يدوياً بنفسك):

```powershell
npx supabase db reset --no-seed
```

### 6.2 تشغيل البذور النظامية يدوياً

الترتيب **مقصود** — كل ملف يعتمد على ما قبله:

| # | الملف | لماذا هذا الترتيب |
|---|---|---|
| 1 | `01_modules.sql` | الوحدات أولاً |
| 2 | `02_plans.sql` | يفحص أن وحدات كل باقة مسجّلة في `platform_modules` |
| 3 | `03_chart_of_accounts.sql` | الحسابات |
| 4 | `04_units.sql` | الوحدات |
| 5 | `05_expense_categories.sql` | يحلّ الحساب **بالكود** من `accounts` |

> لو شغّلت `05_expense_categories.sql` قبل `03_chart_of_accounts.sql` لما وجد
> الحساب، ولرفع فحصه الذاتي استثناءً.

**الأمر الذي استخدمناه فعلاً (يعمل على Windows):**

```powershell
$ref = (docker ps --format "{{.Names}}" | Select-String "supabase_db_").ToString()
foreach ($f in @("01_modules","02_plans","03_chart_of_accounts","04_units","05_expense_categories")) {
  Write-Host "--- $f ---"
  docker cp "supabase\seeds\01_system\$f.sql" "${ref}:/tmp/$f.sql"
  docker exec $ref psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f "/tmp/$f.sql"
}
```

**النواتج المتوقعة:**

| الملف | الناتج |
|---|---|
| 01_modules | `INSERT 0 14` |
| 02_plans | `INSERT 0 3` |
| 03_chart_of_accounts | `INSERT 0 53` |
| 04_units | `INSERT 0 13` |
| 05_expense_categories | `INSERT 0 11` |

> **`-v ON_ERROR_STOP=1` مهم:** يجعل psql يتوقف عند أول خطأ بدل أن يكمل
> ويطبع نجاحاً كاذباً.

---

## 7. التحقق من سلامة البيانات

### 7.1 الأعداد

```powershell
npx supabase db query "SELECT (SELECT count(*) FROM units) AS units, (SELECT count(*) FROM accounts) AS accounts, (SELECT count(*) FROM platform_modules) AS modules, (SELECT count(*) FROM platform_plans) AS plans, (SELECT count(*) FROM expense_categories) AS expense_cats;"
```

| البيان | المتوقع |
|---|---|
| الوحدات | 13 |
| الحسابات | 53 |
| وحدات النظام | 14 |
| الباقات | 3 |
| تصنيفات المصروف | 11 |

### 7.2 لا بيانات أعمال تسرّبت

القاعدة النظيفة يجب أن تكون **صفراً** في كل هؤلاء:

```sql
SELECT
  (SELECT count(*) FROM public.products)         AS products,   -- 0
  (SELECT count(*) FROM public.customers)        AS customers,  -- 0
  (SELECT count(*) FROM public.inventory)        AS inventory,  -- 0
  (SELECT count(*) FROM public.sales_invoices)   AS invoices,   -- 0
  (SELECT count(*) FROM public.company_settings) AS company;    -- 0
```

إن ظهر رقم غير صفر، فتسرّبت بيانات أعمال إلى ملفات النظام — وهذا خطأ.

### 7.3 ربط تصنيفات المصروف بحساباتها

التصنيفات تحمل `account_id`، فيجب ألّا يبقى تصنيف نشط بلا حساب:

```powershell
npx supabase db query "SELECT c.name_ar, a.code AS account_code, a.name_ar AS account_name FROM expense_categories c LEFT JOIN accounts a ON a.id = c.account_id ORDER BY c.sort_order;"
```

**النتيجة الصحيحة — 11 صفاً، وكلها بكود حساب:**

| التصنيف | الحساب |
|---|---|
| إيجارات | 5313 |
| رواتب وأجور | 5221 |
| كهرباء ومياه | 5311 |
| مواصلات ونقل | 5315 |
| صيانة وإصلاح | 5314 |
| تعبئة وتغليف | 5316 |
| اتصالات وإنترنت | 5312 |
| مصروفات مكتبية | 5317 |
| تسويق وإعلان | 5318 |
| أتعاب مهنية | 5319 |
| مصروفات أخرى | 5911 |

### 7.4 الثبات — شغّل الملف مرتين

كل ملف نظام يجب أن يُشغَّل مرتين بلا خطأ ولا تكرار:

```powershell
docker cp supabase\seeds\01_system\05_expense_categories.sql "${ref}:/tmp/seed05.sql"
docker exec $ref psql -U postgres -d postgres -f /tmp/seed05.sql   # INSERT 0 11
docker exec $ref psql -U postgres -d postgres -f /tmp/seed05.sql   # INSERT 0 0  ← صحيح
```

المرة الثانية تعطي `INSERT 0 0` أي «لا جديد». إن أعطت `INSERT 0 11` فقد
**تضاعفت** الصفوف، وإن رمت `duplicate key` فقد غاب `ON CONFLICT`.

### 7.5 المفتاح الأجنبي موجود بسلوكه الصحيح

```powershell
npx supabase db query "SELECT conname, confdeltype FROM pg_constraint WHERE conrelid = 'public.expense_categories'::regclass AND contype = 'f';"
```

يجب أن يظهر `expense_categories_account_id_fkey` بـ `confdeltype = n`
(أي `ON DELETE SET NULL`) — فحذف حساب لا يجوز أن يحذف التصنيف.

---

## 8. مرجع سريع

| الأمر | ما يفعله |
|---|---|
| `npx supabase start` | يشغّل البيئة المحلية (أول مرة: دقائق) |
| `npx supabase stop` | يوقفها |
| `npx supabase status` | يعرض العناوين والمفاتيح |
| `npx supabase db reset` | **يمحو ويعيد البناء محلياً** |
| `npx supabase db query "<SQL>"` | ينفّذ استعلاماً على القاعدة المحلية |
| `docker ps --format "{{.Names}}: {{.Status}}"` | يعرض الحاويات |
| `docker cp <ملف> <حاوية>:/tmp/x.sql` | ينسخ ملفاً للحاوية (بديل `<`) |
| `docker exec <حاوية> psql -U postgres -d postgres -f /tmp/x.sql` | يشغّل ملف SQL |

### القاعدة الحاكمة على Windows

> **لا تمرّر ملف SQL إلى psql عبر `<` ولا عبر أنبوب PowerShell.**
> استخدم `docker cp` ثم `docker exec ... -f`. هذان هما الطريق الذي لا يفشل.

---

## المراجع

| الملف | الدور |
|---|---|
| `docs/DATABASE_OPERATIONS_GUIDE.md` | **الدليل السحابي** — مشروع جديد ونقل لعميل |
| `supabase/MIGRATIONS_RULES.md` | قانون الترحيلات والبيانات (ملزم) |
| `supabase/migrations/README.md` | الدليل المعماري للبنية |
| `supabase/seeds/README.md` | دليل البيانات |
| `supabase/SCHEMA_REFERENCE.md` | مرجع الجداول والدوال |
