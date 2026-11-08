/**
 * تحويل أخطاء PostgreSQL إلى DomainError (ADR-004/طبقة الأخطاء).
 * يغطي أكواد القيود والأقفال وأخطاء RAISE من الدوال القديمة أثناء الانتقال.
 */
import {
  DomainError,
  BusinessRuleError,
  ConflictError,
  IntegrityError,
  ValidationError,
} from "./domain-error";

interface PgErrorLike {
  code?: string;
  constraint?: string;
  detail?: string;
  table?: string;
  column?: string;
  message?: string;
}

/** أخطاء RAISE من دوال RPC القديمة — تُربط إلى فئات أثناء نقل كل مجال. */
export function mapPgError(err: unknown): DomainError {
  const e = err as PgErrorLike;
  if (!e || typeof e.code !== "string") {
    return new DomainError(
      "INTERNAL",
      (err as Error)?.message ?? "خطأ غير معروف",
      undefined,
      false,
    );
  }
  switch (e.code) {
    case "23505": // unique_violation
    case "23514": // check_violation
    case "23000": // integrity_constraint_violation
    case "23001": // restrict_violation
      return new ConflictError(e.message ?? "قيمة مكررة أو مخالفة لقيد", {
        constraint: e.constraint,
        table: e.table,
        detail: e.detail,
      });
    case "23503": // foreign_key_violation
    case "23502": // not_null_violation
      return new IntegrityError(e.message ?? "مخالفة تكامل مرجعي", {
        constraint: e.constraint,
        column: e.column,
        table: e.table,
      });
    case "23508":
    case "23P01": // exclusion_violation
      return new ConflictError(e.message ?? "مخالفة قيد استبعاد", { constraint: e.constraint });
    case "P0001": // raise_exception من دوال القاعدة (رسائل الأعمال أثناء الانتقال)
      return new BusinessRuleSafe(e.message ?? "رُفضت العملية بقاعدة عمل");
    case "40001": // serialization_failure
    case "40P01": // deadlock_detected
      return new DomainError("CONFLICT", "تعارض تزامن — أعد المحاولة", { pgCode: e.code });
    case "22P02":
    case "22001":
    case "22003":
    case "22007":
      return new ValidationError(e.message ?? "قيمة غير صحيحة", { column: e.column });
    case "28P01":
      return new DomainError("INTERNAL", "فشل مصادقة قاعدة البيانات", undefined, false);
    case "57014": // query_canceled (statement_timeout)
      return new DomainError("CONFLICT", "انتهت مهلة العملية — أعد المحاولة");
    default:
      return new DomainError(
        "INTERNAL",
        e.message ?? "خطأ في قاعدة البيانات",
        { pgCode: e.code },
        false,
      );
  }
}

/** خطأ قاعدة عمل صريح (RAISE) — يواجه المستخدم. */
class BusinessRuleSafe extends BusinessRuleError {}

export { BusinessRuleSafe };

/** يغلف استدعاءً قد يرمي خطأ pg ويحوله موحدًا. */
export async function guardDb<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof DomainError) throw err;
    throw mapPgError(err);
  }
}
