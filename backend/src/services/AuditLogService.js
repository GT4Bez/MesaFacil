// RN-11: trilha de auditoria. Ações permitidas: ver o CHECK de audit_logs (migration 010).
export class AuditLogService {
  // Sempre recebe o `db` da transação corrente: se a auditoria falhar, a ação sofre rollback.
  async record({ userId, shiftId = null, action, entity, entityId, details = {} }, db) {
    if (!db) throw new Error('AuditLogService.record exige a transação corrente.');
    await db.query(
      `INSERT INTO audit_logs (user_id, shift_id, action, entity, entity_id, details)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, shiftId, action, entity, entityId, JSON.stringify(details)]
    );
  }
}
