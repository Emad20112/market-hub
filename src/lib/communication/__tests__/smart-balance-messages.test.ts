import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { renderMessage } from "../template-engine";
import { buildUnifiedContext } from "../context-builder";
import { setActiveMessageSettings, splitCustomerBalance } from "../message-settings";

const company = { name: "مطحنة الخير", arabicName: "مطحنة الخير", contacts: ["772222222"] };

describe("Smart balance messages", () => {
  it("splits previous debt from the current invoice using the live balance", () => {
    const r = splitCustomerBalance({ invoiceRemaining: 2000, currentBalance: 7000 });
    assert.deepEqual(r, { invoiceRemaining: 2000, previousBalance: 5000, totalBalance: 7000 });
  });

  it("shows previous debt even when the invoice is fully paid", () => {
    setActiveMessageSettings(null);
    const text = renderMessage(
      buildUnifiedContext({
        event: "invoice_share",
        company,
        customer: { id: "c1", name: "علي", phone: "771234567", balance: 0, currentBalance: 3000 },
        invoice: { invoiceNumber: "INV-1", total: 1500, paid: 1500, remaining: 0 },
      }),
    ).text;
    assert.ok(text.includes("مسددة بالكامل"));
    assert.ok(text.includes("رصيد سابق عليكم"));
    assert.ok(text.includes("إجمالي المستحق عليكم"));
  });

  it("shows invoice remaining, previous balance and total when there is old debt", () => {
    setActiveMessageSettings(null);
    const text = renderMessage(
      buildUnifiedContext({
        event: "milling_document_share",
        company,
        customer: { id: "c1", name: "علي", balance: 5000 },
        invoice: { invoiceNumber: "INV-2", total: 3000, paid: 1000, remaining: 2000 },
        millingDocumentNumber: "ML-9",
      }),
    ).text;
    assert.ok(text.includes("متبقي هذه الفاتورة"));
    assert.ok(text.includes("رصيد سابق عليكم"));
    assert.ok(text.includes("إجمالي المستحق عليكم"));
  });

  it("never uses the word أمانة in milling messages", () => {
    setActiveMessageSettings(null);
    const text = renderMessage(
      buildUnifiedContext({
        event: "milling_document_share",
        company: { ...company, arabicName: "", name: "" },
        customer: { id: "c1", name: "علي", balance: 0 },
        millingDocumentNumber: "ML-9",
      }),
    ).text;
    assert.ok(!/أمان|امان/.test(text));
  });

  it("uses the custom goods term from settings", () => {
    setActiveMessageSettings({ millingGoodsTerm: "طحين", millingServiceName: "قسم الطحن" });
    const text = renderMessage(
      buildUnifiedContext({
        event: "milling_document_share",
        company,
        customer: { id: "c1", name: "علي", balance: 0 },
        millingDocumentNumber: "ML-9",
      }),
    ).text;
    assert.ok(text.includes("سند طحين"));
    assert.ok(text.includes("قسم الطحن"));
    setActiveMessageSettings(null);
  });

  it("hides previous balance and total when disabled in settings", () => {
    setActiveMessageSettings({ showPreviousBalance: false, showTotalBalance: false });
    const text = renderMessage(
      buildUnifiedContext({
        event: "invoice_share",
        company,
        customer: { id: "c1", name: "علي", balance: 0, currentBalance: 3000 },
        invoice: { invoiceNumber: "INV-1", total: 1500, paid: 1500, remaining: 0 },
      }),
    ).text;
    assert.ok(!text.includes("رصيد سابق"));
    assert.ok(!text.includes("إجمالي المستحق"));
    setActiveMessageSettings(null);
  });
});
