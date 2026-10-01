-- ============================================================================
-- توطين بيانات المطحنة للجمهورية اليمنية
-- ============================================================================
-- كانت البذرة الأصلية مقتبسة من نموذج سعودي (SAR / ر.س). هذه الهجرة تصحح
-- العملة والفهرس فقط، ولا تعدّل فواتير أو قيوداً مالية مُرحّلة.
--
-- أسعار القمح والدقيق المرجعية هنا بالريال اليمني، من قائمة وزارة الاقتصاد
-- والصناعة والاستثمار اليمنية المنشورة في 17-09-2026 (50 كجم: حبوب 11,400
-- ودقيق 13,500). وهي نقاط بداية قابلة للتعديل وليست سعراً موحداً لكل محافظة.
-- ============================================================================

UPDATE public.company_settings
SET currency = 'YER',
    currency_symbol = 'ر.ي',
    tax_rate = 0,
    updated_at = now()
WHERE id = 1;

-- مواد خام: تكلفة مرجعية للكيس 50 كجم. تبقى تكلفة كل توريد فعلية هي المعتمدة
-- في فاتورة الشراء، ولا يجوز اعتبار هذه القيم بديلاً عنها.
UPDATE public.products
SET cost_price = CASE sku
  WHEN 'RM-WHEAT-HARD'  THEN 11400.00
  WHEN 'RM-WHEAT-LOCAL' THEN 11000.00
  WHEN 'RM-WHEAT-SOFT'  THEN 10800.00
  WHEN 'RM-CORN-YELLOW' THEN 12500.00
  WHEN 'RM-BARLEY'      THEN 9000.00
  ELSE cost_price
END,
    description = CASE sku
      WHEN 'RM-WHEAT-HARD' THEN 'قمح صلب مستورد للمطحنة — سعر مرجعي يمني للكيس 50 كجم؛ تعتمد تكلفة التوريد الفعلية عند الشراء.'
      WHEN 'RM-WHEAT-LOCAL' THEN 'قمح بلدي محلي موسمي — سعر مرجعي يمني للكيس 50 كجم؛ تعتمد تكلفة التوريد الفعلية عند الشراء.'
      ELSE description
    END,
    updated_at = now()
WHERE sku IN ('RM-WHEAT-HARD', 'RM-WHEAT-LOCAL', 'RM-WHEAT-SOFT', 'RM-CORN-YELLOW', 'RM-BARLEY');

-- منتجات الدقيق: أسعار مرجعية يمنية للكيس، قابلة للتعديل بحسب المحافظة والجودة.
UPDATE public.products
SET sale_price = CASE sku
  WHEN 'FG-FLOUR-SUPER-50' THEN 13500.00
  WHEN 'FG-FLOUR-SUPER-25' THEN 6800.00
  WHEN 'FG-FLOUR-BROWN-50' THEN 13000.00
  WHEN 'FG-BRAN-40'        THEN 7500.00
  WHEN 'FG-SEMOLINA-50'    THEN 18000.00
  ELSE sale_price
END,
    description = CASE sku
      WHEN 'FG-FLOUR-SUPER-50' THEN 'دقيق فاخر نمرة 1 معبأ — سعر مرجعي يمني 13,500 ر.ي للكيس 50 كجم، يُراجع وفق المحافظة والجودة.'
      WHEN 'FG-FLOUR-SUPER-25' THEN 'دقيق فاخر نمرة 1 معبأ — سعر مرجعي يمني للكيس 25 كجم، يُراجع وفق المحافظة والجودة.'
      WHEN 'FG-FLOUR-BROWN-50' THEN 'دقيق بر كامل معبأ — سعر مرجعي يمني للكيس 50 كجم، يُراجع وفق المحافظة والجودة.'
      ELSE description
    END,
    updated_at = now()
WHERE sku IN ('FG-FLOUR-SUPER-50', 'FG-FLOUR-SUPER-25', 'FG-FLOUR-BROWN-50', 'FG-BRAN-40', 'FG-SEMOLINA-50');

-- مستلزمات التعبئة: قيم يمنية ابتدائية للمخزون وليست أسعاراً سعودية محوّلة.
UPDATE public.products
SET cost_price = CASE sku
  WHEN 'PKG-BAG-PP-50'   THEN 350.00
  WHEN 'PKG-BAG-PP-25'   THEN 250.00
  WHEN 'PKG-BAG-JUTE-50' THEN 900.00
  WHEN 'PKG-THREAD-ROLL' THEN 6000.00
  ELSE cost_price
END,
    sale_price = CASE sku
  WHEN 'PKG-BAG-PP-50'   THEN 500.00
  WHEN 'PKG-BAG-PP-25'   THEN 400.00
  WHEN 'PKG-BAG-JUTE-50' THEN 1300.00
  WHEN 'PKG-THREAD-ROLL' THEN 0.00
  ELSE sale_price
END,
    updated_at = now()
WHERE sku IN ('PKG-BAG-PP-50', 'PKG-BAG-PP-25', 'PKG-BAG-JUTE-50', 'PKG-THREAD-ROLL');

-- أجور الخدمات اتفاقية وليست قائمة سعر حكومية. تصفير السعر المرجعي يمنع
-- إصدار فاتورة بسعر سعودي صغير عن طريق الخطأ؛ السعر الفعلي يُدخل في أمر الطحن.
UPDATE public.products
SET sale_price = 0,
    description = CASE sku
      WHEN 'SRV-MILL-BAG50' THEN 'أجرة طحن شوال 50 كجم — تُحدد بالريال اليمني في أمر الطحن/الاتفاق مع العميل.'
      WHEN 'SRV-MILL-TON' THEN 'أجرة طحن بالطن المتري — تُحدد بالريال اليمني في أمر الطحن/الاتفاق مع العميل.'
      WHEN 'SRV-MILL-TON-JOB' THEN 'أجرة طحن بالطن المتري — تُحدد بالريال اليمني في أمر الطحن/الاتفاق مع العميل.'
      WHEN 'SRV-CLEAN-TON' THEN 'أجرة تنظيف وفرز للطن — تُحدد بالريال اليمني في أمر الخدمة.'
      WHEN 'SRV-SEWING-BAG' THEN 'أجور تعبئة وحياكة للكيس — تُحدد بالريال اليمني في أمر الخدمة.'
      WHEN 'SRV-STORAGE-DAY' THEN 'رسوم تخزين الأمانات لليوم والطن — تُحدد بالريال اليمني في أمر الخدمة.'
      ELSE description
    END,
    updated_at = now()
WHERE sku IN ('SRV-MILL-BAG50', 'SRV-MILL-TON', 'SRV-MILL-TON-JOB', 'SRV-CLEAN-TON', 'SRV-SEWING-BAG', 'SRV-STORAGE-DAY');

COMMENT ON TABLE public.products IS
  'فهرس أصناف المطحنة بالريال اليمني. أسعار التوريد والخدمة الفعلية تُثبت في مستنداتها ولا تُستنتج من السعر المرجعي.';
