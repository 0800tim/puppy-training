// Bumps the service worker VERSION and the ?v= cache-busters in index.html together.
//   node scripts/bump.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const pub = join(dirname(fileURLToPath(import.meta.url)), "..", "public");
const swPath = join(pub, "sw.js"), htmlPath = join(pub, "index.html");
const sw = readFileSync(swPath, "utf8");
const cur = Number(/const VERSION = "pt-v(\d+)"/.exec(sw)[1]);
const next = cur + 1;
writeFileSync(swPath, sw.replace(/const VERSION = "pt-v\d+"/, 'const VERSION = "pt-v' + next + '"'));
writeFileSync(htmlPath, readFileSync(htmlPath, "utf8").replace(/\?v=\d+/g, "?v=" + next));
console.log("pt-v" + cur + " -> pt-v" + next);
