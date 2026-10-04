import { useEffect, useState } from "react";

export function VortexSplashScreen() {
  const [visible, setVisible] = useState(true);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const hasShown = sessionStorage.getItem("vortex_splash_shown");
    if (hasShown) {
      setVisible(false);
      return;
    }

    const fadeTimer = setTimeout(() => {
      setFading(true);
    }, 1100);

    const removeTimer = setTimeout(() => {
      setVisible(false);
      sessionStorage.setItem("vortex_splash_shown", "true");
    }, 1500);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(removeTimer);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      className={`fixed inset-0 z-[99999] flex flex-col items-center justify-center bg-background transition-opacity duration-400 ease-out ${
        fading ? "opacity-0 pointer-events-none" : "opacity-100"
      }`}
      aria-hidden="true"
    >
      <div className="flex flex-col items-center justify-center space-y-4 px-4 text-center">
        <img
          src="/vortex-erp-wordmark.png"
          alt="Vortex ERP"
          className="h-20 sm:h-24 w-auto object-contain select-none animate-in fade-in zoom-in-95 duration-500"
        />
        <div className="h-1 w-24 overflow-hidden rounded-full bg-muted/60">
          <div className="h-full w-full rounded-full bg-primary/80 animate-pulse" />
        </div>
      </div>
    </div>
  );
}
