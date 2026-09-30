/**
 * Market-Hub ERP — Milling module: printable documents.
 *
 * Three documents, each with a thermal (80 mm) and an A4/A5 layout, because a
 * mill prints three different things at three different moments:
 *
 *   printIntakeReceipt()      the scale house, at the moment grain is weighed in
 *   printDeliveryNote()       the gate, when a truck of the customer's flour leaves
 *   printMillingJobTicket()   the mill floor, as a batch running order
 *
 * Each renders into a hidden iframe and calls print() — never a new tab, and
 * never a popup the browser can block. Same posture as `invoice-print.ts`.
 */

import type { MillingDelivery, MillingIntake, MillingJob, MillingOutput } from "@/lib/milling";
import { outputLabel } from "@/lib/milling";

export type MillingPaper = "thermal" | "a4" | "a5";

const COMPANY_CACHE_KEY = "company_settings_cache";

type CompanyInfo = {
  name?: string;
  legal_name?: string;
  phone?: string;
  address?: string;
  tax_number?: string;
  currency_symbol?: string;
};

function readCompany(): CompanyInfo {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(COMPANY_CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

const esc = (v: unknown): string =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** Arabic-Indic digits are what an Arabic scale house expects on a weight slip. */
const n = (v: unknown, digits = 3): string => {
  const num = Number(v ?? 0);
  if (!Number.isFinite(num)) return "0";
  return num.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
};

const kgToTons = (kg: unknown): string =>
  (Number(kg ?? 0) / 1000).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  });

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("ar-EG", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return "—";
  }
}

/**
 * A Code-39 payload built from a document number.
 *
 * The document number is already unique per store, so the barcode is too — and a
 * gate scanner can therefore read a delivery note without any network lookup.
 */
function barcodeSvg(value: string): string {
  // Code 39 encodes each character as 9 elements (5 bars, 4 spaces) plus the
  // narrow/wide inter-character gap. We render it as an SVG so it stays crisp on
  // both a thermal head and a 300 dpi laser.
  const narrow = 2;
  const wide = 5;
  const charset = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%";

  const patterns: Record<string, string> = {
    "0": "nnnwwnwnn",
    "1": "wnnwnnnnw",
    "2": "nnwwnnnnw",
    "3": "wnwwnnnnn",
    "4": "nnnwwnnnw",
    "5": "wnnwwnnnn",
    "6": "nnwwwnnnn",
    "7": "nnnwnnwnw",
    "8": "wnnwnnwnn",
    "9": "nnwwnnwnn",
    A: "wnnnnwnnw",
    B: "nnwnnwnnw",
    C: "wnwnnwnnn",
    D: "nnnnwwnnw",
    E: "wnnnwwnnn",
    F: "nnwnwwnnn",
    G: "nnnnnwwnw",
    H: "wnnnnwwnn",
    I: "nnwnnwwnn",
    J: "nnnnwwwnn",
    K: "wnnnnnnww",
    L: "nnwnnnnww",
    M: "wnwnnnnwn",
    N: "nnnnwnnww",
    O: "wnnnwnnwn",
    P: "nnwnwnnwn",
    Q: "nnnnnnwww",
    R: "wnnnnnwwn",
    S: "nnwnnnwwn",
    T: "nnnnwnwwn",
    U: "wwnnnnnnw",
    V: "nwwnnnnnw",
    W: "wwwnnnnnn",
    X: "nwnnwnnnw",
    Y: "wwnnwnnnn",
    Z: "nwwnwnnnn",
    "-": "nwnnnnwnw",
    ".": "wwnnnnwnn",
    " ": "nwwnnnwnn",
    "/": "nwnwnwnnn",
    $: "nwnwnwnnn",
    "+": "nwnnnwnwn",
    "%": "nnnwnwnwn",
    "*": "nwnnwnwnn",
  };

  let bars = "";
  let x = 0;
  const text = `*${value}*`;

  for (const ch of text) {
    const pattern = patterns[ch] ?? patterns["-"];
    for (let i = 0; i < pattern.length; i++) {
      const width = pattern[i] === "w" ? wide : narrow;
      if (pattern[i] === "n") {
        bars += `<rect x="${x}" y="0" width="${width}" height="44" fill="#000"/>`;
      }
      x += width;
    }
    x += narrow; // inter-character gap
  }

  const width = x + 20;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} 60" width="${width}" height="60" role="img" aria-label="${esc(value)}">
    ${bars}
    <text x="${width / 2}" y="57" font-family="monospace" font-size="11" text-anchor="middle" fill="#000">${esc(value)}</text>
  </svg>`;
}

const shell = (title: string, body: string, paper: MillingPaper): string => {
  const sizes: Record<MillingPaper, { w: string; h: string; pad: string }> = {
    // 80 mm thermal roll
    thermal: { w: "80mm", h: "auto", pad: "4mm" },
    a4: { w: "210mm", h: "297mm", pad: "12mm" },
    a5: { w: "148mm", h: "210mm", pad: "8mm" },
  };
  const s = sizes[paper];

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="utf-8"/>
<title>${esc(title)}</title>
<style>
  @page { size: ${paper === "thermal" ? "80mm auto" : s.w + " " + s.h}; margin: 0; }
  * { box-sizing: border-box; }
  body {
    font-family: "Segoe UI", Tahoma, "Noto Naskh Arabic", sans-serif;
    width: ${s.w}; margin: 0; padding: ${s.pad}; color: #000; background: #fff;
    font-size: ${paper === "thermal" ? "10.5pt" : "11pt"}; line-height: 1.5;
  }
  h1 { font-size: ${paper === "thermal" ? "14pt" : "17pt"}; margin: 0 0 2px; text-align: center; }
  h2 { font-size: ${paper === "thermal" ? "11pt" : "13pt"}; margin: 0 0 6px; text-align: center; font-weight: 700; }
  .sub { text-align: center; font-size: 9pt; margin-bottom: 8px; }
  hr { border: 0; border-top: 1px dashed #000; margin: 6px 0; }
  table { width: 100%; border-collapse: collapse; margin: 4px 0; }
  td, th { padding: 2px 3px; vertical-align: top; font-size: ${paper === "thermal" ? "10pt" : "10.5pt"}; }
  .kv td:first-child { width: 34%; font-weight: 700; }
  .totals { font-weight: 700; }
  .sig { margin-top: 14px; display: flex; gap: 18px; font-size: 9pt; }
  .sig > div { flex: 1; border-top: 1px solid #000; padding-top: 3px; }
  .barcode { text-align: center; margin: 8px 0 4px; }
  .note { font-size: 8.5pt; margin-top: 6px; }
  .sign { display: flex; justify-content: space-between; font-size: 9pt; font-weight: 700; }
  .foot { text-align: center; font-size: 8pt; margin-top: 8px; }
  @media print { body { width: auto; } .no-print { display: none; } }
</style>
</head>
<body>${body}</body>
</html>`;
};

