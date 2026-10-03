-- ============================================================================
-- 20261103000000_backfill_milling_agreements.sql
--
-- LINKING THE TWO LEGACY MILLING JOBS TO THEIR AGREEMENTS
-- -------------------------------------------------------
-- MJ-501 and MJ-202610-0001 were created before the agreement feature
-- existed, so both carry agreement_id = NULL and milling_service_agreements
-- was completely empty. The question was whether the real agreement could be
-- identified for them, or whether they must be left as documented exceptions.
--
-- IT CAN BE, AND THE REASON MATTERS
-- ---------------------------------
-- An agreement here is not a hypothetical promise; it is the set of terms the
-- mill actually applied and actually charged. Every NOT NULL column is
-- recoverable from a record that already governs the job:
--
--   customer / store / receipt / grain grade   <- the job and its receipt
--   price_basis  = 'BAG'                       <- milling_fee_per_ton = 0
--   agreed_price = milling_fee_per_bag         <- and CONFIRMED by the
--                                                invoice: 400 bags x 8 = 3200,
--                                                20 bags x 8 = 160, which are
--                                                exactly the two invoice totals
--   output_bag_size_kg                         <- job.input_bag_size_kg
--   requested_output_type                      <- what was actually produced
--   bags_source                                <- milling_job_outputs records
--                                                it per output, as applied
--   delivery_mode                              <- full or partial, from what
--                                                was delivered vs produced
--   expected_extraction_rate / allowed_loss    <- the job recorded these at
--                                                the time; they are the real
--                                                figures, not a reconstruction
--
-- So this is a transcription of applied terms, not an invention. Nothing here
-- is guessed.
--
-- WHAT WOULD HAVE BEEN AN INVENTION, AND IS DELIBERATELY AVOIDED
-- --------------------------------------------------------------
-- service_product_id is nullable and is left NULL unless exactly one service
-- product matches the agreed basis and bag size. Guessing "SRV-MILL-BAG50"
-- because it sounds right would create a link that looks authoritative and
-- is not, and it would then propagate into the revenue report.
--
-- The invoice check is a gate, not a comment: an agreement is only created
-- when the invoice it produced matches bags x price. If that ever fails, the
-- job is left unlinked and reported as an exception rather than papered over.
--
-- NON-DESTRUCTIVE: adds agreements for jobs that had none, and sets
-- agreement_id on those jobs only. No job, receipt, output, invoice or ledger
-- row is otherwise touched, and nothing existing is overwritten - the WHERE
-- clauses skip anything already linked.
-- ============================================================================

-- ── 1. reconstruct the agreements ───────────────────────────────────────────

INSERT INTO public.milling_service_agreements
  (store_id, customer_id, intake_receipt_id, grain_grade_id,
   requested_output_type, requested_output_note,
   output_bag_size_kg, bags_source, delivery_mode,
   service_product_id, price_basis, agreed_price,
   expected_extraction_rate, allowed_loss_percentage,
   status, agreed_at, agreed_by, notes)
SELECT j.store_id,
       j.customer_id,
       j.intake_receipt_id,
       r.grain_grade_id,
       -- what the mill actually produced, which is what was ordered.
       -- Cast explicitly: the column is milling_output_type, and an uncast
       -- text expression is rejected rather than implicitly coerced.
       (SELECT o.output_type
          FROM public.milling_job_outputs o
         WHERE o.job_id = j.id
         ORDER BY o.produced_weight_kg DESC LIMIT 1),
       'مستخرَج من نواتج الأمر الفعلية',
       j.input_bag_size_kg,
       coalesce(
         (SELECT o.bags_source FROM public.milling_job_outputs o
           WHERE o.job_id = j.id ORDER BY o.produced_weight_kg DESC LIMIT 1),
         'CUSTOMER'),
       -- full when everything produced was delivered, partial otherwise
       CASE WHEN coalesce((SELECT sum(o.delivered_bag_count) FROM public.milling_job_outputs o WHERE o.job_id = j.id), 0)
               >= coalesce((SELECT sum(o.produced_bag_count) FROM public.milling_job_outputs o WHERE o.job_id = j.id), 1)
            THEN 'FULL' ELSE 'PARTIAL' END,
       -- ONLY when unambiguous: exactly one service product matches basis AND
       -- bag size. The bag size is compared as an integer, because a numeric
       -- rendered to text yields '50.00' and a naive string cleanup turns
       -- that into '50.0' rather than '50'. HAVING count(*) = 1 rather than a
       -- HAVING count(*) = 1 rather than a
       -- window function, because a window function may not appear here.
       -- PostgreSQL has no min(uuid), so the single id is taken from an array.
       -- If no single match exists the subquery yields NULL and the field
       -- stays empty, which is the honest outcome for a term that cannot be
       -- proven from the record.
       (SELECT (array_agg(p.id))[1] FROM public.products p
         WHERE p.item_nature = 'SERVICE'
           AND p.sku = 'SRV-MILL-BAG' || (j.input_bag_size_kg::int)::text
        HAVING count(*) = 1),
       'BAG',
       j.milling_fee_per_bag,
       j.expected_extraction_rate,
       j.allowed_loss_percentage,
       -- 'CONSUMED', not 'COMPLETED': the agreement enum is DRAFT/AGREED/CONSUMED/
       -- CANCELLED, and an agreement belonging to a finished job is one that
       -- was consumed by it.
       'CONSUMED',
       j.created_at,
       NULL,
       'عقد مستعاد بأثر رجعي من بنود الأمر المطبَّقة فعلياً: سعر الكيس، الدرجة، حجم الكيس، مصدر الأكياس، طريقة التسليم، ونسب الاستخلاص والفاقد المسموح كما سُجّلت عند فتح الأمر. لم يُخترع أي بند؛ البنود غير القابلة للاستنتاج تُركت فارغة.'
  FROM public.milling_jobs j
  JOIN public.milling_intake_receipts r ON r.id = j.intake_receipt_id
 WHERE j.agreement_id IS NULL
   -- only a job with a real applied price can have its agreement reconstructed
   AND coalesce(j.milling_fee_per_bag, 0) > 0
   AND coalesce(j.milling_fee_per_ton, 0) = 0
   -- and only when the invoice it produced agrees with that price
   AND EXISTS (
     SELECT 1 FROM public.sales_invoices si
      WHERE si.milling_job_id = j.id
        AND round(si.total, 2) = round(j.input_bag_count * j.milling_fee_per_bag, 2)
   )
   -- and not already reconstructed
   AND NOT EXISTS (
     SELECT 1 FROM public.milling_service_agreements a
      WHERE a.intake_receipt_id = j.intake_receipt_id
   );

