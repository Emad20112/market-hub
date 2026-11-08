# سجل قرارات التنفيذ (DECISIONS LOG)

> يوثَّق هنا كل نقل/حذف/تغيير أثناء تنفيذ Architecture v2.
> الأعمدة: الدالة/العنصر، القرار، السبب، الأدلة، التاريخ، المرحلة.

| العنصر | القرار | السبب | الأدلة | التاريخ | المرحلة |
|---|---|---|---|---|---|
| `supabase/database/` + `_build` + `registry.json` (مخرجات v1) | حذف | أُلغي تصميم v1 بعد قرار المالك (Backend هو مركز المنطق) | قرار المالك 2026-11-07 | 2026-11-07 | v2 |
| `post_stock_settlement` | مرشحة حذف (مؤجلة للمرحلة 1 بعد grep نهائي) | التعليقات وحدها تذكرها؛ شاشة التسوية تستخدم `post_stock_adjustment` | grep في src: تعليقات + types مولدة فقط | 2026-11-07 | 1 |
| `create_milling_service_document_multi_priced`, `record_customer_advance_payment`, `record_customer_payment_splits` | خرجت من قائمة الحذف | تُستدعى ديناميكيًا عبر `(supabase.rpc as any)` — الفحص الثابت أفلتها | `lib/milling/custody.ts:600`, `hooks/use-financial-posting.ts:106`, `routes/_app.payments.tsx:333` | 2026-11-07 | تدقيق |
| `handle_new_user`, `rpc_allowlist`, `payment_method_catalog_view`, `get_batch_settings`, `sync_apply_operation` | تدقيق حي قبل أي حذف | قد تكون موصولة خارج المستودع (Auth Hook / بيئات قائمة) | `arch-fn-classification.md` | 2026-11-07 | 1 |
| قاعدة الاتصال الافتراضية المحلية | 5432 (حزمة supabase CLI) وليس 5433 | 5433 قاعدة الإنتاج الذاتية المستضافة المنفصلة؛ حزمة CLI المحلية تُصغي على 5432 | `docker port supabase_db_*` | 2026-11-07 | 0 |
| `withTransaction` بدون AsyncLocalStorage | تمرير صريح للمعاملة + `withSavepoint` | سياق خفي تسبب في تسرب حالة معاملة بين اتصالات Pool (فشل اختبارات)؛ الصراحة أأمن ومطابق لـ ADR-003 | اختبارات المرحلة 0 | 2026-11-07 | 0 |
| `SET LOCAL` بمعاملات نصية معقمة | SET لا يقبل معاملات ($1) في PostgreSQL | اختبار statement_timeout فشل بـ syntax error | اختبارات المرحلة 0 | 2026-11-07 | 0 |

## المرحلة 0 — ما أُنجز (2026-11-07)
- تثبيت `kysely` + `@types/pg` + `kysely-codegen` (dev).
- `src/server/shared/db/pool.ts`: Pool مركزي، حل اتصال من البيئة، بلا تسريب أسرار، `pingDb()`.
- `src/server/shared/db/transaction.ts`: `withTransaction` (BEGIN/COMMIT/ROLLBACK + إعادة عند deadlock + مهلة بيان + حقن `SET LOCAL role/claims` للـ RLS) و`withSavepoint` للتعشيش الصريح.
- `src/server/shared/errors/`: تسلسل `DomainError` كامل + `mapPgError` (23505/23503/P0001/40P01/…) + `guardDb`.
- `src/server/shared/auth/session.ts`: `ServerSession` + `authorize` (مصادقة الآن، قدرات لكل مجال عند نقله) — يتكامل مع `requireSupabaseAuth` القائم.
- `src/server/shared/testing/tx-rollback.ts`: أداة اختبارات مع رجوع تلقائي.
- `src/server/api/health/db-health.ts`: أول server function على المسار الإلزامي.
- اختبارات: `npm run test:server:errors` (6/6)، `npm run test:server:db` (8/8 على قاعدة محلية) — تشمل: COMMIT/ROLLBACK/SAVEPOINT/RLS-context/service_role/timeout/unique-violation.
- بوابة الجودة: `tsc --noEmit` نظيف (ما عدا خطأ سابق غير مرتبط في `_app.milling.intake.tsx`)، `eslint src/server` نظيف.

## بوابة المرحلة 0 (تحقق)
✅ المعاملات مختبرة على قاعدة محلية حقيقية — الشرط المسبق لنقل أي عملية مالية مستوفى.


## المرحلة 1 — حذف الدوال الميتة (2026-11-07)
- ترحيل `018_drop_dead_functions.sql` (25 اسمًا، يُسقط كل overloads ديناميكيًا عبر pg_proc).
- **تدقيق قبل الحذف:** grep شامل (src + tests + seeds + functions + apply_to_cloud).
  - استُثنيت لوجود مستدعين: `customer_balance_reconciliation_report` (اختبار قبول)،
    `platform_admin_audit_self` (اختبار قبول)، `grain_types_output_map_ratio_is_valid`
    (قيد CHECK — أخطأ فيها المحلل الآلي فاكتشفها التدقيق).
  - مؤجلة للتدقيق الحي: `handle_new_user`, `rpc_allowlist`, `payment_method_catalog_view`, `sync_apply_operation`.
- طُبق على القاعدتين (خط الأساس 5433 + تطوير 5432). بقيت RPCs التطبيق سليمة (فحص 12 دالة حرجة).
- تصحيح بيئي مهم: خط الأساس الجديد = حاوية `supabase-db` على **5433**؛ القاعدة على 5432 هي
  مكدس التطوير القديم الذي يعمل عليه التطبيق حاليًا (`VITE_SUPABASE_TARGET=docker`).

## المرحلة 2 — أول نقل فعلي: identity / inventory(دفعات) / catalog(ترقيم) (2026-11-07)
### المنقول (3 دوال → Use Cases)
| الدالة (محذوفة بترحيل 019) | Use Case الجديد | سلوك محفوظ |
|---|---|---|
| `set_profile_active` | `src/server/domains/identity/application/set-profile-active.usecase.ts` | كل القواعد: owner/superadmin، منع التعطيل الذاتي، منع تعديل مستخدمي المنصة، قفل 9915/active-owner-status، منع تعطيل آخر مالك نشط، رسائل الرفض حرفيًا |
| `save_batch_settings` | `src/server/domains/inventory/application/save-batch-settings.usecase.ts` | owner/manager + دمج jsonb + إرجاع المدمج |
| `fn_set_document_numbering` | `src/server/domains/catalog/application/set-document-numbering.usecase.ts` | حارس قيمة البدء ضد التكرار (أعلى رقم صادر لكل نوع)، setval(…,false)، دمج COALESCE، سجل تدقيق best-effort |

