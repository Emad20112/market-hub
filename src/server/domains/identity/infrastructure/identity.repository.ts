/**
 * مستودع الهوية — المرحلة 2 (ADR-004: SQL فقط داخل infrastructure).
 *
 * ملاحظة أمان (موثقة في DECISIONS-LOG): العمليات المنقولة هنا كانت دوال
 * SECURITY DEFINER في القاعدة. المكافئ الخادمي: تشغيل الكتابة بـ service_role
 * مع تنفيذ فحوص الصلاحيات صراحة في Use Case (نفس دلالات الأمان القديمة).
 * تحقق الدور يستدعي دالة `has_role` المتبقية في القاعدة (مصدر الحقيقة الوحيد
 * للصلاحيات أثناء الانتقال — لا تكرار للقاعدة).
 */
import type { PoolClient } from "pg";
import { NotFoundError } from "@/server/shared/errors/domain-error";

export interface SetProfileActiveRow {
  userId: string;
  isActive: boolean;
}

/** مكافئ public.has_role — يبقى في القاعدة (تستخدمه سياسات RLS) ونستدعيه هنا. */
export async function hasRole(tx: PoolClient, userId: string, role: string): Promise<boolean> {
  const { rows } = await tx.query<{ has_role: boolean }>(
    "SELECT public.has_role($1::uuid, $2::public.app_role) AS has_role",
    [userId, role],
  );
  return rows[0]?.has_role === true;
}

export async function isPlatformSuperadmin(tx: PoolClient, userId: string): Promise<boolean> {
  const { rows } = await tx.query<{ is_platform_superadmin: boolean }>(
    "SELECT public.is_platform_superadmin($1::uuid) AS is_platform_superadmin",
    [userId],
  );
  return rows[0]?.is_platform_superadmin === true;
}

export async function isPlatformAdminUser(tx: PoolClient, userId: string): Promise<boolean> {
  const { rows } = await tx.query<{ is_platform_admin: boolean }>(
    "SELECT EXISTS(SELECT 1 FROM public.platform_admins WHERE user_id = $1::uuid) AS is_platform_admin",
    [userId],
  );
  return rows[0]?.is_platform_admin === true;
}

/** هل يوجد مالك نشط آخر غير المستهدف؟ (شرط آخر مالك نشط في set_profile_active) */
export async function otherActiveOwnerExists(
  tx: PoolClient,
  targetUserId: string,
): Promise<boolean> {
  const { rows } = await tx.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1
         FROM public.user_roles ur
         JOIN public.profiles p ON p.id = ur.user_id
        WHERE ur.role = 'owner'::public.app_role
          AND p.is_active
          AND ur.user_id <> $1::uuid
     ) AS exists`,
    [targetUserId],
  );
  return rows[0]?.exists === true;
}

export async function targetHasOwnerRole(tx: PoolClient, targetUserId: string): Promise<boolean> {
  const { rows } = await tx.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM public.user_roles WHERE user_id = $1::uuid AND role = 'owner'::public.app_role
     ) AS exists`,
    [targetUserId],
  );
  return rows[0]?.exists === true;
}

export async function updateProfileActive(
  tx: PoolClient,
  targetUserId: string,
  isActive: boolean,
): Promise<void> {
  const { rowCount } = await tx.query(
    "UPDATE public.profiles SET is_active = $2::boolean WHERE id = $1::uuid",
    [targetUserId, isActive],
  );
  if (rowCount === 0) throw new NotFoundError("profile", targetUserId);
}

/** قفل تزامن مطابق للدالة القديمة: 9915 / hashtext('active-owner-status'). */
export async function lockActiveOwnerStatus(tx: PoolClient): Promise<void> {
  await tx.query("SELECT pg_advisory_xact_lock(9915, hashtext('active-owner-status'))");
}
