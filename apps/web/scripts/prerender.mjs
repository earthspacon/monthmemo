// After `vite build` and the SSR build of src/prerender/entry.tsx: writes the prerendered files into dist/.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const WEB_DIR = path.resolve(import.meta.dirname, "..");
const DIST = path.join(WEB_DIR, "dist");
const ENTRY = path.join(WEB_DIR, "dist-prerender", "entry.js");

const { buildPrerenderedFiles } = await import(pathToFileURL(ENTRY).href);
const files = buildPrerenderedFiles(readFileSync(path.join(DIST, "index.html"), "utf8"));

for (const { file, content } of files) {
  writeFileSync(path.join(DIST, file), content);
}
console.log(`prerender: wrote ${files.map(({ file }) => file).join(", ")}`);
