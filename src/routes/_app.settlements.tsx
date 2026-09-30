import { createFileRoute } from "@tanstack/react-router";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { StockAdjustmentDialog } from "@/components/stock/stock-adjustment-dialog";
import {
  AlertTriangle,
  ClipboardList,
  ShieldCheck,
  Warehouse,
  Boxes,
  Scale,
  TrendingUp,
  RefreshCw,
  FileCheck,
  LayoutGrid,
  List,
  TableProperties,
  Loader2,
  Sparkles,
  ArrowDownLeft,
  ArrowUpRight,
  Plus,
} from "lucide-react";
import { type PageGuideConfig } from "@/components/page-guide";
import { StatusBadge } from "@/components/ui/status-badge";
import { DataTable, type DataTableColumn, type DataTableSort } from "@/components/ui/data-table";
import {
  TableToolbar,
  ToolbarAction,
  applyFilters,
  type FilterDefinition,
  type FilterValues,
  type SortOption,
} from "@/components/ui/table-toolbar";
import { buildSearchIndex, fuzzySearch } from "@/design/fuzzy";
import { qtyCell } from "@/lib/format";
import { useBreakpoint } from "@/design/breakpoints";
import { QUERY_KEYS } from "@/lib/query-keys";

export const Route = createFileRoute("/_app/settlements")({
  head: () => ({ meta: [{ title: "التسويات — فورتيكس ERP" }] }),
  component: SettlementsPage,
});

const SETTLEMENTS_PAGE_SIZE = 50;

/** The ten movement types this ledger covers (mirrors the DB enum). */
const MOVEMENT_TYPES = [
  "adjustment",
  "purchase",
  "sale",
  "transfer_in",
  "transfer_out",
  "return_in",
  "return_out",
  "opening",
  "purchase_return",
  "sale_return",
] as const;

type MovementType = (typeof MOVEMENT_TYPES)[number];

/** Direction buckets — decided by movement type, not by the sign alone. */
type Direction = "in" | "out" | "adjustment" | "return";

const DIRECTION_BY_TYPE: Record<MovementType, Direction> = {
  purchase: "in",
  opening: "in",
  transfer_in: "in",
  return_in: "in",
  sale: "out",
  transfer_out: "out",
  return_out: "out",
  adjustment: "adjustment",
  purchase_return: "return",
  sale_return: "return",
};

type SettlementRow = {
  id: string;
  movement_type: string;
  quantity: number;
  note: string | null;
  created_at: string;
  product_id: string;
  warehouse_id: string;
  created_by: string | null;
  unit_cost: number | null;
  reference: string | null;
  reference_type: string | null;
  adjustment_reason?: string | null;
  products: { id: string; name: string; name_ar: string | null; sku: string | null } | null;
  warehouses: { id: string; name: string; name_ar: string | null; code: string | null } | null;
  profiles: { full_name: string | null } | null;
};

