# Architecture Review — Market-Hup ERP

> **الحالة:** مسودة للاعتماد. هذه المرحلة تسبق أي تنفيذ، وفق طلب المالك:
> مراجعة كاملة، مقارنة تصاميم، اختيار معماري، خريطة اعتماديات، Ownership،
> وأماكن كل شيء، وقواعد إضافة مجالات جديدة.
> **المصادر:** فحص فعلي لـ `supabase/migrations/` (17 ملفًا، 296 تعريف دالة)،
> مسح برمجي للاعتماديات (`supabase/arch-dep-scan.md`)، وجرد 42 ملف استدعاء
> `supabase.rpc()` في الواجهة (~75 دالة RPC مستخدمة فعليًا).

---

## 1. ملخص الوضع الحالي (كما هو فعليًا، لا افتراضات)

| المؤشر | القيمة |
|---|---|
| ملفات الترحيل النشطة | 17 (خط أساس معاد بناؤه 2026-11) |
| تعريفات دوال SQL | 296 (بما فيها overloads) |
| أكبر ملف ترحيل | `012_milling_and_custody.sql` — 229 KB / 46 دالة |
| استدعاءات `supabase.rpc()` من الواجهة | 42 ملفًا، ~75 دالة مختلفة |
| Edge Functions | 2 فقط (`admin-create-user`, `raw-rest`) |
| منطق TS موجود | `src/lib/` بـ 25 مجالًا، لكنه يستدعي RPC مباشرة |

**خريطة الاعتماديات المستخرجة فعليًا** (من `arch-dep-scan.md`):

```
002 identity/security  ← يعتمد عليها الجميع (has_role, is_staff, tg_set_updated_at, business_*)
003 catalog            → identity
004 partners           → identity
005 products/inventory → identity
006 stock/costing      → identity, products
007 sales              → identity, products, stock, partners
008 purchasing         → identity, products, stock
009 accounting         → identity, stock, products, treasury (payment_method_ledger_account) ⚠
010 expenses           → identity, accounting
011 treasury           → identity, expenses(7 دوال), accounting, sales, partners ⚠
012 milling/custody    → treasury, products, identity, expenses, sales, stock, accounting, catalog, partners, purchasing ⚠ (قمة الهرم)
013 production         → products, identity, accounting, expenses, milling, stock
016 post-sales guard   → يعيد تعريف post_sales_invoice المملوكة لـ 011 ⚠ (انتهاك Ownership)
```

**مشاكل مؤكدة بالأدلة:**
1. منطق الأعمال مُدَمج في ملفات ترحيل ضخمة — لا يمكن قراءة/اختبار مجال دون فتح 200+ KB.
2. `016` يعدّل دالة مملوكة لمجال آخر (`post_sales_invoice`) — انتهاك Ownership قائم.
3. 9 مجالات تكسر الترتيب الطبقي (accounting يعتمد على treasury والعكس ضمنيًا عبر post_sales_invoice_cogs).
4. 75 دالة RPC تُستدعى من 42 ملفًا مباشرة بلا طبقة وسيطة — لا تحقق، لا توحيد أخطاء، لا عقود.
5. overloads بنفس الاسم (create_sale ×3, post_expense ×3, smart_manufacture ×4, record_customer_payment ×2, record_expense_payment ×3) بدون توثيق لمن يستدعي أي نسخة.

---

## 2. مقارنة التصاميم المعمارية الممكنة

### البديل A — الوضع الراهن (كل شيء في Migrations)
| الإيجابيات | السلبيات |
|---|---|
| لا حاجة لأي تغيير | نفس المشكلة المطروحة: صيانة، اختبار، قراءة شبه مستحيلة |
| ذرّية مضمونة | منطق الأعمال ملتصق بتاريخ البناء |

**الحكم:** مستبعد — هو السبب المباشر للطلب.