### البنية
- Transport: `src/server/api/{identity,inventory,catalog}/*.ts` (requireSupabaseAuth + zod).
- عقود DTO قابلة للتسلسل (قاعدة TanStack: لا `unknown` في المخرجات).
- الاستدعاءات في الواجهة حُوّلت: `_app.users.tsx`, `use-batch-settings.ts` (مع الحفاظ على
  fallback التحديث المباشر السابق), `document-numbering-card.tsx`.

### قرارات مرحلية
1. **الكتابة service_role بدل authenticated** للعمليات التي كانت SECURITY DEFINER —
   نفس دلالات الأمان القديمة، مع فحص الأدوار صراحة في Use Case عبر استدعاء `has_role`
   (مصدر الحقيقة الوحيد، لا تكرار). RLS يبقى مطبقًا على كل ما يُقرأ/يُكتب بهوية المستخدم.
2. **اختبارات التكافؤ تصبح مشروطة بوجود الدالة القديمة** (oldFnExists) — بعد إسقاطها
   تتخطى جانب "القديمة" وتظل تغطي "الجديدة". النتيجة قبل الإسقاط: **12/12**.
3. ترحيل 019 طُبق على القاعدتين.

### بوابات المرحلة 2 (كلها خضراء)
- تsc نظيف، eslint نظيف، أخطاء 6/6، معاملات 8/8، تكافؤ 12/12 ثم 7 فعلي بعد الإسقاط.
- فحص البيانات بعد الاختبارات: مطابقة البذور (4 ملاك نشطون، سجل المنصة كما هو).


## المرحلة 3 — نطاق المخزون الثابت (2026-11-07)
### المنقول (9 دوال → Backend، مُسقطت بترحيل 020)
| الدالة القديمة | Use Case / Repository | ملاحظات السلوك المحفوظ |
|---|---|---|
| `product_reference_counts` | `inventory/infrastructure/product.repository.ts` | عدادات صريحة + دفتر الأمانات + مسح FK العام من الكتالوج بنفس الحراسة |
| `product_delete_guard` | `inventory/application/product-delete-guard.usecase.ts` | أسباب forbidden/referenced/not_found/deleted كما الأصل |
| `save_product_batch` | `inventory/application/batches.usecase.ts` | إنشاء/دمج/تعديل + FOR UPDATE + post_stock_delta بنفس الكتل النوعية |
| `delete_product_batch` | نفس الملف | مزامنة المخزون عبر ADJUSTMENT |
| `get_batch_kpis` | نفس الملف | نفس تعريفات منتهي/قريب/صالح/بلا |
| `reconcile_batches_with_inventory` | نفس الملف | FULL OUTER JOIN بنفس شروط الأصل |
| `receive/release_customer_owned_stock` | نفس الملف | فحص nature≠SERVICE، العملاء، التدقيق audit_logs |
| `save_item_policy` | نفس الملف | قواعد SERVICE/TRACKED/UNTRACKED، GUC `app.allow_policy_change`، snapshot تدقيق |

### قرارات مرحلية
1. **`post_stock_delta` يبقى في القاعدة حتى المرحلة 4** (قلب نظام المخزون، 19 مستدعي SQL
   من دوال باقية) — Use Cases تستدعيه عبر SQL داخل نفس المعاملة؛ انتقال موثق وليس تكرارًا.
2. **`audit_item_policy_snapshot` يبقى** (تستخدمه مشغلات/سياسات) — استدعاء انتقالي.
3. **`save_product_uom_settings` (14KB) مؤجلة إلى 3b** — أكبر من أن تختلط بدفعة الاختبارات.
4. اختبارات التكافؤ تعمل على قاعدة البذور 5433 صراحةً (`SERVER_DATABASE_URL` من بيئة
   الحاوية) — القاعدة الافتراضية في `pool.ts` تبقى مشيرة لقاعدة التطوير النشطة.
5. التكافؤ ثبت قبل الإسقاط: 4/4 (43 منتجًا حقيقيًا مقارنة JSON كاملة) — وبعد الإسقاط
   تتخطى سيناريوهات "القديمة" تلقائيًا.

### استبدالات الواجهة
`lib/safety.ts` (عدّادات + حذف آمن مع fallback العميل السابق)،
`components/batches/add-batch-dialog.tsx`، `routes/_app.batches.tsx` (حذف + KPIs
مع fallback الجدول السابق)، `components/batches/batch-settings-dialog.tsx` (تسوية)،
`lib/items/stock-operations.ts` (استلام/تسليم مخزون العملاء)، `lib/items/safety.ts` (سياسة الصنف).

### بوابات المرحلة 3 (خضراء)
tsc نظيف، eslint نظيف، أخطاء 6/6، معاملات 8/8، تكافؤ 2 (7 فعلي) و3 (4/4 قبل الإسقاط).


## المرحلة 4 — قلب النظام: محرك المخزون والتكلفة (2026-11-07)
### المنقول (7 دوال → Backend، منطق المحرك مُعاد تنفيذه بالكامل في TypeScript)
| الدالة القديمة | الموقع الجديد | ملاحظات |
|---|---|---|
| `post_stock_delta` | `stock/application/engine.ts` | نفس التحقق (دقة 3 خانات، is_staff، TRACKED فقط)، نفس أقفال FOR UPDATE/FOR SHARE، نفس ترتيب الكتابة، GUC `app.stock_engine` |
| `apply_cost_movement` | نفس الملف | متوسط متحرك حرفيًا: كلفة الخروج من الطبقة، عدم حصر القيمة عند الصفر (سلوك oversold المتعمد)، سجل item_cost_transactions + audit |
| `post_opening_stock` | `stock/application/stock.usecases.ts` | التحقق الكامل قبل رأس المستند، OPENING kind |
| `post_stock_adjustment` | نفس الملف | قيد T-09 عبر `create_journal_entry` (انتقالي حتى المرحلة 9)، تصحيح adjustment_reason |
| `create/update_opening_balance` | نفس الملف | أقسام/أطراف/تحقق السطور حرفيًا |
| `set_company_costing_method` | نفس الملف | MOVING_AVERAGE فقط، حظر التبديل بوجود أرصدة، سجل costing_policy_history |
| `next_stock_*_number` | `stock/infrastructure/stock.repository.ts` | نفس التسلسلات والتنسيق |

