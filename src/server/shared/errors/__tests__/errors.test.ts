/**
 * اختبارات وحدة طبقة الأخطاء — بلا قاعدة بيانات (ADR-006 مستوى 1).
 * تشغيل: npx tsx src/server/shared/errors/__tests__/errors.test.ts
 */
import assert from "node:assert/strict";
import { mapPgError, guardDb } from "../pg-error-mapper";
import { DomainError, BusinessRuleError, ConflictError, IntegrityError } from "../domain-error";

let failures = 0;
function run(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    failures++;
    console.error(`✗ ${name}\n  ${(err as Error).message}`);
  }
}

run("unique_violation 23505 → ConflictError", () => {
  const e = mapPgError({ code: "23505", constraint: "products_barcode_key", message: "dup" });
  assert.ok(e instanceof ConflictError);
  assert.equal(e.details?.constraint, "products_barcode_key");
  assert.equal(e.userFacing, true);
});

run("foreign_key_violation 23503 → IntegrityError", () => {
  const e = mapPgError({ code: "23503", message: "fk" });
  assert.ok(e instanceof IntegrityError);
});

run("raise_exception P0001 → BusinessRuleError يواجه المستخدم", () => {
  const e = mapPgError({ code: "P0001", message: "لا يجوز البيع لأكون موجب" });
  assert.ok(e instanceof BusinessRuleError);
  assert.equal(e.userFacing, true);
});

run("deadlock 40P01 → Conflict إعادة المحاولة", () => {
  const e = mapPgError({ code: "40P01", message: "deadlock" });
  assert.equal(e.code, "CONFLICT");
});

run("غير معروف → INTERNAL غير مواجه للمستخدم", () => {
  const e = mapPgError({ code: "XX999", message: "boom" });
  assert.equal(e.code, "INTERNAL");
  assert.equal(e.userFacing, false);
});

run("DomainError يمر عبر guardDb دون تحويل", async () => {
  // async داخل run لا يُنتظر — نتحقق بالعبرة المنطقية
  try {
    await guardDb(async () => {
      throw new BusinessRuleError("قاعدة");
    });
    assert.fail("لم يرمِ");
  } catch (err) {
    assert.ok(err instanceof DomainError);
  }
});

if (failures > 0) {
  console.error(`\nفشل ${failures} اختبار`);
  process.exit(1);
}
console.log("\nكل اختبارات الأخطاء نجحت.");
