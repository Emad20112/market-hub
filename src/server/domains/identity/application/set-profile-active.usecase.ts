/**
 * Use Case: set_profile_active — المرحلة 2.
 * إعادة تنفيذ مطابق لسلوك الدالة القديمة public.set_profile_active
 * (supabase/migrations/002 — الأصل يُحذف بعد إثبات صفر استخدام):
 *  1. actor مصادق (تحقق في authorize).
 *  2. actor owner أو platform superadmin.
 *  3. لا تعطيل الحساب الذاتي.
 *  4. لا تعديل حالة مستخدم منصة عبر هذا المسار.
 *  5. قفل تزامن (9915/active-owner-status) ثم منع تعطيل آخر مالك نشط.
 *  6. تحديث profiles.is_active.
 * الرسائل نفسها التي كانت تظهر من RAISE في الدالة القديمة.
 */
import type { PoolClient } from "pg";
import { AuthorizationError, ValidationError } from "@/server/shared/errors/domain-error";
import type { ServerSession } from "@/server/shared/auth/session";
import { withTransaction } from "@/server/shared/db/transaction";
import {
  hasRole,
  isPlatformSuperadmin,
  isPlatformAdminUser,
  otherActiveOwnerExists,
  targetHasOwnerRole,
  updateProfileActive,
  lockActiveOwnerStatus,
} from "../infrastructure/identity.repository";

export interface SetProfileActiveInput {
  userId: string;
  isActive: boolean;
}

/** قاعدة العمل النقية: هل يمكن للـ actor تغيير حالة هذا المستخدم؟ */
export function assertCanChangeProfileStatus(
  actor: ServerSession,
  input: SetProfileActiveInput,
  facts: { isOwner: boolean; isSuperadmin: boolean; targetIsPlatformAdmin: boolean },
): void {
  if (!facts.isOwner && !facts.isSuperadmin) {
    throw new AuthorizationError(
      "Only a store owner or platform superadmin may change account status",
    );
  }
  if (input.userId === actor.userId && !input.isActive) {
    throw new AuthorizationError("You cannot deactivate your own account");
  }
  if (facts.targetIsPlatformAdmin) {
    throw new AuthorizationError("Manage platform access through the platform admin registry");
  }
}

/** قاعدة العمل النقية: منع تعطيل آخر مالك نشط. */
export function assertNotLastActiveOwner(
  input: SetProfileActiveInput,
  facts: { targetHasOwnerRole: boolean; otherActiveOwnerExists: boolean },
): void {
  if (!input.isActive && facts.targetHasOwnerRole && !facts.otherActiveOwnerExists) {
    throw new AuthorizationError("The last active store owner cannot be deactivated");
  }
}

export async function setProfileActive(
  session: ServerSession,
  input: SetProfileActiveInput,
): Promise<void> {
  if (!input.userId || input.isActive === undefined || input.isActive === null) {
    throw new ValidationError("User and active status are required");
  }
  // الكتابة كانت SECURITY DEFINER — المكافئ: service_role مع فحص الأدوار صراحة أعلاه.
  await withTransaction(async (tx: PoolClient) => {
    const isOwner = await hasRole(tx, session.userId, "owner");
    const isSuperadmin = await isPlatformSuperadmin(tx, session.userId);
    assertCanChangeProfileStatus(session, input, {
      isOwner,
      isSuperadmin,
      targetIsPlatformAdmin: await isPlatformAdminUser(tx, input.userId),
    });

    await lockActiveOwnerStatus(tx);
    assertNotLastActiveOwner(input, {
      targetHasOwnerRole: await targetHasOwnerRole(tx, input.userId),
      otherActiveOwnerExists: await otherActiveOwnerExists(tx, input.userId),
    });
    await updateProfileActive(tx, input.userId, input.isActive);
  });
}
