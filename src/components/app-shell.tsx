import { useCompanyCurrency } from "@/hooks/use-company-currency";
import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { memo, useEffect, useMemo, useState } from "react";
import {
  LayoutDashboard,
  ScanBarcode,
  ShoppingBag,
  Package,
  Warehouse,
  Receipt,
  Truck,
  Users,
  Building2,
  Wallet,
  BarChart3,
  ShieldCheck,
  Bell,
  Settings,
  Search,
  Command as CommandIcon,
  LogOut,
  Moon,
  Sun,
  Sparkles,
  RotateCcw,
  RotateCw,
  ArrowRightLeft,
  CalendarClock,
  Barcode,
  Gift,
  History,
  Layers,
  Boxes,
  Menu,
  PanelLeftOpen,
  PanelLeftClose,
  AlertTriangle,
  LineChart,
  FileText,
  BookOpen,
  Scale,
  Landmark,
  PieChart,
  Crown,
  ClipboardList,
  Cog,
  PackagePlus,
  ChartColumn,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { canAccessRoute, getRouteRule } from "@/lib/route-access";
import { useAuth } from "@/lib/auth";
import { useModules } from "@/lib/modules";
import { CommandPalette } from "@/components/command-palette";
import { VortexHeaderOmnisearch } from "@/components/vortex-header-omnisearch";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { ConnectionBanner } from "@/components/ui/connection";
import { cn } from "@/lib/utils";
import { InamaSoftFooter } from "@/components/inama-soft-footer";
import { supabase } from "@/integrations/supabase/client";
import { setCompanySettingsCache } from "@/lib/format";
import { checkBackupReminderStatus } from "@/lib/backup/reminder";
import { useMillingMode, isRouteVisibleByMillingMode } from "@/lib/milling-mode";
import { getSidebarSections, type SidebarSection } from "@/lib/navigation";
import { routeIcon } from "@/lib/navigation/route-icons";

const SidebarContents = memo(function SidebarContents({
  onNavigate,
  collapsed = false,
  onToggleCollapse,
}: {
  onNavigate?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  const { t, dir, lang } = useI18n();
  const isAr = lang === "ar";

  const { user, signOut, isPlatformAdmin, isPlatformSuperadmin, roles } = useAuth();

  const { isModuleEnabled } = useModules();

  const navigate = useNavigate();

  // Must be passed as an options object with a `select` selector. Passing a bare
  // function leaves `select` undefined, so the hook returns the whole RouterState
  // object and `pathname.startsWith(...)` below throws
  // "TypeError: pathname.startsWith is not a function".
  const pathname = useRouterState({
    select: (s) => s.location.pathname,
  });

  // Navigation belongs to the application itself, not to an individual tenant.
  // The company logo remains available in invoices and printable documents.
  const logoUrl = "/vortex-erp-mark.png";

  const { mode: millingMode } = useMillingMode();

  const filteredSections = useMemo<SidebarSection[]>(() => {
    return getSidebarSections({
      isModuleEnabled,
      isVisibleByMillingMode: (path) => isRouteVisibleByMillingMode(path, millingMode),
      canAccess: (entry) =>
        canAccessRoute(entry.path.split("?")[0], { roles, isPlatformAdmin, isPlatformSuperadmin }),
    });
  }, [isModuleEnabled, isPlatformAdmin, isPlatformSuperadmin, roles, millingMode]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-sidebar text-sidebar-foreground">
      {/* Sidebar Header with Brand Logo */}
      <div
        className={cn(
          "flex h-16 items-center border-b border-sidebar-border/60 transition-all duration-300",
          collapsed ? "justify-center px-2" : "justify-start gap-2.5 px-4",
        )}
      >
        {collapsed ? (
          <img
            src={logoUrl}
            alt={t("app.name")}
            className={cn(
              "size-9 shrink-0 rounded-xl border border-border/60 bg-surface-2/90 p-1 object-contain shadow-md ring-1 ring-white/10",
            )}
            onError={(event) => {
              event.currentTarget.style.visibility = "hidden";
            }}
          />
        ) : (
          <>
            {/* Ø´Ø¹Ø§Ø± Ù…Ø±ÙƒÙ‘Ø¨ (Ø±Ù…Ø² + ÙƒÙ„Ù…Ø©) Ø¨Ø¬Ø§Ù†Ø¨ Ø§Ù„Ù†Øµ */}
            <img
              src="/vortex-erp-wordmark.png"
              alt={t("app.name")}
              className="h-9 w-auto shrink-0 object-contain"
              onError={(event) => {
                event.currentTarget.style.visibility = "hidden";
              }}
            />
            <span className="text-base font-extrabold tracking-tight text-foreground">
              ÙÙˆØ±ØªÙƒØ³
            </span>
          </>
        )}
      </div>

      {/* Navigation Links */}
      <nav
        className={cn(
          "flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain custom-scrollbar",
          collapsed ? "px-2 py-3 space-y-2" : "px-3 py-3.5 space-y-4",
        )}
      >
        {filteredSections.map((sec, secIdx) => (
          <div key={sec.titleKey}>
            {!collapsed ? (
              <div className="px-3 pb-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground/80 truncate">
                {t(sec.titleKey)}
              </div>
            ) : (
              secIdx > 0 && <div className="my-2 h-px w-7 mx-auto bg-sidebar-border/60" />
            )}

            <ul className={cn(collapsed ? "space-y-1.5" : "space-y-1")}>
              {sec.entries.map((it) => {
                const active =
                  pathname === it.path ||
                  (it.path !== "/dashboard" && pathname.startsWith(`${it.path}/`));
                const Icon = routeIcon(it.id);

                return (
                  <li key={it.id} className="relative">
                    <Link
                      to={it.path}
                      onClick={onNavigate}
                      className={cn(
                        "group relative flex items-center transition-all duration-200",

                        collapsed
                          ? "h-10 w-10 mx-auto justify-center rounded-xl p-0"
                          : "gap-3 px-3 py-2.5 rounded-xl text-[13.5px] sm:text-sm font-medium",

                        active
                          ? collapsed
                            ? "bg-primary text-primary-foreground shadow-md shadow-primary/25 ring-2 ring-primary/40"
                            : "bg-gradient-to-r from-primary/20 via-primary/10 to-primary/5 text-foreground font-semibold shadow-[inset_0_0_0_1px_oklch(1_0_0_/_0.08)]"
                          : collapsed
                            ? "text-muted-foreground hover:bg-surface-2 hover:text-foreground hover:scale-105"
                            : "text-muted-foreground hover:bg-sidebar-accent/70 hover:text-foreground",
                      )}
                    >
                      {active && !collapsed && (
                        <span
                          className={cn(
                            "absolute inset-y-2 w-[3px] rounded-full bg-primary",
                            dir === "rtl" ? "right-0" : "left-0",
                          )}
                        />
                      )}

                      <div
                        className={cn(
                          "grid place-items-center transition-transform duration-200",

                          collapsed
                            ? "h-full w-full"
                            : cn(
                                "h-7 w-7 rounded-lg group-hover:scale-110",
                                "bg-surface-2/60",
                                active && "ring-1 ring-primary/40 shadow-sm",
                              ),
                        )}
                      >
                        <Icon
                          className={cn(
                            "shrink-0 transition-colors",

                            collapsed
                              ? active
                                ? "h-5 w-5 text-primary-foreground stroke-[2.2]"
                                : "h-5 w-5 text-muted-foreground group-hover:text-foreground"
                              : active
                                ? "h-4 w-4 text-primary stroke-[2.5]"
                                : "h-4 w-4 text-muted-foreground group-hover:text-foreground",
                          )}
                        />
                      </div>

                      {!collapsed && (
                        <span className="truncate leading-normal">
                          {it.i18nKey ? t(it.i18nKey) : isAr ? it.titleAr : it.titleEn}
                        </span>
                      )}

                      {/* Tooltip in Icon-only mode */}
                      {collapsed && (
                        <div
                          className={cn(
                            "pointer-events-none absolute z-50 whitespace-nowrap rounded-xl bg-popover/95 backdrop-blur-md px-3 py-1.5 text-xs font-semibold text-popover-foreground shadow-xl border border-border/80 transition-all duration-150 scale-95 opacity-0 group-hover:scale-100 group-hover:opacity-100",
                            dir === "rtl" ? "right-full me-3.5" : "left-full ms-3.5",
                          )}
                        >
                          <div className="flex items-center gap-1.5">
                            <span>
                              {it.i18nKey ? t(it.i18nKey) : isAr ? it.titleAr : it.titleEn}
                            </span>

                            {(it.superadminOnly || getRouteRule(it.path)?.superadminOnly) && (
                              <Crown className="h-3 w-3 text-amber-500 shrink-0" />
                            )}
                          </div>

                          <div
                            className={cn(
                              "absolute top-1/2 -translate-y-1/2 border-[5px] border-transparent",
                              dir === "rtl"
                                ? "left-full -ms-[1px] border-s-popover/95"
                                : "right-full -me-[1px] border-e-popover/95",
                            )}
                          />
                        </div>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer Profile & Sign Out */}
      <div
        className={cn(
          "border-t border-sidebar-border/60 p-2.5",
          collapsed && "flex justify-center p-2",
        )}
      >
        <button
          onClick={async () => {
            await signOut();
            navigate({
              to: "/auth",
              replace: true,
            });
          }}
          className={cn(
            "group relative flex items-center rounded-xl text-[13.5px] font-medium text-muted-foreground hover:bg-sidebar-accent hover:text-foreground transition-colors",
            collapsed ? "h-10 w-10 justify-center p-0" : "w-full gap-2.5 px-3 p-2",
          )}
          title={lang === "ar" ? "ØªØ³Ø¬ÙŠÙ„ Ø§Ù„Ø®Ø±ÙˆØ¬" : "Sign out"}
        >
          <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-primary/20 to-chart-4/20 text-[11px] font-bold text-foreground border border-primary/20">
            {(user?.email ?? "?").charAt(0).toUpperCase()}
          </div>

          {!collapsed && (
            <>
              <span className="min-w-0 flex-1 truncate text-start text-xs font-medium">
                {user?.email}
              </span>

              <LogOut className="h-4 w-4 shrink-0 opacity-60 group-hover:opacity-100 transition" />
            </>
          )}

          {collapsed && (
            <div
              className={cn(
                "pointer-events-none absolute z-50 whitespace-nowrap rounded-xl bg-popover/95 backdrop-blur-md px-3 py-1.5 text-xs font-semibold text-popover-foreground shadow-xl border border-border/80 transition-all duration-150 scale-95 opacity-0 group-hover:scale-100 group-hover:opacity-100",
                dir === "rtl" ? "right-full me-3.5" : "left-full ms-3.5",
              )}
            >
              <span>
                {lang === "ar" ? "ØªØ³Ø¬ÙŠÙ„ Ø§Ù„Ø®Ø±ÙˆØ¬" : "Sign out"} ({user?.email})
              </span>

              <div
                className={cn(
                  "absolute top-1/2 -translate-y-1/2 border-[5px] border-transparent",
                  dir === "rtl"
                    ? "left-full -ms-[1px] border-s-popover/95"
                    : "right-full -me-[1px] border-e-popover/95",
                )}
              />
            </div>
          )}
        </button>
      </div>
    </div>
  );
});

export function AppShell({ children }: { children: React.ReactNode }) {
  const { t, dir } = useI18n();

  const navigate = useNavigate();

  const pathname = useRouterState({
    select: (s) => s.location.pathname,
  });

  const isPosRoute =
    pathname === "/pos" ||
    pathname.startsWith("/pos/") ||
    pathname === "/purchase-pos" ||
    pathname.startsWith("/purchase-pos/");
  const isSettingsRoute = pathname === "/settings" || pathname.startsWith("/settings/");

  const [paletteOpen, setPaletteOpen] = useState(false);

  const [mobileOpen, setMobileOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [settingsSidebarOpen, setSettingsSidebarOpen] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);

  // Ù„Ø§ ÙŠØªÙ… ØªØ­Ù…ÙŠÙ„ Ù‚Ø§Ø¦Ù…Ø© Ø§Ù„ØªÙ†Ø¨ÙŠÙ‡Ø§Øª ÙƒØ§Ù…Ù„Ø© Ø¯Ø§Ø®Ù„ Ø§Ù„ØºÙ„Ø§ÙØ› ØµÙØ­Ø© Ø§Ù„ØªÙ†Ø¨ÙŠÙ‡Ø§Øª Ù‡ÙŠ Ø§Ù„Ù…Ø³Ø¤ÙˆÙ„Ø© Ø¹Ù† Ø°Ù„Ùƒ.
  // Ø¥Ø¨Ù‚Ø§Ø¡ Ø§Ù„Ù…Ù„Ø®Øµ Ø¨Ù‚ÙŠÙ…Ø© Ø¢Ù…Ù†Ø© ÙŠÙ…Ù†Ø¹ ØªØ¹Ø·Ù„ Ø§Ù„ØºÙ„Ø§Ù Ù‚Ø¨Ù„ ÙØªØ­ ØµÙØ­Ø© Ø§Ù„ØªÙ†Ø¨ÙŠÙ‡Ø§ØªØŒ Ø¨ÙŠÙ†Ù…Ø§ ÙŠØ¸Ù„
  // ØªÙ†Ø¨ÙŠÙ‡ Ø§Ù„Ù†Ø³Ø®Ø© Ø§Ù„Ø§Ø­ØªÙŠØ§Ø·ÙŠØ© Ø§Ù„ÙÙˆØ±ÙŠ ÙŠØ¹Ù…Ù„ Ø¨Ø´ÙƒÙ„ Ù…Ø³ØªÙ‚Ù„.
  const alertsSummary = { total: 0, hasDanger: false };

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("vortex_sidebar_collapsed") === "true";
    }

    return false;
  });

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;

      if (typeof window !== "undefined") {
        localStorage.setItem("vortex_sidebar_collapsed", String(next));
      }

      return next;
    });
  };

  useEffect(() => {
    if (isSettingsRoute) {
      setSettingsSidebarOpen(false);
    }
  }, [isSettingsRoute]);

  const [theme, setTheme] = useState<"dark" | "light">(
    () =>
      (typeof window !== "undefined" && (localStorage.getItem("theme") as "dark" | "light")) ||
      "light",
  );

  // Use centralized company currency with TanStack Query cache (5min staleTime)
  useCompanyCurrency();

  useEffect(() => {
    const root = document.documentElement;

    root.classList.toggle("dark", theme === "dark");

    root.classList.toggle("light", theme === "light");

    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();

        setPaletteOpen((x) => !x);
      }
    };

    window.addEventListener("keydown", handler);

    return () => window.removeEventListener("keydown", handler);
  }, []);

  const sideEdge = dir === "rtl" ? "border-l" : "border-r";

  return (
    <div className="relative z-10 flex h-screen w-full overflow-hidden text-foreground">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "hidden md:flex h-full shrink-0 flex-col overflow-hidden transition-all duration-300 ease-in-out",

          isSettingsRoute
            ? settingsSidebarOpen
              ? "w-64"
              : "w-[72px]"
            : collapsed
              ? "w-[72px]"
              : "w-64",

          sideEdge,
          "border-sidebar-border/60",
        )}
      >
        <SidebarContents
          collapsed={isSettingsRoute ? !settingsSidebarOpen : collapsed}
          onToggleCollapse={toggleCollapsed}
        />
      </aside>

      {/* Mobile drawer */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side={dir === "rtl" ? "right" : "left"}
          className="w-72 p-0 bg-sidebar border-sidebar-border/60 overflow-hidden"
        >
          <SidebarContents onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Offline notice â€” sits above everything in the content column */}
        <ConnectionBanner />

        {/* Top bar */}
        <header className="sticky top-0 z-30 flex h-16 items-center gap-2.5 border-b border-border/60 bg-background/70 px-4 backdrop-blur-xl sm:px-6">
          {/* Mobile menu toggle - smoothly hides when search is focused */}
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className={cn(
              "grid h-10 w-10 shrink-0 place-items-center rounded-full border border-border/60 bg-surface text-muted-foreground transition-all duration-300 hover:border-ring/40 hover:bg-surface-2 hover:text-foreground active:scale-95 md:hidden",
              searchFocused
                ? "w-0 max-w-0 opacity-0 pointer-events-none scale-0 -ms-2"
                : "w-10 opacity-100 scale-100",
            )}
            aria-label={dir === "rtl" ? "ÙØªØ­ Ø§Ù„Ù‚Ø§Ø¦Ù…Ø© Ø§Ù„Ø¬Ø§Ù†Ø¨ÙŠØ©" : "Open sidebar"}
          >
            <Menu className="h-4.5 w-4.5" />
          </button>

          {/* Desktop Sidebar Collapse / Expand Toggle - circular button with PanelLeftOpen/Close */}
          <button
            type="button"
            onClick={() =>
              isSettingsRoute ? setSettingsSidebarOpen((open) => !open) : toggleCollapsed()
            }
            className={cn(
              "hidden md:grid h-10 w-10 shrink-0 place-items-center rounded-full border border-border/60 bg-surface text-muted-foreground transition-all duration-300 hover:border-ring/40 hover:bg-surface-2 hover:text-foreground active:scale-95",
              searchFocused && "md:hidden lg:grid",
            )}
            title={
              isSettingsRoute
                ? settingsSidebarOpen
                  ? dir === "rtl"
                    ? "Ø¥ØºÙ„Ø§Ù‚ Ø§Ù„Ù‚Ø§Ø¦Ù…Ø© Ø§Ù„Ø¬Ø§Ù†Ø¨ÙŠØ©"
                    : "Close sidebar"
                  : dir === "rtl"
                    ? "ÙØªØ­ Ø§Ù„Ù‚Ø§Ø¦Ù…Ø© Ø§Ù„Ø¬Ø§Ù†Ø¨ÙŠØ©"
                    : "Open sidebar"
                : collapsed
                  ? dir === "rtl"
                    ? "ØªÙˆØ³ÙŠØ¹ Ø§Ù„Ù‚Ø§Ø¦Ù…Ø© Ø§Ù„Ø¬Ø§Ù†Ø¨ÙŠØ©"
                    : "Expand sidebar"
                  : dir === "rtl"
                    ? "Ø·ÙŠ Ø§Ù„Ù‚Ø§Ø¦Ù…Ø© (Ø£ÙŠÙ‚ÙˆÙ†Ø§Øª ÙÙ‚Ø·)"
                    : "Collapse sidebar"
            }
            aria-label={
              isSettingsRoute && settingsSidebarOpen
                ? dir === "rtl"
                  ? "Ø¥ØºÙ„Ø§Ù‚ Ø§Ù„Ù‚Ø§Ø¦Ù…Ø© Ø§Ù„Ø¬Ø§Ù†Ø¨ÙŠØ©"
                  : "Close sidebar"
                : dir === "rtl"
                  ? "Ø§Ù„Ù‚Ø§Ø¦Ù…Ø© Ø§Ù„Ø¬Ø§Ù†Ø¨ÙŠØ©"
                  : "Sidebar menu"
            }
          >
            {isSettingsRoute ? (
              <Menu className="h-4.5 w-4.5" />
            ) : collapsed ? (
              <PanelLeftOpen className="h-4.5 w-4.5" />
            ) : (
              <PanelLeftClose className="h-4.5 w-4.5" />
            )}
          </button>

          <VortexHeaderOmnisearch onFocusChange={setSearchFocused} />

          <div
            className={cn(
              "ms-auto flex items-center gap-2 transition-all duration-300",
              searchFocused
                ? "max-w-0 overflow-hidden opacity-0 pointer-events-none scale-90 sm:max-w-none sm:opacity-100 sm:pointer-events-auto sm:scale-100"
                : "max-w-[300px] opacity-100 scale-100",
            )}
          >
            {/* Ø²Ø± ØªØ­Ø¯ÙŠØ« Ø§Ù„ØµÙØ­Ø© Ø§Ù„Ø­Ø§Ù„ÙŠØ© ÙÙŠ Ù†ÙØ³ Ø§Ù„Ù…ÙƒØ§Ù† Ø¨Ø¯ÙˆÙ† Ø§Ù†ØªÙ‚Ø§Ù„ */}
            <button
              type="button"
              onClick={() => {
                setIsRefreshing(true);
                window.location.reload();
              }}
              className="grid h-10 w-10 place-items-center rounded-full border border-border/60 bg-surface text-muted-foreground hover:text-foreground hover:border-ring/40 hover:bg-surface-2 transition-all active:scale-95"
              title={dir === "rtl" ? "ØªØ­Ø¯ÙŠØ« Ø§Ù„ØµÙØ­Ø© Ø§Ù„Ø­Ø§Ù„ÙŠØ©" : "Refresh page"}
              aria-label={dir === "rtl" ? "ØªØ­Ø¯ÙŠØ« Ø§Ù„ØµÙØ­Ø©" : "Refresh"}
            >
              <RotateCw
                className={cn(
                  "h-4 w-4 transition-all duration-300",
                  isRefreshing && "animate-spin text-primary",
                )}
              />
            </button>

            {/* Ø²Ø± ØªØ¨Ø¯ÙŠÙ„ Ø§Ù„ÙˆØ¶Ø¹ (ÙØ§ØªØ­ / Ù…Ø¸Ù„Ù…) */}
            <button
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="grid h-10 w-10 place-items-center rounded-full border border-border/60 bg-surface text-muted-foreground hover:text-foreground hover:border-ring/40 hover:bg-surface-2 transition-all active:scale-95"
              title={t("common.theme")}
              aria-label={t("common.theme")}
            >
              {theme === "dark" ? (
                <Sun className="h-4 w-4 text-amber-400" />
              ) : (
                <Moon className="h-4 w-4 text-sky-500" />
              )}
            </button>

            {/* Ø²Ø± Ø§Ù„Ø¥Ø´Ø¹Ø§Ø±Ø§Øª Ù…Ø¹ Ø§Ù„Ø´Ø§Ø±Ø© Ø§Ù„Ø°ÙƒÙŠØ© ÙˆØ§Ù„Ø±Ù‚Ù… Ø§Ù„ØµØºÙŠØ± */}
            <button
              className="relative grid h-10 w-10 place-items-center rounded-full border border-border/60 bg-surface text-muted-foreground hover:text-foreground hover:border-ring/40 hover:bg-surface-2 transition-all active:scale-95"
              title={
                checkBackupReminderStatus().isDue
                  ? "ØªÙ†Ø¨ÙŠÙ‡: Ø­Ø§Ù† Ù…ÙˆØ¹Ø¯ ØªÙ†Ø²ÙŠÙ„ Ù†Ø³Ø®Ø© Ø§Ø­ØªÙŠØ§Ø·ÙŠØ© Ù…Ø­Ù„ÙŠØ© Ù„Ù„Ø¬Ù‡Ø§Ø²!"
                  : alertsSummary?.total
                    ? `Ù„Ø¯ÙŠÙƒ ${alertsSummary.total} ØªÙ†Ø¨ÙŠÙ‡Ø§Øª Ù†Ø´Ø·Ø©`
                    : t("nav.notifications")
              }
              aria-label={t("nav.notifications")}
              onClick={() =>
                navigate({
                  to: "/notifications",
                })
              }
            >
              <Bell className="h-4 w-4" />

              {/* Ø§Ù„Ø´Ø§Ø±Ø© Ø§Ù„Ø°ÙƒÙŠØ©: Ø¯Ø§Ø¦Ø±Ø© Ù†Ø§Ø¨Ø¶Ø© Ù„Ù„ØªÙ†Ø¨ÙŠÙ‡Ø§Øª Ø§Ù„Ø¹Ø§Ø¬Ù„Ø© ÙˆØ±Ù‚Ù… Ø£Ù†ÙŠÙ‚ Ù…ØµØºØ± */}
              {checkBackupReminderStatus().isDue || alertsSummary?.hasDanger ? (
                <span className="absolute -top-1 -end-1 flex items-center justify-center">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-500 opacity-75" />
                  <span className="relative flex h-4 min-w-[16px] items-center justify-center rounded-full bg-gradient-to-r from-red-600 to-rose-500 px-1 text-[9px] font-extrabold text-white shadow-md ring-2 ring-background">
                    {alertsSummary?.total || "!"}
                  </span>
                </span>
              ) : alertsSummary?.total && alertsSummary.total > 0 ? (
                <span className="absolute -top-0.5 -end-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-amber-500 px-1 text-[9px] font-bold text-white shadow-sm ring-2 ring-background">
                  {alertsSummary.total}
                </span>
              ) : (
                <span className="absolute top-2 end-2 h-2 w-2 rounded-full bg-primary/70 ring-2 ring-background" />
              )}
            </button>
          </div>
        </header>

        <main
          className={cn(
            "flex-1 min-h-0 overflow-y-auto overflow-x-hidden custom-scrollbar pb-16",
            isPosRoute ? "flex flex-col" : "",
          )}
        >
          {isPosRoute ? (
            <div className="flex-1 min-h-0 flex flex-col p-3 sm:p-5">{children}</div>
          ) : (
            <div className="mx-auto w-full max-w-[1400px] px-2 py-3 sm:px-1 sm:py-4 lg:px-1 lg:py-6">
              {children}
            </div>
          )}
        </main>
        <InamaSoftFooter />
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}