### قرارات معمارية مرحلية (جوهر المرحلة)
1. **`post_stock_delta`/`apply_cost_movement` تبقى في القاعدة كجسر انتقالي** — لديها 19
   مستدعي SQL من دوال باقية (مبيعات/مشتريات/خزينة/طحن/إنتاج). المنطق الآن **مكرر مؤقتًا
   بمعزل مُتحقق منه**: اختبار تكافؤ 5/5 يثبت التطابق الحرفي (inventory + cost_layers +
   movements + cost_transactions + رسائل الرفض)؛ الإسقاط في المرحلة 13 بعد انتقال آخر مستدعٍ.
   هذا الاستثناء الوحيد المتعمد لقاعدة "لا تكرار" — بسبب ذرّية المعاملات المالية عبر مراحل.
2. **محرك الكتابة يعمل `service_role` مع فحص صلاحيات صريح** — مطابق لدلالات
   SECURITY DEFINER في الدوال القديمة (اكتشفه اختبار التكافؤ: نسخة `authenticated`
   حُجبت بـ RLS وهذا كان انحرافًا سلوكيًا حقيقيًا).
3. **تنسيق الأرقام في رسائل الرفض مطابق لطبع numeric في PostgreSQL** (`0.000`) —
   اكتُشف بالاختبار أيضًا.
4. Use Cases في inventory (دفعات، مخزون عملاء) حُوّلت من استدعاء `post_stock_delta`
   SQL إلى المحرك الجديد — إزالة أول اعتماد خلفي على دالة القاعدة.

### استبدالات الواجهة
`lib/items/stock-operations.ts` (رصيد أول المدة + تسوية)،
`lib/opening-balances/index.ts` (إنشاء/تحديث مستند الأرصدة)،
`components/settings/sections/stock-settings-section.tsx` (طريقة التكلفة).

### بوابات المرحلة 4 (خضراء)
تsc نظيف، eslint نظيف، تكافؤ 5/5 على بيانات حقيقية، وأخطاء/معاملات/مرحلتا 2-3 كلها خضراء.


## المرحلة 5 — المبيعات (2026-11-07)
### المنقول (3 دوال → Backend، منطقها مُعاد بالكامل في TypeScript، مُسقطة بترحيل 021)
| الدالة القديمة | الموقع الجديد | ملاحظات |
|---|---|---|
| `create_sale` (9-معاملات) | `sales/application/sales.usecases.ts` — بإعادة تصميم (Use Case + معاملة واحدة `withTransaction`) | نفس التحقق كاملًا: الأدوار owner/manager/cashier، الدفع المجزأ، حسم الصنف/الوحدات، حد الائتمان، عميل النقد النظامي، نفس ترتيب الكتابة (فحص المخزون ← رأس الفاتورة ← سطور+محرك المخزون ← مزامنة التواريخ ← الذمة ← splits ← تدقيق ← post_sales_invoice) |
| `create_sales_return` | نفس الملف (`createSalesReturnInner` + غلاف) | نفس التحقق: الفاتورة المقفولة، مطابقة السطر/الوحدة، mod الزيادة، حد المرتجع، توزيع الذمة/الاسترداد النقدي، قفل صف العميل، `recalculate_customer_balance`، القيد المتوازن عبر `balance_and_post_return` |
| `adjust_loyalty` | نفس الملف | earn/redeem/adjust + GREATEST(0) كما الأصل |

### قرارات معمارية مرحلية
1. **استهلاك محرك المرحلة 4 مباشرة** — Use Cases المبيعات تستدعي `postStockDelta` (TS) بدل دالة القاعدة؛ لا اعتماد خلفي جديد. `post_stock_delta` يبقى جسرًا انتقاليًا لمستدعيه SQL الباقين (قرار المرحلة 4، إسقاط في المرحلة 13).
2. **`recalculate_customer_balance`/`customer_balance_lock` تبقيان في القاعدة** — لهما 3 مستدعي SQL باقون (الخزينة/مُشغّل الدفتر)؛ استدعاء انتقالي من Use Case حتى المرحلة 7 (الخزينة).
3. **`post_sales_invoice`/`balance_and_post_return` تبقيان (المحاسبة) حتى المرحلة 9** — استدعاء انتقالي مع حقن `request.jwt.claims` داخليًا لأن الدوال SECURITY DEFINER تقرأ `auth.uid()`؛ نفس دلالات ندائها من معاملة المستخدم سابقًا.
4. **`resolve_writable_payment_method`/`payment_method_ledger_account` تبقيان** (كتالوج طرق الدفع ومشغلاته) حتى المرحلة 7.
5. **رسائل الرفض منسوخة من طبع PostgreSQL الحرفي** — فحص المخزون يجري بنفس استعلام الأصل (CROSS JOIN LATERAL `resolve_sale_line` + `product_quantity_in_base`) وتُبنى الرسالة من نص numeric الذي تُخرجه القاعدة نفسها (`999999.000000000000`) — انحراف تنسيق اكتشفه اختبار التكافؤ وأُصلح قبل الوصول للإنتاج.
6. **الترتيب داخل المعاملة**: فحص المخزون بـ FOR UPDATE يسبق أي كتابة (كما الأصل)؛ `companyAllowsNegativeSales` لا يدخل فحص create_sale (يعالجه مُشغّل الدفعات) — مطابق للأصل بعد تدقيق حرفي.

### انحرافات اكتشفها اختبار التكافؤ (وأُصلحت)
- تنسيق numeric في رسالة `Insufficient stock` (طبع scale كامل من القاعدة، لا `${number}`).
- مفاتيح سطور البيع camelCase لم تكن تصل إلى `resolve_sale_line` (كان يفشل بصمت ويعامِلها كخدمة لحظية) — تُطبَّع إلى snake_case قبل الاستعلام.
- فحص `mod(quantity, increment)` بالفاصلة العائمة غير حاسم — استُبدل بمقارنة نسبية 1e-9.
- `post_sales_invoice` داخل معاملة service_role لا يرى هوية — حقن claims انتقالي (قرار 3 أعلاه).
- إصلاح ملف واجهة `_app.opening-balances.tsx` المفسود (setters لأزالة state محذوفة) حتى تعود بوابة tsc خضراء.

