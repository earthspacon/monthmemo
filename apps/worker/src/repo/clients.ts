import type { ClientDto, ClientInput } from "@monthmemo/contract";

import { newId, newToken } from "../ids";

type ClientRow = {
  id: string;
  name: string;
  ga4PropertyId: string | null;
  ga4PropertyName: string | null;
  gscSiteUrl: string | null;
};

type RecipientRow = { clientId: string; email: string; unsubscribedAt: string | null };

export type ClientSources = {
  ga4PropertyName: string | null;
};

export type ClientRecord = Omit<ClientDto, "nextReportOn">;

const CLIENT_COLUMNS = `id, name, ga4_property_id AS ga4PropertyId, ga4_property_name AS ga4PropertyName,
  gsc_site_url AS gscSiteUrl`;

function insertRecipients({ db, clientId, emails }: { db: D1Database; clientId: string; emails: string[] }) {
  return emails.map((email) => {
    return db
      .prepare("INSERT INTO recipients (id, client_id, email, unsubscribe_token) VALUES (?, ?, ?, ?)")
      .bind(newId(), clientId, email, newToken());
  });
}

export async function listClients({ db, agencyId }: { db: D1Database; agencyId: string }): Promise<ClientRecord[]> {
  const clients = await db
    .prepare(`SELECT ${CLIENT_COLUMNS} FROM clients WHERE agency_id = ? ORDER BY created_at, id`)
    .bind(agencyId)
    .all<ClientRow>();
  const recipients = await db
    .prepare(
      `SELECT recipients.client_id AS clientId, recipients.email, recipients.unsubscribed_at AS unsubscribedAt
       FROM recipients JOIN clients ON clients.id = recipients.client_id
       WHERE clients.agency_id = ? ORDER BY recipients.rowid`,
    )
    .bind(agencyId)
    .all<RecipientRow>();

  return clients.results.map((client) => {
    return {
      ...client,
      recipients: recipients.results
        .filter((recipient) => {
          return recipient.clientId === client.id;
        })
        .map((recipient) => {
          return { email: recipient.email, unsubscribed: recipient.unsubscribedAt !== null };
        }),
    };
  });
}

export async function findClient({ db, agencyId, id }: { db: D1Database; agencyId: string; id: string }) {
  const row = await db
    .prepare(`SELECT ${CLIENT_COLUMNS} FROM clients WHERE id = ? AND agency_id = ?`)
    .bind(id, agencyId)
    .first<ClientRow>();
  return row ?? null;
}

export async function createClientRecord({
  db,
  agencyId,
  input,
  sources,
  now,
}: {
  db: D1Database;
  agencyId: string;
  input: ClientInput;
  sources: ClientSources;
  now: Date;
}) {
  const id = newId();
  await db.batch([
    db
      .prepare(
        `INSERT INTO clients (id, agency_id, name, ga4_property_id, ga4_property_name, gsc_site_url, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        agencyId,
        input.name,
        input.ga4PropertyId,
        sources.ga4PropertyName,
        input.gscSiteUrl,
        now.toISOString(),
      ),
    ...insertRecipients({ db, clientId: id, emails: input.recipients }),
  ]);
  return id;
}

// Recipients that stay keep their row, so their unsubscribe link and choice survive an edit.
export async function updateClientRecord({
  db,
  agencyId,
  id,
  input,
  sources,
}: {
  db: D1Database;
  agencyId: string;
  id: string;
  input: ClientInput;
  sources: ClientSources;
}) {
  const kept = input.recipients.map(() => "?").join(", ");
  const existing = await db
    .prepare("SELECT email FROM recipients WHERE client_id = ?")
    .bind(id)
    .all<{ email: string }>();
  const known = new Set(
    existing.results.map((row) => {
      return row.email;
    }),
  );
  const added = input.recipients.filter((email) => {
    return !known.has(email);
  });

  await db.batch([
    db
      .prepare(
        `UPDATE clients SET name = ?, ga4_property_id = ?, ga4_property_name = ?, gsc_site_url = ?
         WHERE id = ? AND agency_id = ?`,
      )
      .bind(input.name, input.ga4PropertyId, sources.ga4PropertyName, input.gscSiteUrl, id, agencyId),
    db.prepare(`DELETE FROM recipients WHERE client_id = ? AND email NOT IN (${kept})`).bind(id, ...input.recipients),
    ...insertRecipients({ db, clientId: id, emails: added }),
  ]);
}

// Reports and recipients go with the client through the foreign keys.
export async function deleteClientRecord({ db, agencyId, id }: { db: D1Database; agencyId: string; id: string }) {
  await db.prepare("DELETE FROM clients WHERE id = ? AND agency_id = ?").bind(id, agencyId).run();
}
