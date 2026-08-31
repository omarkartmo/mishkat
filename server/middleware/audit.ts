import { Request } from 'express';
import { db } from '../db/pool';

export async function recordAuditLog(
  userId: string | null,
  userName: string | null,
  userRole: string | null,
  action: string,
  entityType: string,
  entityId?: string | null,
  metadata?: any,
  req?: Request
): Promise<void> {
  try {
    const id = `audit-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    const ip = req ? (req.headers['x-forwarded-for'] as string || req.socket.remoteAddress || '127.0.0.1') : 'system';
    const userAgent = req ? req.headers['user-agent'] || '' : 'system';

    await db.query(`
      INSERT INTO audit_logs (
        id, user_id, user_name, user_role, action, entity_type, entity_id, metadata, ip_address, user_agent
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, [
      id,
      userId,
      userName,
      userRole,
      action,
      entityType,
      entityId || null,
      metadata ? JSON.stringify(metadata) : null,
      ip,
      userAgent,
    ]);
  } catch (err) {
    console.error('⚠️ [Audit Log Error]', err);
  }
}
