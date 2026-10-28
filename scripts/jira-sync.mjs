#!/usr/bin/env node
import { runSync } from "./lib/run-sync.mjs";
import { loadSecrets, applySecretsToEnv } from "./lib/secrets.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadDotEnv(path.join(ROOT, ".env"));
applySecretsToEnv(loadSecrets());

const dryRun = process.argv.includes("--dry-run");
const google = process.argv.includes("--google");
const source = dryRun ? "demo" : google ? "google" : "auto";

runSync({ source, dryRun })
  .then((r) => {
    console.log(`[jane] ${r.source}: ${r.count} tickets → ${r.snapshotPath}`);
    console.log(`[jane] summary`, r.summary);
  })
  .catch((err) => {
    console.error("[jane] sync failed:", err.message || err);
    process.exit(1);
  });

function loadDotEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!(k in process.env)) process.env[k] = v;
  }
}
