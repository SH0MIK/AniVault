import { Db } from './db';

export async function ensurePointsWallet(db: Db, userId: number) {
  await db.query('INSERT OR IGNORE INTO points_wallets(user_id) VALUES(?)', [userId]);
  return db.fetchOne<{balance:number;lifetime_earned:number;lifetime_spent:number}>(
    'SELECT balance,lifetime_earned,lifetime_spent FROM points_wallets WHERE user_id=?', [userId]
  );
}

/** Idempotent award: an event key can only ever credit a user once. */
export async function awardPoints(
  db: Db, userId: number, amount: number, eventType: string, eventKey: string, description: string
): Promise<boolean> {
  if (!Number.isInteger(amount) || amount <= 0) return false;
  await ensurePointsWallet(db, userId);
  const before = await db.fetchOne<{balance:number}>('SELECT balance FROM points_wallets WHERE user_id=?', [userId]);
  const balanceAfter = Number(before?.balance ?? 0) + amount;
  const inserted = await db.query(
    'INSERT OR IGNORE INTO points_ledger(user_id,amount,balance_after,event_type,event_key,description) VALUES(?,?,?,?,?,?)',
    [userId, amount, balanceAfter, eventType, eventKey, description]
  );
  if (!(inserted.meta.changes ?? 0)) return false;
  await db.query(
    "UPDATE points_wallets SET balance=balance+?,lifetime_earned=lifetime_earned+?,updated_at=datetime('now') WHERE user_id=?",
    [amount, amount, userId]
  );
  return true;
}
