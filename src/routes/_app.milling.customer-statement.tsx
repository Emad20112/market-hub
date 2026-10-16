/**
 * /milling/customer-statement — كشف حساب الأمانات (قراءة فقط).
 *
 * تبويبان على views مشتقة من custody_ledger:
 *   «عيني» — المستلم/المسلَّم/المتبقي لكل عميل وصنف (custody_customer_statement).
 *   «مالي» — فواتير الأجور المرتبطة بسطور الأمانة (custody_service_money).
 * + تقرير الفاقد المكتشف (custody_detected_loss) — يُكتشف لا يُدخل (ق2).
 * المرجع: docs/milling/00_خطة_التبسيط_المعتمدة.md §4.1
 */
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { FileText, Scale, Wallet, TriangleAlert, Link2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { ModuleGuard } from "@/lib/modules";
import {
  fetchCustodyStatement,
  fetchCustodyServiceMoney,
  fetchCustomerOpenInvoices,
  fetchUnlinkedMillingEntries,
  fetchDetectedLoss,
  linkCustodyInvoice,
  type UnlinkedMillingEntry,
  type CustodyStatementRow,
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

export const Route = createFileRoute("/_app/milling/customer-statement")({
  head: () => ({ meta: [{ title: "كشف حساب الأمانات — فورتكس ERP" }] }),
  component: CustomerStatementPage,
});

function CustomerStatementPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"physical" | "money">("physical");
  const [search, setSearch] = useState("");
  const [linkingEntry, setLinkingEntry] = useState<{ id: string; customer: string } | null>(null);

  const statement = useQuery({
    queryKey: ["milling", "statement"],
    queryFn: () => fetchCustodyStatement(),
  });

  const money = useQuery({
    queryKey: ["milling", "service-money"],
    queryFn: () => fetchCustodyServiceMoney(),
  });

  const loss = useQuery({
    queryKey: ["milling", "detected-loss"],
    queryFn: fetchDetectedLoss,
  });

  const rows = statement.data ?? [];
  /** تجميع بسيط حسب العميل للعرض. */
  const byCustomer = new Map<string, CustodyStatementRow[]>();
  for (const r of rows) {
    const list = byCustomer.get(r.customer_id) ?? [];
    list.push(r);
    byCustomer.set(r.customer_id, list);
  }
  const filteredCustomers = [...byCustomer.entries()].filter(([, list]) =>
    list.some((r) => (r.customer_name_ar || "").toLowerCase().includes(search.toLowerCase())),
  );

  const moneyRows = (money.data ?? []).filter((m) =>
    (m.customer_name_ar || "").toLowerCase().includes(search.toLowerCase()),
  );

  const lossRows = (loss.data ?? []).filter((l) => l.loss_status === "REVIEW");

  /** فواتير مفتوحة للعميل المختار — لربطها بسطر الأمانة. */
  const openInvoices = useQuery({
    queryKey: ["milling", "open-invoices", linkingEntry?.customer],
    queryFn: () => fetchCustomerOpenInvoices(linkingEntry!.customer),
    enabled: Boolean(linkingEntry?.customer),
  });

  /** سطور طحن بلا فاتورة بعد. */
  const unlinked = useQuery({
    queryKey: ["milling", "unlinked"],
    queryFn: fetchUnlinkedMillingEntries,
    enabled: tab === "money",
  });

  const link = useMutation({
    mutationFn: (invoiceId: string) => linkCustodyInvoice(linkingEntry!.id, invoiceId),
    onSuccess: (res) => {
      if (!res.ok) {
        toast.error(res.message || "تعذر الربط.");
        return;
      }
      toast.success("تم ربط الفاتورة بسطر الأمانة — ستظهر في الكشف المالي.");
      setLinkingEntry(null);
      void qc.invalidateQueries({ queryKey: ["milling"] });
    },
  });

  const customerName = (cid: string) =>
    (statement.data ?? []).find((r) => r.customer_id === cid)?.customer_name_ar || cid.slice(0, 8);

  return (
    <ModuleGuard moduleId="milling_operations">
      <div className="mx-auto max-w-7xl space-y-4 p-4">
        <PageHeader
          title="كشف حساب الأمانات"
          subtitle="كل الأرقام مشتقة من السجل — لا رصيد مخزَّن ولا رقم يتخلف عن الواقع."
        />

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
              <Wallet className="me-1.5 inline h-3.5 w-3.5" /> المالي (أجور الطحن)
            </button>
          </div>
          <MillingInput
            placeholder="بحث باسم العميل…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full sm:w-64"
          />
        </div>

        {statement.isError && <QueryErrorGuard error={statement.error} />}

        {tab === "physical" && (
          <div className="space-y-4">
            {filteredCustomers.length === 0 ? (
              <MillingPanel>
                <div className="p-6">
                  <MillingEmpty
                    title="لا يوجد كشف بعد"
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
                  />
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border/70 text-muted-foreground">
                          <th className="px-4 py-2 text-start font-bold">الصنف</th>
                          <th className="px-3 py-2 text-center font-bold">استُلم (كيس)</th>
                          <th className="px-3 py-2 text-center font-bold">استُلم (كجم)</th>
                          <th className="px-3 py-2 text-center font-bold">صادر (كيس)</th>
                          <th className="px-3 py-2 text-center font-bold">صادر (كجم)</th>
                          <th className="px-3 py-2 text-center font-bold">المتبقي</th>
                        </tr>
                      </thead>
                      <tbody>
                        {list.map((r) => (
                          <tr
                            key={`${r.item_id}-${r.warehouse_id}`}
                            className="border-b border-border/40 last:border-0"
                          >
                            <td className="px-4 py-2 font-bold text-foreground">
                              {r.item_name_ar}
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
                            <td className="px-3 py-2 text-center">
                              <Pill
                                tone={
                                  r.remaining_bags > 0 || r.remaining_kg > 0 ? "amber" : "emerald"
                                }
                              >
                                <span className="tabular-nums">
                                  {fmtNum(r.remaining_bags)} كيس / {fmtNum(r.remaining_kg)} كجم
                                </span>
                              </Pill>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </MillingPanel>
              ))
            )}

            {/* الفاقد المكتشف — تنبيه ولا يمنع */}
            {lossRows.length > 0 && (
              <MillingPanel className="border-amber-500/40">
                <MillingSectionTitle
                  icon={<TriangleAlert className="h-4 w-4" />}
                  title="فاقد مكتشف — للمراجعة"
                  subtitle="الوارد − الناتج المسجّل. لا حقل إدخال للفاقد في النظام — إن ظهر رقم غير معقول راجع الميزان والتسجيل."
                />
                <div className="p-4 space-y-2">
                  {lossRows.map((l) => (
                    <div
                      key={`${l.customer_id}-${l.item_id}-${l.warehouse_id}`}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-amber-500/10 px-3 py-2"
                    >
                      <span className="text-xs font-bold text-foreground">
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

        {tab === "money" && (
          <>
            {/* سطور طحن بلا فاتورة — تُربط هنا */}
            {(unlinked.data ?? []).length > 0 && (
              <MillingPanel>
                <MillingSectionTitle
                  icon={<Link2 className="h-4 w-4" />}
                  title="عمليات طحن بلا فاتورة أجور"
                  subtitle="أصدر الفاتورة من شاشات المبيعات (بند «أجور طحن وتجهيز» سطراً واحداً) ثم اربطها."
                />
                <div className="space-y-2 p-4">
                  {(unlinked.data ?? []).map((u: UnlinkedMillingEntry) => (
                    <div
                      key={u.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/70 bg-surface-2/40 px-3 py-2"
                    >
                      <span className="text-xs font-bold text-foreground">
                        {customerName(u.customer_id)}
                        <Mono className="ms-2">{u.doc_number}</Mono>
                      </span>
                      <button
                        type="button"
                        onClick={() => setLinkingEntry({ id: u.id, customer: u.customer_id })}
                        className="rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-1 text-[11px] font-bold text-amber-700 hover:bg-amber-500/20 dark:text-amber-300"
                      >
                        ربط فاتورة
                      </button>
                    </div>
                  ))}
                </div>
              </MillingPanel>
            )}

            <MillingPanel>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 p-4">
                <div>
                  <h2 className="text-sm font-bold text-foreground">فواتير الأجور</h2>
                  <p className="text-xs text-muted-foreground">
                    فاتورة واحدة بسطر واحد لكل عملية — «أجور طحن وتجهيز». أنشئها من شاشات المبيعات
                    ثم اربطها هنا.
                  </p>
                </div>
              </div>
              <div className="overflow-x-auto">
                {moneyRows.length === 0 ? (
                  <div className="p-6">
                    <MillingEmpty
                      title="لا فواتير أجور بعد"
                      hint="تُربط فاتورة الأجور بسطر الأمانة عند إصدارها من المبيعات."
                    />
                  </div>
                ) : (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border/70 text-muted-foreground">
                        <th className="px-4 py-2 text-start font-bold">العميل</th>
                        <th className="px-3 py-2 text-center font-bold">السند</th>
                        <th className="px-3 py-2 text-center font-bold">الفاتورة</th>
                        <th className="px-3 py-2 text-center font-bold">الإجمالي</th>
                        <th className="px-3 py-2 text-center font-bold">المدفوع</th>
                        <th className="px-3 py-2 text-center font-bold">المتبقي</th>
                      </tr>
                    </thead>
                    <tbody>
                      {moneyRows.map((m) => (
                        <tr
                          key={m.custody_entry_id}
                          className="border-b border-border/40 last:border-0"
                        >
                          <td className="px-4 py-2 font-bold text-foreground">
                            {m.customer_name_ar}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <Mono>{m.doc_number}</Mono>
                          </td>
                          <td className="px-3 py-2 text-center">
                            <Mono>{m.invoice_number}</Mono>
                          </td>
                          <td className="px-3 py-2 text-center tabular-nums">{fmtNum(m.total)}</td>
                          <td className="px-3 py-2 text-center tabular-nums">{fmtNum(m.paid)}</td>
                          <td className="px-3 py-2 text-center">
                            {m.outstanding > 0 ? (
                              <Pill tone="rose">{fmtNum(m.outstanding)}</Pill>
                            ) : (
                              <Pill tone="emerald">مسدد</Pill>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </MillingPanel>

            {/* حوار اختيار الفاتورة للربط */}
            {linkingEntry && (
              <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
                <div className="w-full max-w-md rounded-2xl border border-border bg-surface-1 p-5 shadow-xl">
                  <h3 className="text-sm font-bold text-foreground">ربط فاتورة بسطر الأمانة</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    اختر فاتورة مبيعات مؤكدة غير مسددة للعميل «{customerName(linkingEntry.customer)}
                    ».
                  </p>
                  <div className="mt-3 max-h-64 space-y-1.5 overflow-y-auto">
                    {(openInvoices.data ?? []).length === 0 ? (
                      <MillingEmpty
                        title="لا فواتير مفتوحة لهذا العميل"
                        hint="أصدر فاتورة الأجور أولاً من شاشات المبيعات."
                      />
                    ) : (
                      (openInvoices.data ?? []).map((inv) => (
                        <button
                          key={inv.id}
                          type="button"
                          disabled={link.isPending}
                          onClick={() => link.mutate(inv.id)}
                          className="flex w-full items-center justify-between rounded-xl border border-border/70 bg-surface-2/40 px-3 py-2 text-start text-xs hover:bg-muted/60 disabled:opacity-50"
                        >
                          <Mono>{inv.invoice_number}</Mono>
                          <span className="flex items-center gap-2">
                            <span className="tabular-nums">{fmtNum(inv.total)}</span>
                            <Pill tone="sky">متبقٍ {fmtNum(inv.total - inv.paid)}</Pill>
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                  <div className="mt-4 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setLinkingEntry(null)}
                      className="rounded-xl border border-border px-4 py-2 text-xs font-bold text-foreground hover:bg-muted"
                    >
                      إلغاء
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </ModuleGuard>
  );
}
