import { type ClientDto, type GoogleSourcesDto } from "@monthmemo/contract";
import { combine, createEffect, createEvent, createStore, sample } from "effector";
import { createGate } from "effector-react";

import { apiCommand, apiRequest } from "../shared/api";
import { createRemote } from "../shared/remote";
import { toastShown } from "../shared/toast-model";
import { $me, meFx } from "../session/model";
import { EMPTY_DRAFT, validateDraft, type ClientDraft, type ClientFormErrors } from "./lib";

type FormState = { mode: "closed" } | { mode: "add" } | { mode: "edit"; clientId: string };

const NO_SOURCES: GoogleSourcesDto = { ga4: [], gsc: [] };
const CLOSED: FormState = { mode: "closed" };

export const ClientsGate = createGate();
export const addClicked = createEvent();
export const editClicked = createEvent<ClientDto>();
export const formClosed = createEvent();
export const draftChanged = createEvent<Partial<ClientDraft>>();
export const saveSubmitted = createEvent();
export const deleteRequested = createEvent<ClientDto>();
export const deleteCancelled = createEvent();
export const deleteConfirmed = createEvent();
export const clientsRetried = createEvent();
export const sourcesRetried = createEvent();

const clients = createRemote({
  handler: () => {
    return apiRequest<ClientDto[]>({ path: "/api/clients" });
  },
  initial: [] as ClientDto[],
});

const sources = createRemote({
  handler: () => {
    return apiRequest<GoogleSourcesDto>({ path: "/api/google/sources" });
  },
  initial: NO_SOURCES,
});

const saveFx = createEffect(async ({ clientId, body }: { clientId: string | null; body: unknown }) => {
  const path = clientId ? `/api/clients/${clientId}` : "/api/clients";
  await apiCommand({ path, method: clientId ? "PUT" : "POST", body });
  return clientId === null;
});

const deleteFx = createEffect((id: string) => {
  return apiCommand({ path: `/api/clients/${id}`, method: "DELETE" });
});

export const $clients = clients.$data;
export const $clientsStatus = clients.$status;
export const $clientsError = clients.$error;
export const $sources = sources.$data;
export const $sourcesStatus = sources.$status;
export const $sourcesError = sources.$error;
export const $saving = saveFx.pending;
export const $deleting = deleteFx.pending;

export const $form = createStore<FormState>(CLOSED);
export const $draft = createStore<ClientDraft>(EMPTY_DRAFT);
export const $formErrors = createStore<ClientFormErrors>({});
export const $clientToDelete = createStore<ClientDto | null>(null);

export const $sourcesEmpty = combine(sources.$status, sources.$data, (status, data) => {
  return status === "ready" && data.ga4.length === 0 && data.gsc.length === 0;
});

// The plan limit is the one the session reports; the count is the list on screen so it follows adds and deletes.
export const $limit = combine($me, clients.$data, (me, list) => {
  const limit = me?.agency.clientLimit ?? 0;
  return {
    limit,
    count: list.length,
    atLimit: me !== null && list.length >= limit,
    overLimit: me !== null && list.length > limit,
  };
});

function draftOf(client: ClientDto): ClientDraft {
  return {
    name: client.name,
    recipients: client.recipients
      .map((recipient) => {
        return recipient.email;
      })
      .join("\n"),
    ga4PropertyId: client.ga4PropertyId ?? "",
    gscSiteUrl: client.gscSiteUrl ?? "",
  };
}

$form.on(addClicked, () => ({ mode: "add" })).on(editClicked, (_, client) => ({ mode: "edit", clientId: client.id }));
$form.reset(formClosed, saveFx.done);

$draft.on(draftChanged, (draft, change) => ({ ...draft, ...change }));
$draft.on(editClicked, (_, client) => draftOf(client));
$draft.reset(addClicked, formClosed);

$formErrors.reset(addClicked, editClicked, formClosed, draftChanged);

$clientToDelete.on(deleteRequested, (_, client) => client);
$clientToDelete.reset(deleteCancelled, deleteFx.finally);

sample({
  clock: [ClientsGate.open, clientsRetried],
  target: clients.fx,
});

sample({
  clock: [addClicked, editClicked],
  source: sources.$status,
  filter: (status) => status !== "ready",
  fn: () => undefined,
  target: sources.fx,
});

sample({
  clock: sourcesRetried,
  target: sources.fx,
});

sample({
  clock: saveSubmitted,
  source: { draft: $draft, form: $form },
  fn: ({ draft }) => validateDraft(draft).errors,
  target: $formErrors,
});

sample({
  clock: saveSubmitted,
  source: { draft: $draft, form: $form, saving: saveFx.pending },
  filter: ({ draft, saving }) => !saving && validateDraft(draft).input !== null,
  fn: ({ draft, form }) => {
    return {
      clientId: form.mode === "edit" ? form.clientId : null,
      body: validateDraft(draft).input,
    };
  },
  target: saveFx,
});

sample({
  clock: deleteConfirmed,
  source: $clientToDelete,
  filter: (client) => client !== null,
  fn: (client) => client?.id ?? "",
  target: deleteFx,
});

sample({
  clock: [saveFx.done, deleteFx.done],
  target: [clients.fx, meFx],
});

sample({
  clock: saveFx.doneData,
  fn: (added) => ({ text: added ? "Client added" : "Client saved", tone: "success" as const }),
  target: toastShown,
});

sample({
  clock: deleteFx.done,
  fn: () => ({ text: "Client deleted", tone: "success" as const }),
  target: toastShown,
});

sample({
  clock: [saveFx.failData, deleteFx.failData],
  fn: (error) => ({ text: error.message, tone: "error" as const }),
  target: toastShown,
});
