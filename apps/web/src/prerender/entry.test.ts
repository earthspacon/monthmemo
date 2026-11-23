import { describe, expect, it } from "vitest";

import TEMPLATE from "../../index.html?raw";
import { buildPrerenderedFiles } from "./entry";

describe("web analytics beacon", () => {
  const TOKEN = "0123456789abcdef0123456789abcdef";
  const htmlFiles = (token?: string) => {
    return buildPrerenderedFiles(TEMPLATE, token ? { beaconToken: token } : undefined).filter(({ file }) => {
      return file.endsWith(".html");
    });
  };

  it("a production build puts the Cloudflare beacon on every public page and the app shell", () => {
    const withBeacon = htmlFiles(TOKEN);
    expect(withBeacon.length).toBeGreaterThan(3);
    for (const { file, content } of withBeacon) {
      expect(content, file).toContain("https://static.cloudflareinsights.com/beacon.min.js");
      expect(content, file).toContain(`data-cf-beacon='{"token":"${TOKEN}","spa":true}'`);
    }
  });

  it("a build without the token (dev, e2e, sandbox) loads no analytics", () => {
    for (const { file, content } of htmlFiles()) {
      expect(content, file).not.toContain("cloudflareinsights");
    }
  });
});
