/**
 * سياق الجلسة والصلاحيات (ADR-005) — المرحلة 0.
 *
 * Transport (server functions) يستخرج الجلسة من وسيط requireSupabaseAuth
 * (تحقق JWT مقابل Supabase) ويمررها للـ Use Case عبر ServerSession.
 * Use Case يستدعي authorize(session, capability) قبل أي عمل.
 *
 * هذه البنية الهيكلية (Skeleton): سجل القدرات يتوسع مجالًا بعد مجال أثناء
 * نقل دوال الصلاحيات من القاعدة (expense_assert_capability, can_operate_milling…).
 */

export interface ServerSession {
  /** auth.uid() */
  userId: string;
  claims: Record<string, unknown>;
  /** معرّف المنشأة من الـ JWT عند توفره (app_metadata.company_id أو claim مخصص). */
  companyId?: string;
}

export function sessionFromContext(ctx: {
  userId: string;
  claims: Record<string, unknown>;
}): ServerSession {
  const companyId =
    (ctx.claims["company_id"] as string | undefined) ??
    ((ctx.claims["app_metadata"] as Record<string, unknown> | undefined)?.["company_id"] as
      string | undefined);
  return { userId: ctx.userId, claims: ctx.claims, companyId };
}

/** قدرة موحدة تُفحص في بداية كل Use Case. الأسماء تُوحَّد عند نقل كل مجال. */
export interface Capability {
  domain: string;
  action: string;
}

export class AuthorizationError extends Error {}

/**
 * تحقق الصلاحية المرحلي:
 *  - المرحلة 0: مصادقة فقط (مستخدم صالح = مسموح) — سلوك مطابق للوضع الحالي
 *    حيث كانت الدوال تتحقق داخليًا؛ فحوصات الأدوار التفصيلية تنتقل مجالًا بعد مجال
 *    (لكل مجال اختباراته) قبل حذف دوال الصلاحيات من القاعدة.
 *  - بعد نقل كل مجال: تسجل قدراته هنا وتصبح الفحوص إلزامية.
 */
export function authorize(session: ServerSession | undefined, capability?: Capability): void {
  if (!session?.userId) {
    throw new AuthorizationError("المصادقة مطلوبة لهذه العملية.");
  }
  void capability; // سيلتزم الفحص التفصيلي عند نقل كل مجال (ADR-005).
}

/** تنفيذ Use Case تحت سياق جلسة محمي. */
export async function withSession<T>(session: ServerSession, fn: () => Promise<T>): Promise<T> {
  authorize(session);
  return fn();
}
