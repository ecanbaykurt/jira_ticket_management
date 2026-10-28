#!/usr/bin/env node
/**
 * Keep this process running — every day at 09:00 (JANE_TZ) runs jira-sync.
 *
 *   npm run schedule
 *   npm run sync:dry   # test once without Jira
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import cron from "node-cron";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

loadEnv(path.join(ROOT, ".env"));
const tz = process.env.JANE_TZ || "America/New_York";

console.log(`[jane] Scheduler up — daily 09:00 (${tz})`);
console.log(`[jane] Ctrl+C to stop. Test now: npm run sync  |  dry: npm run sync:dry`);

cron.schedule(
  "0 9 * * *",
  () => {
    console.log(`[jane] ${new Date().toISOString()} — morning sync starting`);
    const child = spawn(process.execPath, [path.join(__dirname, "jira-sync.mjs")], {
      cwd: ROOT,
      stdio: "inherit",
      env: process.env,
    });
    child.on("exit", (code) => {
      console.log(`[jane] morning sync finished code=${code}`);
    });
  },
  { timezone: tz },
);

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!(k in process.env)) process.env[k] = v;
  }
}
