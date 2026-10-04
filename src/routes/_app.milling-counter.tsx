/**
 * Market-Hub ERP — The mill's express counter, as its own screen.
 *
 * WHY THIS IS SEPARATE FROM THE MILLING DESK
 * ------------------------------------------
 * The unified desk is the plan-driven milling module. It renders differently
 * depending on the milling mode configured in settings: the simplified plan
 * shows this counter, the manufacturing plan shows production orders, BOM
 * recipes and joint costing instead. Putting the express counter inside it
 * means the counter's availability and behaviour are hostage to whichever
 * milling mode a tenant happens to have selected.
 *
 * A counter operator needs one job at the gate — intake, milling, billing —
 * and needs it to be there regardless of how the mill's production plan is
 * configured. So this screen mounts the same desk component directly, with no
 * dependence on the milling-mode setting, and the settings page is left alone.
 *
 * It also means the two counters on it now share one set of milling terms
 * (see MillingTermsFields), so an operator who learns the terms on the cash
 * ticket already knows them on the custody receipt.
 */
import { ModuleGuard } from "@/lib/modules";
import { createFileRoute } from "@tanstack/react-router";
import { UnifiedMillingDesk } from "@/components/milling/unified-milling-desk";
import { PageHeader } from "@/components/page-header";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_app/milling-counter")({
  head: () => ({ meta: [{ title: "كاونتر المطحنة السريع — فورتيكس ERP" }] }),
  component: () => (
    <ModuleGuard moduleId="milling_operations">
      <MillCounterPage />
    </ModuleGuard>
  ),
});

function MillCounterPage() {
  const { lang } = useI18n();
  const isRtl = lang === "ar";

  return (
    <div className="space-y-4 pb-12">
      <PageHeader
        title={isRtl ? "كاونتر المطحنة السريع" : "Mill Express Counter"}
        subtitle={
          isRtl
            ? "استلام وطحن وفوترة في شاشة واحدة — تعمل بغضّ النظر عن خطة المطحنة المختارة في الإعدادات"
            : "Intake, milling and billing on one screen — regardless of the milling plan set in settings"
        }
      />
      <UnifiedMillingDesk />
    </div>
  );
}
