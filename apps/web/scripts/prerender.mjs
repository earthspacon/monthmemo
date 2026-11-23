// After `vite build` and the SSR build of src/prerender/entry.tsx: writes the prerendered files into dist/.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const WEB_DIR = path.resolve(import.meta.dirname, "..");
const DIST = path.join(WEB_DIR, "dist");
const ENTRY = path.join(WEB_DIR, "dist-prerender", "entry.js");

const { buildPrerenderedFiles } = await import(pathToFileURL(ENTRY).href);
const files = buildPrerenderedFiles(readFileSync(path.join(DIST, "index.html"), "utf8"), {
  beaconToken: process.env.VITE_CF_BEACON_TOKEN,
});

for (const { file, content } of files) {
  const target = path.join(DIST, file);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content);
}
console.log(`prerender: wrote ${files.map(({ file }) => file).join(", ")}`);