### البديل B — نقل الملفات فقط إلى `supabase/sql/` مسطّح
| الإيجابيات | السلبيات |
|---|---|
| أسرع تنفيذ | نقل شكلي؛ بعد سنتين يصبح `sql/accounting.sql` 3000 سطر (نفس الاعتراض المالك) |
| صفر مخاطرة | لا Ownership، لا عقود، لا طبقة خدمات |

**الحكم:** مستبعد — لا يحل المشكلة، يزيحها.

### البديل C — Backend مستقل (NestJS/Fastify + Postgres مباشر)
| الإيجابيات | السلبيات |
|---|---|
| منطق TS قابل للاختبار كاملًا | فقدان ذرّية المعاملات المالية أو معاملات موزعة هشةة |
| فصل كامل | RLS يُعاد بناؤه يدويًا في الخدمة (مخاطرة أمنية جسيمة) |
| | يتعارض مع قرار موثق في `MIGRATIONS_RULES.md` §3 |
| | بنية نشر جديدة كاملة (Docker، Deploy) — مخاطرة عالية |
| | إعادة كتابة ~296 دالة = أشهر عمل مع احتمال انحراف سلوكي |

**الحكم:** مستبعد الآن. التكلفة/المخاطرة تفوق الفائدة، والذرّية المالية هي جوهر النظام. يبقى خيارًا مستقبليًا إذا نما النظام لتعدد عملاء/منصات.

### البديل D — كل شيء في قاعدة البيانات لكن منظّم (modular PL/pgSQL)
| الإيجابيات | السلبيات |
|---|---|
| ذرّية كاملة | اختبار المنطق يتطلب قاعدة حية دائمًا |
| لا حاجة لطبقة جديدة | أدوات التطوير والـ DX على SQL سيئة |
| | لا يحل طبقة الواجهة (42 ملف استدعاء) |

**الحكم:** جزئي — يُعتمد **لجزء المعاملات المالية فقط** (انظر §4)، لا كبنية كاملة.

### البديل E — Edge Functions لكل مجال (Deno)
| الإيجابيات | السلبيات |
|---|---|
| منطق TS خارج المخطط | زمن شبكة لكل عملية مالية، تكلفة cold-start |
| | لا معاملات عبر جلسة PostgREST واحدة دون إعادة تصميم |
| | بنية نشر إضافية لن مكسب حقيقي أمام RPC المباشر |

**الحكم:** مستبعد — RPC المباشر عبر PostgREST أسرع وأبسط ويحفظ الذرّية.

### ✅ البديل F (المعتمد المقترح) — Modular Domain Architecture هجينة
**"القاعدة حارس تكامل + طبقة نطاق TypeScript موزعة بالملكية"**:
- داخل `supabase/database/`: كل مجال مجلد كامل، **كل دالة في ملف مستقل**، مع ملف `manifest` يعطي Ownership والاعتماديات صراحة.
- داخل `src/domains/`: خدمات + مستودعات + عقود كاملة (Types, DTOs, Validators, Mappers) — **لا `supabase.rpc` خارج `src/domains`**.
- المعاملات المالية الذرية تبقى RPC داخل القاعدة (حفظ الذرّية + RLS)، لكنها **محصورة وموثقة بعقود**، والتنسيق حولها في الخدمات.

**لماذا F:** يحقق كل شرط المالك (بنية domain، ملف لكل دالة، ownership، حدود اعتماد، حظر RPC المباشر، عقود كاملة، أخطاء موحدة) بأقل مخاطرة سلوكية على النظام الحي، ويحافظ على قراري الأصليين الصحيحين: بقاء الكتابة المالية كـ RPC ذري، وعدم كسر العقود القائمة.

---

## 3. البنية المستهدفة (F) — المجلدات والملفات

