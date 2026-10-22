#!/usr/bin/env node
// Operator tool for a server run with HOUSEHOLDS=1 (docs/design/HOUSEHOLDS.md): add or list families from the shell.
// The running server picks a new family up from households.json on the first request that names it, no restart.
//   node scripts/household.mjs list
//   node scripts/household.mjs create --name Biscuit --pin 123456 [--adult 4321] [--owner ann@example.nz] [--sms]
// DATA_DIR comes from the environment, else from .env next to this checkout, else ./data.
import { readFileSync, writeFileSync, renameSync, existsSync, statSync } from "node:fs";
import { randomBytes, randomInt, scryptSync } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envFile = path.join(root, ".env");
const env = Object.assign({}, existsSync(envFile) ? Object.fromEntries(readFileSync(envFile, "utf8").split("\n").filter((l) => /^[A-Z_]+=/.test(l)).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).trim()]; })) : {}, process.env);
const dataDir = path.resolve(env.DATA_DIR || path.join(root, "data"));
const indexFile = path.join(dataDir, "households.json");
const args = process.argv.slice(2);
const cmd = args[0];
const opt = (k) => { const i = args.indexOf("--" + k); return i < 0 ? undefined : args[i + 1] === undefined || args[i + 1].startsWith("--") ? true : args[i + 1]; };
const die = (m) => { console.error(m); process.exit(1); };

if (!existsSync(indexFile)) die("No " + indexFile + ". Is this server running with HOUSEHOLDS=1? (It writes the index on first start.)");
const index = JSON.parse(readFileSync(indexFile, "utf8"));
if (!Array.isArray(index.households)) die("households.json has no households list");

if (cmd === "list") {
  for (const h of index.households) console.log([h.id, h.code, JSON.stringify(h.name), h.owner || "-", new Date(h.created).toISOString().slice(0, 10), h.flags.sms ? "sms" : "", h.flags.suspended ? "SUSPENDED" : ""].join("  "));
  if (!index.households.length) console.log("(no families yet)");
  process.exit(0);
}
if (cmd !== "create") die("Usage: household.mjs list | create --name <puppy> --pin <digits> [--adult <digits>] [--owner <email>] [--sms]");

const name = String(opt("name") || "").trim().slice(0, 24);
const pin = String(opt("pin") || ""), adult = opt("adult") ? String(opt("adult")) : "";
if (!/^\d{4,8}$/.test(pin)) die("--pin must be 4 to 8 digits");
if (adult && !/^\d{4,8}$/.test(adult)) die("--adult must be 4 to 8 digits");
const hashPin = (p) => { const salt = randomBytes(16); return "scrypt$" + salt.toString("hex") + "$" + scryptSync(p, salt, 32).toString("hex"); };
const CODE_CHARS = "23456789abcdefghjkmnpqrstuvwxyz";
const slug = (x) => String(x || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 20) || "family";
let code; do { code = slug(name) + "-"; for (let i = 0; i < 4; i++) code += CODE_CHARS[randomInt(CODE_CHARS.length)]; } while (index.households.some((r) => r.code === code));
const rec = { id: "h_" + randomBytes(5).toString("hex"), code, name, owner: String(opt("owner") || "").trim().slice(0, 120), pin: hashPin(pin), adultPin: adult ? hashPin(adult) : "",
  pinTag: randomBytes(8).toString("hex"), created: Date.now(), lastActive: Date.now(), flags: { sms: opt("sms") === true, suspended: false, demo: false } };
index.households.push(rec);
const tmp = indexFile + "." + process.pid + ".tmp";
writeFileSync(tmp, JSON.stringify(index, null, 1), { mode: 0o600 });
renameSync(tmp, indexFile);
console.log("Created " + rec.id + " code " + code + (name ? " for " + name : "") + ". Join link: /j/" + code);
