import { money } from "@/lib/format";
import type { CommunicationEventType, MessageLanguage, UnifiedCommunicationContext } from "./types";
import type { CommunicationSettings } from "./settings";

interface MessageSection {
  title: string;
  rows: string[];
}

const safeLine = (value: unknown): string =>
  String(value ?? "")
    .replace(/[\r\n]+/g, " ")
    .trim();

function number(value: unknown, language: MessageLanguage): string {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "";
  return new Intl.NumberFormat(language === "ar" ? "ar-YE" : "en-US", {
    maximumFractionDigits: 2,
  }).format(parsed);
}

function amount(value: unknown): string {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? money(parsed) : "";
}

function date(value: string | null | undefined, language: MessageLanguage): string {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return safeLine(value);
  return new Intl.DateTimeFormat(language === "ar" ? "ar-YE" : "en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(parsed);
}

function companyName(context: UnifiedCommunicationContext, language: MessageLanguage): string {
  return safeLine(
    language === "ar"
      ? context.company?.arabicName || context.company?.name
      : context.company?.name || context.company?.arabicName,
  );
}

function companyPhone(context: UnifiedCommunicationContext): string {
  return safeLine(context.company?.contacts?.find((contact) => Boolean(contact?.trim())));
}

function section(title: string, rows: Array<string | null | undefined>): MessageSection | null {
  const visibleRows = rows.filter((row): row is string => Boolean(row));
  return visibleRows.length ? { title, rows: visibleRows } : null;
}

function field(label: string, value: unknown): string | null {
  const text = safeLine(value);
  return text ? `- *${label}:* ${text}` : null;
}

function getEventContent(
  context: UnifiedCommunicationContext,
  language: MessageLanguage,
  settings: CommunicationSettings,
): { title: string; introduction?: string; sections: MessageSection[] } {
  const ar = language === "ar";
  const { fields } = settings;
  const customer = context.customer;
  const invoice = context.invoice;
  const payment = context.payment;
  const statement = context.statement;

  const reference = (label: string, value: unknown) =>
    fields.showReferences ? field(label, value) : null;
  const dated = (label: string, value: string | undefined | null) =>
    fields.showDates ? field(label, date(value, language)) : null;
  const moneyField = (label: string, value: unknown) =>
    fields.showPrices ? field(label, amount(value)) : null;
  const balanceField = (label: string, value: unknown) =>
    fields.showPrices && fields.showBalances ? field(label, amount(value)) : null;

  switch (context.event) {
    case "payment_request": {
      const due = Number(customer?.balance ?? invoice?.remaining ?? 0);
      return {
        title: ar ? "إشعار رصيد مستحق" : "Outstanding balance notice",
        introduction: ar
          ? "نفيدكم بوجود رصيد مستحق على حسابكم، ونرجو التنسيق للسداد."
          : "There is an outstanding balance on your account. Please contact us to arrange payment.",
        sections: [
          section(ar ? "بيانات الرصيد" : "Balance details", [
            fields.showPrices && fields.showBalances
              ? field(ar ? "الرصيد المستحق" : "Amount due", amount(due))
              : null,
            fields.showDates
              ? dated(ar ? "تاريخ الإشعار" : "Notice date", new Date().toISOString())
              : null,
          ]),
        ].filter((item): item is MessageSection => Boolean(item)),
      };
    }
    case "debt_reminder": {
      const due = Number(customer?.balance ?? invoice?.remaining ?? 0);
      return {
        title: ar ? "تذكير بالرصيد" : "Balance reminder",
        introduction: ar
          ? "نود تذكيركم بوجود رصيد مستحق على حسابكم. يسعدنا التنسيق معكم لتسويته."
          : "This is a friendly reminder that your account has an outstanding balance. Please contact us to settle it.",
        sections: [
          section(ar ? "ملخص الحساب" : "Account summary", [
            fields.showPrices && fields.showBalances
              ? field(ar ? "الرصيد الحالي" : "Current balance", amount(due))
              : null,
            fields.showDates ? dated(ar ? "التاريخ" : "Date", new Date().toISOString()) : null,
          ]),
        ].filter((item): item is MessageSection => Boolean(item)),
      };
    }
    case "payment_received": {
      const rows = [
        reference(ar ? "رقم السند" : "Receipt no.", payment?.receiptNumber),
        dated(ar ? "التاريخ" : "Date", payment?.date),
        moneyField(ar ? "المبلغ المستلم" : "Amount received", payment?.amount),
        fields.showPaymentMethods
          ? field(ar ? "طريقة الدفع" : "Payment method", payment?.method)
          : null,
        reference(ar ? "رقم الفاتورة" : "Invoice no.", payment?.invoiceNumber),
        balanceField(ar ? "الرصيد المتبقي" : "Remaining balance", payment?.remainingBalance),
        payment?.notes ? field(ar ? "ملاحظات" : "Notes", payment.notes) : null,
      ];
      return {
        title: ar ? "إشعار استلام دفعة" : "Payment receipt",
        introduction: ar
          ? "نؤكد استلام دفعتكم، وتم تسجيلها في حسابكم."
          : "Your payment has been received and recorded on your account.",
        sections: [section(ar ? "تفاصيل العملية" : "Transaction details", rows)].filter(
          (item): item is MessageSection => Boolean(item),
        ),
      };
    }
    case "invoice_created":
    case "invoice_share":
    case "purchase_invoice_share": {
      const isPurchase = context.event === "purchase_invoice_share";
      const rows = [
        reference(ar ? "رقم الفاتورة" : "Invoice no.", invoice?.invoiceNumber),
        dated(ar ? "التاريخ" : "Date", invoice?.date),
        moneyField(ar ? "الإجمالي" : "Total", invoice?.total),
        moneyField(ar ? "المدفوع" : "Paid", invoice?.paid),
        balanceField(ar ? "المتبقي" : "Balance due", invoice?.remaining),
        fields.showBalances && invoice?.status
          ? field(ar ? "الحالة" : "Status", safeLine(invoice.status))
          : null,
      ];
      return {
        title: isPurchase
          ? ar
            ? "إشعار فاتورة مشتريات"
            : "Purchase invoice notice"
          : ar
            ? "تفاصيل فاتورة المبيعات"
            : "Sales invoice details",
        introduction: isPurchase
          ? ar
            ? "نشارككم تفاصيل فاتورة المشتريات المسجلة."
            : "Here are the details of the recorded purchase invoice."
          : ar
            ? "نشارككم تفاصيل الفاتورة المسجلة. شاكرين لكم ثقتكم."
            : "Here are the details of your invoice. Thank you for your business.",
        sections: [section(ar ? "بيانات الفاتورة" : "Invoice details", rows)].filter(
          (item): item is MessageSection => Boolean(item),
        ),
      };
    }
    case "statement_share": {
      const rows = [
        fields.showDates ? field(ar ? "الفترة" : "Period", statement?.periodLabel) : null,
        moneyField(ar ? "الرصيد الافتتاحي" : "Opening balance", statement?.openingBalance),
        moneyField(ar ? "إجمالي المدين" : "Total debit", statement?.totalDebit),
        moneyField(ar ? "إجمالي الدائن" : "Total credit", statement?.totalCredit),
        balanceField(ar ? "الرصيد الختامي" : "Closing balance", statement?.closingBalance),
        fields.showReferences
          ? field(
              ar ? "عدد الحركات" : "Transactions",
              number(statement?.transactionsCount, language),
            )
          : null,
      ];
      return {
        title: ar ? "ملخص كشف الحساب" : "Account statement summary",
        introduction: ar
          ? "مرفق لكم ملخص حركة حسابكم للفترة الموضحة."
          : "Here is a summary of your account activity for the selected period.",
        sections: [section(ar ? "ملخص الحركة" : "Activity summary", rows)].filter(
          (item): item is MessageSection => Boolean(item),
        ),
      };
    }
    case "supplier_notice": {
      const rows = [
        fields.showPrices && fields.showBalances
          ? field(ar ? "الرصيد الحالي" : "Current balance", amount(customer?.balance))
          : null,
        fields.showDates ? dated(ar ? "التاريخ" : "Date", new Date().toISOString()) : null,
      ];
      return {
        title: ar ? "إشعار حساب المورد" : "Supplier account notice",
        introduction: ar
          ? "نشارككم ملخص الرصيد المسجل في حساب المورد."
          : "Here is a summary of the balance recorded on the supplier account.",
        sections: [section(ar ? "بيانات الحساب" : "Account details", rows)].filter(
          (item): item is MessageSection => Boolean(item),
        ),
      };
    }
    case "milling_document_share": {
      const milling = context.milling;
      const isDelivery = milling?.stage === "delivery";
      const isMilled = milling?.stage === "milled";
      const title = ar
        ? isDelivery
          ? "سند تسليم نواتج الأمانة"
          : isMilled
            ? "سند طحن أمانة"
            : "سند استلام أمانة وفاتورة أجور"
        : isDelivery
          ? "Custody output delivery"
          : isMilled
            ? "Custody milling record"
            : "Custody intake and milling fees";
      const documentRows = [
        reference(
          ar ? "رقم السند" : "Ticket no.",
          milling?.ticketNumber ?? context.millingDocumentNumber,
        ),
        reference(ar ? "رقم فاتورة الأجور" : "Service invoice no.", milling?.invoiceNumber),
        dated(ar ? "التاريخ" : "Date", milling?.date ?? invoice?.date),
        field(ar ? "الحالة" : "Status", safeLine(milling?.status ?? context.millingStatus)),
      ];
      const grainRows =
        fields.showQuantities && milling?.grainLines?.length
          ? milling.grainLines.map((line) => {
              const details = [
                line.bags != null ? `${number(line.bags, language)} ${ar ? "كيس" : "bags"}` : null,
                line.bagSizeKg != null
                  ? `${number(line.bagSizeKg, language)} ${ar ? "كجم للكيس" : "kg per bag"}`
                  : null,
                line.weightKg != null
                  ? `${number(line.weightKg, language)} ${ar ? "كجم" : "kg"}`
                  : null,
              ]
                .filter(Boolean)
                .join("، ");
              return field(safeLine(line.name) || (ar ? "نوع الحبوب" : "Grain"), details);
            })
          : [
              field(ar ? "نوع الحبوب" : "Grain type", milling?.grainType),
              fields.showQuantities && milling?.bagCount != null
                ? field(ar ? "عدد الأكياس" : "Bags", number(milling.bagCount, language))
                : null,
              fields.showQuantities && milling?.bagSizeKg != null
                ? field(
                    ar ? "حجم الكيس" : "Bag size",
                    `${number(milling.bagSizeKg, language)} ${ar ? "كجم" : "kg"}`,
                  )
                : null,
              fields.showQuantities && milling?.totalWeightKg != null
                ? field(
                    ar ? "الوزن الإجمالي" : "Total weight",
                    `${number(milling.totalWeightKg, language)} ${ar ? "كجم" : "kg"}`,
                  )
                : null,
            ];
      const outputRows = fields.showQuantities
        ? (milling?.items ?? []).map((item) => {
            const quantity = [
              item.bags != null ? `${number(item.bags, language)} ${ar ? "كيس" : "bags"}` : null,
              item.weightKg != null
                ? `${number(item.weightKg, language)} ${ar ? "كجم" : "kg"}`
                : null,
            ]
              .filter(Boolean)
              .join("، ");
            const remaining =
              item.remainingBags != null
                ? ` · ${ar ? "المتبقي طرفنا" : "Remaining in custody"}: ${number(item.remainingBags, language)} ${ar ? "كيس" : "bags"}`
                : "";
            return field(
              safeLine(item.name) || (ar ? "الناتج" : "Output"),
              `${quantity}${remaining}`,
            );
          })
        : [];
      const financeRows = [
        moneyField(ar ? "إجمالي الأجور" : "Total service fees", milling?.grandTotal),
        moneyField(ar ? "المدفوع" : "Paid", milling?.paidAmount),
        balanceField(ar ? "المتبقي" : "Balance due", milling?.remainingAmount),
      ];
      return {
        title,
        introduction: isDelivery
          ? ar
            ? "تم تسجيل تسليم النواتج الموضحة أدناه من أمانتكم."
            : "The outputs listed below have been recorded as delivered from your custody."
          : isMilled
            ? ar
              ? "تم تسجيل عملية الطحن وإثبات النواتج في أمانتكم."
              : "The milling operation is recorded and its outputs are assigned to your custody."
            : ar
              ? "تم تسجيل استلام الأمانة وتفاصيل أجور الخدمة."
              : "The custody intake and service-fee details have been recorded.",
        sections: [
          section(ar ? "بيانات السند" : "Document details", documentRows),
          section(
            isDelivery
              ? ar
                ? "النواتج المسلمة"
                : "Delivered outputs"
              : ar
                ? "تفاصيل الحبوب"
                : "Grain details",
            isDelivery ? outputRows : grainRows,
          ),
          isDelivery ? null : section(ar ? "تفاصيل الأجور" : "Service fees", financeRows),
        ].filter((item): item is MessageSection => Boolean(item)),
      };
    }
    case "general_customer_notice":
      return {
        title: ar ? "رسالة إلى العميل" : "Customer notice",
        introduction: ar
          ? "نتواصل معكم بخصوص حسابكم. يرجى التواصل معنا عند الحاجة إلى أي توضيح."
          : "We are contacting you regarding your account. Please reach out if you need any clarification.",
        sections: [],
      };
  }
}

export function formatConfiguredMessage(
  context: UnifiedCommunicationContext,
  language: MessageLanguage,
  settings: CommunicationSettings,
): string {
  const content = getEventContent(context, language, settings);
  const ar = language === "ar";
  const parts: string[] = [];

  if (settings.fields.showGreeting) {
    parts.push(ar ? "السلام عليكم ورحمة الله وبركاته،" : "Hello, and warm regards.");
  }
  if (settings.fields.showCustomerName && context.customer?.name) {
    parts.push(
      ar
        ? `الأستاذ/ ${safeLine(context.customer.name)} المحترم،`
        : `Dear ${safeLine(context.customer.name)},`,
    );
  }
  const name = settings.fields.showCompanyName ? companyName(context, language) : "";
  if (name) parts.push(`*${name}*`);

  parts.push(`*${content.title}*`);
  if (content.introduction) parts.push(safeLine(content.introduction));

  for (const item of content.sections) {
    parts.push(`*${item.title}*\n${item.rows.join("\n")}`);
  }

  if (settings.fields.showClosing) {
    const closing = ar
      ? "شاكرين لكم ثقتكم، ويسعدنا خدمتكم دائماً."
      : "Thank you for your continued trust. We are always happy to help.";
    const contact = settings.fields.showCompanyPhone ? companyPhone(context) : "";
    parts.push(contact ? `${closing}\n${ar ? "للاستفسار" : "Contact"}: ${contact}` : closing);
  }

  return parts.filter(Boolean).join("\n\n");
}