### 3.1 قاعدة البيانات: `supabase/database/`
```
supabase/
  database/
    _shared/                    # أدوات مشتركة (أدنى طبقة — لا تعتمد على أحد)
      time/        business_now.sql, business_today.sql, business_timezone.sql
      numbering/   fn_next_document_number.sql, fn_resolve_document_numbering.sql,
                   fn_format_document_number.sql, <domain>/number-sequence.sql
      rbac/        has_role.sql, is_staff.sql, can_read_finance.sql, is_platform_admin.sql, ...
      triggers/    tg_set_updated_at.sql
      MANIFEST.md
    identity/       # users, profiles, settings, audit, sync
      tables.sql  policies.sql  views.sql
      functions/  handle_new_user.sql, set_profile_active.sql, ...
      triggers/   tg_customers_system_guard.sql ...
      MANIFEST.md
    catalog/        # أنواع الحبوب، الوحدات، المرجعية
    partners/       # عملاء وموردون ودفاترهم
    inventory/      # منتجات، دفعات، سياسات أصناف
    stock/          # حركات المخزون والتكلفة (post_stock_delta, resolve_unit_cost, ...)
    accounting/     # دفتر الأستاذ، الفترات، الأصول، الضرائب
      functions/  create_journal_entry.sql, post_journal_entry.sql,
                  reverse_journal_entry.sql, close_fiscal_year.sql, ...
    sales/          # create_sale.sql, create_sales_return.sql, recalculate_customer_balance.sql, ...
    purchasing/     # create_purchase.sql, create_purchase_return.sql, ...
    expenses/       # ملف لكل دالة (create_expense.sql, decide_expense.sql, ...)
    treasury/       # post_sales_invoice.sql, record_customer_payment.sql, cheques/, payment-methods/
    milling/        # custody_intake.sql, custody_milling.sql, milling_document_process.sql, ...
    production/     # smart_manufacture.sql, create_production_order.sql, ...
    platform/       # backup, sync, cross-domain constraints
    _build/         # سكربت التجميع: يبني migrations النهائية من database/ بالترتيب
  migrations/       # مخرجات البناء فقط (جداول + FK + فهارس + قيود + أنواع + تضمين الدوال)
```

**قواعد قاطعة داخل `database/`:**
1. **دالة = ملف واحد** باسمها نفسه (`create_sale.sql`). لا ملف يحوي عدة دوال إلا مشغلات مرتبطة بدالة واحدة.
2. **`MANIFEST.md` لكل مجال** يوثق: الوصف، الـ Owner، ما يعتمد عليه (domains فقط، لا ملفات)، الدوال التي يملكها، العقود الموافقة في `src/domains/`.
3. **Ownership صارم:** دالة تعدل جداول مجال ⇒ تملكها إما جداولها أو المجال الأعلى في الترتيب. أي دالة تُعرَّف حاليًا في مجال وتخدم مجالًا آخر (مثل `post_sales_invoice` في 011/016) تُعاد لملكها الوحيد، ويُوثق تعديلها في سجل قرارات `_build/DECISIONS.md`.
4. **الاتجاه الوحيد للاعتماد:** من الأعلى إلى الأسفل في التسلسل (§4). ملف في مجال لا يستدعي دالة من مجال أعلى منه أو جانبي.
5. جداول/فهارس/قيود/سياسات RLS تبقى في `migrations/` كما هي الآن (خط الأساس المعتمد)؛ `database/` يحمل **الدوال والمشغلات والـ views فقط** في هذه المرحلة، لتفادي إعادة كتابة خط الأساس الذي جرى التحقق منه.
6. `_build/` يولّد ملفات الترحيل بتضمين محتوى الملفات بالترتيب الطبقي — الناتج مطابق بايت‑ببايت لما هو عليه اليوم (تحقق بمقارنة `pg_dump`).

