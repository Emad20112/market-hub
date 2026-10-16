/**
 * /milling/customer-statement — كشف حساب الأمانات (قراءة فقط).
 *
 * تبويبان على views مشتقة من custody_ledger:
 *   «عيني» — المستلم/المسلَّم/المتبقي لكل عميل وصنف (custody_customer_statement).
 *   «مالي» — فواتير الأجور المرتبطة برأس المستند الموحد وسطور الأمانة (custody_service_money).
 * + تقرير الفاقد المكتشف (custody_detected_loss) — يُكتشف لا يُدخل (ق2).
 *
 * يدعم:
 *   - التصفية الصريحة للعميل عند التمرير من تفاصيل العميل (?customerId=)
 *   - روابط مباشرة من الفاتورة إلى مستند المطحنة ومن المستند إلى الفاتورة.
 *   - مشاركة كشف العميل عبر نظام المشاركة والواتساب الموحد.
 * المرجع: docs/milling/07_تدقيق_ما_قبل_التسليم_والفجوات.md
 */
import { createFileRoute, Link, useSearch, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  FileText,
  Scale,
  Wallet,
  TriangleAlert,
  Receipt,
  Share2,
  ExternalLink,
  ArrowUpRight,
  X,
  UserCheck,
  Printer,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { ModuleGuard } from "@/lib/modules";
import {
  fetchCustodyStatement,
  fetchCustodyServiceMoney,
  fetchDetectedLoss,
  fetchMillingDocumentDetails,
  buildMillingDocumentUnifiedDoc,
  type CustodyStatementRow,
  type CustodyMoneyRow,
} from "@/lib/milling";
import {
  MillingPanel,
  MillingSectionTitle,
  MillingInput,
  MillingEmpty,
  Pill,
  Mono,
  QueryErrorGuard,
  fmtNum,
} from "@/components/milling/milling-ui";
import { DocumentShareDialog } from "@/components/communication/document-share-dialog";
import { UniversalPrintPreview } from "@/components/universal-print-preview";
import type { PrintRequest } from "@/lib/printing";

export const Route = createFileRoute("/_app/milling/customer-statement")({
  validateSearch: (search: Record<string, unknown>): { customerId?: string } => ({
    customerId: typeof search.customerId === "string" ? search.customerId : undefined,
  }),
  head: () => ({ meta: [{ title: "كشف حساب الأمانات — فورتكس ERP" }] }),
  component: CustomerStatementPage,
});

function CustomerStatementPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<"physical" | "money">("physical");
  const [search, setSearch] = useState("");
  /** العميل المُمرَّر من رابط خارجي (مثلاً من تفاصيل العميل) — يُصفّى الكشف عليه حصراً. */
  const { customerId: preselectedCustomerId } = useSearch({
    from: "/_app/milling/customer-statement",
  });

  // حالة نافذة المشاركة والواتساب
  const [shareCustomer, setShareCustomer] = useState<{
    id: string;
    name: string;
    summaryText: string;
    balance: number;
  } | null>(null);

  // حالة الطباعة المباشرة وإعادة طباعة السندات
  const [printRequest, setPrintRequest] = useState<PrintRequest | null>(null);
  const [printingDocId, setPrintingDocId] = useState<string | null>(null);

  const handlePrintDoc = async (docId: string) => {
    try {
      setPrintingDocId(docId);
      const details = await fetchMillingDocumentDetails(docId);
      if (!details) {
        toast.error("تعذر جلب تفاصيل مستند المطحنة للطباعة.");
        return;
      }
      const stage =
        details.status === "DELIVERED"
          ? "delivery"
          : details.status === "PROCESSED"
            ? "milled"
            : "intake";
      const docData = buildMillingDocumentUnifiedDoc(details, stage);
      setPrintRequest({
        documentType: "mill_document",
        doc: docData,
      });
    } catch (err: any) {
      toast.error(err?.message || "خطأ أثناء تجهيز الطباعة");
    } finally {
      setPrintingDocId(null);
    }
  };

  const statement = useQuery({
    queryKey: ["milling", "statement", preselectedCustomerId],
    queryFn: () => fetchCustodyStatement(preselectedCustomerId),
  });

  const money = useQuery({
    queryKey: ["milling", "service-money", preselectedCustomerId],
    queryFn: () => fetchCustodyServiceMoney(preselectedCustomerId),
  });

  const loss = useQuery({
    queryKey: ["milling", "detected-loss"],
    queryFn: fetchDetectedLoss,
  });

  const rows = statement.data ?? [];
  /** تجميع حسب العميل للعرض. */
  const byCustomer = new Map<string, CustodyStatementRow[]>();
  for (const r of rows) {
    const list = byCustomer.get(r.customer_id) ?? [];
    list.push(r);
    byCustomer.set(r.customer_id, list);
  }

  const term = search.trim().toLowerCase();
  const filteredCustomers = [...byCustomer.entries()].filter(([, list]) =>
    term === "" ? true : list.some((r) => (r.customer_name_ar || "").toLowerCase().includes(term)),
  );

  const moneyRows = (money.data ?? []).filter((m) =>
    term === ""
      ? true
      : (m.customer_name_ar || "").toLowerCase().includes(term) ||
        (m.doc_number || "").toLowerCase().includes(term) ||
        (m.invoice_number || "").toLowerCase().includes(term),
  );

  const lossRows = (loss.data ?? []).filter((l) => {
    if (preselectedCustomerId && l.customer_id !== preselectedCustomerId) return false;
    return l.loss_status === "REVIEW";
  });

  const activeCustomerName =
    rows[0]?.customer_name_ar || money.data?.[0]?.customer_name_ar || "العميل المحدد";

  const clearFilter = () => {
    navigate({ to: "/milling/customer-statement", search: {} });
  };

  const handleShareStatement = (custId: string, custName: string, items: CustodyStatementRow[]) => {
    const totalRemainingKg = items.reduce((acc, i) => acc + Number(i.remaining_kg || 0), 0);
    const totalRemainingBags = items.reduce((acc, i) => acc + Number(i.remaining_bags || 0), 0);
    const relatedMoney = (money.data ?? []).filter((m) => m.customer_id === custId);
    const totalOutstanding = relatedMoney.reduce((acc, m) => acc + Number(m.outstanding || 0), 0);

    setShareCustomer({
      id: custId,
      name: custName,
      summaryText: `كشف أمانات: رصيد متبقي ${totalRemainingBags} كيس (${totalRemainingKg} كجم). ذمة أجور متبقية: ${totalOutstanding} ر.ي`,
      balance: totalOutstanding,
    });
  };

  return (
    <ModuleGuard moduleId="milling_operations">
      <div className="mx-auto max-w-7xl space-y-4 p-4">
        <PageHeader
          title="كشف حساب الأمانات"
          subtitle="كل الأرقام مشتقة من السجل — لا رصيد مخزَّن ولا رقم يتخلف عن الواقع."
        />

        {/* شارة التصفية النشطة عند الدخول من تفاصيل العميل */}
        {preselectedCustomerId && (
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-primary/30 bg-primary/10 px-4 py-2.5 text-xs text-primary">
            <div className="flex items-center gap-2 font-bold">
              <UserCheck className="h-4 w-4" />
              <span>كشف خاص بالعميل: {activeCustomerName}</span>
            </div>
            <button
              type="button"
              onClick={clearFilter}
              className="inline-flex items-center gap-1 rounded-lg bg-background px-2.5 py-1 text-xs font-semibold text-foreground shadow-xs hover:bg-muted"
            >
              <X className="h-3 w-3" />
              إلغاء التصفية وعرض كل العملاء
            </button>
          </div>
        )}

        {/* التبويبات + البحث */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex rounded-xl bg-muted p-1 border border-border">
            <button
              type="button"
              onClick={() => setTab("physical")}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                tab === "physical" ? "bg-amber-500 text-white shadow-xs" : "text-muted-foreground"
              }`}
            >
              <Scale className="me-1.5 inline h-3.5 w-3.5" /> العيني (أكياس وكجم)
            </button>
            <button
              type="button"
              onClick={() => setTab("money")}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                tab === "money" ? "bg-amber-500 text-white shadow-xs" : "text-muted-foreground"
              }`}
            >
              <Wallet className="me-1.5 inline h-3.5 w-3.5" /> المالي (فواتير أجور الطحن)
            </button>
          </div>
          <MillingInput
            placeholder="بحث باسم العميل، رقم المستند، الفاتورة…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full sm:w-72"
          />
        </div>

        {statement.isError && <QueryErrorGuard error={statement.error} />}

        {/* التبويب العيني */}
        {tab === "physical" && (
          <div className="space-y-4">
            {filteredCustomers.length === 0 ? (
              <MillingPanel>
                <div className="p-6">
                  <MillingEmpty
                    title="لا يوجد كشف أمانات عينية بعد"
                    hint="أول استلام أو طحن سيظهر هنا مباشرة."
                  />
                </div>
              </MillingPanel>
            ) : (
              filteredCustomers.map(([customerId, list]) => (
                <MillingPanel key={customerId}>
                  <MillingSectionTitle
                    icon={<FileText className="h-4 w-4" />}
                    title={list[0].customer_name_ar || "عميل"}
                    subtitle={`المخزن: ${list[0].warehouse_name_ar || "—"}`}
                    action={
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            handleShareStatement(
                              customerId,
                              list[0].customer_name_ar || "العميل",
                              list,
                            )
                          }
                          className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-300 transition hover:bg-emerald-500/20"
                        >
                          <Share2 className="h-3.5 w-3.5" />
                          واتساب ومشاركة
                        </button>
                        <Link
                          to="/milling/intake"
                          className="inline-flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-3 py-1.5 text-[11px] font-bold text-primary transition hover:bg-primary/20"
                        >
                          <Receipt className="h-3.5 w-3.5" />
                          مستند طحن جديد
                        </Link>
                      </div>
                    }
                  />
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border/70 text-muted-foreground">
                          <th className="px-4 py-2 text-start font-bold">الصنف</th>
                          <th className="px-3 py-2 text-center font-bold">الوارد (أكياس)</th>
                          <th className="px-3 py-2 text-center font-bold">الوارد (كجم)</th>
                          <th className="px-3 py-2 text-center font-bold">المنصرف (أكياس)</th>
                          <th className="px-3 py-2 text-center font-bold">المنصرف (كجم)</th>
                          <th className="px-3 py-2 text-center font-bold">المتبقي (أكياس)</th>
                          <th className="px-3 py-2 text-center font-bold">المتبقي (كجم)</th>
                          <th className="px-4 py-2 text-end font-bold">آخر حركة</th>
                        </tr>
                      </thead>
                      <tbody>
                        {list.map((r) => (
                          <tr
                            key={`${r.customer_id}-${r.item_id}`}
                            className="border-b border-border/40 last:border-0"
                          >
                            <td className="px-4 py-2 font-bold text-foreground">
                              {r.item_name_ar}
                              <span className="ms-1.5 text-[10px] text-muted-foreground font-mono">
                                ({r.sku})
                              </span>
                            </td>
                            <td className="px-3 py-2 text-center tabular-nums">
                              {fmtNum(r.received_bags)}
                            </td>
                            <td className="px-3 py-2 text-center tabular-nums">
                              {fmtNum(r.received_kg)}
                            </td>
                            <td className="px-3 py-2 text-center tabular-nums">
                              {fmtNum(r.issued_bags)}
                            </td>
                            <td className="px-3 py-2 text-center tabular-nums">
                              {fmtNum(r.issued_kg)}
                            </td>
                            <td className="px-3 py-2 text-center font-bold">
                              {r.remaining_bags > 0 ? (
                                <Pill tone="amber">{fmtNum(r.remaining_bags)}</Pill>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td className="px-3 py-2 text-center font-bold">
                              {r.remaining_kg > 0 ? (
                                <Pill tone="emerald">{fmtNum(r.remaining_kg)}</Pill>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td className="px-4 py-2 text-end text-[11px] text-muted-foreground">
                              {r.last_movement_at
                                ? new Date(r.last_movement_at).toLocaleDateString("ar-EG")
                                : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </MillingPanel>
              ))
            )}

            {/* الفاقد المكتشف — تنبيه تشغيلي */}
            {lossRows.length > 0 && (
              <MillingPanel className="border-amber-500/40">
                <MillingSectionTitle
                  icon={<TriangleAlert className="h-4 w-4" />}
                  title="فاقد مكتشف — للمراجعة الرقابية"
                  subtitle="الوارد − الناتج المسجّل لكل عملية طحن مستقلة. لا حقل إدخال للفاقد في النظام."
                />
                <div className="p-4 space-y-2">
                  {lossRows.map((l, idx) => (
                    <div
                      key={idx}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-amber-500/10 px-3 py-2 text-xs"
                    >
                      <span className="font-bold text-foreground">
                        {l.customer_name_ar} — {l.grain_name_ar}
                      </span>
                      <Mono>
                        مطحون {fmtNum(l.milled_kg)} كجم → نواتج {fmtNum(l.produced_kg)} كجم = فاقد{" "}
                        {fmtNum(l.detected_loss_kg)} كجم
                      </Mono>
                    </div>
                  ))}
                </div>
              </MillingPanel>
            )}
          </div>
        )}

        {/* التبويب المالي */}
        {tab === "money" && (
          <MillingPanel>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 p-4">
              <div>
                <h2 className="text-sm font-bold text-foreground">فواتير أجور الطحن الرسمية</h2>
                <p className="text-xs text-muted-foreground">
                  كل فاتورة هنا منشأة ومثبتة في دفتر المبيعات والذمم والتحصيل؛ مع روابط مباشرة
                  لمستند المطحنة.
                </p>
              </div>
            </div>
            <div className="overflow-x-auto">
              {moneyRows.length === 0 ? (
                <div className="p-6">
                  <MillingEmpty
                    title="لا توجد فواتير أجور مسجلة"
                    hint="أنشئ مستند طحن جديداً من استقبال وفواتير الطحن لتظهر فاتورته هنا."
                  />
                </div>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border/70 text-muted-foreground">
                      <th className="px-4 py-2.5 text-start font-bold">العميل</th>
                      <th className="px-3 py-2.5 text-center font-bold">مستند الطحن</th>
                      <th className="px-3 py-2.5 text-center font-bold">فاتورة المبيعات</th>
                      <th className="px-3 py-2.5 text-center font-bold">الإجمالي</th>
                      <th className="px-3 py-2.5 text-center font-bold">المدفوع</th>
                      <th className="px-3 py-2.5 text-center font-bold">المتبقي (الذمة)</th>
                      <th className="px-4 py-2.5 text-end font-bold">الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {moneyRows.map((m) => (
                      <tr
                        key={m.custody_entry_id}
                        className="border-b border-border/40 transition hover:bg-muted/40 last:border-0"
                      >
                        <td className="px-4 py-2.5 font-bold text-foreground">
                          {m.customer_name_ar}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <Link
                            to="/milling/intake"
                            search={{ docId: m.custody_entry_id }}
                            className="inline-flex items-center gap-1 font-bold text-primary hover:underline"
                            title="فتح مستند المطحنة"
                          >
                            <Mono>{m.doc_number}</Mono>
                            <ArrowUpRight className="h-3 w-3" />
                          </Link>
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <Link
                            to="/sales"
                            search={{ customerId: m.customer_id }}
                            className="inline-flex items-center gap-1 font-semibold text-foreground hover:text-primary hover:underline"
                            title="عرض في شاشة المبيعات"
                          >
                            <Mono>#{m.invoice_number}</Mono>
                            <ExternalLink className="h-3 w-3 text-muted-foreground" />
                          </Link>
                        </td>
                        <td className="px-3 py-2.5 text-center tabular-nums font-semibold">
                          {fmtNum(m.total)}
                        </td>
                        <td className="px-3 py-2.5 text-center tabular-nums text-emerald-600 font-semibold">
                          {fmtNum(m.paid)}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          {m.outstanding > 0 ? (
                            <Pill tone="rose">{fmtNum(m.outstanding)}</Pill>
                          ) : (
                            <Pill tone="emerald">مسدد بالكامل</Pill>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-end">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => handlePrintDoc(m.custody_entry_id)}
                              disabled={printingDocId === m.custody_entry_id}
                              className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-2 py-1 text-xs font-semibold text-foreground shadow-xs transition hover:bg-muted disabled:opacity-50"
                              title="طباعة سريعة لمستند الطحن"
                            >
                              <Printer className="h-3 w-3 text-primary" />
                              <span className="hidden sm:inline">
                                {printingDocId === m.custody_entry_id ? "جارٍ التجهيز…" : "طباعة"}
                              </span>
                            </button>
                            <Link
                              to="/milling/intake"
                              search={{ docId: m.custody_entry_id }}
                              className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-2.5 py-1 text-xs font-bold text-foreground shadow-xs hover:bg-muted"
                            >
                              عرض ومتابعة المستند
                            </Link>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </MillingPanel>
        )}

        {/* معاينة الطباعة وإعادة طباعة المستندات */}
        {printRequest && (
          <UniversalPrintPreview
            open={Boolean(printRequest)}
            onOpenChange={(open) => !open && setPrintRequest(null)}
            request={printRequest}
            title="طباعة مستند المطحنة الموحد"
          />
        )}

        {/* نافذة مشاركة كشف العميل */}
        {shareCustomer && (
          <DocumentShareDialog
            open={Boolean(shareCustomer)}
            onClose={() => setShareCustomer(null)}
            title={`مشاركة كشف أمانات العميل: ${shareCustomer.name}`}
            documentType="statement"
            customer={{
              id: shareCustomer.id,
              name: shareCustomer.name,
              balance: shareCustomer.balance,
            }}
            statement={{
              periodLabel: "كشف أمانات الحبوب والنواتج",
              openingBalance: 0,
              totalDebit: shareCustomer.balance,
              totalCredit: 0,
              closingBalance: shareCustomer.balance,
              transactionsCount: 1,
            }}
          />
        )}
      </div>
    </ModuleGuard>
  );
}
