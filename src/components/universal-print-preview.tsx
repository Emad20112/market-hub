import { useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Eye, Printer, X } from "lucide-react";
import { renderUnifiedDocument, printUnifiedDocument, type PrintRequest } from "@/lib/printing";

interface UniversalPrintPreviewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request: PrintRequest;
  title?: string;
}

export function UniversalPrintPreview({
  open,
  onOpenChange,
  request,
  title = "معاينة المستند",
}: UniversalPrintPreviewProps) {
  const html = useMemo(() => renderUnifiedDocument(request), [request]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[92vh] max-w-5xl flex-col overflow-hidden p-0">
        <DialogHeader className="flex flex-row items-center justify-between border-b p-4">
          <DialogTitle className="flex items-center gap-2">
            <Eye className="size-5 text-primary" />
            {title}
          </DialogTitle>
          <div className="flex items-center gap-2">
            <Button type="button" onClick={() => printUnifiedDocument(request)} className="gap-2">
              <Printer className="size-4" />
              طباعة
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              aria-label="إغلاق"
            >
              <X className="size-4" />
            </Button>
          </div>
        </DialogHeader>
        <div className="flex-1 overflow-auto bg-slate-200/70 p-4 dark:bg-slate-950/70">
          <iframe
            title={title}
            srcDoc={html}
            className="mx-auto min-h-[900px] w-full max-w-[900px] rounded-lg border-0 bg-white shadow-xl"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

