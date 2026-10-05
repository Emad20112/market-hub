import { useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Eye, Printer, X, Download, Share2 } from "lucide-react";
import {
  renderUnifiedDocument,
  printUnifiedDocument,
  PRINTING_LABELS,
  type PrintRequest,
} from "@/lib/printing";

interface UniversalPrintPreviewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request: PrintRequest;
  title?: string;
  rtl?: boolean;
  /** يُستدعى عند طلب «تحميل PDF»؛ إن لم يُمرَّر يُطبع المستند كبديل. */
  onDownloadPdf?: () => void;
  /** يُستدعى عند طلب «مشاركة»؛ إن لم يُمرَّر يُخفى الزر. */
  onShare?: () => void;
}

export function UniversalPrintPreview({
  open,
  onOpenChange,
  request,
  title,
  rtl,
  onDownloadPdf,
  onShare,
}: UniversalPrintPreviewProps) {
  const isRtl = rtl ?? request.rtl ?? true;
  const labels = PRINTING_LABELS[isRtl ? "ar" : "en"];
  /** نفس HTML الذي يُرسل للطباعة — لا يتم جلب البيانات مرة أخرى. */
  const html = useMemo(() => renderUnifiedDocument(request), [request]);
  const heading = title ?? labels.preview;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[92vh] max-w-5xl flex-col overflow-hidden p-0">
        <DialogHeader className="flex flex-row items-center justify-between gap-2 border-b p-4">
          <DialogTitle className="flex items-center gap-2">
            <Eye className="size-5 text-primary" />
            {heading}
          </DialogTitle>
          <div className="flex items-center gap-2">
            <Button type="button" onClick={() => printUnifiedDocument(request)} className="gap-2">
              <Printer className="size-4" />
              {labels.print}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="gap-2"
              onClick={() => (onDownloadPdf ? onDownloadPdf() : printUnifiedDocument(request))}
            >
              <Download className="size-4" />
              {labels.downloadPdf}
            </Button>
            {onShare && (
              <Button type="button" variant="outline" className="gap-2" onClick={onShare}>
                <Share2 className="size-4" />
                {labels.share}
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              aria-label={labels.cancel}
            >
              <X className="size-4" />
            </Button>
          </div>
        </DialogHeader>
        <div className="flex-1 overflow-auto bg-slate-200/70 p-4 dark:bg-slate-950/70">
          <iframe
            title={heading}
            srcDoc={html}
            className="mx-auto min-h-[900px] w-full max-w-[900px] rounded-lg border-0 bg-white shadow-xl"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
