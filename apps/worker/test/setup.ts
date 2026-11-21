import { applyD1Migrations, env } from "cloudflare:test";
import { beforeEach } from "vitest";

import { installFakes, resetFakes } from "./fakes";

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
installFakes();

beforeEach(() => {
  resetFakes();
});