const settlementGuideConfig: PageGuideConfig = {
  title: "دليل التسويات والمطابقة المخزنية",
  subtitle:
    "شرح شامل لكيفية معالجة الفروقات الجردية وتأثير كل حركة على الأرصدة والقيود المحاسبية وسجل التدقيق الداخلي.",
  badge: "إدارة المخزون والرقابة",
  icon: <Scale className="h-5 w-5 text-sky-500" />,
  summaryText:
    "شاشة التسويات هي صمام الأمان للرقابة المخزنية؛ تسجل بدقة وبصمة رقمية غير قابلة للتلاعب كل حركة تؤثر على رصيد المستودعات، سواء كانت تسوية يدوية لمعالجة عجز/فائض جردي، أو حركات آلية ناتجة عن فواتير بيع وشراء وترجيع.",
  overviewCards: [
    {
      title: "التسوية الجردية (Stock Adjustment)",
      description:
        "إدخال مباشر لتعديل رصيد صنف في مستودع محدد لمطابقة الجرد الفعلي على الرفوف مع الرصيد الدفتري للنظام.",
      icon: <Boxes className="h-4 w-4" />,
    },
    {
      title: "التتبع المالي والمحاسبي",
      description:
        "الفروقات الموجبة تُعامل كإيرادات فروق جرد، بينما العجز يسجل في حساب خسائر العجز أو التلف المحاسبي.",
      icon: <TrendingUp className="h-4 w-4" />,
    },
    {
      title: "سجل تدقيق كامل (Audit Trail)",
      description:
        "كل حركة تسجل اسم المستخدم الذي نفذها، التكلفة التاريخية، التاريخ والوقت بدقة، وسبب التسوية.",
      icon: <FileCheck className="h-4 w-4" />,
    },
    {
      title: "الربط مع الفواتير والتحويلات",
      description:
        "تعرض الشاشة بجانب التسويات كافة حركات الإدخال والإخراج الناتجة عن نقاط البيع، المشتريات، والتحويل بين الفروع.",
      icon: <RefreshCw className="h-4 w-4" />,
    },
  ],
  matrixTitle: "مصفوفة تأثير العمليات على المخزون والحسابات العامة",
  matrixDescription:
    "جدول تحليلي يوضح الأثر الفوري لكل نوع حركة على قاعدة البيانات، القيود اليومية، وأرصدة التكلفة:",
  impactMatrix: {
    columns: [
      { key: "type", label: "نوع الحركة", className: "w-[18%]" },
      { key: "stockImpact", label: "التأثير على رصيد المستودع", className: "w-[24%]" },
      { key: "financialImpact", label: "الأثر المالي والقيد المحاسبي", className: "w-[30%]" },
      { key: "triggerCondition", label: "سبب الحدوث ومصدر البيانات", className: "w-[28%]" },
    ],
    rows: [
      {
        badge: { label: "تسوية فائض (+)", variant: "emerald" },
        fields: {
          type: "تسوية بالزيادة (Adjustment In)",
          stockImpact: "زيادة الرصيد المتاح للصنف في المستودع المحدد فوراً بالقيمة المدخلة.",
          financialImpact: "من حـ/ المخزون (مدين) إلى حـ/ أرباح وفروقات جردية (دائن) بسعر التكلفة.",
          triggerCondition: "اكتشاف بضاعة فعلية زائدة أثناء عمليات الجرد الدوري أو السنوي.",
        },
      },
      {
        badge: { label: "تسوية عجز (-)", variant: "rose" },
        fields: {
          type: "تسوية بالنقص (Adjustment Out)",
          stockImpact: "تخفيض الرصيد المتاح للصنف لمنع البيع السالب أو الوهمي.",
          financialImpact: "من حـ/ عجز وفاقد مخزني (مدين) إلى حـ/ المخزون (دائن) بقيمة التكلفة.",
          triggerCondition: "تلف بضاعة، انتهاء صلاحية، أو نقص مثبت بمحضر جرد رسمي.",
        },
      },
      {
        badge: { label: "شراء (+)", variant: "blue" },
        fields: {
          type: "فاتورة مشتريات (Purchase)",
          stockImpact: "زيادة كميات المخزون وتحديث متوسط التكلفة المرجح (WAC).",
          financialImpact: "من حـ/ المخزون إلى حـ/ المورد أو الصندوق/البنك بحسب طريقة الدفع.",
          triggerCondition: "اعتماد فاتورة مشتريات أو إدخال عبر نقطة المشتريات (POP).",
        },
      },
      {
        badge: { label: "بيع (-)", variant: "purple" },
        fields: {
          type: "فاتورة مبيعات (Sale)",
          stockImpact: "خصم الكميات المباعة فوراً من مستودع نقطة البيع أو المستودع الرئيسي.",
          financialImpact:
            "إثبات الإيراد + قيد تكلفة البضاعة المباعة (COGS) من حـ/ التكلفة إلى حـ/ المخزون.",
          triggerCondition: "إتمام عملية بيع في الكاشير (POS) أو فاتورة مبيعات معتمدة.",
        },
      },
      {
        badge: { label: "تحويل (⇄)", variant: "amber" },
        fields: {
          type: "تحويل بين مستودعين (Transfer)",
          stockImpact: "خصم من المستودع المصدر وإضافة إلى المستودع الهدف دون تغيير الإجمالي العام.",
          financialImpact:
            "قيد مناقلة بين مراكز التكلفة وحسابات الفروع المعنية دون أثر على الأرباح.",
          triggerCondition: "مناقلة مخزنية بين المعارض والمستودعات المركزية.",
        },
      },
    ],
  },
  stepsTitle: "الخطوات القياسية لتنفيذ تسوية مخزنية صحيحة",
  steps: [
    {
      number: "1",
      title: "إجراء الجرد الفعلي ومطابقة الباركود",
      description:
        "قم بعد الكميات الموجودة فعلياً في المستودع ومقارنتها بالرقم الظاهر في شاشة المخزون.",
    },
    {
      number: "2",
      title: "تحديد الصنف والمستودع بدقة",
      description: "تأكد من اختيار المستودع الصحيح لتفادي ترحيل كميات لمستودع فرع آخر بالخطأ.",
    },
    {
      number: "3",
      title: "تسجيل السبب والمبرر الإداري",
      description:
        "كتابة سبب التسوية (مثل: تلف ناتج عن سوء تخزين، عجز جرد شهر مارس) لسلامة التدقيق المالي.",
    },
    {
      number: "4",
      title: "مراجعة السجل بعد الحفظ",
      description:
        "تظهر الحركة فوراً في هذا الجدول مع إبراز المستخدم والوقت والتكلفة لضمان الشفافية.",
    },
  ],
  rulesTitle: "الضوابط والتحذيرات الرقابية",
  rules: [
    {
      type: "danger",
      title: "منع التعديل بأثر رجعي أو الحذف المباشر",
      description:
        "حركات المخزون تُسجل كحركات غير قابلة للحذف (Append-Only)؛ في حال وجود خطأ في تسوية سابقة، يجب تصحيحها بتسوية عكسية جديدة موثقة.",
    },
    {
      type: "warning",
      title: "صلاحيات الوصول والرقابة الثنائية",
      description:
        "صفحة التسويات تقتصر على أصحاب الصلاحيات المخولة (المالك، المدير، المحاسب، أمين المستودع) لمنع أي تلاعب غير مصرح به.",
    },
    {
      type: "info",
      title: "حماية بيانات الشركة وقاعدة البيانات الحية",
      description:
        "جميع الاستعلامات مفهرسة ومهيأة للعمل السريع دون استهلاك موارد الخادم أو التأثير على حركة البيع المستمرة.",
    },
  ],
  footerTip: "فورتيكس ERP — التدقيق الرقمي الموحد والمطابقة المحاسبية اللحظية",
};

