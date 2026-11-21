export type DailyUsage = {
  globalUsd: number;
  agencyUsd: number;
};

export async function readDailyUsage({
  db,
  day,
  agencyId,
}: {
  db: D1Database;
  day: string;
  agencyId: string;
}): Promise<DailyUsage> {
  const [globalRow, agencyRow] = await Promise.all([
    db.prepare("SELECT COALESCE(SUM(cost_usd), 0) AS total FROM llm_usage WHERE day = ?").bind(day).first<{
      total: number;
    }>(),
    db
      .prepare("SELECT COALESCE(SUM(cost_usd), 0) AS total FROM llm_usage WHERE day = ? AND agency_id = ?")
      .bind(day, agencyId)
      .first<{ total: number }>(),
  ]);

  return {
    globalUsd: globalRow?.total ?? 0,
    agencyUsd: agencyRow?.total ?? 0,
  };
}

export async function recordUsage({
  db,
  day,
  agencyId,
  costUsd,
}: {
  db: D1Database;
  day: string;
  agencyId: string;
  costUsd: number;
}) {
  await db
    .prepare(
      `INSERT INTO llm_usage (day, agency_id, cost_usd) VALUES (?, ?, ?)
       ON CONFLICT (day, agency_id) DO UPDATE SET cost_usd = cost_usd + excluded.cost_usd`,
    )
    .bind(day, agencyId, costUsd)
    .run();
}

// One owner alert per kind per UTC day: the insert wins for at most one caller.
export async function claimOwnerAlert({ db, kind, day }: { db: D1Database; kind: string; day: string }) {
  const result = await db.prepare("INSERT OR IGNORE INTO owner_alerts (kind, day) VALUES (?, ?)").bind(kind, day).run();
  return (result.meta.changes ?? 0) > 0;
}
