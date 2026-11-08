import { useMemo, useState } from "react";
import { Check, ChevronDown, Warehouse, Sparkles, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface WarehouseOption {
  id: string;
  name: string;
  name_ar?: string | null;
  code?: string | null;
  is_default?: boolean;
}

interface WarehousePickerProps {
  options: WarehouseOption[];
  value: string;
  onChange: (value: string) => void;
  lang?: string;
  label?: string;
  emptyLabel?: string;
  className?: string;
  disabled?: boolean;
  onAddNew?: () => void;
}

export function WarehousePicker({
  options,
  value,
  onChange,
  lang = "ar",
  label,
  emptyLabel,
  className = "",
  disabled = false,
  onAddNew,
}: WarehousePickerProps) {
  const [open, setOpen] = useState(false);
  const isArabic = lang === "ar";
  const selected = options.find((option) => option.id === value);
  const fallbackLabel = emptyLabel ?? (isArabic ? "اختر المستودع…" : "Select warehouse…");
  const defaultLabel = label ?? (isArabic ? "المستودع" : "Warehouse");

  const select = (nextValue: string) => {
    onChange(nextValue);
    setOpen(false);
  };

  const { pinned, regular } = useMemo(() => {
    const pinnedOptions = options.filter((option) => option.is_default);
    const rest = options.filter((option) => !option.is_default);
    return { pinned: pinnedOptions, regular: rest };
  }, [options]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-label={defaultLabel}
          aria-expanded={open}
          data-form-nav
          disabled={disabled}
          className={cn(
            "group h-10 min-w-0 w-full justify-between items-center gap-2 rounded-2xl border border-border/70 bg-background/80 px-2.5 text-start shadow-xs transition hover:border-amber-500/40 hover:bg-amber-500/[0.035]",
            disabled && "cursor-not-allowed opacity-60",
            className,
          )}
        >
          {/* الجانب الأيمن: أيقونة المستودع + اسم المستودع في المنتصف تماماً */}
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400 shadow-2xs">
              <Warehouse className="size-4" />
            </span>
            <span className="truncate text-xs font-bold text-foreground leading-normal">
              {selected ? selected.name_ar || selected.name : fallbackLabel}
            </span>
          </div>

          {/* الجانب الأيسر: شارة افتراضي + سهم واحد منسدل أنيق */}
          <div className="flex shrink-0 items-center gap-1.5">
            {selected?.is_default && (
              <span className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-300 shadow-2xs">
                {isArabic ? "افتراضي" : "Default"}
              </span>
            )}
            <span className="grid size-6 shrink-0 place-items-center rounded-lg bg-surface-2/70 text-muted-foreground/80 transition-colors group-hover:bg-muted group-hover:text-foreground">
              <ChevronDown
                className={cn("size-3.5 transition-transform duration-200", open && "rotate-180")}
              />
            </span>
          </div>
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align={isArabic ? "end" : "start"}
        sideOffset={5}
        collisionPadding={{ top: 12, bottom: 12, left: 12, right: 12 }}
        sticky="always"
        avoidCollisions
        className="max-h-[min(28rem,70dvh)] w-[min(340px,calc(100vw-1rem))] overflow-hidden rounded-2xl border-border/70 bg-popover p-0 shadow-2xl"
      >
        {/* الترويسة الأنيقة */}
        <div className="flex items-center justify-between border-b border-border/70 bg-gradient-to-b from-amber-500/[0.12] via-amber-500/[0.04] to-transparent px-3.5 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-amber-500/20 bg-amber-500/15 text-amber-600 dark:text-amber-400">
              <Warehouse className="size-4.5" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold text-foreground">
                {isArabic ? "المستودعات والمخازن" : "Warehouses"}
              </span>
              <span className="block text-[11px] text-muted-foreground">
                {isArabic ? "اختر المستودع المعتمد للعملية" : "Select warehouse"}
              </span>
            </span>
          </div>
          <span className="shrink-0 rounded-full border border-border/70 bg-background/80 px-2 py-1 text-[10px] font-medium text-muted-foreground">
            {options.length}
          </span>
        </div>

        {/* المستودع الافتراضي المثبت في الأعلى إن وجد */}
        {pinned.length > 0 && (
          <div className="border-b border-border/70 bg-gradient-to-b from-amber-500/[0.08] to-transparent p-1.5">
            <div className="mb-1 flex items-center gap-1 px-1.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700/80 dark:text-amber-300/80">
              <Sparkles className="size-3" />
              {isArabic ? "المستودع الافتراضي" : "Default Warehouse"}
            </div>
            {pinned.map((option) => {
              const active = value === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => select(option.id)}
                  className={cn(
                    "flex min-h-11 w-full items-center justify-between rounded-xl border px-2.5 py-2 text-start transition",
                    active
                      ? "border-amber-500/40 bg-amber-500/10"
                      : "border-transparent hover:border-amber-500/20 hover:bg-amber-500/[0.06]",
                  )}
                >
                  <div className="flex min-w-0 flex-1 items-center gap-2.5">
                    <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-amber-500/20 text-amber-600 dark:text-amber-400">
                      <Warehouse className="size-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="block truncate text-xs font-bold text-foreground">
                          {option.name_ar || option.name}
                        </span>
                        <span className="rounded-md border border-amber-500/30 bg-amber-500/15 px-1.5 text-[9px] font-bold text-amber-700 dark:text-amber-300">
                          {isArabic ? "افتراضي" : "Default"}
                        </span>
                      </div>
                      {option.code && (
                        <span className="block font-mono text-[10px] text-muted-foreground">
                          {option.code}
                        </span>
                      )}
                    </div>
                  </div>
                  <Check
                    className={cn(
                      "size-4 shrink-0 text-amber-600 dark:text-amber-400",
                      active ? "opacity-100" : "opacity-0",
                    )}
                  />
                </button>
              );
            })}
          </div>
        )}

        {/* بقية المستودعات مع البحث */}
        <Command dir={isArabic ? "rtl" : "ltr"} className="rounded-none bg-transparent">
          <CommandInput
            placeholder={isArabic ? "ابحث عن مستودع أو كود..." : "Search warehouse or code..."}
            className="h-10 text-xs"
          />
          <CommandList className="max-h-[min(20rem,42dvh)] p-1.5">
            <CommandEmpty className="py-6 text-xs text-muted-foreground">
              {isArabic ? "لا توجد مستودعات مطابقة للبحث" : "No matching warehouses"}
            </CommandEmpty>

            {regular.map((option) => {
              const active = value === option.id;
              return (
                <CommandItem
                  key={option.id}
                  value={`${option.name_ar || option.name} ${option.code ?? ""}`}
                  onSelect={() => select(option.id)}
                  className={cn(
                    "min-h-12 items-center justify-between rounded-xl px-2.5 py-2 ring-1 ring-inset transition-colors",
                    active
                      ? "bg-amber-500/[0.09] text-foreground ring-amber-500/30"
                      : "ring-transparent hover:bg-muted/60",
                  )}
                >
                  <div className="flex min-w-0 flex-1 items-center gap-2.5">
                    <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                      <Warehouse className="size-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-semibold text-foreground">
                        {option.name_ar || option.name}
                      </span>
                      {option.code && (
                        <span className="block font-mono text-[10px] text-muted-foreground">
                          {option.code}
                        </span>
                      )}
                    </div>
                  </div>
                  <Check
                    className={cn(
                      "size-4 shrink-0 text-amber-600 dark:text-amber-400",
                      active ? "opacity-100" : "opacity-0",
                    )}
                  />
                </CommandItem>
              );
            })}
          </CommandList>
        </Command>

        {/* زر إضافة مستودع جديد أسفل القائمة إن تم تمرير onAddNew */}
        {onAddNew && (
          <div className="border-t border-border/70 p-2 bg-muted/20">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onAddNew();
              }}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-amber-500/40 bg-amber-500/5 py-2 text-xs font-bold text-amber-700 dark:text-amber-300 hover:bg-amber-500/10 transition"
            >
              <Plus className="size-3.5" />
              <span>{isArabic ? "إضافة مستودع جديد" : "Add New Warehouse"}</span>
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