### استبدالات الواجهة
`lib/sales-invoice/index.ts` (createSalesInvoice → `createSaleFn`)،
`routes/_app.pos.tsx` (RPC create_sale → `createSaleFn`)،
`routes/_app.sales-returns.tsx` (RPC create_sales_return → `createSalesReturnFn` مع try/catch مترجم)،
`routes/_app.loyalty.tsx` (RPC adjust_loyalty → `adjustLoyaltyFn`).
لم يبق أي استدعاء RPC حي للدوال الثلاث (تحقق grep). الملفات المتبقية ذكرها في تعليقات/أنواع مولدة فقط.

### بوابات المرحلة 5 (خضراء)
tsc نظيف، eslint نظيف (التحذيرات الثلاثة في pos.tsx سابقة)، تكافؤ 5/5 على بيانات حقيقية قبل الإسقاط
(بيع نقدي، بيع آجل مع الدفتر والرصيد، رفض المخزون بنفس الرسالة، مرتجع كامل مع الدفتر وحالة الفاتورة، ولاء)،
ترحيل 021 مطبق على خط الأساس 5433 (قاعدة التطوير 5432 متوقفة حاليًا — يُطبق عند إقلاعها)،
وكل المجموعات (أخطاء 6/6، معاملات، مرحلات 2-4) خضراء بعد الإسقاط.


## المرحلة 7 — الخزينة (2026-11-07)
### المنقول (4 دوال → Backend، مُسقطة بترحيل 022)
| الدالة القديمة | الموقع الجديد | ملاحظات |
|---|---|---|
| `record_customer_payment` (13-معاملات + الـ 5-معاملات المفوضة لها) | `treasury/application/treasury.usecases.ts` | الأدوار الأربعة، دقة منزلتان، منع تاريخ مستقبلي، لحظة الحدوث بتوقيت المنشأة، رفض آجل، قفل العميل، فحص الرصيد/الفاتورة، الشيكات في السجل، التوزيع التلقائي على الفواتير المفتوحة، القيد، إعادة الاحتساب |
| `record_customer_payment_splits` | نفس الملف | على الأقل طرفان، تطابق المجموع، لكل طرف سند + دفتر + قيد خاص به، ثم تحديث الفاتورة/التوزيع مرة واحدة |
| `record_customer_advance_payment` | نفس الملف | دفعة مقدمة: دفتر credit + T-10 قيد على `payment_method_ledger_account` |
| `record_supplier_payment` (7- و9-معاملات) | نفس الملف (`recordSupplierPaymentInner` — الصيغة الكاملة) | ترقيم السند، تحديد الحساب (مدخل/صندوق/بنك/افتراضي)، سند + قيد Dr 2111/Cr الحساب، ربط القيد، تحديث الرصيد، تدقيق. **7-معاملات المفوضة إلى 9-معاملات سلوكيًا إلا كتابة supplier_ledger** — الصيغة 9 لا تكتب دفتر المورد |

### قرارات معمارية مرحلية
1. **`recalculate_customer_balance`/`customer_balance_lock` تبقيان في القاعدة** — اكتشاف حي:
   المُشغّل `tg_customer_ledger_sync_balance` (تبقى في القاعدة بقرار سابق) يستدعي
   `recalculate_customer_balance` عند كل كتابة في دفتر العميل. الإسقاط مؤجل حتى مرحلة
   المحاسبة (9) عندما تُعالَج المشغلات. Use Cases تستدعيهما عبر SQL (لا تكرار) — نفس نمط
   جسر `post_stock_delta`.
2. **`create_journal_entry` يبقى انتقاليًا (المرحلة 9)** مع حقن claims داخل Use Case حيث تلزم.
3. **`resolve_writable_payment_method`/`resolve_document_settlement_account`/
   `payment_method_ledger_account` تبقى** (كتالوج طرق الدفع ومشغلاته) — مؤجلة لمرحلة لاحقة.
4. **التحقق الصلاحيات صراحة في Use Case** (`assertPaymentRole`) — مطابق لدلالات
   SECURITY DEFINER كما في المرحلتين 2 و4.
5. **`withTransaction` ذرّية واحدة لكل سند** — لا فجوة بين سند الدفتر والقيد والرصيد.

### انحراف اكتشفه اختبار التكافؤ (وأُصلح)
- نسختي الأولى كتبت سطر `PAYMENT` في `supplier_ledger` — سلوك الصيغة القديمة 7-معاملات
  فقط؛ الصيغة الحية 9-معاملات لا تكتبه. نطابق الأصل الحي حرفيًا (اكتُشف بالاختبار قبل الإنتاج).

### استبدالات الواجهة
`hooks/use-financial-posting.ts` (تحصيل عميل/دفعة مقدمة/سند مورد → server functions)،
`routes/_app.payments.tsx` (تحصيل مفرد + مجزأ)،
`routes/_app.supplier-ledger.tsx` (سند صرف). لم يبق أي استدعاء RPC حي للدوال المنقولة.
إصلاح ملف `components/ui/connection.tsx` (استيرادات مفقودة ظهرت بين الجولات) لبوابة tsc.

### بوابات المرحلة 7 (خضراء)
tsc نظيف، eslint نظيف، تكافؤ 4/4 على بيانات حقيقية قبل الإسقاط (تحصيل بفاتورة، توزيع تلقائي،
تحصيل مجزأ، سند مورد)، ترحيل 022 مطبق على خط الأساس 5433 (قاعدة التطوير 5432 متوقفة —
يُطبق عند إقلاعها)، وكل المجموعات (أخطاء 6/6، مرحلات 2-5) خضراء بعد الإسقاط.


