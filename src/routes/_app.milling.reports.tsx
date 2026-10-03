import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ChartColumn, Gauge, Receipt, TriangleAlert, Download, Wallet } from "lucide-react";

import { ModuleGuard } from "@/lib/modules";
import { MILLING_MODULE_ID } from "@/lib/milling";
import {
  fetchEfficiencyReport,
  fetchIntakeHealth,
  fetchPricingDiagnostics,
  type EfficiencyRow,
  type IntakeHealthRow,
  type PricingDiagnosticRow,
} from "@/lib/milling/agreements";
import { PageHeader } from "@/components/page-header";
import {
  MillingPanel,
  MillingSectionTitle,
  MillingTable,
  MillingRow,
  Cell,
  Mono,
  Pill,
  StatTile,
  MillingEmpty,
  QueryErrorGuard,
} from "@/components/milling/milling-ui";

export const Route = createFileRoute("/_app/milling/reports")({
  component: MillingReportsPage,
});

const nf = (v: number | null | undefined, d = 0) =>
  (v ?? 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: d });

const MUTED = "text-muted-foreground";

/**
 * تقرير كفاءة الطحن.
 *
 * المرحلة 4 من خطة المطحنة:первое شاشة للإدارة. تعرض كفاءة الاستخلاص
 * الفعلية مقابل المتوقعة، والفاقد الزائد (مورد النزاع مع العميل)،
 * وصحة ربط السندات بالفحوص، وحالة التسعير.
 */
