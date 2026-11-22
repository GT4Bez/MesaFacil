import { DatabaseConnection } from '../database/DatabaseConnection.js';

export const COUNT_METHODS = ['cash', 'card', 'pix'];

// RN-14 (spec 008): contagem cega do fechamento, uma linha por forma de pagamento.
export class ShiftCountRepository {
  constructor(database = DatabaseConnection.getInstance()) {
    this.database = database;
  }

  // Recontar substitui a contagem anterior do turno inteiro.
  async replace({ shiftId, userId, declared, expected, note }, db = this.database) {
    await db.query(`DELETE FROM shift_counts WHERE shift_id = $1`, [shiftId]);
    const { rows } = await db.query(
      `INSERT INTO shift_counts (shift_id, payment_method, declared, expected, counted_by, note)
       SELECT $1, t.method, t.declared, t.expected, $2, $3
       FROM unnest($4::text[], $5::numeric[], $6::numeric[]) AS t(method, declared, expected)
       RETURNING counted_at`,
      [
        shiftId,
        userId,
        note,
        COUNT_METHODS,
        COUNT_METHODS.map((method) => declared[method]),
        COUNT_METHODS.map((method) => expected[method])
      ]
    );
    return rows[0].counted_at;
  }

  // null quando o turno ainda não foi contado; métodos sempre na ordem cash, card, pix.
  async findByShift(shiftId, db = this.database) {
    const { rows } = await db.query(
      `SELECT sc.payment_method, sc.declared, sc.expected, sc.difference, sc.counted_at, sc.note,
              u.name AS counted_by
       FROM shift_counts sc
       JOIN users u ON u.id = sc.counted_by
       WHERE sc.shift_id = $1
       ORDER BY array_position($2::text[], sc.payment_method::text)`,
      [shiftId, COUNT_METHODS]
    );
    if (!rows.length) return null;
    return {
      countedBy: rows[0].counted_by,
      countedAt: rows[0].counted_at,
      note: rows[0].note,
      methods: rows.map((row) => ({
        method: row.payment_method,
        declared: Number(row.declared),
        expected: Number(row.expected),
        difference: Number(row.difference)
      }))
    };
  }
}
