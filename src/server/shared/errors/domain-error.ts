/**
 * تسلسل الأخطاء الموحد (ADR: طبقة الأخطاء) — المرحلة 0.
 * كل طبقة ترمي DomainError أو أحد أبنائه؛ Transport يترجمها لاستجابة موحدة.
 */

export type ErrorCode =
  | "VALIDATION_ERROR"
  | "BUSINESS_RULE"
  | "AUTHORIZATION"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INTEGRITY"
  | "INTERNAL";

export class DomainError extends Error {
  readonly code: ErrorCode;
  readonly details?: Record<string, unknown>;
  /** هل يجب إظهار الرسالة للمستخدم كما هي (أخطاء الأعمال نعم، الداخلية لا). */
  readonly userFacing: boolean;

  constructor(
    code: ErrorCode,
    message: string,
    details?: Record<string, unknown>,
    userFacing = true,
  ) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.details = details;
    this.userFacing = userFacing;
  }
}

export class ValidationError extends DomainError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("VALIDATION_ERROR", message, details);
  }
}

export class BusinessRuleError extends DomainError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("BUSINESS_RULE", message, details);
  }
}

export class AuthorizationError extends DomainError {
  constructor(message = "غير مصرح بهذه العملية", details?: Record<string, unknown>) {
    super("AUTHORIZATION", message, details);
  }
}

export class NotFoundError extends DomainError {
  constructor(entity: string, id?: string) {
    super("NOT_FOUND", id ? `${entity} (${id}) غير موجود` : `${entity} غير موجود`, { entity, id });
  }
}

export class ConflictError extends DomainError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("CONFLICT", message, details);
  }
}

export class IntegrityError extends DomainError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("INTEGRITY", message, details);
  }
}

/** أخطاء مجالات الأعمال تضيف المجال للسياق. */
export class SalesError extends BusinessRuleError {}
export class AccountingError extends BusinessRuleError {}
export class InventoryError extends BusinessRuleError {}
export class TreasuryError extends BusinessRuleError {}
export class ExpensesError extends BusinessRuleError {}
export class MillingError extends BusinessRuleError {}
export class ProductionError extends BusinessRuleError {}