### 3.2 الواجهة/الخدمات: `src/domains/`
```
src/
  domains/
    accounting/
      contracts/    types.ts, dto.ts, errors.ts        # أنواع + DTOs + أخطاء المجال
      validators/   journal-entry.schema.ts           # zod + قواعد عمل قابلة للاختبار
      repositories/ journal.rpc.ts                    # *الوحيد* الذي يستدعي supabase.rpc
      mappers/      journal.mapper.ts                 # DB row ⇄ DTO
      services/     journal.service.ts                # التنسيق، قواعد الاستدعاء، الصلاحيات
      index.ts                                        # الواجهة العامة فقط (barrel مقيد)
    sales/ ... purchasing/ ... inventory/ ... expenses/
    treasury/ ... milling/ ... production/ ... shared/
  lib/               # يبقى: printing, reports-UI, offline, navigation… (غير نطاقات أعمال)
```

**قواعد `src/domains/`:**
1. **حظر RPC خارج `repositories/`:** يُفعَّل بقاعدة ESLint (`no-restricted-properties` على `supabase.rpc`) بمجرد اكتمال تغليف كل دالة — قاعدة تُشدَّد تدريجيًا مع كل مرحلة.
2. Route/Component يستخدم **Services فقط**. Service يستخدم Repositories + Validators. Repository يستدعي RPC فقط.
3. العقود كاملة وليست Zod فقط: `types.ts` (أنوع نهائية)، `dto.ts` (أشكال النقل)، `validators/` (zod + قواعد عمل)، `mappers/` (تحويل DB⇄DTO).
4. الأخطاء موحدة: `DomainError` أساس، وفئات لكل مجال (`SalesError`, `AccountingError`, …)، مع **محوّل واحد** من أخطاء Postgres (codes + message) إلى `DomainError` في `src/domains/shared/errors.ts` — يُستبدل به كل `try/catch` مكرر تدريجيًا.
5. `index.ts` لكل مجال يصدّر Services فقط — لا تصدير repository أو rpc مباشرة.
6. لا منطق مكرر: أي قاعدة عمل موجودة في SQL تبقى في SQL، وأي قاعدة تحقق واجهة تبقى في validators — Service **لا يعيد** كتابة قاعدة القاعدة، بل يتفادى الاستدعاء عندما يعرف النتيجة مسبقًا (تحسين UX لا تغيير سلوك).

---

## 4. خريطة الاعتماديات والطبقات (التصميم المستهدف)

مبنية على المسح الفعلي، مع إصلاح الحلقات المكتشفة:

```
L0  shared        (time, numbering, rbac, trigger utils)      — لا يعتمد على أحد
L1  identity      (users, settings, audit)                    → shared
L2  catalog       (أنواع، وحدات، ترقيم مستندات)               → identity
L3  partners      (عملاء، موردون، دفاتر)                      → identity
L4  inventory     (منتجات، دفعات، سياسات)                     → identity, catalog
L5  stock         (حركات، تكلفة)                              → inventory, identity
L6  accounting    (قيود، فترات، أصول، ضرائب)                  → stock, inventory, identity
L7  expenses      (دورة المصروف)                              → accounting, identity
L8  sales         → stock, inventory, partners, identity      (لا يعتمد accounting مباشرة ✓)
L9  purchasing    → stock, inventory, identity
L10 treasury      → accounting, expenses, sales, partners     (post_* invoices, payments, cheques)
L11 milling       → treasury, sales, stock, expenses, ...     (قمة الهرم)
L12 production    → inventory, stock, accounting, expenses
```

**إصلاحات مطلوبة لتثبيت هذا الترتيب (بدون تغيير سلوك):**
1. **`payment_method_ledger_account`** تستدعاه `accounting` (L6) وهي مملوكة لـ treasury (L10) — تُنقل إلى `shared/numbering`-مستوى مجال `treasury/config` أو تُفصل إلى `shared/payment-codes` كبيانات قراءة خالصة، مع توثيق القرار.
2. **`post_sales_invoice`** يُدمج تعريف 016 (revenue guard) في الملف الواحد المالك `treasury/functions/post_sales_invoice.sql` — يُلغى النمط "ترحيل يعدّل دالة مجال آخر".
3. `treasury → sales` (`recalculate_customer_balance`, `customer_balance_lock`) مقبول لأن treasury أعلى من sales؛ و`milling → can_operate_milling` (production يستهلكها) تُعامل كدالة صلاحية في `shared/rbac`-style بمجال milling مع توثيق.

