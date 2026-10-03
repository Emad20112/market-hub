import * as React from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { COUNTRIES, Country } from "@/lib/country-data";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface CountrySelectorProps {
  value: Country;
  onChange: (country: Country) => void;
  disabled?: boolean;
}

export function CountrySelector({ value, onChange, disabled }: CountrySelectorProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");

  const filteredCountries = React.useMemo(() => {
    if (!search.trim()) return COUNTRIES;
    const term = search.toLowerCase().trim();
    return COUNTRIES.filter(
      (c) =>
        c.nameAr.toLowerCase().includes(term) ||
        c.nameEn.toLowerCase().includes(term) ||
        c.dialCode.includes(term) ||
        c.code.toLowerCase().includes(term),
    );
  }, [search]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="h-12 px-3 min-w-[110px] justify-between border-white/10 bg-[#071125] text-white hover:bg-white/5 shadow-xs rounded-2xl"
        >
          <div className="flex items-center gap-2 font-medium dir-ltr">
            <span className="text-lg">{value.flag}</span>
            <span className="text-xs font-semibold tracking-tight">{value.dialCode}</span>
          </div>
          <ChevronsUpDown className="mr-1 h-3.5 w-3.5 shrink-0 opacity-50 text-slate-400" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[280px] p-0 border-white/10 bg-[#0d182d] text-white shadow-2xl rounded-2xl backdrop-blur-xl"
        align="start"
      >
        <div className="p-2 border-b border-white/10 flex items-center gap-2">
          <Search className="h-4 w-4 shrink-0 text-slate-400" />
          <input
            type="text"
            placeholder="ابحث عن الدولة أو الرمز..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-transparent text-xs text-white outline-none placeholder:text-slate-400 dir-rtl"
          />
        </div>
        <div className="max-h-[220px] overflow-y-auto p-1 text-xs">
          {filteredCountries.length === 0 ? (
            <div className="py-6 text-center text-xs text-slate-400 dir-rtl">
              لا توجد نتائج مطابقة
            </div>
          ) : (
            filteredCountries.map((country) => {
              const isSelected = country.code === value.code;
              return (
                <button
                  key={country.code}
                  type="button"
                  onClick={() => {
                    onChange(country);
                    setOpen(false);
                  }}
                  className={cn(
                    "w-full flex items-center justify-between px-3 py-2 text-xs rounded-xl transition-colors dir-rtl cursor-pointer",
                    isSelected
                      ? "bg-primary/20 text-primary font-bold"
                      : "hover:bg-white/5 text-slate-300",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-base">{country.flag}</span>
                    <span className="truncate">{country.nameAr}</span>
                  </div>
                  <div className="flex items-center gap-2 dir-ltr font-mono text-xs">
                    <span className="text-slate-400">{country.dialCode}</span>
                    {isSelected && <Check className="h-3.5 w-3.5 text-primary" />}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