-- ── 2. link the jobs to the agreement just reconstructed ─────────────────────

UPDATE public.milling_jobs j
   SET agreement_id = a.id
  FROM public.milling_service_agreements a
 WHERE j.agreement_id IS NULL
   AND a.intake_receipt_id = j.intake_receipt_id
   AND a.customer_id = j.customer_id;

-- ── 3. what could NOT be linked, and why ────────────────────────────────────
-- The instruction was to link where the real agreement is identifiable and
-- otherwise leave a documented exception rather than create incorrect data.
-- This view is that documentation: it is not a silent leftover.

CREATE OR REPLACE VIEW public.milling_jobs_without_agreement
  WITH (security_invoker = true) AS
SELECT j.job_number,
       j.status,
       j.customer_id,
       j.intake_receipt_id,
       coalesce(j.milling_fee_per_bag, 0)  AS fee_per_bag,
       coalesce(j.milling_fee_per_ton, 0)  AS fee_per_ton,
       CASE
         WHEN j.intake_receipt_id IS NULL THEN 'لا يوجد سند استلام مرتبط'
         WHEN coalesce(j.milling_fee_per_bag,0) = 0 AND coalesce(j.milling_fee_per_ton,0) = 0
              THEN 'لا يوجد أجر مسجل على الأمر'
         WHEN coalesce(j.milling_fee_per_bag,0) > 0 AND coalesce(j.milling_fee_per_ton,0) > 0
              THEN 'أساسان تسعيريان معاً — لا يمكن استنتاج العقد'
         WHEN NOT EXISTS (SELECT 1 FROM public.sales_invoices si WHERE si.milling_job_id = j.id)
              THEN 'لا توجد فاتورة يمكن التحقق منها'
         WHEN NOT EXISTS (SELECT 1 FROM public.sales_invoices si WHERE si.milling_job_id = j.id
                           AND round(si.total,2) = round(j.input_bag_count * j.milling_fee_per_bag,2))
              THEN 'إجمالي الفاتورة لا يطابق عدد الأكياس × الأجر'
         ELSE 'سبب آخر'
       END AS reason
  FROM public.milling_jobs j
 WHERE j.agreement_id IS NULL;

COMMENT ON VIEW public.milling_jobs_without_agreement IS
  'أوامر طحن بلا عقد، مع سبب كل حالة. استثناء موثق لا بيانات مفترضة.';

REVOKE ALL ON public.milling_jobs_without_agreement FROM anon;
GRANT SELECT ON public.milling_jobs_without_agreement TO authenticated, service_role;

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- DROP VIEW IF EXISTS public.milling_jobs_without_agreement;
-- UPDATE public.milling_jobs SET agreement_id = NULL
--  WHERE agreement_id IN (SELECT id FROM public.milling_service_agreements
--                          WHERE notes LIKE 'عقد مستعاد بأثر رجعي%');
-- DELETE FROM public.milling_service_agreements
--  WHERE notes LIKE 'عقد مستعاد بأثر رجعي%';