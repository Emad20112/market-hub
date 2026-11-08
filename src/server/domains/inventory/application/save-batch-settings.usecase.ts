/**
 * Use Case: save_batch_settings — المرحلة 2.
 * مطابق للدالة القديمة public.save_batch_settings (002):
 *  - actor owner أو manager.
 *  - دمج (jsonb ||) على company_settings.batch_settings (الصف الأول) + updated_at.
 *  - يعيد الإعدادات المدمجة.
 * رسائل الرفض نفسها ("Not authenticated" / "Not authorized to change company settings").
 */
import type { PoolClient } from "pg";
import { AuthorizationError } from "@/server/shared/errors/domain-error";
import type { ServerSession } from "@/server/shared/auth/session";
import { withTransaction } from "@/server/shared/db/transaction";
import { hasRole } from "@/server/domains/identity/infrastructure/identity.repository";

/** الإعدادات المدمجة — قيم بدائية (متوافقة مع jsonb الموجود والتسلسل عبر الخادم). */
export type BatchSettingsPayload = Record<string, string | number | boolean | null>;

export async function saveBatchSettings(
  session: ServerSession,
  settings: Record<string, unknown>,
): Promise<BatchSettingsPayload> {
  return withTransaction(async (tx: PoolClient) => {
    const isOwner = await hasRole(tx, session.userId, "owner");
    const isManager = await hasRole(tx, session.userId, "manager");
    if (!isOwner && !isManager) {
      throw new AuthorizationError("Not authorized to change company settings");
    }
    const { rows } = await tx.query<{ batch_settings: Record<string, unknown> }>(
      `UPDATE public.company_settings
          SET batch_settings = coalesce(batch_settings, '{}'::jsonb) || $1::jsonb,
              updated_at = now()
       RETURNING batch_settings`,
      [JSON.stringify(settings)],
    );
    return rows[0].batch_settings as BatchSettingsPayload;
  });
}
