import { useModules } from "@/lib/modules";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { StockAdjustmentDialog } from "@/components/stock/stock-adjustment-dialog";
import { Warehouse, Search, ArrowUpDown, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/inventory")({
  head: () => ({ meta: [{ title: "Inventory — Vortex ERP" }] }),
  component: InventoryPage,
});

type Row = {
  id: string;
  name: string;
  sku: string | null;
  min_stock: number;
  inventory: { warehouse_id: string; quantity: number }[];
};

function InventoryPage() {
  const { t, lang } = useI18n();
  const { isModuleEnabled } = useModules();
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [warehouseId, setWarehouseId] = useState<string>("");
  const [adjust, setAdjust] = useState<{ product: Row } | null>(null);

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

  const { data: rows, isLoading } = useQuery({
    queryKey: ["inventory"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, sku, min_stock, inventory(warehouse_id, quantity)")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  const filtered = useMemo(() => {
    if (!rows) return [];
    const q = query.trim().toLowerCase();
    return rows.filter(
      (r) => !q || r.name.toLowerCase().includes(q) || (r.sku ?? "").toLowerCase().includes(q),
    );
  }, [rows, query]);

  function qtyFor(r: Row) {
    if (!warehouseId) return r.inventory.reduce((a, i) => a + Number(i.quantity), 0);
    return Number(r.inventory.find((i) => i.warehouse_id === warehouseId)?.quantity ?? 0);
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
                    <div className="mx-auto grid h-10 w-10 place-items-center rounded-md bg-surface border border-border">
                      <Warehouse className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <p className="mt-3 text-sm text-foreground">{t("inventory.no_inventory")}</p>
                    <p className="text-xs text-muted-foreground">{t("inventory.empty_hint")}</p>
                  </td>
                </tr>
              )}
              {filtered.map((r) => {
                const q = qtyFor(r);
                const low = q <= Number(r.min_stock);
                return (
                  <tr
                    key={r.id}
                    className="border-b border-border/60 hover:bg-accent/40 transition-colors"
                  >
                    <td className="px-4 py-2.5 font-medium text-foreground">{r.name}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                      {r.sku ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 text-end font-mono text-muted-foreground">
                      {Number(r.min_stock)}
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
                        onClick={() => setAdjust({ product: r })}
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

      {adjust && warehouseId && (
        <StockAdjustmentDialog
          initialProductId={adjust.product.id}
          initialWarehouseId={warehouseId}
          onClose={() => setAdjust(null)}
          onSaved={() => {
            setAdjust(null);
            qc.invalidateQueries({ queryKey: ["inventory"] });
            qc.invalidateQueries({ queryKey: ["settlements"] });
          }}
        />
      )}
    </>
  );
}