## المرحلة 8 — المشتريات (2026-11-07)
### المنقول (3 دوال → Backend، مُسقطة بترحيل 023)
| الدالة القديمة | الموقع الجديد | ملاحظات |
|---|---|---|
| `create_purchase` (8- و11-معاملات) | `purchasing/application/purchasing.usecases.ts` | الصيغة 11 كاملة: حل الصندوق الافتراضي، بناء الأقساط داخليًا، purchasable/الوحدات، تعطيل يخمّنه العميل، حماية المورد النظامي، سطور + محرك المخزون، payment_splits، رصيد المورد، تدقيق، post_purchase_invoice داخليًا مع GUC، توجيه الخزينة |
| `post_purchase_invoice` | نفس الملف (`postPurchaseInvoiceInner`) | نقل كامل (011): الأدوار مع استثناء cashier الداخلي، منع الترحيل المزدوج، تجميع حسب item_class/stock_effect، 1316 للضريبة، 2111 للمستحق، سداد مفرد أو لكل قسط |
| `create_purchase_return` | نفس الملف (`createPurchaseReturnInner`) | التحقق الكامل (فاتورة مقفولة، مطابقة السطر/الوحدة، الزيادة، حد المرتجع، المخزون)، T-12 رصيد المورد يصير دائنًا، T-08(ب) قيد مقلوب بقيمة المخزون الدفترية الفعلية |

### اكتشافات التكافؤ (أهم ما في المرحلة)
1. **عيب إنتاجي في الدالة القديمة `create_purchase_return` (012):**
   `coalesce(r.item_class, 'GOOD')` — PostgreSQL يحوّل 'GOOD' إلى نوع العمود enum item_class
   **وقت الترجمة لا وقت التنفيذ**، و'GOOD' قيمة `item_nature` لا `item_class`؛ لذا الدالة
   **تنهار لأي مرتجع مشتريات لمخزون مُتتبَّع** بغضّ النظر عن قيمة item_class.
   النسخة الجديدة تُصحّح العيب (مذكّرات نصية)، والاختبار يوثّق انهيار القديمة
   بالخطأ الدقيق `invalid input value for enum item_class: "GOOD"`.
2. سيناريو الدفع المجزأ بطريقة آجل + مدفوع جزئي غير صالح في المسارين — أُعيد تصميم
   الاختبار (credit بمدفوع 0) لأن القيد لن يتوازن في الأصل أيضًا.
3. `productPurchasable` كان يقرأ عمودًا بلا alias — أُصلح (اكتشف بالاختبار).
4. سلوك T-12 مؤكد: مرتجع فاتورة نقدية مسددة يجعل رصيد المورد -24.00 دائنًا — عمدًا.

### استبدالات الواجهة
`components/purchases/purchase-form-sheet.tsx` (create_purchase → `createPurchaseFn`)،
`routes/_app.purchase-returns.tsx` (create_purchase_return → `createPurchaseReturnFn`).
لم يبق أي استدعاء RPC حي للدوال الثلاث. ( regeneration أنواع المخطط جرّب لملف WIP خاص
بالمستخدم `milling.records.tsx` ثم أُرجع — لا يخص هذه المرحلة؛ أخطاء tsc المتبقية
كلها في ملف WIP هذا.)

### بوابات المرحلة 8 (خضراء)
تكافؤ 3/3 قبل الإسقاط (شراء نقدي، شراء آجل جزئي، مرتجع كامل + عيب القديمة موثق)،
ترحيل 023 مطبق على 5433، وكل المجموعات (أخطاء 6/6، مرحلات 2-5 + 7) خضراء بعد الإسقاط،
والأخطاء الوحيدة الباقية في tsc من ملف WIP خارج نطاق المرحلة.


## المرحلة 9 — المحاسبة: النواة (2026-11-07)
### المنقول (5 دوال → Backend؛ الإسقاط مؤجل للمرحلة 13 لوجود مستدعين SQL باقين)
| الدالة القديمة | الموقع الجديد | ملاحظات |
|---|---|---|
| `create_journal_entry` | `accounting/application/accounting.usecases.ts` — `createJournalEntryInner` | T-03 (يدوي للمحاسبة فقط/نظامي لأي مصادق)، سطر بلا طرف يُرفض قبل الرأس، حظر حسابات النظام لليدوي، T-19 فترة مقفلة (العكسي مستثنى)، ترقيم JE-YYYYMMDD، منع حسابات مفقودة/غير قابلة للترحيل برسالتين منفصلتين، توازن وإجماليات، تدقيق |
| `reverse_journal_entry` | نفس الملف | أسباب إلزامية، POSTED فقط، سطور مقلوبة بنفس الترتيب، الحالة REVERSED |
| `set_period_status` | نفس الملف | الأدوار، OPEN/CLOSED، closed_at/by، تدقيق |
| `assert_period_open` | `accounting/infrastructure/accounting.repository.ts` | نفس الاستثناء: تاريخ خارج الفترات مسموح |
| `next_journal_number` | نفس الملف | نفس التسلسل والتنسيق |

### قرارات معمارية مرحلية
1. **إزالة أول اعتماد محاسبي خلفي فعلي:** Use Cases المنقولة (الخزينة والمشتريات —
   سندات القبض/المقدمة/المورد وفاتورة المشتريات) تُنشئ القيود عبر `createJournalEntryInner`
   بدل دالة القاعدة. الكتلة القديمة تُستدعى فحص الأدوار داخليًا (isSystem=true).
2. **`create_journal_entry`/`assert_period_open`/`next_journal_number` تبقى في القاعدة
   كجسر** — لديها مستدعون SQL باقون (`post_sales_invoice`، `balance_and_post_return`
   والمستخدمة من مرتجعات المبيعات/المشتريات، الطحن، الإنتاج، الإقفال، المصاريف).
   الإسقاط في المرحلة 13 (ترحيل 024 إعلاني يوثق النية).
3. **`reverse_journal_entry`/`set_period_status` قابلتان للإسقاط الفوري** لكن بقي النداء
   عبر الواجهة أمانًا حتى استبدال كل مستدعي الواجهة في نطاق 9b (الإقفال/الأصول/الضرائب).

### استبدالات الواجهة
`routes/_app.fiscal-periods.tsx` (set_period_status → `setPeriodStatusFn`).
Transport: `src/server/api/accounting/{create-journal-entry,reverse-journal-entry,set-period-status}.ts`.

### بوابات المرحلة 9 (خضراء)
تكافؤ 4/4 قبل أي إسقاط (قيد نظامي متوازن بيتًا-بيتًا، رفض غير المتوازن بنفس الرسالة،
العكس، حالة الفترة)، وكل المجموعات (أخطاء 6/6، مرحلات 5/7/8) خضراء.