function SettlementsPage() {
  const { t, lang } = useI18n();
  const { hasRole, user } = useAuth();
  const qc = useQueryClient();
  const canManageSettlement =
    hasRole("owner") || hasRole("manager") || hasRole("warehouse") || hasRole("accountant");
  const breakpoint = useBreakpoint();
  const tableUsesHorizontalScroll =
    breakpoint === "xs" || breakpoint === "sm" || breakpoint === "md";

  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<FilterValues>({});
  const [sort, setSort] = useState<DataTableSort | null>(null);
  const [quickFilter, setQuickFilter] = useState<"all" | "adjustment" | "in" | "out">("all");
  const [viewMode, setViewMode] = useState<"grid" | "list" | "table">("grid");

  /*
   * Origin/main's stock engine entry point: the same adjustment dialog the
   * inventory page uses, so a settlement is posted through one code path.
   */
  const [isAdjustmentOpen, setIsAdjustmentOpen] = useState(false);

  const label = (en?: string | null, ar?: string | null) =>
    (lang === "ar" ? ar || en : en || ar) ?? "—";

  const movementLabel = (type: string) => t(`movement.${type}`);

  const directionOf = (type: string): Direction =>
    DIRECTION_BY_TYPE[type as MovementType] ?? "adjustment";

  /* Warehouse options for the filter panel (read-only). */
  const { data: warehouses } = useQuery({
    queryKey: QUERY_KEYS.warehouses,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warehouses")
        .select("id, name, name_ar, code")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: canManageSettlement,
  });

  /*
   * Streaming read of the stock-movement ledger.
   *
   * The previous version asked for a hard `.limit(200)` and stopped there, so
   * any movement older than the newest 200 rows was silently invisible — a real
   * audit problem for a control screen. It now pages 50 rows at a time with
   * `.range()`, exactly like the products/inventory pages. The SELECT columns,
   * joins and ordering are unchanged; no schema, RLS or RPC was touched.
   */
  const {
    data: rowPages,
    isLoading,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetching,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: QUERY_KEYS.settlements,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const from = pageParam * SETTLEMENTS_PAGE_SIZE;
      const to = from + SETTLEMENTS_PAGE_SIZE - 1;
      const { data, error: rowsError } = await supabase
        .from("stock_movements")
        .select(
          "id, movement_type, quantity, note, created_at, product_id, warehouse_id, created_by, unit_cost, reference, reference_type, products(id,name,name_ar,sku), warehouses(id,name,name_ar,code)",
        )
        .in("movement_type", MOVEMENT_TYPES)
        .order("created_at", { ascending: false })
        .range(from, to);
      if (rowsError) throw rowsError;

      const rows = (data ?? []) as unknown as SettlementRow[];

      // stock_movements has no direct FK to profiles, so creator names are
      // resolved in a second, parallel request keyed by created_by.
      const creatorIds = Array.from(
        new Set(rows.map((row) => row.created_by).filter((id): id is string => Boolean(id))),
      );
      let profilesByUser: Record<string, { full_name: string | null }> = {};
      if (creatorIds.length > 0) {
        const { data: profiles, error: profilesError } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", creatorIds);
        if (!profilesError && profiles) {
          profilesByUser = Object.fromEntries(
            profiles.map((profile) => [profile.id, { full_name: profile.full_name }]),
          );
        }
      }

      return {
        rows: rows.map((row) => ({
          ...row,
          profiles: row.created_by ? (profilesByUser[row.created_by] ?? null) : null,
        })),
        hasMore: rows.length === SETTLEMENTS_PAGE_SIZE,
      };
    },
    getNextPageParam: (lastPage, pages) => (lastPage.hasMore ? pages.length : undefined),
    enabled: canManageSettlement,
  });

  const rows = useMemo(() => rowPages?.pages.flatMap((page) => page.rows) ?? [], [rowPages]);

  /* ---------------- search (fuzzy, Arabic-normalised) ---------------- */
  const searchIndex = useMemo(
    () =>
      buildSearchIndex(rows, (r) => [
        r.products?.name,
        r.products?.name_ar,
        r.products?.sku,
        r.warehouses?.name,
        r.warehouses?.name_ar,
        r.profiles?.full_name,
        r.note,
        r.reference,
      ]),
    [rows],
  );

  const searched = useMemo(() => {
    const q = query.trim();
    if (!q) return rows;
    return fuzzySearch(searchIndex, q, { threshold: 0.5, requireAll: true }).map((m) => m.item);
  }, [rows, query, searchIndex]);

  /* ---------------- filter definitions ---------------- */
  const filterDefinitions = useMemo<FilterDefinition[]>(() => {
    const defs: FilterDefinition[] = [];
    if (warehouses?.length) {
      defs.push({
        key: "warehouse",
        label: t("settlements.filter.warehouse"),
        type: "select",
        options: warehouses.map((w: any) => ({ value: w.id, label: label(w.name, w.name_ar) })),
      });
    }
    defs.push({
      key: "type",
      label: t("settlements.filter.type"),
      type: "select",
      options: MOVEMENT_TYPES.map((m) => ({ value: m, label: movementLabel(m) })),
    });
    defs.push({
      key: "created_at",
      label: t("settlements.filter.date"),
      type: "date-range",
    });
    return defs;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warehouses, lang, t]);

  const filtered = useMemo(
    () =>
      applyFilters(
        searched,
        filters,
        {
          warehouse: (r) => r.warehouse_id,
          type: (r) => r.movement_type,
        },
        { dateAccessors: { created_at: (r) => r.created_at } },
      ),
    [searched, filters],
  );

  const displayRows = useMemo(
    () =>
      filtered.filter((r) => {
        const d = directionOf(r.movement_type);
        if (quickFilter === "adjustment") return d === "adjustment";
        if (quickFilter === "in") return d === "in" || d === "return";
        if (quickFilter === "out") return d === "out";
        return true;
      }),
    [filtered, quickFilter],
  );

  /* ---------------- KPI counts (over loaded rows) ---------------- */
  const kpi = useMemo(() => {
    let adjustments = 0;
    let inQty = 0;
    let outQty = 0;
    for (const r of rows) {
      const d = directionOf(r.movement_type);
      if (d === "adjustment") adjustments++;
      if (d === "in" || d === "return") inQty += Math.abs(Number(r.quantity) || 0);
      if (d === "out") outQty += Math.abs(Number(r.quantity) || 0);
    }
    return { adjustments, inQty, outQty };
  }, [rows]);

  /* ---------------- sort ---------------- */
  const sortOptions = useMemo<SortOption[]>(() => {
    void sort;
    return [
      { value: "", label: lang === "ar" ? "الافتراضي (الأحدث)" : "Default (newest)" },
      // Values must match the `DataTable` column keys below, otherwise the
      // DataTable cannot resolve the sort and silently keeps the original order.
      { value: "created_at", label: t("settlements.sort.date") },
      { value: "quantity", label: t("settlements.sort.qty") },
      { value: "product", label: t("settlements.sort.product") },
      { value: "warehouse", label: t("settlements.sort.warehouse") },
    ];
  }, [lang, t, sort]);

  const sortedRows = useMemo(() => {
    if (!sort?.key) return displayRows;
    const dir = sort.direction === "desc" ? -1 : 1;
    const val = (r: SettlementRow): string | number => {
      switch (sort.key) {
        case "quantity":
          return Number(r.quantity) || 0;
        case "product":
          return (
            (lang === "ar"
              ? r.products?.name_ar || r.products?.name
              : r.products?.name || r.products?.name_ar) ?? ""
          );
        case "warehouse":
          return (
            (lang === "ar"
              ? r.warehouses?.name_ar || r.warehouses?.name
              : r.warehouses?.name || r.warehouses?.name_ar) ?? ""
          );
        default:
          return new Date(r.created_at).getTime();
      }
    };
    return [...displayRows].sort((a, b) => {
      const av = val(a);
      const bv = val(b);
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv), lang === "ar" ? "ar" : "en") * dir;
    });
  }, [displayRows, sort, lang]);

  /* ---------------- visual helpers ---------------- */
  const barClass = (d: Direction) =>
    d === "in"
      ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]"
      : d === "out"
        ? "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.45)]"
        : d === "adjustment"
          ? "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]"
          : "bg-sky-500 shadow-[0_0_8px_rgba(14,165,233,0.4)]";

  const toneOf = (d: Direction) =>
    d === "in" ? "success" : d === "out" ? "danger" : d === "adjustment" ? "warning" : "info";

  const reasonOf = (r: SettlementRow) =>
    r.note || r.adjustment_reason || r.reference || t("settlements.no_reason");

  const userOf = (r: SettlementRow) =>
    r.profiles?.full_name ?? user?.email ?? t("settlements.unknown_user");

  /* ---------------- classic table columns ---------------- */
  const columns = useMemo<DataTableColumn<SettlementRow>[]>(() => {
    return [
      {
        key: "product",
        header: t("settlements.product"),
        sortable: true,
        width: "w-[220px]",
        sortValue: (r) =>
          (lang === "ar"
            ? r.products?.name_ar || r.products?.name
            : r.products?.name || r.products?.name_ar) ?? "",
        cell: (r) => {
          const primary =
            lang === "ar"
              ? r.products?.name_ar || r.products?.name || "—"
              : r.products?.name || r.products?.name_ar || "—";
          return (
            <div className="flex flex-col py-0.5">
              <span
                className="truncate text-sm font-semibold leading-snug text-foreground"
                dir={lang === "ar" ? "rtl" : "ltr"}
              >
                {primary}
              </span>
              <span className="truncate font-mono text-[11px] text-muted-foreground">
                {r.products?.sku ?? "—"}
              </span>
            </div>
          );
        },
      },
      {
        key: "warehouse",
        header: t("settlements.warehouse"),
        sortable: true,
        width: "w-[150px]",
        sortValue: (r) => label(r.warehouses?.name, r.warehouses?.name_ar),
        cell: (r) => (
          <span className="flex items-center gap-2 truncate text-xs text-muted-foreground">
            <Warehouse className="size-3.5 shrink-0" />
            {label(r.warehouses?.name, r.warehouses?.name_ar)}
          </span>
        ),
      },
      {
        key: "type",
        header: t("settlements.type"),
        width: "w-[140px]",
        cell: (r) => (
          <StatusBadge tone={toneOf(directionOf(r.movement_type))} dot>
            {movementLabel(r.movement_type)}
          </StatusBadge>
        ),
      },
      {
        key: "quantity",
        header: t("settlements.qty"),
        align: "end",
        sortable: true,
        width: "w-[110px]",
        sortValue: (r) => Number(r.quantity) || 0,
        cell: (r) => {
          const d = directionOf(r.movement_type);
          const tone =
            d === "in"
              ? "text-emerald-500"
              : d === "out"
                ? "text-red-500"
                : d === "adjustment"
                  ? "text-amber-500"
                  : "text-sky-500";
          return (
            <span className={`font-mono text-xs font-bold tabular-nums ${tone}`}>
              {qtyCell(r.quantity)}
            </span>
          );
        },
      },
      {
        key: "reason",
        header: t("settlements.reason"),
        width: "w-[200px]",
        cell: (r) => (
          <span className="block truncate text-xs text-muted-foreground">{reasonOf(r)}</span>
        ),
      },
      {
        key: "user",
        header: t("settlements.user"),
        width: "w-[150px]",
        cell: (r) => (
          <span className="block truncate text-xs text-muted-foreground">{userOf(r)}</span>
        ),
      },
      {
        key: "created_at",
        header: t("settlements.date"),
        sortable: true,
        width: "w-[170px]",
        sortValue: (r) => new Date(r.created_at).getTime(),
        cell: (r) => (
          <span className="font-mono text-[11px] text-muted-foreground">
            {new Date(r.created_at).toLocaleString()}
          </span>
        ),
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, t, user?.email]);

  const emptyState = (
    <div className="card-mullak flex flex-col items-center justify-center space-y-3 p-12 text-center">
      <div className="grid size-14 place-items-center rounded-2xl bg-muted/30 text-muted-foreground">
        <ClipboardList className="size-8" />
      </div>
      <h4 className="text-base font-bold text-foreground">{t("settlements.empty")}</h4>
      <p className="max-w-sm text-xs text-muted-foreground">{t("settlements.empty_hint")}</p>
    </div>
  );

  if (!canManageSettlement) {
    return (
      <div className="panel-elevated rounded-3xl border border-border/80 bg-surface/90 p-8 text-center">
        <ShieldCheck className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
        <h3 className="text-lg font-semibold text-foreground">
          {lang === "ar" ? "لا يوجد صلاحية للتسويات" : "Settlement access denied"}
        </h3>
        <p className="mt-2 text-sm text-muted-foreground">
          {lang === "ar"
            ? "يحتاج المستخدم إلى صلاحية المخزون أو الإدارة لمشاهدة سجل التسويات."
            : "Inventory or admin access is required to view settlement records."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-12">
      <PageHeader
        title={lang === "ar" ? "التسويات والمراجعة" : "Stock Settlements"}
        subtitle={
          lang === "ar"
            ? "سجل واضح لكل حركة مخزون وتعديل مع مطابقة المستخدم والتاريخ والسبب"
            : "Clear audit trail for stock changes and review steps"
        }
        guide={settlementGuideConfig}
      />

      {/* ─── KPI cards ─── */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <div className="card-mullak group relative flex items-center justify-between overflow-hidden p-4 sm:p-5">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground sm:text-xs">
              {t("settlements.kpi.total")}
            </p>
            <h3 className="mt-1 font-mono text-xl font-bold tracking-tight text-foreground sm:text-2xl">
              {rows.length.toLocaleString()}
            </h3>
            <span className="mt-1 inline-flex items-center gap-1 text-[10px] text-muted-foreground/80">
              <Sparkles className="size-3 text-primary" />
              {lang === "ar" ? "داخل السجل المحمّل" : "in loaded ledger"}
            </span>
          </div>
          <div className="grid size-12 shrink-0 place-items-center rounded-2xl border border-primary/20 bg-primary/10 text-primary shadow-sm transition-transform group-hover:scale-105">
            <ClipboardList className="size-6" />
          </div>
          <div className="pointer-events-none absolute -left-6 -top-6 size-20 rounded-full bg-primary/10 blur-xl" />
        </div>

        <div className="card-mullak group relative flex items-center justify-between overflow-hidden p-4 sm:p-5">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-500/90 sm:text-xs">
              {t("settlements.kpi.adjustments")}
            </p>
            <h3 className="mt-1 font-mono text-xl font-bold tracking-tight text-amber-400 sm:text-2xl">
              {kpi.adjustments.toLocaleString()}
            </h3>
            <span className="mt-1 inline-flex items-center gap-1 text-[10px] text-amber-500/80">
              <AlertTriangle className="size-3" />
              {lang === "ar" ? "تحتاج مراجعة" : "needs review"}
            </span>
          </div>
          <div className="grid size-12 shrink-0 place-items-center rounded-2xl border border-amber-500/20 bg-amber-500/10 text-amber-400 shadow-sm transition-transform group-hover:scale-105">
            <AlertTriangle className="size-6" />
          </div>
          <div className="pointer-events-none absolute -left-6 -top-6 size-20 rounded-full bg-amber-500/10 blur-xl" />
        </div>

        <div className="card-mullak group relative flex items-center justify-between overflow-hidden p-4 sm:p-5">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-500/90 sm:text-xs">
              {t("settlements.kpi.in")}
            </p>
            <h3 className="mt-1 font-mono text-xl font-bold tracking-tight text-emerald-400 sm:text-2xl">
              {qtyCell(kpi.inQty)}
            </h3>
            <span className="mt-1 inline-flex items-center gap-1 text-[10px] text-emerald-500/80">
              <ArrowDownLeft className="size-3" />
              {lang === "ar" ? "من شراء وتحويل ومرتجع" : "purchases, transfers, returns"}
            </span>
          </div>
          <div className="grid size-12 shrink-0 place-items-center rounded-2xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 shadow-sm transition-transform group-hover:scale-105">
            <ArrowDownLeft className="size-6" />
          </div>
          <div className="pointer-events-none absolute -left-6 -top-6 size-20 rounded-full bg-emerald-500/10 blur-xl" />
        </div>

        <div className="card-mullak group relative flex items-center justify-between overflow-hidden p-4 sm:p-5">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-red-500/90 sm:text-xs">
              {t("settlements.kpi.out")}
            </p>
            <h3 className="mt-1 font-mono text-xl font-bold tracking-tight text-red-400 sm:text-2xl">
              {qtyCell(kpi.outQty)}
            </h3>
            <span className="mt-1 inline-flex items-center gap-1 text-[10px] text-red-500/80">
              <ArrowUpRight className="size-3" />
              {lang === "ar" ? "مبيعات وتحويلات" : "sales & transfers"}
            </span>
          </div>
          <div className="grid size-12 shrink-0 place-items-center rounded-2xl border border-red-500/20 bg-red-500/10 text-red-400 shadow-sm transition-transform group-hover:scale-105">
            <ArrowUpRight className="size-6" />
          </div>
          <div className="pointer-events-none absolute -left-6 -top-6 size-20 rounded-full bg-red-500/10 blur-xl" />
        </div>
      </div>

      {/* ─── Toolbar: search + filters + sort + view toggle + quick pills ─── */}
      <div className="pt-2 sm:pt-3.5">
        <TableToolbar
          sticky
          search={{
            value: query,
            onValueChange: setQuery,
            placeholder: t("settlements.search"),
            resultCount: rows.length,
            loading: isFetching && !isLoading,
          }}
          filters={{
            definitions: filterDefinitions,
            values: filters,
            onValueChange: setFilters,
          }}
          sort={{
            options: sortOptions,
            value: sort?.key ?? "",
            onValueChange: (v) => setSort(v ? { key: v, direction: "asc" } : null),
            label: lang === "ar" ? "ترتيب" : "Sort",
          }}
          viewToggle={
            <div className="flex items-center gap-1.5">
              {canManageSettlement && (
                <ToolbarAction
                  label={lang === "ar" ? "تسوية جردية جديدة" : "New Stock Adjustment"}
                  icon={<Plus />}
                  onClick={() => setIsAdjustmentOpen(true)}
                  tone="primary"
                />
              )}
              <ToolbarAction
                label={
                  viewMode === "grid"
                    ? t("settlements.view_grid")
                    : viewMode === "list"
                      ? t("settlements.view_list")
                      : t("settlements.view_classic")
                }
                icon={
                  viewMode === "grid" ? (
                    <LayoutGrid />
                  ) : viewMode === "list" ? (
                    <List />
                  ) : (
                    <TableProperties />
                  )
                }
                onClick={() =>
                  setViewMode((prev) =>
                    prev === "grid" ? "list" : prev === "list" ? "table" : "grid",
                  )
                }
                tone="ghost"
              />
            </div>
          }
        >
          {viewMode !== "table" && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
              {(
                [
                  { id: "all", label: t("settlements.quick.all"), count: rows.length },
                  {
                    id: "adjustment",
                    label: t("settlements.quick.adjustment"),
                    count: kpi.adjustments,
                  },
                  { id: "in", label: t("settlements.quick.in") },
                  { id: "out", label: t("settlements.quick.out") },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setQuickFilter(f.id)}
                  className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold transition ${
                    quickFilter === f.id
                      ? "border-primary bg-primary text-primary-foreground shadow-xs shadow-primary/20"
                      : "border-border/70 bg-surface/70 text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                  }`}
                >
                  <span>{f.label}</span>
                  {"count" in f && (
                    <span
                      className={`rounded-full px-1.5 font-mono text-[10px] ${
                        quickFilter === f.id
                          ? "bg-white/20 text-white"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {f.count}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </TableToolbar>
      </div>

      {/* ─── Grid view ─── */}
      {viewMode === "grid" ? (
        <div className="space-y-4">
          {isLoading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="card-mullak h-44 animate-pulse rounded-2xl bg-surface-2/40"
                />
              ))}
            </div>
          ) : sortedRows.length === 0 ? (
            emptyState
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
                {sortedRows.map((r) => {
                  const d = directionOf(r.movement_type);
                  const productName =
                    lang === "ar"
                      ? r.products?.name_ar || r.products?.name || "—"
                      : r.products?.name || r.products?.name_ar || "—";
                  return (
                    <div
                      key={r.id}
                      className={`card-mullak group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-r-4 p-4 transition-all duration-200 sm:p-5 ${
                        d === "in"
                          ? "border-r-emerald-500 hover:border-emerald-500/60"
                          : d === "out"
                            ? "border-r-red-500 hover:border-red-500/60"
                            : d === "adjustment"
                              ? "border-r-amber-500 hover:border-amber-500/60"
                              : "border-r-sky-500 hover:border-sky-500/60"
                      }`}
                    >
                      <div className="mb-2.5 flex items-center justify-between gap-2">
                        <StatusBadge tone={toneOf(d)} dot>
                          {movementLabel(r.movement_type)}
                        </StatusBadge>
                        <span className="inline-flex items-center gap-1 truncate rounded-md border border-border/60 bg-surface-2 px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                          <Warehouse className="size-2.5 shrink-0" />
                          <span className="truncate">
                            {label(r.warehouses?.name, r.warehouses?.name_ar)}
                          </span>
                        </span>
                      </div>

                      <div className="mb-3">
                        <h4
                          className="line-clamp-2 text-sm font-bold leading-snug text-foreground transition-colors group-hover:text-primary sm:text-base"
                          dir={lang === "ar" ? "rtl" : "ltr"}
                        >
                          {productName}
                        </h4>
                        {r.products?.sku && (
                          <p className="mt-0.5 font-mono text-[11px] text-muted-foreground/80">
                            {r.products.sku}
                          </p>
                        )}
                      </div>

                      <div className="mb-3.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                        {r.reference && (
                          <span className="rounded-md border border-border/50 bg-surface-2/70 px-2 py-0.5 font-mono text-[10px]">
                            {r.reference}
                          </span>
                        )}
                        {r.unit_cost != null && Number(r.unit_cost) > 0 && (
                          <span className="rounded-md border border-border/50 bg-surface-2/70 px-2 py-0.5 font-mono text-[10px]">
                            {lang === "ar" ? "تكلفة: " : "Cost: "}
                            {Number(r.unit_cost).toFixed(2)}
                          </span>
                        )}
                      </div>

                      <div className="mt-auto flex items-end justify-between gap-2 border-t border-border/60 pt-3">
                        <div className="min-w-0">
                          <p className="text-[10px] font-medium text-muted-foreground">
                            {t("settlements.qty")}
                          </p>
                          <p
                            className={`font-mono text-lg font-bold tracking-tight ${
                              d === "in"
                                ? "text-emerald-500"
                                : d === "out"
                                  ? "text-red-500"
                                  : d === "adjustment"
                                    ? "text-amber-500"
                                    : "text-sky-500"
                            }`}
                          >
                            {qtyCell(r.quantity)}
                          </p>
                          <p className="truncate text-[10px] text-muted-foreground/70">
                            {userOf(r)}
                          </p>
                        </div>
                        <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                          {new Date(r.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {hasNextPage && (
                <div className="flex justify-center pt-4">
                  <button
                    onClick={() => void fetchNextPage()}
                    disabled={isFetchingNextPage}
                    className="flex items-center gap-2 rounded-2xl border border-border/80 bg-surface px-6 py-2.5 text-xs font-bold text-foreground shadow-sm transition hover:bg-surface-2 active:scale-95 disabled:opacity-50"
                  >
                    {isFetchingNextPage ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        <span>{t("settlements.loading_more")}</span>
                      </>
                    ) : (
                      <span>{t("settlements.load_more")}</span>
                    )}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      ) : viewMode === "list" ? (
        /* ─── List view ─── */
        <div className="space-y-3">
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="card-mullak h-20 animate-pulse rounded-2xl bg-surface-2/40"
                />
              ))}
            </div>
          ) : sortedRows.length === 0 ? (
            emptyState
          ) : (
            <>
              <div className="space-y-2.5">
                {sortedRows.map((r) => {
                  const d = directionOf(r.movement_type);
                  const productName =
                    lang === "ar"
                      ? r.products?.name_ar || r.products?.name || "—"
                      : r.products?.name || r.products?.name_ar || "—";
                  return (
                    <div
                      key={r.id}
                      className="card-mullak group relative flex flex-col justify-between gap-3 rounded-2xl border p-3.5 transition-all duration-200 hover:border-primary/50 hover:shadow-md sm:p-4 md:flex-row md:items-center"
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <span
                          aria-hidden
                          className={`h-11 w-1.5 shrink-0 rounded-full sm:h-12 ${barClass(d)}`}
                        />
                        <div className="grid size-11 shrink-0 place-items-center rounded-xl border border-primary/20 bg-primary/10 text-primary transition-all group-hover:scale-105 group-hover:bg-primary group-hover:text-primary-foreground">
                          <Boxes className="size-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4
                              className="truncate text-sm font-bold leading-snug text-foreground transition-colors group-hover:text-primary sm:text-base"
                              dir={lang === "ar" ? "rtl" : "ltr"}
                            >
                              {productName}
                            </h4>
                            <StatusBadge tone={toneOf(d)} dot>
                              {movementLabel(r.movement_type)}
                            </StatusBadge>
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                            <span className="inline-flex items-center gap-1 text-[10px]">
                              <Warehouse className="size-2.5" />
                              {label(r.warehouses?.name, r.warehouses?.name_ar)}
                            </span>
                            <span className="truncate text-[10px]">{reasonOf(r)}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-3 ps-4 text-xs sm:gap-4 md:ps-0">
                        <span className="hidden font-mono text-[11px] text-muted-foreground sm:inline">
                          {new Date(r.created_at).toLocaleString()}
                        </span>
                        <span
                          className={`font-mono text-base font-bold tracking-tight ${
                            d === "in"
                              ? "text-emerald-500"
                              : d === "out"
                                ? "text-red-500"
                                : d === "adjustment"
                                  ? "text-amber-500"
                                  : "text-sky-500"
                          }`}
                        >
                          {qtyCell(r.quantity)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {hasNextPage && (
                <div className="flex justify-center pt-4">
                  <button
                    onClick={() => void fetchNextPage()}
                    disabled={isFetchingNextPage}
                    className="flex items-center gap-2 rounded-2xl border border-border/80 bg-surface px-6 py-2.5 text-xs font-bold text-foreground shadow-sm transition hover:bg-surface-2 active:scale-95 disabled:opacity-50"
                  >
                    {isFetchingNextPage ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        <span>{t("settlements.loading_more")}</span>
                      </>
                    ) : (
                      <span>{t("settlements.load_more")}</span>
                    )}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        /* ─── Classic table view with infinite scroll sentinel ─── */
        <div className="panel-elevated -mx-1 overflow-hidden rounded-3xl border border-border/80 sm:mx-0">
          <DataTable
            className="px-0"
            columns={columns}
            rows={displayRows}
            rowKey={(r) => r.id}
            loading={isLoading}
            initialLoading={isLoading}
            refreshing={isFetching && !isLoading && !isFetchingNextPage}
            error={(error as Error) ?? null}
            onRetry={() => refetch()}
            sort={sort}
            onSortChange={setSort}
            infinite
            hasMore={Boolean(hasNextPage)}
            onLoadMore={() => {
              if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
            }}
            loadingMore={isFetchingNextPage}
            pageSize={SETTLEMENTS_PAGE_SIZE}
            totalCount={rows.length}
            minWidth={1000}
            horizontalScroll={tableUsesHorizontalScroll}
            stickyHeader
            empty={{
              icon: <ClipboardList />,
              title: t("settlements.empty"),
              description: t("settlements.empty_hint"),
            }}
          />
        </div>
      )}

      <p className="px-1 text-[11px] text-muted-foreground/70">{t("settlements.scope_hint")}</p>

      {/*
       * Origin/main's stock engine: the adjustment is posted through the same
       * dialog the inventory page uses, then both ledgers are refreshed.
       */}
      {isAdjustmentOpen && (
        <StockAdjustmentDialog
          onClose={() => setIsAdjustmentOpen(false)}
          onSaved={() => {
            setIsAdjustmentOpen(false);
            qc.invalidateQueries({ queryKey: ["settlements"] });
            qc.invalidateQueries({ queryKey: ["inventory"] });
          }}
        />
      )}
    </div>
  );
}