function emit(html: string, delay = 350) {
  const iframe = document.createElement("iframe");
  iframe.style.cssText =
    "position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;border:0;visibility:hidden;";
  document.body.appendChild(iframe);

  const cw = iframe.contentWindow!;
  cw.document.open();
  cw.document.write(html);
  cw.document.close();

  setTimeout(() => {
    try {
      cw.focus();
      cw.print();
    } finally {
      setTimeout(() => {
        try {
          document.body.removeChild(iframe);
        } catch {
          /* already removed */
        }
      }, 2000);
    }
  }, delay);
}

/* ------------------------------------------------------- 1. intake slip */

export function printIntakeReceipt(
  doc: {
    receipt: MillingIntake;
    customerName: string;
    warehouseName?: string | null;
  },
  paper: MillingPaper = "thermal",
) {
  const c = readCompany();
  const r = doc.receipt;

  const shortage = Number(r.nominal_weight_kg ?? 0) - Number(r.net_weight_kg ?? 0);

  const body = `
    <h1>${esc(c.legal_name || c.name || "مطاحن")}</h1>
    <div class="sub">
      ${esc(c.address ?? "")}${c.phone ? " — " + esc(c.phone) : ""}
      ${c.tax_number ? "<br/>الرقم الضريبي: " + esc(c.tax_number) : ""}
    </div>
    <hr/>
    <h2>سند استلام أمانات — ${esc(r.receipt_number)}</h2>

    <table class="kv">
      <tr><td>العميل</td><td>${esc(doc.customerName)}</td></tr>
      <tr><td>نوع الحبوب</td><td>${esc(r.grain_type)}</td></tr>
      <tr><td>المستودع</td><td>${esc(doc.warehouseName ?? r.store_id)}</td></tr>
      <tr><td>مكان التخزين</td><td>${esc(r.silo_or_location || "—")}</td></tr>
      <tr><td>رقم الشاحنة</td><td>${esc(r.truck_plate_number || "—")}</td></tr>
      <tr><td>السائق</td><td>${esc(r.driver_name || "—")}</td></tr>
      <tr><td>التاريخ</td><td>${esc(formatDate(r.created_at))}</td></tr>
    </table>

    <hr/>
    <table>
      <thead>
        <tr><th>عدد الأكياس</th><th>سعة الكيس</th><th>الوزن الاسمي</th></tr>
      </thead>
      <tbody>
        <tr><td>${n(r.intake_bag_count, 0)}</td><td>${n(r.bag_size_kg, 2)} كجم</td><td>${n(r.nominal_weight_kg)} كجم</td></tr>
      </tbody>
    </table>

    <table>
      <thead>
        <tr><th>الوزن القائم</th><th>الوزن الفارغ</th><th>الوزن الصافي</th></tr>
      </thead>
      <tbody>
        <tr><td>${n(r.gross_weight_kg)}</td><td>${n(r.tare_weight_kg)}</td><td>${n(r.net_weight_kg)}</td></tr>
      </tbody>
    </table>

    <p class="totals">إجمالي صافي مستلم: ${n(r.net_weight_kg)} كجم (${kgToTons(r.net_weight_kg)} طن)</p>
    ${
      Math.abs(shortage) >= 1
        ? `<p class="note"><strong>فرق أوزان الأكياس:</strong> ${n(shortage)} كجم ${
            shortage > 0 ? "(عجز في أوزان الأكياس عن الاسمي)" : "(زيادة عن الاسمي)"
          }</p>`
        : ""
    }

    <table class="kv">
      <tr><td>نسبة الرطوبة</td><td>${n(r.moisture_percentage, 2)} %</td></tr>
      <tr><td>نسبة الشوائب</td><td>${n(r.impurities_percentage, 2)} %</td></tr>
    </table>

    ${r.notes ? `<hr/><p class="note"><strong>ملاحظات:</strong> ${esc(r.notes)}</p>` : ""}

    <div class="sig">
      <div>مستلم من العميل</div>
      <div>أمين المخزن</div>
      <div>مدير المصنع</div>
    </div>

    <div class="foot">
      هذا السند إثبات استلام أمانات عينية فقط، ولا يُثبت أي عملية شراء أو مديونية.
    </div>
  `;

  emit(shell(`سند استلام أمانات ${r.receipt_number}`, body, paper));
}