**قاعدة إضافة مجال جديد مستقبلًا:**
1. أضف مجلدًا في `database/<domain>/` + `src/domains/<domain>/` بنفس الهيكل القياسي.
2. حدد موقع المجال في التسلسل الطبقي؛ إن احتاج الاعتماد على مجال أعلى ⇒ أعد التفكير في الملكية (الدالة تنتقل للمجال الأعلى).
3. `MANIFEST.md` إلزامي قبل أول دالة. لا RPC يظهر للواجهة قبل عقده في `contracts/`.
4. اختبار قبول SQL في `supabase/tests/<domain>/` + اختبار وحدة TS في `src/domains/<domain>/__tests__/`.

---

## 5. أماكن كل شيء (Registry)

| العنصر | المكان |
|---|---|
| دالة SQL | `supabase/database/<domain>/functions/<fn>.sql` (ملف واحد) |
| Trigger | `supabase/database/<domain>/triggers/<tg>.sql` |
| View | `supabase/database/<domain>/views.sql` |
| سياسات RLS/منح | `supabase/migrations/` (خط الأساس الحالي) — الجديدة بجوار مجالها |
| جداول/فهارس/قيود/أنواع | `supabase/migrations/` (لا تتغير في هذه المرحلة) |
| Ownership | `MANIFEST.md` لكل مجال + `database/_build/DECISIONS.md` |
| خريطة اعتماديات | هذه الوثيقة §4 + `arch-dep-scan.md` (تُحدَّث آليًا بالسكربت) |
| Types / DTOs | `src/domains/<domain>/contracts/{types,dto}.ts` |
| Validators | `src/domains/<domain>/validators/*.schema.ts` |
| Mappers | `src/domains/<domain>/mappers/*.mapper.ts` |
| Repositories (RPC فقط) | `src/domains/<domain>/repositories/*.rpc.ts` |
| Services (الواجهة العامة) | `src/domains/<domain>/services/*.service.ts` |
| الأخطاء الموحدة | `src/domains/shared/errors.ts` (+ أخطاء لكل مجال في contracts) |
| Shared Utilities | `supabase/database/_shared/` (SQL) + `src/domains/shared/` (TS) |
| اختبارات SQL | `supabase/tests/<domain>/*.sql` |
| اختبارات TS | `src/domains/<domain>/__tests__/` |
| قواعد البناء والترحيل | `database/_build/` + تحديث `MIGRATIONS_RULES.md` |

**الترتيب الحقيقي للدوال المستخدمة من الواجهة (75):** موزعة على المجالات كالتالي — milling/custody 18، expenses 19، treasury/payments 9، stock/batches 9، opening-balances 4، production 5، sales 4، purchasing 2، accounting 1، partners 1، identity 2، catalog 1. أي أن الجهد الأكبر في milling وexpenses.

---

## 6. معالجة التكرار والدوال الميتة (القرار المسبق، يُنفذ بالفحص لكل دالة)

المنهجية لكل مجموعة overloads: **حصر المستدعين فعليًا** (من 42 ملف استدعاء + دوال SQL داخلية) → النسخة المستخدمة تبقى باسمها الأصلي (عدم كسر عقد) → النسخ الميتة تُحذف مع توثيق الحذف في `DECISIONS.md`. مبدئيًا:
- `create_sale` (3 overloads): يبدو أن `create_sale(p_company_id, p_payload jsonb)` هي المستخدمة من الواجهة — يُتحقق استدعاءً‑استدعاءً قبل أي حذف.
- `post_expense` (3) و`record_expense_payment` (3): نفس المنهجية؛ الأرجح أن الأقدمين من التاريخ القديم وتُحذف بعد إثبات غياب المستدعين.
- `create_expense` مقابل `create_expense_v2`: الواجهة تستدعي `create_expense_v2` فقط → `create_expense` مرشحة حذف بعد التحقق.
- `update_expense` مقابل `update_expense_v2`: الواجهة تستدعي `v2` فقط → نفس الحكم.
- `create_milling_service_document` مقابل `_multi` مقابل `_multi_priced`: الواجهة تستدعي غير المُسعّرة والمُسعّرة معًا → يُدرس دمج واجهة واحدة بمستقبِل optional، ويُوثق القرار.

