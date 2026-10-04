import { Globe2, MapPin, Phone } from "lucide-react";
import { cn } from "@/lib/utils";

type InamaSoftFooterProps = {
  className?: string;
};

export function InamaSoftFooter({ className }: InamaSoftFooterProps) {
  return (
    <footer
      className={cn(
        "border-t border-border/40 bg-background/50 px-4 py-2 sm:px-6 text-[11px] text-muted-foreground/70 transition-colors",
        className,
      )}
      dir="rtl"
    >
      <div className="mx-auto flex w-full max-w-[1400px] flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
        <div className="flex items-center gap-2">
          <img
            src="/inama-soft-logo.ico"
            alt="إنما سوفت"
            className="h-4 w-4 rounded object-contain opacity-80"
          />
          <span className="font-semibold text-foreground/90">إنما سوفت</span>
          <span>·</span>
          <span>موسى جميل العوضي</span>
          <span className="hidden sm:inline">·</span>
          <span className="hidden sm:inline-flex items-center gap-1">
            <MapPin className="h-3 w-3" /> إب، اليمن
          </span>
        </div>

        <div className="flex items-center gap-3">
          <a
            href="tel:+967772217218"
            className="hidden sm:inline-flex items-center gap-1 transition-colors hover:text-foreground"
            dir="ltr"
          >
            <Phone className="h-3 w-3" />
            <span>+967 772 217 218</span>
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
