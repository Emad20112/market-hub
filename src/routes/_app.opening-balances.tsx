import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { BookOpen, CheckCircle2, Scale, TriangleAlert, Undo2 } from "lucide-react";

import { ModuleGuard } from "@/lib/modules";
import {
  OPENING_SECTIONS,
  createOpeningDocument,
  fetchCustomers,
  fetchOpeningDocuments,
  fetchOpeningLines,
  fetchStockableItems,
  fetchSuppliers,
  fetchWarehouses,
  postOpeningDocument,
  reverseOpeningDocument,
  yer,
  type OpeningLineDraft,
  type OpeningSection,
  type OpeningSummary,
} from "@/lib/opening-balances";
import { PageHeader } from "@/components/page-header";
import {
  Cell,
  MillingEmpty,
  MillingPanel,
  MillingRow,
  MillingSectionTitle,
  MillingTable,
  Mono,
  Pill,
  QueryErrorGuard,
  StatTile,
} from "@/components/milling/milling-ui";

export const Route = createFileRoute("/_app/opening-balances")({
  component: OpeningBalancesPage,
});

/*
 * قيد الافتتاح ليس قائمة إدخال، بل عملية موازنة.
 *
 * لذلك الشاشة مبنية حول الفرق: مجموع المدين مقابل مجموع الدائن. أي رقم
 * يُكتب هنا يصبح جزءاً من تقييم كل صنف لاحق، لذلك لا يُرحَّل القيد إلا
 * إذا توازن — والملخص يعرض الفرق ورأس المال المطلوب قبل الترحيل لا بعده.
 */
