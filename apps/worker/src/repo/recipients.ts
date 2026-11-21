export type RecipientLink = {
  id: string;
  unsubscribedAt: string | null;
};

export async function findRecipientByToken({ db, token }: { db: D1Database; token: string }) {
  return db
    .prepare("SELECT id, unsubscribed_at AS unsubscribedAt FROM recipients WHERE unsubscribe_token = ?")
    .bind(token)
    .first<RecipientLink>();
}

// Keeps the first unsubscribe time when the link is used twice.
export async function markUnsubscribed({ db, id, now }: { db: D1Database; id: string; now: Date }) {
  await db
    .prepare("UPDATE recipients SET unsubscribed_at = ? WHERE id = ? AND unsubscribed_at IS NULL")
    .bind(now.toISOString(), id)
    .run();
}