## المرحلة 10a — المصاريف: النواة (2026-11-07)
### المنقول (11 دالة مساعدة حاسمة → Backend؛ الإسقاط مؤجل للمرحلة 13)
| الدالة القديمة | الموقع الجديد | ملاحظات |
|---|---|---|
| `expense_can`/`expense_assert_capability` | `expenses/infrastructure/expenses.repository.ts` | جدول الصلاحيات بترتيب الأدوار حرفيًا (view=10، approve/reject/cancel=40، post/reverse=30...) |
| `expense_round` | نفس الملف (دالة نقية) | منزلتان — **تقريب decimal-safe نصي** (الانحراف أدناه) |
| `expense_settlement_status` | نفس الملف (نقية) | >= من جهة السداد و > على الصفر (تسوية البواقي < 0.005) |
| `expense_line_net`/`expense_line_production_base_amount` | نفس الملف (نقية) | INCLUSIVE/EXCLUSIVE/NONE + ضريبة قابلة للاسترداد |
| `expense_required_approval_rank` | نفس الملف | أعلى رتبة مطلوبة للمبلغ |
| `expense_log_action` | نفس الملف | تسلسل الموافقات + سجل التدقيق العام |
| `expense_posting_account_code` | نفس الملف | منع الترحيل بلا حساب إعداد فعّال (55000) |
| `expense_write_supplier_ledger` | نفس الملف | قفل استشاري على الرصيد التراكمي + UPDATE...RETURNING بنفس صيغة الأصل |
| `expense_reverse_supplier_ledger` | نفس الملف | عكس صف الدفتر بمفتاح عكسي |

### اكتشاف التكافؤ (الأهم)
- **انحراف float في التقريب:** `expense_round(1.005)` يجب أن تدور 1.01 (numeric نصف-أعلى)،
  وroundN العائم كان يعطي 1.00 (100.49999…). صُحح بتنفيذ decimal-safe نصي — يحمي أيضًا
  مجموع ملايين الصفوف من تراكم الانزلاق (تعليق الأصل نفسه).

### الوضع الانتقالي
المساعدات تُستهلك من دوال دورة حياة المصاريف الباقية في القاعدة (submit/decide/post/
update_v2 — المرحلة 10b) ومشغلات القاعدة؛ الإسقاط في المرحلة 13 (ترحيل 025 إعلاني).
اختبارات المراحل 5/7/8 تتخطى سيناريوهاتها القديمة بعد إسقاط دوالها — كما هو معتمد.

### بوابات المرحلة 10a (خضراء)
تكافؤ 4/4 (round/settlement/line_net + دفتر المورد دائن/مدين بيتًا-بيتًا)،
وكل المجموعات (أخطاء 6/6، مرحلات 5-9) خضراء. tsc نظيف على النطاقات المنقولة
(التحذيران السابقان لندائي إقفال السنة — 9b).


## المرحلة 10b — المصاريف: دورة الحياة (2026-11-08)
### المنقول (10 دوال → Backend؛ مُسقطة بترحيل 026)
| الدالة القديمة | الموقع الجديد | ملاحظات |
|---|---|---|
| `create_expense_v2` | `expenses/application/expense-lifecycle.usecases.ts` — `createExpenseInner` | idempotency advisory lock، فحص فاتورة المورد، jsonb → سطور، إرجاع الصف كاملًا |
| `update_expense_v2` | نفس الملف — `updateExpenseInner` | DRAFT/REJECTED فقط، ملكية أو رتبة ≥30، معالجة ضريبة ورقم الفاتورة |
| `submit_expense` | نفس الملف — `submitExpenseInner` | سطور > 0، طرف مطلوب، صلاحية expense.submit |
| `decide_expense` | نفس الملف — `decideExpenseInner` | رتبة الموافقة، منع الموافقة الذاتية (استثناء مالك على مسودة)، سبب إلزامي. **إصلاح عيب قديم موثق:** تسجيل الحركة 'approved'/'rejected' بدل 'approve'/'reject' التي كانت تنهار بقيد expense_approvals_action_known دائمًا |
| `post_expense` | نفس الملف — `postExpenseInner` | ADVANCE مرفوض، مسودة بترحيل مباشر (owner + allowDraftPost + سبب)، مجموعات ترحيل + ضريبة قابلة للاسترداد، دفتر مورد، payNow |
| `record_expense_payment` | نفس الملف — `recordExpensePaymentInner` | idempotency، صندوق/بنك/حساب/طريقة دفع، قيد التسوية عبر `createJournalEntryInner`، دفتر مورد |
| `reverse_expense_payment` | نفس الملف | عكس القيد ثم صف عكسي، حظر عكس العكسي |
| `close_expense` / `cancel_expense` / `reverse_expense` | نفس الملف | نفس شروط الحالة والدفع والتبعية |

### قرارات مرحلية
1. **القيود عبر محرك المرحلة 9** (`createJournalEntryInner`/`reverseJournalEntryInner`) —
   لا اعتماد خلفي على دالة القاعدة في هذه الدورة.
2. **ترحيل 026 إسقاط فعلي** للـ10 دوال بكل overloads (مولد من pg_proc ديناميكيًا)،
   على خلاف 024/025 الإعلانيين — لا مستدعي SQL باقين لدورة الحياة بعد النقل.
3. **إصلاح rpc_allowlist في ترحيل 002**: كان التصريح فيه `NULL::text[] AS $function$` —
   تفكيك غير صالح؛ عاد ليأخذ جسم مصفوفة rpc_allowlist_before_company_production
   (المصدر الأساسي، العقد التاريخي). الأسماء المنقولة للباك اند تبقى فيه للاحتفاظ
   بالسجل حتى المرحلة 13، والدوال الجديدة تصل عبر server functions لا RPC.
4. **مخرجات Transport DTO قابل للتسلسل**: `JsonValue` صريح بدل `unknown`
   (قاعدة TanStack Start)، والواجهة تُحوّل عبر `as unknown as { entry: ExpenseEntry }`
   في `hooks/use-expenses.ts` (10 مواضع) — الواجهة كانت تستهلك `*Fn` بالفعل.

### إصلاح ترميمي قبل البوابات
ملف `expense-lifecycle.usecases.ts` وُجد تالف نحوّيًا (أقواس/إسنادات ناقصة في 13 موضعًا
— أثر كتابة فاسدة سابقة). أُصلح كاملًا ثم أجتاز tsc وeslint بلا خطأ.