function OpeningBalancesPage() {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<OpeningLineDraft[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [section, setSection] = useState<OpeningSection>("STOCK");
  const [amount, setAmount] = useState("");
  const [qty, setQty] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [refId, setRefId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().slice(0, 10));

  const documents = useQuery({
    queryKey: ["opening", "documents"],
    queryFn: fetchOpeningDocuments,
  });
  const items = useQuery({ queryKey: ["opening", "items"], queryFn: fetchStockableItems });
  const customers = useQuery({ queryKey: ["opening", "customers"], queryFn: fetchCustomers });
  const suppliers = useQuery({ queryKey: ["opening", "suppliers"], queryFn: fetchSuppliers });
  const warehouses = useQuery({ queryKey: ["opening", "warehouses"], queryFn: fetchWarehouses });

  const lines = useQuery({
    queryKey: ["opening", "lines", selectedId],
    queryFn: () => fetchOpeningLines(selectedId!),
    enabled: Boolean(selectedId),
  });

  const selected = documents.data?.find((d) => d.id === selectedId) ?? null;
  const meta = OPENING_SECTIONS.find((s) => s.value === section)!;

  const draftTotals = useMemo(() => {
    // The server derives debit/credit from the section; the client mirrors it
    // only so the operator can see the balance move as they type.
    const debitSections: OpeningSection[] = ["STOCK", "RECEIVABLE", "CASH", "BANK", "ASSET"];
    const debit = draft
      .filter((l) => debitSections.includes(l.section))
      .reduce((s, l) => s + l.amount, 0);
    const credit = draft
      .filter((l) => !debitSections.includes(l.section))
      .reduce((s, l) => s + l.amount, 0);
    return { debit, credit, diff: debit - credit };
  }, [draft]);

  const run = <TData, TVars>(fn: (v: TVars) => Promise<TData>, okMessage: string) => ({
    mutationFn: fn,
    onSuccess: () => {
      setError(null);
      setNotice(okMessage);
      void qc.invalidateQueries({ queryKey: ["opening"] });
    },
    onError: (e: Error) => {
      setNotice(null);
      setError(e.message);
    },
  });

  const save = useMutation(
    run<string, void>(async () => {
      if (draft.length === 0) throw new Error("أضف بنداً واحداً على الأقل");
      return createOpeningDocument({ effectiveDate, lines: draft });
    }, "تم إنشاء مسودة القيد الافتتاحي"),
  );

  const post = useMutation(
    run<void, string>(async (id) => postOpeningDocument(id), "تم ترحيل القيد الافتتاحي"),
  );

  const reverse = useMutation(
    run<void, { id: string; reason: string }>(
      async (v) => reverseOpeningDocument(v.id, v.reason),
      "تم عكس القيد الافتتاحي",
    ),
  );

  const addLine = () => {
    const value = Number(amount);
    if (!value || value <= 0) {
      setError("المبلغ يجب أن يكون أكبر من صفر");
      return;
    }
    if (meta.needsRef === "item" && (!refId || !warehouseId)) {
      setError("بند المخزون يحتاج صنفاً ومستودعاً");
      return;
    }
    if (meta.needsRef === "customer" && !refId) {
      setError("بند ذمم العملاء يحتاج عميلاً");
      return;
    }
    if (meta.needsRef === "supplier" && !refId) {
      setError("بند ذمم الموردين يحتاج مورداً");
      return;
    }
    const q = Number(qty);
    const uc = Number(unitCost);
    setDraft((d) => [
      ...d,
      {
        section,
        description: meta.label,
        amount: value,
        quantity: meta.needsQty ? q || null : null,
        unit_cost: meta.needsQty ? uc || null : null,
        product_id: meta.needsRef === "item" ? refId : null,
        warehouse_id: meta.needsRef === "item" ? warehouseId : null,
        customer_id: meta.needsRef === "customer" ? refId : null,
        supplier_id: meta.needsRef === "supplier" ? refId : null,
      },
    ]);
    setError(null);
    setAmount("");
    setQty("");
    setUnitCost("");
    setRefId("");
  };

  return (
    <ModuleGuard moduleId="accounting">
      <PageHeader
        title="الأرصدة الافتتاحية"
        subtitle="قيد افتتاحي واحد يتوازن: مخزون · ذمم · موردون · نقدية · بنوك · أصول · التزامات · رأس مال"
      />

      <div className="space-y-4">
        <QueryErrorGuard
          what="الأرصدة الافتتاحية"
          queries={[documents, items, customers, suppliers, warehouses]}
        />

        {/* ── المسودة: التوازن أولاً ── */}
        <MillingPanel>
          <MillingSectionTitle
            icon={<BookOpen className="h-4 w-4" />}
            title="قيد افتتاحي جديد"
            subtitle="لا يُرحَّل إلا إذا توازن مجموع المدين مع الدائن"
          />

          <div className="grid gap-3 border-b border-border p-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-xs font-bold">
              تاريخ السريان
              <input
                type="date"
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-border bg-background px-2 py-1.5"
              />
            </label>
            <label className="text-xs font-bold">
              القسم
              <select
                value={section}
                onChange={(e) => setSection(e.target.value as OpeningSection)}
                className="mt-1 block w-full rounded-lg border border-border bg-background px-2 py-1.5"
              >
                {OPENING_SECTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <p className="self-end pb-1 text-[11px] leading-relaxed text-muted-foreground sm:col-span-2">
              {meta.hint}
            </p>

            {meta.needsRef && (
              <label className="text-xs font-bold">
                {meta.needsRef === "item"
                  ? "الصنف"
                  : meta.needsRef === "customer"
                    ? "العميل"
                    : "المورد"}
                <select
                  value={refId}
                  onChange={(e) => setRefId(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-border bg-background px-2 py-1.5"
                >
                  <option value="">— اختر —</option>
                  {meta.needsRef === "item"
                    ? (items.data ?? []).map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.sku} · {i.name_ar ?? ""}
                        </option>
                      ))
                    : meta.needsRef === "customer"
                      ? (customers.data ?? []).map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))
                      : (suppliers.data ?? []).map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                </select>
              </label>
            )}

            {meta.needsRef === "item" && (
              <label className="text-xs font-bold">
                المستودع
                <select
                  value={warehouseId}
                  onChange={(e) => setWarehouseId(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-border bg-background px-2 py-1.5"
                >
                  <option value="">— اختر —</option>
                  {(warehouses.data ?? []).map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name_ar ?? w.id}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {meta.needsQty && (
              <>
                <label className="text-xs font-bold">
                  الكمية
                  <input
                    type="number"
                    value={qty}
                    onChange={(e) => setQty(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-border bg-background px-2 py-1.5"
                  />
                </label>
                <label className="text-xs font-bold">
                  تكلفة الوحدة
                  <input
                    type="number"
                    value={unitCost}
                    onChange={(e) => setUnitCost(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-border bg-background px-2 py-1.5"
                  />
                </label>
              </>
            )}

            <label className="text-xs font-bold">
              المبلغ ر.ي
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-border bg-background px-2 py-1.5"
              />
            </label>
            <button
              type="button"
              onClick={addLine}
              className="self-end h-9 cursor-pointer rounded-xl border border-border text-xs font-bold hover:bg-muted"
            >
              إضافة بند
            </button>
          </div>

          {draft.length > 0 && (
            <div className="p-4">
              <MillingTable minWidth={520} headers={["القسم", "البيان", "المبلغ"]}>
                {draft.map((l, i) => (
                  <MillingRow key={i}>
                    <Cell>
                      <Pill
                        tone={
                          ["STOCK", "RECEIVABLE", "CASH", "BANK", "ASSET"].includes(l.section)
                            ? "emerald"
                            : "rose"
                        }
                      >
                        {OPENING_SECTIONS.find((s) => s.value === l.section)?.label}
                      </Pill>
                    </Cell>
                    <Cell className="text-muted-foreground">
                      {l.quantity ? `${l.quantity} × ${l.unit_cost} — ` : ""}
                      {l.description}
                    </Cell>
                    <Cell align="end">
                      <Mono>{yer(l.amount)}</Mono>
                    </Cell>
                  </MillingRow>
                ))}
              </MillingTable>

              <div className="mt-3 grid gap-2 rounded-xl border border-border p-3 sm:grid-cols-4">
                <div>
                  <span className="text-[11px] text-muted-foreground">مدين</span>
                  <Mono className="block font-bold">{yer(draftTotals.debit)}</Mono>
                </div>
                <div>
                  <span className="text-[11px] text-muted-foreground">دائن</span>
                  <Mono className="block font-bold">{yer(draftTotals.credit)}</Mono>
                </div>
                <div>
                  <span className="text-[11px] text-muted-foreground">الفرق</span>
                  <Mono
                    className={`block font-bold ${draftTotals.diff === 0 ? "text-emerald-600" : "text-rose-600"}`}
                  >
                    {yer(draftTotals.diff)}
                  </Mono>
                </div>
                <button
                  type="button"
                  onClick={() => save.mutate(undefined)}
                  disabled={save.isPending}
                  className="self-center h-9 cursor-pointer rounded-xl bg-primary px-3 text-xs font-bold text-primary-foreground disabled:opacity-50"
                >
                  حفظ كمسودة
                </button>
              </div>
            </div>
          )}
        </MillingPanel>

        {error && (
          <MillingPanel>
            <div className="flex items-start gap-3 p-4">
              <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-rose-500" />
              <p className="text-xs leading-relaxed">{error}</p>
            </div>
          </MillingPanel>
        )}
        {notice && !error && (
          <MillingPanel>
            <p className="flex items-center gap-2 p-4 text-xs font-bold text-emerald-600">
              <CheckCircle2 className="h-4 w-4" /> {notice}
            </p>
          </MillingPanel>
        )}

        {/* ── المستندات ── */}
        <MillingPanel>
          <MillingSectionTitle
            icon={<Scale className="h-4 w-4" />}
            title="قيود الأرصدة الافتتاحية"
            subtitle="القيد غير المتوازن يظهر قبل ترحيله لا بعده"
          />
          {documents.isLoading ? (
            <p className="p-6 text-center text-xs text-muted-foreground">جارٍ التحميل…</p>
          ) : !documents.data?.length ? (
            <MillingEmpty
              title="لا توجد أرصدة افتتاحية"
              description="أنشئ قيدك الأول من النموذج أعلاه."
            />
          ) : (
            <MillingTable
              minWidth={900}
              headers={["الرقم", "التاريخ", "الحالة", "مدين", "دائن", "التوازن", ""]}
            >
              {documents.data.map((d: OpeningSummary) => (
                <MillingRow
                  key={d.id}
                  onClick={() => setSelectedId(d.id)}
                  className={d.id === selectedId ? "bg-muted/60" : undefined}
                >
                  <Cell>
                    <Mono className="font-bold">{d.document_number}</Mono>
                  </Cell>
                  <Cell className="text-muted-foreground">{d.effective_date}</Cell>
                  <Cell>
                    <Pill
                      tone={
                        d.status === "POSTED"
                          ? "emerald"
                          : d.status === "REVERSED"
                            ? "rose"
                            : "amber"
                      }
                    >
                      {d.status === "POSTED"
                        ? "مرحَّل"
                        : d.status === "REVERSED"
                          ? "معكوس"
                          : "مسودة"}
                    </Pill>
                  </Cell>
                  <Cell align="end">
                    <Mono>{yer(d.total_debits)}</Mono>
                  </Cell>
                  <Cell align="end">
                    <Mono>{yer(d.total_credits)}</Mono>
                  </Cell>
                  <Cell>
                    {d.status === "DRAFT" ? (
                      <Pill tone={d.is_balanced ? "emerald" : "rose"}>
                        {d.is_balanced ? "متوازن" : `ناقص ${yer(d.capital_required_now)}`}
                      </Pill>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </Cell>
                  <Cell>
                    {d.status === "DRAFT" && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          post.mutate(d.id);
                        }}
                        disabled={!d.is_balanced || post.isPending}
                        title={d.is_balanced ? "ترحيل" : "القيد غير متوازن"}
                        className="h-8 cursor-pointer rounded-lg border border-border px-2 text-[11px] font-bold hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        ترحيل
                      </button>
                    )}
                    {d.status === "POSTED" && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const reason = window.prompt("سبب عكس القيد الافتتاحي؟");
                          if (reason && reason.trim()) reverse.mutate({ id: d.id, reason });
                        }}
                        className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-lg border border-border px-2 text-[11px] font-bold hover:bg-muted"
                      >
                        <Undo2 className="h-3 w-3" /> عكس
                      </button>
                    )}
                  </Cell>
                </MillingRow>
              ))}
            </MillingTable>
          )}
        </MillingPanel>

        {/* ── بنود المستند المختار ── */}
        {selected && (
          <MillingPanel>
            <MillingSectionTitle
              icon={<BookOpen className="h-4 w-4" />}
              title={`بنود ${selected.document_number}`}
              subtitle="الجهة (مدين/دائن) تُشتق من القسم ولا تُختار يدوياً"
            />
            {lines.isLoading ? (
              <p className="p-6 text-center text-xs text-muted-foreground">جارٍ التحميل…</p>
            ) : lines.isError ? (
              <p className="p-6 text-center text-xs font-bold text-rose-600">
                تعذّر تحميل البنود: {(lines.error as Error).message}
              </p>
            ) : !lines.data?.length ? (
              <MillingEmpty title="لا بنود" description="هذا القيد فارغ." />
            ) : (
              <MillingTable minWidth={600} headers={["القسم", "الجهة", "البيان", "المبلغ"]}>
                {lines.data.map((l) => (
                  <MillingRow key={l.id}>
                    <Cell>
                      <Pill tone={l.side === "DEBIT" ? "emerald" : "rose"}>
                        {l.side === "DEBIT" ? "مدين" : "دائن"}
                      </Pill>
                    </Cell>
                    <Cell className="text-muted-foreground">
                      {OPENING_SECTIONS.find((s) => s.value === l.section)?.label ?? l.section}
                    </Cell>
                    <Cell>{l.description}</Cell>
                    <Cell align="end">
                      <Mono className="font-bold">{yer(l.amount)}</Mono>
                    </Cell>
                  </MillingRow>
                ))}
              </MillingTable>
            )}
          </MillingPanel>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          <StatTile title="مستندات" value={documents.data?.length ?? 0} tone="sky" />
          <StatTile
            title="مرحَّلة"
            value={(documents.data ?? []).filter((d) => d.status === "POSTED").length}
            tone="emerald"
          />
          <StatTile
            title="غير متوازنة"
            value={
              (documents.data ?? []).filter((d) => d.status === "DRAFT" && !d.is_balanced).length
            }
            tone="amber"
          />
        </div>
      </div>
    </ModuleGuard>
  );
}