function MillingReportsPage() {
  const navigate = useNavigate();

  const efficiency = useQuery({
    queryKey: ["milling", "efficiency"],
    queryFn: fetchEfficiencyReport,
  });
  const intakeHealth = useQuery({
    queryKey: ["milling", "intake-health"],
    queryFn: fetchIntakeHealth,
  });
  const pricing = useQuery({
    queryKey: ["milling", "pricing-diagnostics"],
    queryFn: fetchPricingDiagnostics,
  });

  const rows = efficiency.data ?? [];
  const linkedReceipts = (intakeHealth.data ?? []).filter((r) => !r.needs_grade_link).length;
  const orphanReceipts = (intakeHealth.data ?? []).filter((r) => r.needs_grade_link).length;
  const excessJobs = rows.filter((r) => r.loss_status === "EXCEEDS").length;
  const dualBasis = (pricing.data ?? []).filter(
    (p: PricingDiagnosticRow) => p.pricing_health === "DUAL_BASIS_ERROR",
  );

  /*
   * The tiles above are computed from these same arrays. When a query fails
   * they read as zero, so without this guard a broken report renders a wall of
   * confident zeros: "0 orders", "0 invoiced", "no orphans". Silence would
   * have been read as good news.
   */

  const totalInvoiced = rows.reduce((s, r) => s + (r.invoiced_total ?? 0), 0);
  const totalInput = rows.reduce((s, r) => s + r.input_weight_kg, 0);
  const totalLoss = rows.reduce((s, r) => s + r.actual_loss_kg, 0);
  const avgExtraction = totalInput > 0 ? ((totalInput - totalLoss) * 100) / totalInput : 0;

  const exportCsv = () => {
    const head = [
      "job_number",
      "customer",
      "grain_grade",
      "status",
      "input_kg",
      "output_kg",
      "loss_kg",
      "loss_pct",
      "extraction_actual",
      "extraction_expected",
      "invoice",
      "invoice_total",
    ];
    const body = rows.map((r) =>
      [
        r.job_number,
        r.customer_name_ar ?? "",
        r.grain_grade ?? "",
        r.status,
        r.input_weight_kg,
        r.total_output_kg,
        r.actual_loss_kg,
        (100 * r.actual_loss_kg) / (r.input_weight_kg || 1),
        r.actual_extraction_rate,
        r.expected_extraction_rate,
        r.invoice_number ?? "",
        r.invoiced_total ?? "",
      ].join(","),
    );
    // BOM حتى تفتح Excel العربية بشكل صحيح.
    const blob = new Blob(["" + [head.join(","), ...body].join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `milling-efficiency-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <ModuleGuard moduleId={MILLING_MODULE_ID}>
      <PageHeader
        title="تقارير المطحنة"
        subtitle="كفاءة الاستخلاص · الفاقد · صحة بيانات الفحوص والتسعير"
        actions={
          <button
            type="button"
            onClick={exportCsv}
            disabled={!rows.length}
            className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-xl border border-border px-3 text-xs font-bold text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" />
            تصدير CSV
          </button>
        }
      />

      <div className="space-y-4">
        <QueryErrorGuard what="تقارير المطحنة" queries={[efficiency, intakeHealth, pricing]} />

        {/* ── مؤشرات عامة ── */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            icon={<Gauge className="h-4 w-4" />}
            title="متوسط كفاءة الاستخلاص"
            value={`${nf(avgExtraction, 1)}%`}
            tone={avgExtraction >= 78 ? "emerald" : "amber"}
          />
          <StatTile
            icon={<ChartColumn className="h-4 w-4" />}
            title="أوامر تجاوز فاقدها المتعاقد"
            value={nf(excessJobs)}
            tone={excessJobs ? "amber" : "emerald"}
          />
          <StatTile
            icon={<Receipt className="h-4 w-4" />}
            title="إجمالي أجور طُحنت"
            value={nf(totalInvoiced, 2)}
            tone="sky"
          />
          <StatTile
            icon={<Wallet className="h-4 w-4" />}
            title="سندات بلا فحص مرتبط"
            value={nf(orphanReceipts)}
            tone={orphanReceipts ? "amber" : "emerald"}
          />
        </div>

        {/* ── تنبيه تشخيص التسعير ── */}
        {dualBasis.length > 0 && (
          <MillingPanel>
            <div className="flex items-start gap-3 p-4">
              <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
              <div className="space-y-1">
                <p className="text-sm font-bold text-foreground">
                  {dualBasis.length} أمر يحمل أساس تسعيرين (كيس + طن)
                </p>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  هذا يسبّب فاتورة بشطرين لنفس الخدمة. شغّل{" "}
                  <Mono className="font-bold">repair_milling_dual_fee_jobs(true)</Mono> بعد مراجعة
                  السجلات — الأرقام:{" "}
                  {dualBasis.map((d: PricingDiagnosticRow) => d.job_number).join("، ")}
                </p>
              </div>
            </div>
          </MillingPanel>
        )}

        {/* ── كفاءة الاستخلاص ── */}
        <MillingPanel>
          <MillingSectionTitle
            icon={<Gauge className="h-4 w-4" />}
            title="كفاءة الاستخلاص والفاقد"
            subtitle="المقارنة بين الكفاءة الفعلية والمتوقعة لكل أمر"
          />
          {efficiency.isLoading ? (
            <p className="p-6 text-center text-xs text-muted-foreground">جارٍ التحميل…</p>
          ) : rows.length === 0 ? (
            <MillingEmpty
              title="لا توجد أوامر طحن"
              description="ستظهر التقارير بعد أول أمر طحن."
              action={
                <button
                  type="button"
                  onClick={() => navigate({ to: "/milling/jobs" })}
                  className="h-9 cursor-pointer rounded-xl bg-primary px-4 text-xs font-bold text-primary-foreground"
                >
                  فتح شاشة الأوامر
                </button>
              }
            />
          ) : (
            <MillingTable
              minWidth={980}
              headers={[
                "الأمر",
                "العميل",
                "الدرجة",
                "الداخل كجم",
                "الناتج كجم",
                "الفاقد",
                "الكفاءة",
                "الحالة",
                "الفاتورة",
              ]}
            >
              {rows.map((r: EfficiencyRow) => (
                <MillingRow key={r.job_number}>
                  <Cell>
                    <Mono className="font-bold">{r.job_number}</Mono>
                  </Cell>
                  <Cell className={MUTED}>{r.customer_name_ar ?? "—"}</Cell>
                  <Cell className={MUTED}>{r.grain_grade ?? "—"}</Cell>
                  <Cell align="end">
                    <Mono>{nf(r.input_weight_kg)}</Mono>
                  </Cell>
                  <Cell align="end">
                    <Mono>{nf(r.total_output_kg)}</Mono>
                  </Cell>
                  <Cell align="end">
                    <Mono
                      className={
                        r.loss_status === "EXCEEDS" ? "font-bold text-rose-600" : undefined
                      }
                    >
                      {nf(r.actual_loss_kg)}
                    </Mono>
                  </Cell>
                  <Cell>
                    <Pill
                      tone={
                        r.actual_extraction_rate >= r.expected_extraction_rate ? "emerald" : "amber"
                      }
                    >
                      {nf(r.actual_extraction_rate, 1)}% / {nf(r.expected_extraction_rate, 1)}%
                    </Pill>
                  </Cell>
                  <Cell>
                    {r.loss_status === "EXCEEDS" ? (
                      <Pill tone="rose">فاقد زائد</Pill>
                    ) : (
                      <Pill tone="emerald">ضمن المتعاقد</Pill>
                    )}
                  </Cell>
                  <Cell>
                    {r.invoice_number ? (
                      <Mono className="font-bold">{r.invoice_number}</Mono>
                    ) : (
                      <span className="text-muted-foreground">لم تُفوتر</span>
                    )}
                  </Cell>
                </MillingRow>
              ))}
            </MillingTable>
          )}
        </MillingPanel>

        {/* ── صحة السندات ── */}
        <MillingPanel>
          <MillingSectionTitle
            icon={<Receipt className="h-4 w-4" />}
            title="صحة سندات الاستلام"
            subtitle={`${linkedReceipts} سند مرتبط بفحص · ${orphanReceipts} يحتاج ربطاً يدوياً`}
          />
          {(intakeHealth.data ?? []).length === 0 ? (
            <MillingEmpty title="لا توجد سندات" description="ستظهر السندات هنا." />
          ) : (
            <MillingTable
              minWidth={820}
              headers={["رقم السند", "العميل", "النوع", "الوزن الصافي", "فجوة الأكياس", "الرطوبة"]}
            >
              {(intakeHealth.data ?? []).slice(0, 50).map((r) => {
                return (
                  <MillingRow key={r.id}>
                    <Cell>
                      <Mono className="font-bold">{r.receipt_number}</Mono>
                    </Cell>
                    <Cell className={MUTED}>{r.customer_name_ar ?? "—"}</Cell>
                    <Cell>
                      {r.needs_grade_link ? (
                        <Pill tone="rose">يحتاج ربط فحص</Pill>
                      ) : (
                        <span>{r.grade_name_ar ?? "—"}</span>
                      )}
                    </Cell>
                    <Cell align="end">
                      <Mono>{nf(r.net_weight_kg)}</Mono>
                    </Cell>
                    <Cell align="end">
                      <Mono
                        className={
                          Math.abs(r.bag_weight_gap_kg) >= 1
                            ? "font-bold text-amber-600"
                            : undefined
                        }
                      >
                        {nf(r.bag_weight_gap_kg, 2)}
                      </Mono>
                    </Cell>
                    <Cell>
                      <Pill tone={r.moisture_status === "OK" ? "emerald" : "amber"}>
                        {nf(r.moisture_percentage, 1)}%
                      </Pill>
                    </Cell>
                  </MillingRow>
                );
              })}
            </MillingTable>
          )}
        </MillingPanel>
      </div>
    </ModuleGuard>
  );
}
