# Market-Hub ERP — تقرير حالة تنفيذ معمارية Offline-First ودليل التشغيل

> **تاريخ التحديث:** 2026-09-30  
> **الفرع الحالي:** `yunis-offline-architecture`  
> **الحالة الحالية:** إنجاز **المرحلة 0** (التصميم المنهجي والعقود) و **المرحلة 1** (البنية التحتية البرمجية، محرك عدم التكرار، محرك المزامنة، ومحولات التخزين والمستودعات).

---

## 1. الإجابة المباشرة على حالة التنفيذ

**هل تم تنفيذ الخطة كاملة بجميع مراحلها الـ 11 (0 إلى 10)؟**  
تتكون خطة الانتقال إلى معمارية Hybrid Offline-First من **11 مرحلة متدرجة** لحماية سلامة الحسابات والمخزون، وتم تنفيذ **المرحلة 0 والمرحلة 1 بنجاح كلي**.

### خريطة حالة المراحل الـ 11:

| المرحلة | الوصف | الحالة | التفاصيل |
| :--- | :--- | :---: | :--- |
| **المرحلة 0** | تثبيت سياسة التشغيل والمعمارية المقترحة والعقود | **مكتملة 100%** | توثيق عقود عدم التكرار والبيانات المحلية والحدود التشغيلية. |
| **المرحلة 1** | طبقة Repository ومحرك المزامنة والهيكل المحلي | **مكتملة 100%** | إنشاء `src/lib/offline/` والمحولات وطابور Outbox وتجريد الوصول. |
| **المرحلة 2** | عقد Idempotency و RPCs الخادم لـ `sync_apply_operation` | المرحلة القادمة | إضافة دوال PostgreSQL الذرية للتحقق من مفتاح عدم التكرار. |
| **المرحلة 3** | إعداد بيئة Tauri و SQLite وتشفير البيانات محلياً | مرحلة مستقبلية | تحزيم التطبيق المكتبي لـ Windows مع قواعد بيانات SQLite. |
| **المرحلة 4** | مزامنة البيانات المرجعية ومسارات القراءة المحلية | مرحلة مستقبلية | توجيه استعلامات الأصناف والمستودعات والعملاء إلى الكاش المحالي. |
| **المرحلة 5** | معالجة طابور Outbox/Inbox وإعادة المحاولة التلقائية | مرحلة مستقبلية | تفعيل محرك المزامنة الخلفي عند انقطاع وعودة الشبكة في الشاشات. |
| **المرحلة 6** | مبيعات POS المؤقتة مع الترقيم المحلي والاعتماد | مرحلة مستقبلية | ربط نقاط البيع بالطابور المحلي ومراجع `POS-DEV...`. |
| **المرحلة 7** | المشتريات والمرتجعات والتحويلات والتسويات | مرحلة مستقبلية | ربط مسارات المخزون بعقود Append-only المحمية. |
| **المرحلة 8** | القيود المالية والمدفوعات والمصروفات والتقارير | مرحلة مستقبلية | تمييز التقرير المحلي بعلامة "حتى آخر مزامنة". |
| **المرحلة 9** | تصاريح الأجهزة Offline Auth والأمن والتحديثات | مرحلة مستقبلية | التوثيق المحلي وتوليد توقيع التصريح من الخادم. |
| **المرحلة 10**| التشغيل التجريبي (Pilot) واختبارات Restore والتسليم | مرحلة مستقبلية | الفحص النهائي والاستعادة الفعلية من SQLite. |

---

## 2. ما تم إنجازه تفصيلياً (Phase 0 & Phase 1)

