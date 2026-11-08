import { createFileRoute } from "@tanstack/react-router";
import { ModuleGuard } from "@/lib/modules";
import { SalesInvoiceComposer } from "@/components/sales/sales-invoice-composer";

export const Route = createFileRoute("/_app/sales-invoice/new")({
  head: () => ({ meta: [{ title: "إنشاء فاتورة مبيعات — فورتيكس ERP" }] }),
  component: () => (
    <ModuleGuard moduleId="core">
      <SalesInvoiceComposer />
    </ModuleGuard>
  ),
});
