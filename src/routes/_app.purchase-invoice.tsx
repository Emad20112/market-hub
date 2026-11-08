import { createFileRoute } from "@tanstack/react-router";
import { ModuleGuard } from "@/lib/modules";
import { PurchaseInvoiceComposer } from "@/components/purchases/purchase-invoice-composer";

export const Route = createFileRoute("/_app/purchase-invoice")({
  head: () => ({ meta: [{ title: "إنشاء فاتورة مشتريات — فورتيكس ERP" }] }),
  component: () => (
    <ModuleGuard moduleId="purchases">
      <PurchaseInvoiceComposer />
    </ModuleGuard>
  ),
});
