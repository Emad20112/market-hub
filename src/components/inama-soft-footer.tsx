import { Globe2, MapPin, Phone } from "lucide-react";
import { cn } from "@/lib/utils";

type InamaSoftFooterProps = {
  className?: string;
};

export function InamaSoftFooter({ className }: InamaSoftFooterProps) {
  return (
    <footer
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/95 px-2 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] text-[10px] text-muted-foreground/80 shadow-[0_-4px_18px_rgba(0,0,0,0.06)] backdrop-blur-md transition-colors",
        className,
      )}
      dir="rtl"
    >
      <div className="mx-auto flex w-full max-w-[1400px] flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
        {/* Left: subtle brand & copyright */}
        <div className="flex items-center gap-2">
          <img
            src="/inama-soft-logo.ico"
            alt="إنما سوفت"
            className="h-4 w-4 rounded object-contain opacity-80"
          />
          <span className="font-semibold text-foreground/90">إنما سوفت</span>
          <span>·</span>
          <span className="hidden sm:inline">·</span>
          <span className="hidden sm:inline-flex items-center gap-1">
            <MapPin className="h-3 w-3" /> إب، اليمن
          </span>
        </div>

        {/* Right: minimal contact & social links */}
        <div className="flex items-center gap-1.5 sm:gap-3">
          <a
            href="tel:784795104"
            className="inline-flex items-center gap-1 whitespace-nowrap transition-colors hover:text-foreground"
            aria-label="التواصل عبر الرقم 784795104"
            dir="ltr"
          >
            <Phone className="h-3 w-3" />
            <span>784795104</span>
          </a>
          <a
            href="tel:772217218"
            className="inline-flex items-center gap-1 whitespace-nowrap transition-colors hover:text-foreground"
            aria-label="التواصل عبر الرقم 772217218"
          >
            <Phone className="h-3 w-3" />
            <span>772217218</span>
          </a>
          <a
            href="https://inma-soft.vercel.app"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
          >
            <Globe2 className="h-3 w-3" />
            <span>الموقع الرسمي</span>
          </a>
        </div>
      </div>
    </footer>
  );
}
