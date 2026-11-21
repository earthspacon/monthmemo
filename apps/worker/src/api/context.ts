import type { Deps } from "../deps";
import type { AgencyRow } from "../repo/agencies";

export type PublicContext = { deps: Deps };

export type ApiContext = PublicContext & {
  user: { id: string; email: string };
  agency: AgencyRow;
};
