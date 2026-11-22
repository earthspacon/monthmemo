import { PLANS, type ClientDto } from "@monthmemo/contract";
import { useGate, useUnit } from "effector-react";
import { Pencil, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";

import { ClientForm } from "../clients/ClientForm";
import { formatRunDate } from "../clients/lib";
import {
  $clients,
  $clientsError,
  $clientsStatus,
  $clientToDelete,
  $deleting,
  $form,
  $limit,
  addClicked,
  ClientsGate,
  clientsRetried,
  deleteCancelled,
  deleteConfirmed,
  deleteRequested,
  editClicked,
} from "../clients/model";
import {
  BUTTON_DANGER,
  BUTTON_PRIMARY,
  BUTTON_SECONDARY,
  Banner,
  Card,
  ErrorState,
  PageHeader,
  SkeletonRows,
} from "../shared/ui";

const UPGRADE_LABEL = `Upgrade to Growth for ${PLANS.growth.clientLimit} clients`;

const RecipientList = ({ client }: { client: ClientDto }) => {
  return (
    <ul className="space-y-0.5 text-sm">
      {client.recipients.map((recipient) => {
        if (recipient.unsubscribed) {
          return (
            <li key={recipient.email} className="flex items-center gap-2 text-slate-400">
              <span className="line-through">{recipient.email}</span>
              <span className="rounded bg-slate-100 px-1.5 text-xs">unsubscribed</span>
            </li>
          );
        }
        return (
          <li key={recipient.email} className="text-slate-700">
            {recipient.email}
          </li>
        );
      })}
    </ul>
  );
};

const ClientCard = ({ client }: { client: ClientDto }) => {
  const { edit, remove } = useUnit({ edit: editClicked, remove: deleteRequested });

  return (
    <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-2">
        <h2 className="flex flex-wrap items-center gap-x-2 font-medium">
          {client.name}
          {client.ga4PropertyName && (
            <span className="text-sm font-normal text-slate-500">{client.ga4PropertyName}</span>
          )}
        </h2>
        {client.gscSiteUrl && <p className="break-all text-sm text-slate-500">{client.gscSiteUrl}</p>}
        <RecipientList client={client} />
        <p className="text-xs text-slate-500">Next report: {formatRunDate(client.nextReportOn)}</p>
      </div>
      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          aria-label={`Edit ${client.name}`}
          className={BUTTON_SECONDARY}
          onClick={() => edit(client)}
        >
          <Pencil className="size-4" />
        </button>
        <button
          type="button"
          aria-label={`Delete ${client.name}`}
          className={BUTTON_SECONDARY}
          onClick={() => remove(client)}
        >
          <Trash2 className="size-4" />
        </button>
      </div>
    </Card>
  );
};

const DeleteDialog = () => {
  const { client, deleting, cancel, confirm } = useUnit({
    client: $clientToDelete,
    deleting: $deleting,
    cancel: deleteCancelled,
    confirm: deleteConfirmed,
  });

  if (!client) {
    return null;
  }
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Delete client"
        className="w-full max-w-sm space-y-4 rounded-xl bg-surface p-5 shadow-lg"
      >
        <p className="text-sm text-slate-700">
          This removes the client and every report built for it. This can't be undone.
        </p>
        <div className="flex justify-end gap-2">
          <button type="button" className={BUTTON_SECONDARY} onClick={() => cancel()}>
            Cancel
          </button>
          <button type="button" className={BUTTON_DANGER} disabled={deleting} onClick={() => confirm()}>
            Delete client
          </button>
        </div>
      </div>
    </div>
  );
};

const LimitNotice = () => {
  const { limit } = useUnit({ limit: $limit });

  if (limit.overLimit) {
    return (
      <Banner tone="warning">
        Your plan covers {limit.limit} clients, so only the first {limit.limit} get reports. Remove clients or upgrade.
      </Banner>
    );
  }
  if (!limit.atLimit) {
    return null;
  }
  return (
    <Banner tone="info">
      You're using all {limit.limit} clients on your plan.{" "}
      {limit.canUpgrade && (
        <Link to="/app/billing" className="font-medium underline">
          {UPGRADE_LABEL}
        </Link>
      )}
    </Banner>
  );
};

const AddClientButton = () => {
  const { limit, add } = useUnit({ limit: $limit, add: addClicked });

  return (
    <button type="button" className={BUTTON_PRIMARY} disabled={limit.atLimit} onClick={() => add()}>
      Add client
    </button>
  );
};

export const ClientsPage = () => {
  useGate(ClientsGate);
  const { status, error, clients, form, retry } = useUnit({
    status: $clientsStatus,
    error: $clientsError,
    clients: $clients,
    form: $form,
    retry: clientsRetried,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <PageHeader title="Clients" subtitle="Each client gets one branded email a month." />
        <AddClientButton />
      </div>
      <LimitNotice />
      {form.mode !== "closed" && <ClientForm title={form.mode === "add" ? "Add client" : "Edit client"} />}
      {status === "loading" && <SkeletonRows />}
      {status === "error" && <ErrorState message={error} onRetry={() => retry()} />}
      {status === "ready" && clients.length === 0 && (
        <Card className="p-8 text-center text-sm text-slate-600">No clients yet</Card>
      )}
      {status === "ready" && (
        <div className="space-y-3">
          {clients.map((client) => {
            return <ClientCard key={client.id} client={client} />;
          })}
        </div>
      )}
      <DeleteDialog />
    </div>
  );
};
