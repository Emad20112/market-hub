import { useModules } from "@/lib/modules";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import {
  Warehouse,
  Search,
  ArrowUpDown,
  AlertTriangle,
  X,
  Plus,
  Minus,
  PackagePlus,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { postOpeningStock, postStockAdjustment } from "@/lib/items";

export const Route = createFileRoute("/_app/inventory")({
  head: () => ({ meta: [{ title: "Inventory — Vortex ERP" }] }),
  component: InventoryPage,
});

/**
 * A stock row as this page needs it.
 *
 * Only TRACKED, company-owned goods appear here. A service has no balance by
 * definition, an UNTRACKED good deliberately has none, and customer-owned
 * material is not company stock — showing any of them as "on hand" is exactly
 * the confusion the item model exists to remove.
 */
type Row = {
  id: string;
  name: string;
  name_ar: string | null;
  sku: string | null;
  byWarehouse: Record<string, number>;
};

/** The shape public.stock_positions returns for one item/warehouse/owner. */
type StockPosition = {
  item_id: string;
  item_name: string;
  item_name_ar: string | null;
  sku: string | null;
  quantity: number;
  warehouse_id: string;
};

/**
 * Minimal typed view of the Supabase client for the two Postgres views this
 * page reads. The generated types do not know about them yet, and widening the
 * global client type for one page would hide real type errors elsewhere.
 */
type PositionQuery = {
  data: unknown;
  error: unknown;
};
type PositionFilter = { order: (column: string) => Promise<PositionQuery> };
type PositionEq = {
  eq: (column: string, value: unknown) => PositionEq | PositionFilter;
} & PositionFilter;
type PositionsTable = {
  select: (columns: string) => { eq: (column: string, value: unknown) => PositionEq };
};
type CustomerOwnedTable = {
  select: (columns: string) => {
    eq: (column: string, value: unknown) => { order: (column: string) => Promise<PositionQuery> };
  };
};

/** Builds a typed handle on the stock_positions view (not in the generated types). */
const positionsTable = () => supabase.from("stock_positions" as never) as unknown as PositionsTable;

function InventoryPage() {
  const { t, lang } = useI18n();
  const { isModuleEnabled } = useModules();
  const qc = useQueryClient();
  const ar = lang === "ar";
  const [query, setQuery] = useState("");
  const [warehouseId, setWarehouseId] = useState<string>("");
  const [adjust, setAdjust] = useState<Row | null>(null);
  const [openingOpen, setOpeningOpen] = useState(false);

  const { data: warehouses } = useQuery({
    queryKey: ["warehouses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warehouses")
        .select("id, name, name_ar, code, is_default")
        .eq("is_active", true)
        .order("is_default", { ascending: false });
      if (error) throw error;
      const list = data ?? [];
      if (list.length && !warehouseId) setWarehouseId(list[0].id);
      return list;
    },
  });

  /**
   * Stock is read from public.stock_positions — the Item + Location + Owner
   * model — filtered to company-owned TRACKED goods. The catalogue table no
   * longer decides what counts as inventory.
   */
  const { data: rows, isLoading } = useQuery({
    queryKey: ["inventory-positions"],
    queryFn: async () => {
      const { data, error } = await positionsTable()
        .select("item_id, item_name, item_name_ar, sku, quantity, warehouse_id")
        .eq("owner_type", "COMPANY")
        .eq("inventory_policy", "TRACKED")
        .order("item_name");

      if (error) throw error;

      // Collapse per-warehouse rows into one row per item, keeping each
      // warehouse's own balance alongside the total.
      const byItem = new Map<string, Row>();
      for (const position of (data ?? []) as StockPosition[]) {
        const existing = byItem.get(position.item_id);
        if (existing) {
          existing.byWarehouse[position.warehouse_id] =
            (existing.byWarehouse[position.warehouse_id] ?? 0) + Number(position.quantity ?? 0);
        } else {
          byItem.set(position.item_id, {
            id: position.item_id,
            name: position.item_name,
            name_ar: position.item_name_ar,
            sku: position.sku,
            byWarehouse: { [position.warehouse_id]: Number(position.quantity ?? 0) },
          });
        }
      }

      return [...byItem.values()];
    },
  });

  // The low-stock threshold lives on the catalogue row and is used only for the
  // warning badge, so it is fetched separately rather than joined into the
  // stock position.
  const { data: minStockByItem } = useQuery({
    queryKey: ["inventory-min-stock"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, min_stock")
        .eq("inventory_policy" as never, "TRACKED" as never);
      if (error) throw error;
      const map: Record<string, number> = {};
      for (const product of data ?? []) {
        map[product.id] = Number(product.min_stock ?? 0);
      }
      return map;
    },
  });

  const filtered = useMemo(() => {
    if (!rows) return [];
    const q = query.trim().toLowerCase();
    return rows.filter(
      (r) =>
        !q ||
        r.name.toLowerCase().includes(q) ||
        (r.name_ar ?? "").includes(q) ||
        (r.sku ?? "").toLowerCase().includes(q),
    );
  }, [rows, query]);

  function qtyFor(r: Row) {
    if (!warehouseId) return Object.values(r.byWarehouse).reduce((sum, value) => sum + value, 0);
    return r.byWarehouse[warehouseId] ?? 0;
  }

  function labelOf(r: Row) {
    return ar ? r.name_ar || r.name : r.name || r.name_ar || "";
  }

  return (
    <>
      <PageHeader title={t("inventory.title")} subtitle={t("inventory.subtitle")} />

      <div className="panel-elevated overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <div className="flex h-9 flex-1 min-w-[200px] items-center gap-2 rounded-md border border-border bg-surface px-3 text-sm">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("inventory.search")}
              className="flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
            />
          </div>
          {isModuleEnabled("multi_warehouse") && (
            <select
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
              className="h-9 rounded-md border border-border bg-surface px-3 text-sm text-foreground outline-none"
            >
              <option value="">{t("inventory.all_warehouses")}</option>
              {(warehouses ?? []).map((w: any) => (
                <option key={w.id} value={w.id}>
                  {lang === "ar" ? w.name_ar || w.name : w.name || w.name_ar}
                </option>
              ))}
            </select>
          )}
          {/*
            Opening stock is its own document, deliberately separate from
            purchasing: it establishes a starting balance rather than recording
            a purchase from a supplier.
          */}
          <button
            onClick={() => setOpeningOpen(true)}
            disabled={!warehouseId}
            title={!warehouseId ? t("inventory.select_warehouse") : undefined}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-surface px-3 text-xs font-medium text-foreground transition hover:border-primary/40 disabled:opacity-40"
          >
            <PackagePlus className="h-3.5 w-3.5" />
            {ar ? "رصيد أول المدة" : "Opening stock"}
          </button>
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {filtered.length} {t("inventory.items")}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2.5 text-start font-medium">{t("products.product")}</th>
                <th className="px-4 py-2.5 text-start font-medium">SKU</th>
                <th className="px-4 py-2.5 text-end font-medium">{t("products.min")}</th>
                <th className="px-4 py-2.5 text-end font-medium">{t("inventory.on_hand")}</th>
                <th className="px-4 py-2.5 text-end font-medium">{t("common.status")}</th>
                <th className="px-4 py-2.5 text-end font-medium">{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {isLoading &&
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b border-border/60">
                    <td colSpan={6} className="px-4 py-3">
                      <div className="h-4 w-full rounded shimmer" />
                    </td>
                  </tr>
                ))}
              {!isLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-16 text-center">
                    <div className="mx-auto grid h-10 w-10 place-items-center rounded-md border border-border bg-surface">
                      <Warehouse className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <p className="mt-3 text-sm text-foreground">{t("inventory.no_inventory")}</p>
                    <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
                      {ar
                        ? "لا يظهر هنا إلا الأصناف المتتبعة المملوكة للشركة. الخدمات والأصناف غير المتتبعة ومواد العملاء لا تُعرض كمخزون."
                        : "Only company-owned tracked items appear here. Services, untracked goods and customer-owned material are not shown as inventory."}
                    </p>
                  </td>
                </tr>
              )}
              {filtered.map((r) => {
                const q = qtyFor(r);
                const minStock = minStockByItem?.[r.id] ?? 0;
                const low = q <= minStock;
                return (
                  <tr
                    key={r.id}
                    className="border-b border-border/60 hover:bg-accent/40 transition-colors"
                  >
                    <td className="px-4 py-2.5 font-medium text-foreground">{labelOf(r)}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                      {r.sku ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 text-end font-mono text-muted-foreground">
                      {minStock}
                    </td>
                    <td className="px-4 py-2.5 text-end font-mono text-foreground">
                      {q.toFixed(2)}
                    </td>
                    <td className="px-4 py-2.5 text-end">
                      {low ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-medium text-warning">
                          <AlertTriangle className="h-3 w-3" /> {t("inventory.low")}
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-medium text-success">
                          {t("inventory.ok")}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-end">
                      <button
                        onClick={() => setAdjust(r)}
                        disabled={!warehouseId}
                        title={
                          !warehouseId
                            ? t("inventory.select_warehouse")
                            : t("inventory.adjust_stock")
                        }
                        className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-surface px-2 text-xs text-muted-foreground hover:text-foreground transition disabled:opacity-40"
                      >
                        <ArrowUpDown className="h-3 w-3" /> {t("inventory.adjust")}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <CustomerOwnedPanel warehouseId={warehouseId} />

      {adjust && warehouseId && (
        <AdjustDialog
          product={adjust}
          warehouseId={warehouseId}
          currentQty={qtyFor(adjust)}
          onClose={() => setAdjust(null)}
          onSaved={() => {
            setAdjust(null);
            qc.invalidateQueries({ queryKey: ["inventory-positions"] });
          }}
        />
      )}

      {openingOpen && warehouseId && (
        <OpeningStockDialog
          warehouseId={warehouseId}
          onClose={() => setOpeningOpen(false)}
          onSaved={() => {
            setOpeningOpen(false);
            qc.invalidateQueries({ queryKey: ["inventory-positions"] });
          }}
        />
      )}
    </>
  );
}

/* ------------------------------------------------------- customer-owned */

/**
 * Material the company holds but does not own.
 *
 * It gets its own panel precisely because it must never be read as company
 * inventory: the quantity is real, the ownership is not ours.
 */
function CustomerOwnedPanel({ warehouseId }: { warehouseId: string }) {
  const { lang } = useI18n();
  const ar = lang === "ar";

  const { data } = useQuery({
    queryKey: ["customer-owned-positions"],
    queryFn: async () => {
      const { data: positions, error } = await positionsTable()
        .select("item_id, item_name, item_name_ar, quantity, owner_id, warehouse_id")
        .eq("owner_type", "CUSTOMER")
        .order("item_name");

      if (error) return [];
      return (positions ?? []) as {
        item_id: string;
        item_name: string;
        item_name_ar: string | null;
        quantity: number;
        owner_id: string | null;
        warehouse_id: string;
      }[];
    },
  });

  const rows = (data ?? []).filter((row) => !warehouseId || row.warehouse_id === warehouseId);
  if (rows.length === 0) return null;

  return (
    <div className="panel-elevated mt-4 overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border bg-surface/60 px-4 py-2.5">
        <Users className="h-3.5 w-3.5 text-muted-foreground" />
        <h3 className="text-xs font-semibold text-foreground">
          {ar
            ? "مواد مملوكة للعملاء (خارج مخزون الشركة)"
            : "Customer-owned material (outside company stock)"}
        </h3>
      </div>
      <table className="w-full text-sm">
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.item_id}-${row.owner_id}`} className="border-b border-border/60">
              <td className="px-4 py-2.5 text-foreground">
                {ar ? row.item_name_ar || row.item_name : row.item_name}
              </td>
              <td className="px-4 py-2.5 text-xs text-muted-foreground">
                {ar ? "العميل" : "Customer"}:{" "}
                <span className="font-mono">{row.owner_id?.slice(0, 8)}</span>
              </td>
              <td className="px-4 py-2.5 text-end font-mono text-foreground">
                {Number(row.quantity).toFixed(2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="px-4 py-2.5 text-[11px] text-muted-foreground">
        {ar
          ? "هذه الكميات في حيازة الشركة لكنها ليست ملكًا لها، لذلك لا تدخل في قيمة مخزون الشركة."
          : "These quantities are held by the company but are not its property, so they are excluded from company inventory valuation."}
      </p>
    </div>
  );
}

/* ------------------------------------------------------- opening dialog */

/**
 * Opening stock: a standing balance, recorded as its own document.
 *
 * Only TRACKED goods are offered, because only they can hold a balance — the
 * database enforces the same rule, so the list and the rule cannot drift.
 */
function OpeningStockDialog({
  warehouseId,
  onClose,
  onSaved,
}: {
  warehouseId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [lines, setLines] = useState<{ productId: string; quantity: string; unitCost: string }[]>([
    { productId: "", quantity: "", unitCost: "" },
  ]);

  const { data: items } = useQuery({
    queryKey: ["tracked-items-for-opening"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, name_ar, sku")
        .eq("inventory_policy" as never, "TRACKED" as never)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  function updateLine(
    index: number,
    patch: Partial<{ productId: string; quantity: string; unitCost: string }>,
  ) {
    setLines((current) =>
      current.map((line, position) => (position === index ? { ...line, ...patch } : line)),
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;

    const valid = lines.filter((line) => line.productId && Number(line.quantity) > 0);
    if (valid.length === 0) {
      toast.error(
        ar
          ? "أضف بندًا واحدًا على الأقل بكمية موجبة"
          : "Add at least one line with a positive quantity",
      );
      return;
    }

    setSaving(true);
    const result = await postOpeningStock({
      warehouseId,
      effectiveDate,
      note: note.trim() || undefined,
      lines: valid.map((line) => ({
        productId: line.productId,
        quantity: Number(line.quantity),
        unitCost: Number(line.unitCost) || 0,
      })),
    });
    setSaving(false);

    if (!result.ok) {
      toast.error(
        result.message ?? (ar ? "فشل ترحيل رصيد أول المدة" : "Failed to post opening stock"),
      );
      return;
    }

    toast.success(ar ? "تم ترحيل رصيد أول المدة" : "Opening stock posted");
    onSaved();
  }

  return (
    <ModalShell
      title={ar ? "رصيد أول المدة" : "Opening stock"}
      subtitle={
        ar
          ? "مستند مستقل عن المشتريات — لا يظهر في تقرير المشتريات."
          : "An independent document — it never appears in the purchase report."
      }
      onClose={onClose}
    >
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {ar ? "التاريخ" : "Date"}
            </span>
            <input
              type="date"
              value={effectiveDate}
              onChange={(event) => setEffectiveDate(event.target.value)}
              className={fieldClass}
              required
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {ar ? "ملاحظة" : "Note"}
            </span>
            <input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              className={fieldClass}
              placeholder={ar ? "مثال: جرد افتتاحي" : "e.g. initial stocktake"}
            />
          </label>
        </div>

        <div className="space-y-2">
          {lines.map((line, index) => (
            <div key={index} className="grid grid-cols-12 gap-2">
              <select
                value={line.productId}
                onChange={(event) => updateLine(index, { productId: event.target.value })}
                className={`${fieldClass} col-span-6`}
              >
                <option value="">{ar ? "اختر الصنف" : "Select item"}</option>
                {(items ?? []).map((item) => (
                  <option key={item.id} value={item.id}>
                    {ar ? item.name_ar || item.name : item.name}
                  </option>
                ))}
              </select>
              <input
                type="number"
                step="0.001"
                min="0"
                value={line.quantity}
                onChange={(event) => updateLine(index, { quantity: event.target.value })}
                placeholder={ar ? "الكمية" : "Qty"}
                className={`${fieldClass} col-span-3`}
              />
              <input
                type="number"
                step="0.01"
                min="0"
                value={line.unitCost}
                onChange={(event) => updateLine(index, { unitCost: event.target.value })}
                placeholder={ar ? "تكلفة الوحدة" : "Unit cost"}
                className={`${fieldClass} col-span-3`}
              />
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() =>
            setLines((current) => [...current, { productId: "", quantity: "", unitCost: "" }])
          }
          className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
        >
          <Plus className="h-3 w-3" /> {ar ? "إضافة بند" : "Add line"}
        </button>

        <p className="rounded-md border border-border bg-surface/60 p-2.5 text-[11px] text-muted-foreground">
          {ar
            ? "تكلفة الوحدة هنا هي قيمة تقييم الرصيد الافتتاحي، وليست سعر شراء من مورد."
            : "The unit cost here values the opening balance; it is not a supplier purchase price."}
        </p>

        <ModalFooter
          onClose={onClose}
          saving={saving}
          submitLabel={ar ? "ترحيل الرصيد" : "Post balance"}
        />
      </form>
    </ModalShell>
  );
}

function AdjustDialog({
  product,
  warehouseId,
  currentQty,
  onClose,
  onSaved,
}: {
  product: Row;
  warehouseId: string;
  currentQty: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t, lang } = useI18n();
  const ar = lang === "ar";
  const [mode, setMode] = useState<"in" | "out">("in");
  const [qty, setQty] = useState("1");
  const [unitCost, setUnitCost] = useState("0");
  const [note, setNote] = useState("");
  // The reason is mandatory and is stored on the movement itself, so every
  // adjustment can be explained later.
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState(false);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const q = Number(qty);
    if (!q || q <= 0) {
      toast.error(t("inventory.qty_required"));
      return;
    }
    if (!reason) {
      setReasonError(true);
      toast.error(t("inventory.reason_required"));
      return;
    }

    const signed = mode === "in" ? q : -q;
    if (currentQty + signed < 0) {
      toast.error(t("inventory.negative"));
      return;
    }

    setSaving(true);
    // Posted as a document through an atomic RPC: the balance, the movement
    // and the reason all move together, or none of them do.
    const result = await postStockAdjustment({
      warehouseId,
      reason,
      note: note.trim() || undefined,
      effectiveDate: new Date().toISOString().slice(0, 10),
      lines: [
        {
          productId: product.id,
          quantity: signed,
          unitCost: Number(unitCost) || 0,
          note: note.trim() || undefined,
        },
      ],
    });
    setSaving(false);

    if (!result.ok) {
      toast.error(result.message ?? t("common.failed"));
      return;
    }

    toast.success(t("inventory.adjusted"));
    onSaved();
  }

  return (
    <ModalShell
      title={t("inventory.adjust_stock")}
      subtitle={`${ar ? product.name_ar || product.name : product.name} · ${t("inventory.on_hand")}: ${currentQty.toFixed(2)}`}
      onClose={onClose}
    >
      <form onSubmit={submit} className="space-y-3">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">{t("inventory.adjust_stock")}</h2>
            <p className="text-[11px] text-muted-foreground">
              {product.name} · {t("inventory.on_hand")}:{" "}
              <span className="font-mono">{currentQty.toFixed(2)}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-accent"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 p-5">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setMode("in")}
              className={`flex h-10 items-center justify-center gap-1.5 rounded-md border text-sm font-medium transition ${mode === "in" ? "border-success/50 bg-success/10 text-success" : "border-border bg-surface text-muted-foreground"}`}
            >
              <Plus className="h-4 w-4" /> {t("inventory.stock_in")}
            </button>
            <button
              type="button"
              onClick={() => setMode("out")}
              className={`flex h-10 items-center justify-center gap-1.5 rounded-md border text-sm font-medium transition ${mode === "out" ? "border-destructive/50 bg-destructive/10 text-destructive" : "border-border bg-surface text-muted-foreground"}`}
            >
              <Minus className="h-4 w-4" /> {t("inventory.stock_out")}
            </button>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {t("common.quantity")}
            </span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              className="h-9 rounded-md border border-border bg-surface px-3 text-sm outline-none"
              required
              autoFocus
            />
          </label>

          {mode === "in" && (
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {t("inventory.unit_cost")}
              </span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={unitCost}
                onChange={(e) => setUnitCost(e.target.value)}
                className="h-9 rounded-md border border-border bg-surface px-3 text-sm outline-none"
              />
            </label>
          )}

          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {t("inventory.reason_label")}
            </span>
            <select
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                if (e.target.value) setReasonError(false);
              }}
              aria-invalid={reasonError}
              className={`h-9 rounded-md border bg-surface px-3 text-sm outline-none ${reasonError ? "border-destructive text-destructive" : "border-border"}`}
            >
              <option value="">{t("inventory.reason_select")}</option>
              <option value="damaged">{t("inventory.reason.damaged")}</option>
              <option value="expiry">{t("inventory.reason.expiry")}</option>
              <option value="shortfall">{t("inventory.reason.shortfall")}</option>
              <option value="surplus">{t("inventory.reason.surplus")}</option>
              <option value="stocktake">{t("inventory.reason.stocktake")}</option>
              <option value="other">{t("inventory.reason.other")}</option>
            </select>
            {reasonError && (
              <span className="text-[11px] font-medium text-destructive">
                {t("inventory.reason_required")}
              </span>
            )}
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {t("common.note")}
            </span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="rounded-md border border-border bg-surface p-3 text-sm outline-none resize-none"
              placeholder={t("inventory.reason")}
            />
          </label>

          <div className="rounded-md border border-border bg-surface/60 p-3 text-xs">
            <div className="flex items-center justify-between text-muted-foreground">
              <span>{t("inventory.new_on_hand")}</span>
              <span className="font-mono text-foreground">
                {(currentQty + (mode === "in" ? Number(qty) : -Number(qty || 0))).toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border bg-surface/40 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 items-center rounded-md border border-border bg-surface px-3 text-xs font-medium text-muted-foreground hover:text-foreground transition"
          >
            {t("common.cancel")}
          </button>
          <button
            type="submit"
            disabled={saving || !reason}
            className="flex h-9 items-center rounded-md bg-primary px-4 text-xs font-medium text-primary-foreground hover:opacity-90 transition disabled:opacity-50"
          >
            {saving ? t("common.saving") : t("inventory.apply")}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
/* ------------------------------------------------------------- ui shells */

const fieldClass =
  "h-9 w-full rounded-md border border-border bg-surface px-3 text-sm outline-none";

/**
 * A plain modal frame. Both inventory documents are forms over the same
 * layout, so the chrome lives in one place.
 */
function ModalShell({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="panel-elevated w-full max-w-lg overflow-hidden"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">{title}</h2>
            {subtitle ? <p className="text-[11px] text-muted-foreground">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-accent"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

function ModalFooter({
  onClose,
  saving,
  submitLabel,
}: {
  onClose: () => void;
  saving: boolean;
  submitLabel: string;
}) {
  const { t } = useI18n();
  return (
    <div className="flex items-center justify-end gap-2 pt-1">
      <button
        type="button"
        onClick={onClose}
        className="flex h-9 items-center rounded-md border border-border bg-surface px-3 text-xs font-medium text-muted-foreground transition hover:text-foreground"
      >
        {t("common.cancel")}
      </button>
      <button
        type="submit"
        disabled={saving}
        className="flex h-9 items-center rounded-md bg-primary px-4 text-xs font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
      >
        {saving ? t("common.saving") : submitLabel}
      </button>
    </div>
  );
}