تم بناء النواة البرمجية لمعمارية **Offline-First** داخل النطاق [`src/lib/offline/`](file:///c:/Users/ahmed/Desktop/market-hub/src/lib/offline/):

1. **عقود ومعايير البيانات (`types.ts`):**
   - [types.ts](file:///c:/Users/ahmed/Desktop/market-hub/src/lib/offline/types.ts): تعريف هيكل مظروف Outbox غير القابل للتعديل (`OutboxEnvelope`) ومظروف Inbox وتصاريح الأجهزة (`DeviceRegistration`, `OfflineAuthorityGrant`) وحالات المزامنة والتعارضات.

2. **محرك عدم التكرار والمعرفات الفريدة (`idempotency.ts`):**
   - [idempotency.ts](file:///c:/Users/ahmed/Desktop/market-hub/src/lib/offline/idempotency.ts): خوارزمية توليد UUIDv7 مرتبة زمنيًا، ومولد مفاتيح عدم التكرار الفريدة (`generateIdempotencyKey`) لمنع تكرار أي فاتورة أو دفعة على الخادم، ومولد المراجع المحلية القابلة للطباعة (`generateLocalDocRef`).

3. **محول قواعد البيانات المحلية (`storage-adapter.ts`):**
   - [storage-adapter.ts](file:///c:/Users/ahmed/Desktop/market-hub/src/lib/offline/storage-adapter.ts): واجهة موحدة `IOfflineStorageAdapter` تعمل على المتصفح عبر IndexedDB/LocalStorage (`WebStorageAdapter`) وجاهزة للعمل داخل تطبيق سطح المكتب عبر SQLite (`TauriSQLiteAdapter`).

4. **محرك المزامنة المستقل (`sync-engine.ts`):**
   - [sync-engine.ts](file:///c:/Users/ahmed/Desktop/market-hub/src/lib/offline/sync-engine.ts): محرك `SyncEngine` لإدارة طوابير Outbox، ومعالجة أولويات التنفيذ (High / Medium / Low)، والتعامل الذاتي مع انقطاع وعودة الإنترنت، ومحاولات إعادة الإرسال المجدولة بـ Exponential Backoff & Jitter.

5. **طبقة وصول البيانات والمستودعات (`repositories/`):**
   - [base-repository.ts](file:///c:/Users/ahmed/Desktop/market-hub/src/lib/offline/repositories/base-repository.ts): نمط Repository عالي الكفاءة يفصل واجهات React عن استدعاءات Supabase المباشرة، ويحقق التبديل الشفاف بين القراءة من الكاش المحلي والكتابة إلى Outbox.
   - [reference-repository.ts](file:///c:/Users/ahmed/Desktop/market-hub/src/lib/offline/repositories/reference-repository.ts): مستودعات الأصناف والتصنيفات والماركات والوحدات والمستودعات.

---

## 3. طريقة التشغيل والاختبار

### تشغيل التطبيق في بيئة التطوير المحلية (Web Development):

1. **تثبيت الاعتمادات (في حال عدم تثبيتها):**
   ```bash
   npm install
   ```

2. **تشغيل خادم التطوير المحلي:**
   ```bash
   npm run dev
   ```

3. **فتح التطبيق في المتصفح:**
   افتح [http://localhost:8080](http://localhost:8080) أو المنفذ المحدد في الشاشة.

---

### اختبار فحص سلامة الأكواد والأنواع (TypeScript Validation):

للتأكد من صحة وسلامة كافة أكواد النواة البرمجية المضافة دون أي خطأ في البناء:

```bash
npx tsc --noEmit
```

---

### اختبار النواة البرمجية لـ Offline Engine في المتصفح:

يمكنك استيراد واختبار محرك المزامنة ومستودعات البيانات مباشرة داخل كود التطبيق أو المتصفح:

```typescript
import { globalSyncEngine, categoriesRepo, generateIdempotencyKey } from '@/lib/offline';

// 1. فحص حالة الاتصال والمزامنة
console.log('حالة المحرك:', globalSyncEngine.getStatus());

// 2. تجربة جلب التصنيفات (تستخدم الكاش المحلي عند انقطاع الإنترنت)
const categories = await categoriesRepo.getAll();
console.log('التصنيفات المتاحة:', categories);

// 3. إضافة سجل محلي مع إدراجه في طابور Outbox تلقائياً
const newCat = await categoriesRepo.create({
  id: 'cat-local-001',
  name: 'تصنيف جديد offline',
  name_ar: 'تصنيف جديد offline',
});
```

---

## 4. الخطوات التالية الموصى بها (المرحلة 2)

1. إنشاء دوال PostgreSQL الهيكلية لمستقبل Idempotency على الخادم.
2. البدء بتغليف شاشات المبيعات والـ POS تدريجياً لاستخدام `base-repository` ومحرك Outbox.