### بوابات المرحلة 10b (الحالة)
- tsc نظيف على نطاق الخادم والواجهة المتأثرة؛ eslint نظيف على الملفات المنقولة.
- ✅ **لم يُنفذ بعد:** اختبار تكافؤ 10b على قاعدة حية وترحيل 026 فعليًا —
  قاعدتا 5432/5433 غير قائمتين في هذه الجلسة (Docker متوقف). يُشترط إقلاع
  القاعدة وتطبيق 026 وإعادة تشغيل phase10b-equivalence قبل اعتماد البوابة نهائيًا.


## المرحلة 11 — الإنتاج (2026-11-08)
### المنقول (11 دالة → Backend؛ مُسقطة بترحيل 027)
| الدالة القديمة | الموقع الجديد | ملاحظات |
|---|---|---|
| `create_production_order` | `production/application/production.usecases.ts` | أدوار staff+owner/manager/warehouse/accountant، ترقيم MO-YYYYMMDD-#####، فحص المستودع ومركز التكلفة |
| `complete_production_order` (أكبر دالة في المجال) | نفس الملف | صرف المواد بالدفعات (FEFO/FIFO/يدوي حسب الإعداد والصنف) عبر محرك 4، تخصيص مصروفات صافية بضريبة المدخلات عبر محرك 10a، فاقد كتلي NORMAL/ABNORMAL، ميزان كتلة، توزيع RELATIVE_SALES_VALUE، قيد صرف + قيد إقفال WIP عبر postJournalEntryWithNumber (محرك 9 + رقم صريح = post_journal_entry) |
| `create_and_post_production_order` | نفس الملف | مفوض: create ثم complete في نفس المعاملة |
| `reverse_production_order` | نفس الملف | كل بوابات الأمان: لا ناتج مستخدم لاحقًا، لا رصيد سابق، طبقة تكلفة سليمة، دفعات سليمة، مصروف مشترك محمّل على أمر آخر، عكس قيود عبر reverseJournalEntryInner بترتيب الأصل |
| `smart_manufacture` (الصيغة الموسعة + 3 أغلفة) | نفس الملف | فحص RAW_MATERIAL/TRACKED/ملكية، MOVING_AVERAGE إلزامي، فاقد كتلي، توزيع بقيمة البيع، حسابات 1313/1314/5921/1311 |
| `convert_stock` | نفس الملف | التحويل المخزني للشركة فقط، توازن نواتج+فاقد = المصدر، بلا قيد (FIXED_MANUAL) |
| `production_order_history`/`production_cost_sources`/`production_order_cost_check`/`production_order_cost_detail` | نفس الملف (قراءات) | نفس الاستعلامات والتجميع jsonb؛ فحص is_staff/can_read_finance |
| `production_expense_line_available` | `production/infrastructure/production.repository.ts` | نفس الحساب الصافي (نت يخصم الضريبة غير المستردة) |

### قرارات معمارية مرحلية
1. **post_journal_entry مُعاد تنفيذه كـ postJournalEntryWithNumber** — createJournalEntryInner
   (محرك 9) ثم UPDATE entry_number: نفس سلوك الدالة الأصلية (009) حرفيًا، بلا اعتماد
   خلفي على دالة القاعدة.
2. **movementKind "PRODUCTION" أضيف لنوع StockDeltaArgs** في محرك 4 — القيمة موجودة
   في enum القاعدة 001 لكن TypeScript كان يمنعها؛ لا تغيير سلوكي (movementTypeLegacy
   يحمل production_in/out كما الأصل).
3. **مساعدات الإنتاج تبقى في القاعدة** (production_quantity_in_base،
   production_mass_in_kg، production_inventory_account_code،
   production_output_has_downstream_use، بوّابات المشغلات) — تستهلكها مشغلات
   وRLS وسياسات؛ استدعاؤها من هنا انتقالي حتى المرحلة 13.
4. **القراءات عبر server functions** بنفس شكل jsonb الأصلي — الواجهة (production-orders.ts
   وcustody.ts) حُوّلت من rpc إلى `productionCostSourcesFn/productionOrderHistoryFn/
   productionOrderCostDetailFn/smartManufactureFn/convertStockFn` مع الحفاظ على
   fallback رسائل الأخطاء.
5. **لا مكرر منطق**: كل فحص أمان (canOperateMilling/canReadFinance) ينفذ مرة واحدة
   في Use Case بصيغة SQL الأصلية نفسها.

### بوابات المرحلة 11 (الحالة)
- tsc نظيف على نطاق الخادم والواجهة المنقولة (الأخطاء الباقية في ملف WIP سابق:
  purchase-invoice-composer.tsx — خارج النطاق)؛ eslint نظيف على كل الملفات الجديدة.
- ✅ **لم يُنفذ بعد:** اختبار تكافؤ 11 على قاعدة حية وترحيل 027 فعليًا — نفس
  قيد المرحلة 10b: قاعدتا 5432/5433 غير قائمتين (محرك Docker مُصفّر والصورة
  تحتاج تحميلًا). يُشترط إقلاع القاعدة وتطبيق 026 ثم 027 وإعادة تشغيل
  phase10b-equivalence + phase11-equivalence قبل اعتماد البوابتين نهائيًا.


## المرحلة 12 — التقارير / Backup / Sync (2026-11-08)
### المنقول (11 دالة → Backend؛ مُسقطة بترحيل 028)
| الدالة القديمة | الموقع الجديد | ملاحظات |
|---|---|---|
| `list_expenses` (17 معاملًا) | `reports/application/reports.usecases.ts` | نفس SQL حرفيًا: keyset pagination، فلاتر الحالة/الدفع/الفئات، LEFT JOIN LATERAL للفئة الرئيسية |
| `expense_detail` | نفس الملف | نفس jsonb (entry/lines/payments/approvals/attachments) + حساب قدرات can_* خادميًا |
| `expense_summary` | نفس الملف | FILTER بكل الشرائح (overdue بمسامحة 0.005) |
| `expense_report` (7 مجموعات) | نفس الملف | نفس الترتيب والتحقق من group_by |
| `expense_lookups` | نفس الملف | نفس الفلاتر (موظفو بلا منصة، حسابات 11%) |
| `milling_service_cost_report` | نفس الملف | expense_assert_capability('expense.report') حرفيًا + حل مركز الطحن |
| `get_supplier_statement` | نفس الملف | can_read_finance صريح + نفس window function |
| `get_chart_of_accounts_tree` | نفس الملف | recursive CTE + أرصدة POSTED + طبيعة المدين/الدائن |
| `backup_export_all` | نفس الملف | تصدير ديناميكي لكل جداول public + سقف سجلات السجلات |
| `backup_restore_all` | نفس الملف | owner فقط، session_replication_role=replica، TRUNCATE كامل، إدراج بالأسماء، setval للتسلسلات، تحذير fingerprint لا إيقاف |
| `backup_schema_fingerprint` | نفس الملف | SHA-256 على جداول/أعمدة/أنواع public |