/* ----------------------------------------------------- 2. delivery note */

export function printDeliveryNote(
  doc: {
    delivery: MillingDelivery;
    customerName: string;
    jobNumber: string;
    warehouseName?: string | null;
    items: {
      output_type: string;
      bag_size_kg: number;
      delivered_bags: number;
      delivered_weight_kg: number;
    }[];
  },
  paper: MillingPaper = "a5",
) {
  const c = readCompany();
  const d = doc.delivery;

  const body = `
    <h1>${esc(c.legal_name || c.name || "مطاحن")}</h1>
    <div class="sub">${esc(c.address ?? "")}${c.phone ? " — " + esc(c.phone) : ""}</div>
    <hr/>
    <h2>إذن خروج وتسليم نواتج أمانات — ${esc(d.delivery_number)}</h2>

    <table class="kv">
      <tr><td>العميل</td><td>${esc(doc.customerName)}</td></tr>
      <tr><td>أمر الطحن</td><td>${esc(doc.jobNumber)}</td></tr>
      <tr><td>رقم الشاحنة</td><td>${esc(d.truck_plate_number || "—")}</td></tr>
      <tr><td>السائق</td><td>${esc(d.driver_name || "—")}</td></tr>
      <tr><td>المستودع</td><td>${esc(doc.warehouseName ?? d.store_id)}</td></tr>
      <tr><td>التاريخ</td><td>${esc(formatDate(d.created_at))}</td></tr>
    </table>

    <hr/>
    <table>
      <thead>
        <tr><th>الصنف</th><th>سعة الكيس</th><th>عدد الأكياس</th><th>الوزن (كجم)</th></tr>
      </thead>
      <tbody>
        ${doc.items
          .map(
            (i) => `<tr>
              <td>${esc(outputLabel(i.output_type as any))}</td>
              <td>${n(i.bag_size_kg, 2)}</td>
              <td>${n(i.delivered_bags, 0)}</td>
              <td>${n(i.delivered_weight_kg)}</td>
            </tr>`,
          )
          .join("")}
      </tbody>
      <tfoot>
        <tr class="totals">
          <td colspan="2">الإجمالي</td>
          <td>${n(d.total_bags, 0)}</td>
          <td>${n(d.total_weight_kg)}</td>
        </tr>
      </tfoot>
    </table>

    <p class="totals">إجمالي المحمّل: ${n(d.total_bags, 0)} كيس — ${kgToTons(d.total_weight_kg)} طن</p>

    ${d.notes ? `<hr/><p class="note"><strong>ملاحظات:</strong> ${esc(d.notes)}</p>` : ""}

    <div class="sig">
      <div>أمين البوابة</div>
      <div>سائق الشاحنة</div>
      <div>توقيع العميل</div>
    </div>

    <div class="barcode">${barcodeSvg(d.delivery_number)}</div>
    <div class="foot">
      إذن تسليم عيني فقط — لا ينشئ أي مديونية نقدية ولا يؤثر على مخزون المنشأة.
    </div>
  `;

  emit(shell(`إذن تسليم ${d.delivery_number}`, body, paper), 450);
}