**قاعدة:** لا حذف إلا بعد grep شامل للمستدعين (SQL + TS + seeds + tests) وإثبات الصفر، وبتقرير مرفق لكل دالة محذوفة.

---

## 7. خطة التنفيذ المحدّثة (بعد المراجعة)

| # | المرحلة | الناتج | بوابة التحقق |
|---|---|---|---|
| 0 | **Architecture Review** (هذه الوثيقة) | اعتماد المالك | — |
| 1 | هيكل + بناء | `database/` الهيكل، `_build/` يولّد ترحيلات مطابقة، قاعدة ESLint للحظر (وضع تحذير) | بناء محلي فارغ ×2 + مقارنة `pg_dump` للدوال مع المرجع |
| 2 | `_shared` + identity | نقل دوال L0/L1 لكل ملف مستقل + MANIFESTs | نفس البوابة + اختبارات RBAC |
| 3 | catalog, partners, inventory, stock | L2–L5 | اختبارات المخزون/الدفعات |
| 4 | accounting | 27 دالة | `test:statements` + بناء |
| 5 | expenses | 49 دالة، حذف الميت بعد إثباته | اختبارات acceptance الموجودة |
| 6 | sales, purchasing | | اختبارات payments |
| 7 | treasury (+دمج 016 في مالكها) | | اختبارات payments + دورة مالية |
| 8 | milling, production | | `test:company-production-cycle` |
| 9 | طبقة `src/domains/` **بالتوازي مع 2–8** (لكل مجال تُغلف عقوده ومستودعه فور استقرار دواله) | تشديد قاعدة الحظر تدريجيًا حتى `error` | lint + اختبارات الوحدات لكل مجال |
| 10 | تنظيف Migrations نهائي + توثيق | ملفات ترحيل = بنية + تضمين فقط، README لكل مجال، حذف `arch-dep-scan` المؤقت أو إبقاؤه أداة CI | بناء نهائي ×2 + مطابقة كاملة |

**مبادئ ملزمة طوال التنفيذ:** الهدف بناء معمارية لا نقل ملفات؛ السلوك الحالي ثابت نصًا ودلاليًا؛ كل حذف/دمج موثق بسببه وأدلة مستدعياته؛ كل مرحلة تُراجَع وتُوثَّق قبل الانتقال للتالية؛ لا أثر على قواعد بعيدة.

---

## 8. المخاطر المتبقية (بصراحة)

1. **تطابق بايت‑ببايت** عند التوليد من `database/` قد يتعارض مع إعادة تنسيق whitespace — البوابة الفعلية: مطابقة دلالية عبر `pg_dump -s` كما فعل خط الأساس سابقًا (مقبول).
2. بعض دوال L0 الحساسة (`rpc_allowlist` وشبكتها) تمسّ الأمان — تُنقل أخيرًا داخل مرحلتها مع اختبار fail-closed.
3. حظر RPC بـ ESLint قد يكشف استدعاءات ديناميكية (مثل `use-financial-posting.ts` برمز `rpcName`) — ستُغلف أولاً وتُستبدل بسجل مجالات، لا حظر أعمى قبل ذلك.

---

**بانتظار اعتمادك لهذه المعمارية (البديل F + الإصلاحات الثلاثة في §4 + منهجية §6).** عند الاعتماد أبدأ بالمرحلة 1 فورًا وأستمر مرحلة‑مرحلة مع بوابة تحقق بعد كل واحدة.
