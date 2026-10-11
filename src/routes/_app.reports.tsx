import { createFileRoute, Navigate } from "@tanstack/react-router";
import { ModuleGuard } from "@/lib/modules";

export const Route = createFileRoute("/_app/reports")({
  head: () => ({ meta: [{ title: "التقارير — مركز الكشوفات والتقارير" }] }),
  component: () => (
    <ModuleGuard moduleId="analytics">
      <Navigate to="/account-statement" search={{ tab: "reports" }} replace />
    </ModuleGuard>
  ),
});