/* --------------------------------------------------- 3. mill floor job */

export function printMillingJobTicket(
  doc: {
    job: MillingJob;
    customerName: string;
    intakeNumber: string;
    outputs: MillingOutput[];
  },
  paper: MillingPaper = "a4",
) {
  const c = readCompany();
  const j = doc.job;

  const produced = doc.outputs.reduce((s, o) => s + Number(o.produced_weight_kg ?? 0), 0);
  const bags = doc.outputs.reduce((s, o) => s + Number(o.produced_bag_count ?? 0), 0);
  const loss = Number(j.input_weight_kg ?? 0) - produced;
  const allowed = (Number(j.input_weight_kg ?? 0) * Number(j.allowed_loss_percentage ?? 0)) / 100;

  const body = `
    <h1>${esc(c.legal_name || c.name || "مطاحن")}</h1>
    <div class="sub">${esc(c.address ?? "")}${c.phone ? " — " + esc(c.phone) : ""}</div>
    <hr/>
    <h2>أمر تشغيل وطحن — ${esc(j.job_number)}</h2>

    <table class="kv">
      <tr><td>العميل</td><td>${esc(doc.customerName)}</td></tr>
      <tr><td>سند الاستلام</td><td>${esc(doc.intakeNumber)}</td></tr>
      <tr><td>الحالة</td><td>${esc(j.status)}</td></tr>
      <tr><td>الكمية المسحوبة</td><td>${n(j.input_bag_count, 0)} كيس × ${n(j.input_bag_size_kg, 2)} كجم = ${n(j.input_weight_kg)} كجم</td></tr>
      <tr><td>نسبة الاستخراج المتوقعة</td><td>${n(j.expected_extraction_rate, 2)} %</td></tr>
      <tr><td>الهدر المسموح به</td><td>${n(j.allowed_loss_percentage, 2)} % (${n(allowed)} كجم)</td></tr>
    </table>

    <hr/>
    <h2>النواتج المسجلة</h2>
    <table>
      <thead>
        <tr><th>الناتج</th><th>سعة الكيس</th><th>الأكياس</th><th>الوزن (كجم)</th><th>الأكياس من</th></tr>
      </thead>
      <tbody>
        ${
          doc.outputs.length === 0
            ? '<tr><td colspan="5">لا توجد نواتج مسجلة بعد</td></tr>'
            : doc.outputs
                .map(
                  (o) => `<tr>
                    <td>${esc(outputLabel(o.output_type))}</td>
                    <td>${n(o.bag_size_kg, 2)}</td>
                    <td>${n(o.produced_bag_count, 0)}</td>
                    <td>${n(o.produced_weight_kg)}</td>
                    <td>${o.bags_source === "MILL" ? "مخزون المطحنة" : "العميل"}</td>
                  </tr>`,
                )
                .join("")
        }
        <tr class="totals">
          <td colspan="2">الإجمالي</td>
          <td>${n(bags, 0)}</td>
          <td>${n(produced)}</td>
          <td></td>
        </tr>
      </tbody>
    </table>

    <hr/>
    <table class="kv">
      <tr><td>الوزن الداخل</td><td>${n(j.input_weight_kg)} كجم</td></tr>
      <tr><td>مجموع النواتج</td><td>${n(produced)} كجم</td></tr>
      <tr><td>الفاقد الفعلي</td><td>${n(loss)} كجم (${n(j.input_weight_kg > 0 ? (loss / Number(j.input_weight_kg)) * 100 : 0, 2)} %)</td></tr>
      <tr><td>الهدر المسموح به</td><td>${n(allowed)} كجم</td></tr>
      <tr><td>الفاقد الزائد</td><td>${n(Math.max(loss - allowed, 0))} كجم</td></tr>
      <tr><td>أجرة الكيس</td><td>${n(j.milling_fee_per_bag, 2)} ${esc(c.currency_symbol || "")}</td></tr>
      <tr><td>أجرة الطن</td><td>${n(j.milling_fee_per_ton, 2)} ${esc(c.currency_symbol || "")} / طن</td></tr>
    </table>

    ${j.notes ? `<hr/><p class="note"><strong>ملاحظات:</strong> ${esc(j.notes)}</p>` : ""}

    <div class="sig">
      <div>مشرف الصالة</div>
      <div>أمين المخزن</div>
      <div>المدير</div>
    </div>

    <div class="foot">مستند تشغيلي — لا يُثبت بيعاً ولا إيراداً.</div>
  `;

  emit(shell(`أمر طحن ${j.job_number}`, body, paper), 450);
}