### قرارات معمارية مرحلية
1. **دلالات invoker محفوظة**: دوال القراءة الأصلية (010) لم تكن SECURITY DEFINER —
   المعاملة الجديدة تفتح بـ `SET LOCAL role = authenticated` + claims، فـ RLS
   و`auth.uid()` داخل SQL يعملان كما نداء RPC من التطبيق حرفيًا (نموذج مختلف
   عمدًا عن مراحل الكتابة service_role).
2. **backup_restore_all ديناميكي في TS**: أسماء الجداول تأتي من information_schema
   فقط وتُمرر عبر quote-ident صارم (`^[a-z_][a-z0-9_]*$`) — لا إدخال مستخدم في SQL
   ديناميكي.
3. **`sync_apply_operation` تبقى في القاعدة** — بلا مستدعي واجهة، وتظل على قائمة
   التدقيق الحي قبل الحذف (قرار المرحلة 1، لم يتغير).
4. **أنواع الكشف النصية**: numeric يعود نصًا (`::text`) من SQL وتحوّله الواجهة —
   مطابق لطبع PostgREST تجنبًا لانحراف float.
5. الـ107 كشف المورد fallback المباشر على supplier_ledger في الواجهة أزيل — لا
   حاجة له بعد أن الباك اند هو مصدر الحقيقة.

### بوابات المرحلة 12 (الحالة)
- tsc نظيف على نطاق الخادم والواجهة المنقولة؛ eslint نظيف؛ الـ21 خطأ الباقي
  ملفات WIP سابقة خارج النطاق (purchase-invoice-composer.tsx وmilling.records.tsx).
- ✅ **لم يُنفذ بعد:** اختبار تكافؤ 12 على قاعدة حية وترحيل 028 فعليًا — نفس قيد
  10b/11: القاعدة غير قائمة (محرك Docker مُصفّر). يُشترط إقلاعها وتطبيق 026→027→028
  وتشغيل   phase10b/11/12-equivalence قبل اعتماد البوابات الثلاث نهائيًا.


  ## المرحلة 13 — الإغلاق (جزء 1: الحظر الصارم) (2026-11-08)
  ### ما تم (ترحيل 029)
  1. **rpc_allowlist() أعيد بناؤها مقلّمة**: خرجت منها كل الأسماء المنقولة إلى
     Backend (018-028) والميتة (018)، وبقيت الحية. أُضيفت أسماء حية كانت غائبة
     عن القائمة القديمة: custody_intake_multi، custody_milling_multi،
     custody_adjustment، custody_delivery، custody_grain_items،
     custody_output_items، milling_document_process،
     create_milling_service_document_multi_priced، save_expense_dimension،
     expense_role_rank (تستدعى من قراءات الباك اند تحت authenticated).
  2. **الحظر صار error**: كل دالة public غير مدرجة في القائمة سُحبت منها
     EXECUTE من PUBLIC وanon — نداءها عبر PostgREST يُرفض صراحةً بدل الاعتماد
     على توثيق القائمة.
  3. **service_role يملك EXECUTE صريحًا** على كل دوال public — الجسور الداخلية
     للباك اند (post_sales_invoice، post_purchase_invoice، post_stock_delta،
     create_journal_entry، recalculate_customer_balance، post_opening_balance…)
     تعمل عبر SQL داخل معاملات service بلا تأثر.
  4. **المدرجة مُنحت EXECUTE صريحًا لـ authenticated** (إسقاط GRANT الافتراضي
     عبر PUBLIC يُفقد الموروث).

  ### اكتشافات قبل الحظر (تصحيح سجل المراحل السابقة)
  تدقيق grep شامل بعد تحويل التقارير كشف نداءات RPC حية لم تُوثق في سجلات
  المراحل 4/8 (كانت عبارة «لم يبق أي استدعاء RPC حي» غير دقيقة جزئيًا):
  - `create_purchase` ×4: purchases.tsx (legacy path)، purchase-pos.tsx،
    standard-invoice-composer.tsx، purchase-invoice-composer.tsx.
  - `post_stock_delta`: direct-stock-in-dialog.tsx.
  - `recalculate_customer_balance`: statement-integrity-badge.tsx.
  - `save_expense_dimension` ×2: expense-cost-centers-section.tsx.
  **القرار:** بقيت في القائمة، والسحب الكامل من authenticated مؤجل للجزء 2
  بعد تحويلها أو إسقاط شاشاتها الميتة.

  ### حدود الجزء 1 (المؤجل للجزء 2)
  - السحب الكامل من authenticated: ينتظر نقل الطحن/العهدة (012 — الأضخم) و9b
    (الأصول/الضرائب/الإقفال/الشيكات) وتحويل المتبقي أعلاه.
  - إسقاط الجسور (post_stock_delta، create_journal_entry، assert_period_open،
    مساعدات 010): كلها ما زال لها مستدعون SQL داخل دوال باقية (الطحن والإقفال
    ونشر الأرصدة) — إسقاطها الآن يكسر التطبيق؛ موعدها بعد الجزء 2.
  - sync_apply_operation: بلا مستدعي واجهة؛ تدقيق حي قبل الحذف (قرار المرحلة 1).

  ### بوابات المرحلة 13.1 (الحالة)
  - tsc نظيف على النطاق (المتبقي ملفات WIP سابقة)؛ eslint نظيف؛ الواجهة صفر
    استدعاء RPC لدوال 018-028 المنقولة (تحقق grep نهائي بعد إصلاح
    financial-bridge.ts و_finance.tsx — متبقيات المرحلة 12).
  - ✅ **لم يُنفذ بعد:** تطبيق 029 على قاعدة حية — نفس قيد 10b/11/12.



