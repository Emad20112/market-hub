import { ModuleGuard } from "@/lib/modules";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { useI18n } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { money } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BookOpen,
  Plus,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Receipt,
  User,
  CreditCard,
  Building,
  RefreshCw,
} from "lucide-react";

export const Route = createFileRoute("/_app/supplier-ledger")({
  head: () => ({
    meta: [{ title: "دفتر أستاذ الموردين وسندات الصرف — Vortex ERP" }],
  }),
  component: () => (
    <ModuleGuard moduleId="advanced_accounting">
      <SupplierLedgerPage />
    </ModuleGuard>
  ),
});

interface Supplier {
  id: string;
  name: string;
  phone: string | null;
  balance: number;
}

interface LedgerMovement {
  id: string;
  occurred_at: string;
  entry_type: string;
  debit: number;
  credit: number;
  running_balance: number;
  reference_type: string | null;
  reference_id: string | null;
  due_date: string | null;
  note: string | null;
}

interface PaymentVoucher {
  id: string;
  voucher_number: string;
  supplier_id: string;
  amount: number;
  payment_method: string;
  account_code: string;
  payment_date: string;
  journal_entry_id: string | null;
  notes: string | null;
}

function SupplierLedgerPage() {
  const { isRtl } = useI18n();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>("");
  const [movements, setMovements] = useState<LedgerMovement[]>([]);
  const [recentVouchers, setRecentVouchers] = useState<PaymentVoucher[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMovements, setLoadingMovements] = useState(false);
  const [actionMessage, setActionMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Filters
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Payment Dialog State
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("CASH");
  const [payAccount, setPayAccount] = useState("1101");
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));
  const [payNotes, setPayNotes] = useState("");
  const [submittingPayment, setSubmittingPayment] = useState(false);

  // 1. Fetch Suppliers
  const fetchSuppliers = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("suppliers")
        .select("id, name, phone, balance")
        .order("name");

      if (error) throw error;
      const list = (data || []).map((s) => ({
        id: s.id,
        name: s.name,
        phone: s.phone,
        balance: Number(s.balance) || 0,
      }));
      setSuppliers(list);
      if (list.length > 0 && !selectedSupplierId) {
        setSelectedSupplierId(list[0].id);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setActionMessage({
        type: "error",
        text: `فشل تحميل قائمة الموردين: ${msg}`,
      });
    } finally {
      setLoading(false);
    }
  }, [selectedSupplierId]);

  // 2. Fetch Recent Vouchers
  const fetchRecentVouchers = useCallback(async () => {
    try {
      const { data, error } = await (supabase as any)
        .from("supplier_payments")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);

      if (!error && data) {
        setRecentVouchers(data);
      }
    } catch {
      // ignore
    }
  }, []);

  // 3. Fetch Supplier Ledger Statement
  const fetchStatement = useCallback(
    async (supplierId: string) => {
      if (!supplierId) return;
      setLoadingMovements(true);
      try {
        const { data, error } = await (supabase as any).rpc("get_supplier_statement", {
          p_supplier_id: supplierId,
          p_start_date: startDate ? new Date(startDate).toISOString() : null,
          p_end_date: endDate ? new Date(endDate).toISOString() : null,
        });

        if (error) {
          // Fallback to direct query on supplier_ledger if RPC unavailable
          const { data: raw, error: rawErr } = await (supabase as any)
            .from("supplier_ledger")
            .select("*")
            .eq("supplier_id", supplierId)
            .order("occurred_at", { ascending: false });

          if (rawErr) throw rawErr;
          setMovements(
            (raw || []).map((r: any) => ({
              id: r.id,
              occurred_at: r.occurred_at,
              entry_type: r.entry_type,
              debit: Number(r.debit) || 0,
              credit: Number(r.credit) || 0,
              running_balance: Number(r.balance_after) || 0,
              reference_type: r.reference_type,
              reference_id: r.reference_id,
              due_date: r.due_date,
              note: r.note,
            })),
          );
        } else {
          setMovements(
            (data || []).map((r: any) => ({
              id: r.id,
              occurred_at: r.occurred_at,
              entry_type: r.entry_type,
              debit: Number(r.debit) || 0,
              credit: Number(r.credit) || 0,
              running_balance: Number(r.running_balance) || 0,
              reference_type: r.reference_type,
              reference_id: r.reference_id,
              due_date: r.due_date,
              note: r.note,
            })),
          );
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setActionMessage({
          type: "error",
          text: `فشل جلب كشف حساب المورد: ${msg}`,
        });
      } finally {
        setLoadingMovements(false);
      }
    },
    [startDate, endDate],
  );

  useEffect(() => {
    fetchSuppliers();
    fetchRecentVouchers();
  }, [fetchSuppliers, fetchRecentVouchers]);

  useEffect(() => {
    if (selectedSupplierId) {
      fetchStatement(selectedSupplierId);
    }
  }, [selectedSupplierId, fetchStatement]);

  const selectedSupplier = useMemo(
    () => suppliers.find((s) => s.id === selectedSupplierId),
    [suppliers, selectedSupplierId],
  );

  // Summary figures
  const totalDebits = useMemo(() => movements.reduce((acc, m) => acc + m.debit, 0), [movements]);
  const totalCredits = useMemo(() => movements.reduce((acc, m) => acc + m.credit, 0), [movements]);

  // 4. Submit Payment
  const handleRecordPayment = async () => {
    const amt = parseFloat(payAmount);
    if (!selectedSupplierId || isNaN(amt) || amt <= 0) {
      setActionMessage({
        type: "error",
        text: "يرجى اختيار المورد وتحديد مبلغ سداد صحيح أكبر من الصفر",
      });
      return;
    }

    setSubmittingPayment(true);
    setActionMessage(null);
    try {
      const { data, error } = await (supabase as any).rpc("record_supplier_payment", {
        p_supplier_id: selectedSupplierId,
        p_amount: amt,
        p_payment_method: payMethod,
        p_account_code: payAccount,
        p_payment_date: payDate || new Date().toISOString().slice(0, 10),
        p_notes: payNotes || null,
      });

      if (error) throw error;

      const voucherNo = data?.voucher_number || "";
      setActionMessage({
        type: "success",
        text: `تم تسجيل وترحيل سند الصرف بنجاح (رقم السند: ${voucherNo})، وقيد المحاسبة Dr 2111 / Cr ${payAccount}.`,
      });

      setPaymentDialogOpen(false);
      setPayAmount("");
      setPayNotes("");
      // Refresh
      fetchSuppliers();
      fetchRecentVouchers();
      fetchStatement(selectedSupplierId);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setActionMessage({
        type: "error",
        text: `فشل ترحيل سند الصرف: ${msg}`,
      });
    } finally {
      setSubmittingPayment(false);
    }
  };

  const getEntryBadge = (type: string) => {
    switch (type) {
      case "PURCHASE_INVOICE":
        return (
          <Badge variant="outline" className="border-blue-500 text-blue-600">
            فاتورة مشتريات
          </Badge>
        );
      case "PAYMENT":
        return (
          <Badge variant="default" className="bg-emerald-600 text-white">
            سند صرف / سداد
          </Badge>
        );
      case "PURCHASE_RETURN":
        return (
          <Badge variant="secondary" className="border-amber-500 text-amber-700">
            مرتجع مشتريات
          </Badge>
        );
      case "OPENING_BALANCE":
        return <Badge variant="outline">رصيد افتتاحي</Badge>;
      default:
        return <Badge variant="outline">{type}</Badge>;
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto" dir={isRtl ? "rtl" : "ltr"}>
      <PageHeader
        title="دفتر أستاذ الموردين وسندات الصرف"
        subtitle="كشف حساب تفصيلي لكل مورد، وسندات الصرف النقدية والبنكية مع الترحيل المحاسبي الذري المزدوج (Dr 2111 / Cr 1101/1111)."
      >
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              fetchSuppliers();
              fetchRecentVouchers();
              if (selectedSupplierId) fetchStatement(selectedSupplierId);
            }}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ml-1.5 ${loading ? "animate-spin" : ""}`} />
            تحديث
          </Button>
          <Button
            size="sm"
            onClick={() => setPaymentDialogOpen(true)}
            disabled={!selectedSupplierId}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            <Plus className="h-4 w-4 ml-1.5" />
            سند صرف مورد جديد
          </Button>
        </div>
      </PageHeader>

      {/* Notifications */}
      {actionMessage && (
        <div
          className={`p-4 rounded-lg flex items-center gap-3 border ${
            actionMessage.type === "success"
              ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200"
              : "bg-destructive/10 border-destructive/20 text-destructive"
          }`}
        >
          {actionMessage.type === "success" ? (
            <CheckCircle2 className="h-5 w-5 shrink-0" />
          ) : (
            <AlertTriangle className="h-5 w-5 shrink-0" />
          )}
          <span className="text-sm font-medium">{actionMessage.text}</span>
        </div>
      )}

      {/* Supplier Selector & Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Supplier Dropdown Card */}
        <Card className="md:col-span-1 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <User className="h-4 w-4 text-primary" />
              اختيار المورد
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">المورد</Label>
              <Select value={selectedSupplierId} onValueChange={setSelectedSupplierId}>
                <SelectTrigger>
                  <SelectValue placeholder="اختر المورد..." />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} ({money(s.balance)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedSupplier && (
              <div className="text-xs space-y-1 bg-muted/40 p-2.5 rounded border">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">الهاتف:</span>
                  <span className="font-mono">{selectedSupplier.phone || "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">الرصيد الدفتري:</span>
                  <span className="font-bold text-primary">{money(selectedSupplier.balance)}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Current Balance Card */}
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground">
              الرصيد المستحق الحالي للمورد
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">
              {money(selectedSupplier?.balance || 0)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              الالتزام القائم في ذمم الموردين (حساب 2111)
            </p>
          </CardContent>
        </Card>

        {/* Total Invoices (Credits) */}
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground">
              إجمالي فواتير التوريد (دائن)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{money(totalCredits)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              إجمالي المشتريات المفوترة خلال الفترة
            </p>
          </CardContent>
        </Card>

        {/* Total Payments (Debits) */}
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground">
              إجمالي المدفوعات والمرتجعات (مدين)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">{money(totalDebits)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              إجمالي سندات الصرف والمرتجعات المسجلة
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Date Filter & Search */}
      <Card className="shadow-sm">
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1">
              <Label className="text-xs">من تاريخ</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-44"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">إلى تاريخ</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-44"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setStartDate("");
                setEndDate("");
              }}
            >
              إلغاء تصفية التاريخ
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Movements Ledger Table */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            كشف الحساب التفصيلي: {selectedSupplier?.name || "المورد المحدد"}
          </CardTitle>
          <Badge variant="outline" className="text-xs">
            {movements.length} حركة مسجلة
          </Badge>
        </CardHeader>
        <CardContent className="p-0">
          {loadingMovements ? (
            <div className="p-12 text-center text-muted-foreground flex flex-col items-center gap-2">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <span>جاري تحميل حركات دفتر المورد...</span>
            </div>
          ) : movements.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              لا توجد حركات مسجلة لهذا المورد ضمن الفترة المحددة.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>التاريخ والوقت</TableHead>
                  <TableHead>نوع الحركة</TableHead>
                  <TableHead>البيان / الملاحظة</TableHead>
                  <TableHead>تاريخ الاستحقاق</TableHead>
                  <TableHead className="text-emerald-700">مدين (سداد/مرتجع)</TableHead>
                  <TableHead className="text-blue-700">دائن (فاتورة/توريد)</TableHead>
                  <TableHead className="text-primary font-bold">الرصيد التراكمي</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movements.map((m) => (
                  <TableRow key={m.id} className="hover:bg-muted/30">
                    <TableCell className="font-mono text-xs">
                      {new Date(m.occurred_at).toLocaleString("ar-SA", {
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </TableCell>
                    <TableCell>{getEntryBadge(m.entry_type)}</TableCell>
                    <TableCell className="max-w-md truncate text-xs">{m.note || "—"}</TableCell>
                    <TableCell className="text-xs">
                      {m.due_date ? (
                        <span className="font-mono text-muted-foreground">{m.due_date}</span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-emerald-600 font-semibold">
                      {m.debit > 0 ? money(m.debit) : "—"}
                    </TableCell>
                    <TableCell className="font-mono text-blue-600 font-semibold">
                      {m.credit > 0 ? money(m.credit) : "—"}
                    </TableCell>
                    <TableCell className="font-mono font-bold text-primary">
                      {money(m.running_balance)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Recent Supplier Payment Vouchers */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Receipt className="h-5 w-5 text-primary" />
            آخر سندات الصرف المعتمدة (Supplier Payment Vouchers)
          </CardTitle>
          <Badge variant="outline" className="text-xs">
            {recentVouchers.length} سند
          </Badge>
        </CardHeader>
        <CardContent className="p-0">
          {recentVouchers.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              لم يتم تسجيل سندات صرف مستقلة بعد.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>رقم السند</TableHead>
                  <TableHead>المورد</TableHead>
                  <TableHead>تاريخ الصرف</TableHead>
                  <TableHead>طريقة الدفع</TableHead>
                  <TableHead>الحساب المنصرف منه</TableHead>
                  <TableHead>المبلغ المنصرف</TableHead>
                  <TableHead>البيان</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentVouchers.map((v) => {
                  const s = suppliers.find((x) => x.id === v.supplier_id);
                  return (
                    <TableRow key={v.id} className="hover:bg-muted/30">
                      <TableCell className="font-mono font-bold text-primary">
                        {v.voucher_number}
                      </TableCell>
                      <TableCell className="font-medium">
                        {s ? s.name : v.supplier_id.slice(0, 8)}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{v.payment_date}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {v.payment_method}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {v.account_code === "1101"
                          ? "1101 — الصندوق الرئيسي"
                          : v.account_code === "1111"
                            ? "1111 — البنك التجاري"
                            : v.account_code}
                      </TableCell>
                      <TableCell className="font-mono font-bold text-emerald-600">
                        {money(v.amount)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-xs truncate">
                        {v.notes || "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Record Payment Dialog */}
      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent className="sm:max-w-[500px]" dir={isRtl ? "rtl" : "ltr"}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-emerald-600" />
              تسجيل سند صرف مورد جديد
            </DialogTitle>
            <DialogDescription>
              ترحيل قيد محاسبي مزدوج (Dr 2111 ذمم الموردين / Cr 1101 الصندوق أو 1111 البنك)، وتحديث
              رصيد المورد ودفتره ذرياً.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">المورد المستفيد *</Label>
              <Select value={selectedSupplierId} onValueChange={setSelectedSupplierId}>
                <SelectTrigger>
                  <SelectValue placeholder="اختر المورد..." />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} (الرصيد: {money(s.balance)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">المبلغ المسدد *</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="0.00"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">تاريخ السند *</Label>
                <Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">طريقة الدفع</Label>
                <Select value={payMethod} onValueChange={setPayMethod}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CASH">نقداً (Cash)</SelectItem>
                    <SelectItem value="BANK">تحويل بنكي (Bank Transfer)</SelectItem>
                    <SelectItem value="CHEQUE">شيك (Cheque)</SelectItem>
                    <SelectItem value="CARD">بطاقة / مدى (Card)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">حساب الصرف المالي</Label>
                <Select value={payAccount} onValueChange={setPayAccount}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1101">1101 — الصندوق الرئيسي</SelectItem>
                    <SelectItem value="1111">1111 — الحساب البنكي</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">بيان / ملاحظات السند</Label>
              <Input
                placeholder="سداد دفعة تحت الحساب / فاتورة توريد رقم..."
                value={payNotes}
                onChange={(e) => setPayNotes(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPaymentDialogOpen(false)}>
              إلغاء
            </Button>
            <Button
              onClick={handleRecordPayment}
              disabled={submittingPayment}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {submittingPayment ? (
                <>
                  <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                  جاري الترحيل والحفظ...
                </>
              ) : (
                "اعتماد وترحيل سند الصرف"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
