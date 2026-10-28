#!/usr/bin/env node
/**
 * Local Jane app server — static UI + Settings / Datasource / Actions API.
 * Secrets stay in gitignored .jane-secrets.json (never returned to the browser in full).
 *
 *   npm start          # http://localhost:5500
 *   PORT=5502 npm start
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadSecrets, saveSecrets, statusFromSecrets } from "./lib/secrets.mjs";
import { runSync } from "./lib/run-sync.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PORT = Number(process.env.PORT || 5500);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }
    serveStatic(res, url.pathname);
  } catch (err) {
    json(res, 500, { ok: false, error: err.message || String(err) });
  }
});

async function handleApi(req, res, url) {
  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders());
    res.end();
    return;
  }

  if (url.pathname === "/api/health" && req.method === "GET") {
    return json(res, 200, { ok: true, service: "jane-local", port: PORT });
  }

  if (url.pathname === "/api/settings/status" && req.method === "GET") {
    return json(res, 200, { ok: true, status: statusFromSecrets() });
  }

  if (url.pathname === "/api/settings" && req.method === "GET") {
    // Return editable non-secret fields + masked status (tokens never sent back)
    const s = loadSecrets();
    return json(res, 200, {
      ok: true,
      settings: {
        jira: {
          baseUrl: s.jira.baseUrl,
          email: s.jira.email,
          apiToken: s.jira.apiToken ? "••••••••" : "",
          tokenSet: Boolean(s.jira.apiToken),
          jql: s.jira.jql,
          maxResults: s.jira.maxResults,
          fieldStoryPoints: s.jira.fieldStoryPoints,
          fieldSprint: s.jira.fieldSprint,
          fieldTeam: s.jira.fieldTeam,
          writeComments: s.jira.writeComments,
        },
        google: {
          apiKey: s.google.apiKey ? "••••••••" : "",
          keySet: Boolean(s.google.apiKey),
          spreadsheetId: s.google.spreadsheetId,
          range: s.google.range,
          enabled: s.google.enabled,
        },
        schedule: s.schedule,
      },
      status: statusFromSecrets(s),
    });
  }

  if (url.pathname === "/api/settings" && req.method === "POST") {
    const body = await readJson(req);
    const current = loadSecrets();
    const jira = { ...current.jira, ...(body.jira || {}) };
    const google = { ...current.google, ...(body.google || {}) };
    const schedule = { ...current.schedule, ...(body.schedule || {}) };

    // Keep existing secrets if UI sent mask placeholders
    if (!body.jira?.apiToken || body.jira.apiToken.includes("•")) jira.apiToken = current.jira.apiToken;
    if (!body.google?.apiKey || body.google.apiKey.includes("•")) google.apiKey = current.google.apiKey;

    const status = saveSecrets({ jira, google, schedule });
    return json(res, 200, { ok: true, status, message: "Settings saved locally (.jane-secrets.json)" });
  }

  if (url.pathname === "/api/settings/clear" && req.method === "POST") {
    const body = await readJson(req);
    const current = loadSecrets();
    if (body?.target === "jira" || body?.target === "all") {
      current.jira.apiToken = "";
      if (body?.target === "all") {
        current.jira.baseUrl = "";
        current.jira.email = "";
      }
    }
    if (body?.target === "google" || body?.target === "all") {
      current.google.apiKey = "";
      if (body?.target === "all") {
        current.google.spreadsheetId = "";
        current.google.enabled = false;
      }
    }
    const status = saveSecrets(current);
    return json(res, 200, { ok: true, status, message: "Cleared selected secrets" });
  }

  if (url.pathname === "/api/datasource" && req.method === "GET") {
    const status = statusFromSecrets();
    let snapshot = null;
    const snapPath = path.join(ROOT, "data/jira_snapshot.json");
    if (fs.existsSync(snapPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(snapPath, "utf8"));
        snapshot = {
          source: data.source,
          generatedAt: data.generatedAt,
          count: Array.isArray(data.tickets) ? data.tickets.length : 0,
          summary: data.summary || null,
        };
      } catch { /* ignore */ }
    }
    return json(res, 200, {
      ok: true,
      datasources: [
        {
          id: "jira",
          label: "Jira Cloud",
          connected: status.jira.configured,
          detail: status.jira.configured ? status.jira.baseUrl : "Not configured",
          primary: true,
        },
        {
          id: "google",
          label: "Google Sheets",
          connected: status.google.configured,
          detail: status.google.configured
            ? `${status.google.spreadsheetId} · ${status.google.range}`
            : "Not configured",
          enabled: status.google.enabled,
        },
        {
          id: "demo",
          label: "Demo CSV",
          connected: true,
          detail: "data/sample_data.csv (always available)",
          primary: false,
        },
      ],
      snapshot,
      schedule: status.schedule,
    });
  }

  if (url.pathname === "/api/actions/sync" && req.method === "POST") {
    const body = await readJson(req);
    const source = body?.source || "auto";
    const dryRun = Boolean(body?.dryRun);
    const result = await runSync({ source, dryRun });
    return json(res, 200, result);
  }

  if (url.pathname === "/api/actions/test" && req.method === "POST") {
    const body = await readJson(req);
    const target = body?.target || "jira";
    const status = statusFromSecrets();
    if (target === "jira") {
      if (!status.jira.configured) return json(res, 400, { ok: false, error: "Jira not configured in Settings" });
      try {
        const result = await runSync({ source: "jira" });
        return json(res, 200, { ok: true, message: `Jira OK — ${result.count} tickets`, result });
      } catch (err) {
        return json(res, 502, { ok: false, error: err.message || String(err) });
      }
    }
    if (target === "google") {
      if (!status.google.configured) return json(res, 400, { ok: false, error: "Google not configured in Settings" });
      try {
        const result = await runSync({ source: "google" });
        return json(res, 200, { ok: true, message: `Google Sheets OK — ${result.count} tickets`, result });
      } catch (err) {
        return json(res, 502, { ok: false, error: err.message || String(err) });
      }
    }
    return json(res, 400, { ok: false, error: "Unknown target" });
  }

  json(res, 404, { ok: false, error: "Unknown API route" });
}

function serveStatic(res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === "/" || rel === "") rel = "/index.html";
  if (rel.includes("..")) {
    res.writeHead(400);
    res.end("Bad path");
    return;
  }
  const filePath = path.join(ROOT, rel);
  if (!filePath.startsWith(ROOT) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
  fs.createReadStream(filePath).pipe(res);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    ...corsHeaders(),
  });
  res.end(body);
}

server.listen(PORT, () => {
  console.log(`[jane] http://localhost:${PORT}`);
  console.log(`[jane] Settings API ready — secrets → .jane-secrets.json (gitignored)`);
});
