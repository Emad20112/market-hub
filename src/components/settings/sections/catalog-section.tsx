import { SlidersHorizontal } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CatalogModulesDialog } from "@/components/catalog-modules-dialog";
import { MillingModeSection } from "./milling-mode-section";
import { useState } from "react";

interface CatalogSectionProps {
  canEdit: boolean;
  lang: string;
}

export function CatalogSection({ canEdit, lang }: CatalogSectionProps) {
  const [catalogDialogOpen, setCatalogDialogOpen] = useState(false);

  return (
    <>
      <Card className="rounded-2xl border-border/70 bg-card shadow-sm">
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              {lang === "ar"
                ? "اختر النشاط وخصائص الفهرس والموديلات المناسبة لمنشأتك."
                : "Choose the industry and catalog/model features for your business."}
            </p>
            <Button
              type="button"
              onClick={() => setCatalogDialogOpen(true)}
              className="w-full rounded-xl sm:w-auto"
            >
              <SlidersHorizontal className="me-1.5 size-4" />
              {lang === "ar" ? "تخصيص النشاط والموديلات" : "Customize industry & modules"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="mt-6">
        <MillingModeSection canEdit={canEdit} lang={lang} />
      </div>

      <CatalogModulesDialog open={catalogDialogOpen} onClose={() => setCatalogDialogOpen(false)} />
    </>
  );
}
