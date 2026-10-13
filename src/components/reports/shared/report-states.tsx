import React from 'react';
import { AlertCircle, FileSearch, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ReportEmptyStateProps {
  title?: string;
  description?: string;
  onResetFilters?: () => void;
}

export function ReportEmptyState({
  title = 'لا توجد بيانات تطابق الفلاتر المحددة',
  description = 'جرّب توسيع النطاق الزمني أو تفريغ الفلاتر للبحث عن سجلات أخرى.',
  onResetFilters,
}: ReportEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center bg-card/10">
      <div className="rounded-full bg-muted/60 p-3 text-muted-foreground mb-3">
        <FileSearch className="h-6 w-6" />
      </div>
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <p className="mt-1 text-xs text-muted-foreground max-w-sm">{description}</p>
      {onResetFilters && (
        <Button
          variant="outline"
          size="sm"
          onClick={onResetFilters}
          className="mt-4 gap-1.5 text-xs"
        >
          <RotateCcw className="h-3 w-3" />
          تفريغ الفلاتر
        </Button>
      )}
    </div>
  );
}

interface ReportErrorStateProps {
  error: string;
  onRetry?: () => void;
}

export function ReportErrorState({ error, onRetry }: ReportErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center bg-destructive/5 border-b border-destructive/20">
      <div className="rounded-full bg-destructive/10 p-3 text-destructive mb-3">
        <AlertCircle className="h-6 w-6" />
      </div>
      <h3 className="text-sm font-semibold text-destructive">تعذر تحميل بيانات التقرير</h3>
      <p className="mt-1 text-xs text-muted-foreground max-w-md font-mono">{error}</p>
      {onRetry && (
        <Button
          variant="outline"
          size="sm"
          onClick={onRetry}
          className="mt-4 gap-1.5 text-xs border-destructive/40 hover:bg-destructive/10"
        >
          <RotateCcw className="h-3 w-3" />
          إعادة المحاولة
        </Button>
      )}
    </div>
  );
}
