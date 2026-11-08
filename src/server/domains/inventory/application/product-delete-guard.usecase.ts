/**
 * Use Case: فحص مراجع المنتج + الحذف المحروس — المرحلة 3.
 * مطابق للدالتين القديمتين product_reference_counts / product_delete_guard (012).
 * الصلاحية هنا (owner/manager/platform_admin) — كما فحصتها الدالة القديمة ذاتها.
 */
import type { PoolClient } from "pg";
import { AuthorizationError } from "@/server/shared/errors/domain-error";
import type { ServerSession } from "@/server/shared/auth/session";
import { withTransaction } from "@/server/shared/db/transaction";
import {
  productReferenceCounts,
  productDeleteGuard,
  type ProductReferenceCounts,
  type DeleteGuardResult,
} from "../infrastructure/product.repository";
import {
  hasRole,
  isPlatformAdminUser,
} from "@/server/domains/identity/infrastructure/identity.repository";

export interface ReferenceCountsResult {
  counts: ProductReferenceCounts;
}

export async function countProductReferences(
  session: ServerSession,
  productId: string,
): Promise<ReferenceCountsResult> {
  return withTransaction({ userId: session.userId }, async (tx) => ({
    counts: await productReferenceCounts(tx, productId),
  }));
}

export async function deleteProductGuarded(
  session: ServerSession,
  productId: string,
): Promise<DeleteGuardResult> {
  return withTransaction({ userId: session.userId }, async (tx) => {
    const isOwner = await hasRole(tx, session.userId, "owner");
    const isManager = await hasRole(tx, session.userId, "manager");
    const isPlatformAdmin = await isPlatformAdminUser(tx, session.userId);
    if (!isOwner && !isManager && !isPlatformAdmin) {
      throw new AuthorizationError("forbidden");
    }
    return productDeleteGuard(tx, productId);
  });
}
