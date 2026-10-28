import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { enrichTicket, buildMorningReport } from "./analyze.mjs";
import { loadSecrets, applySecretsToEnv } from "./secrets.mjs";
import { fetchGoogleSheetTickets } from "./google-sheets.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DATA = path.join(ROOT, "data");

export async function runSync({ source = "auto", dryRun = false } = {}) {
  const secrets = loadSecrets();
  applySecretsToEnv(secrets);

  const generatedAt = new Date().toISOString();
  let tickets = [];
  let used = source;

  if (dryRun || source === "demo") {
    used = "demo";
    tickets = loadSampleCsv().map(enrichTicket);
  } else if (source === "google" || (source === "auto" && secrets.google.enabled && secrets.google.apiKey)) {
    used = "google";
    const raw = await fetchGoogleSheetTickets({
      apiKey: secrets.google.apiKey || process.env.GOOGLE_API_KEY,
      spreadsheetId: secrets.google.spreadsheetId || process.env.GOOGLE_SHEETS_ID,
      range: secrets.google.range || process.env.GOOGLE_SHEETS_RANGE,
    });
    tickets = raw.map(enrichTicket);
  } else if (source === "jira" || source === "auto") {
    if (!process.env.JIRA_API_TOKEN) {
      used = "demo-fallback";
      tickets = loadSampleCsv().map(enrichTicket);
    } else {
      used = "jira";
      const raw = await fetchJiraIssues();
      tickets = raw.map(enrichTicket);
    }
  } else {
    throw new Error(`Unknown source: ${source}`);
  }

  const summary = summarize(tickets);
  const snapshot = {
    generatedAt,
    source: used,
    timezone: secrets.schedule?.timezone || "America/New_York",
    summary,
    tickets,
  };

  fs.mkdirSync(DATA, { recursive: true });
  fs.writeFileSync(path.join(DATA, "jira_snapshot.json"), JSON.stringify(snapshot, null, 2));
  fs.writeFileSync(
    path.join(DATA, "morning-report.md"),
    buildMorningReport(tickets, { generatedAt, source: used }),
  );

  return {
    ok: true,
    source: used,
    generatedAt,
    count: tickets.length,
    summary,
    snapshotPath: "data/jira_snapshot.json",
    reportPath: "data/morning-report.md",
  };
}

function summarize(tickets) {
  return {
    open: tickets.filter((t) => t.status === "Open").length,
    inProgress: tickets.filter((t) => t.status === "In progress").length,
    blocked: tickets.filter((t) => t.status === "Blocked").length,
    closed: tickets.filter((t) => t.status === "Closed").length,
    activePoints: Math.round(
      tickets.filter((t) => t.status !== "Closed").reduce((a, t) => a + t.story_points, 0) * 100,
    ) / 100,
  };
}

async function fetchJiraIssues() {
  const { normalizePriority, normalizeStatus } = await import("./analyze.mjs");
  const base = (process.env.JIRA_BASE_URL || "").replace(/\/$/, "");
  const email = process.env.JIRA_EMAIL;
  const token = process.env.JIRA_API_TOKEN;
  const jql = process.env.JIRA_JQL || "order by created DESC";
  const max = Number(process.env.JIRA_MAX_RESULTS || 200);
  const auth = Buffer.from(`${email}:${token}`).toString("base64");
  const fields = [
    "summary", "description", "status", "issuetype", "priority", "assignee",
    "reporter", "created", "duedate", "labels", "components", "parent",
  ];
  if (process.env.JIRA_FIELD_STORY_POINTS) fields.push(process.env.JIRA_FIELD_STORY_POINTS);
  if (process.env.JIRA_FIELD_SPRINT) fields.push(process.env.JIRA_FIELD_SPRINT);
  if (process.env.JIRA_FIELD_TEAM) fields.push(process.env.JIRA_FIELD_TEAM);

  const issues = [];
  let startAt = 0;
  const pageSize = Math.min(100, max);
  while (issues.length < max) {
    const url = new URL(`${base}/rest/api/3/search`);
    url.searchParams.set("jql", jql);
    url.searchParams.set("startAt", String(startAt));
    url.searchParams.set("maxResults", String(pageSize));
    url.searchParams.set("fields", fields.join(","));
    const res = await fetch(url, {
      headers: { Authorization: `Basic ${auth}`, Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`Jira search failed ${res.status}: ${(await res.text()).slice(0, 400)}`);
    const data = await res.json();
    const batch = data.issues || [];
    for (const issue of batch) issues.push(mapIssue(issue, base, normalizePriority, normalizeStatus));
    if (!batch.length || startAt + batch.length >= (data.total || 0)) break;
    startAt += batch.length;
  }
  return issues.slice(0, max);
}

function mapIssue(issue, base, normalizePriority, normalizeStatus) {
  const f = issue.fields || {};
  const desc = extractText(f.description);
  const pointsField = process.env.JIRA_FIELD_STORY_POINTS;
  const sprintField = process.env.JIRA_FIELD_SPRINT;
  const teamField = process.env.JIRA_FIELD_TEAM;
  const story_points = pointsField ? Number(f[pointsField]) : undefined;
  const sprintVal = sprintField ? f[sprintField] : null;
  let sprint = "Backlog";
  if (Array.isArray(sprintVal) && sprintVal.length) {
    const last = sprintVal[sprintVal.length - 1];
    sprint = typeof last === "string" ? (last.match(/name=([^,\]]+)/)?.[1] || "Sprint") : last?.name || "Sprint";
  } else if (sprintVal?.name) sprint = sprintVal.name;
  const teamRaw = teamField ? f[teamField] : null;
  return {
    id: issue.key,
    created: (f.created || "").slice(0, 10),
    sprint,
    issue_type: f.issuetype?.name || "Task",
    category: f.issuetype?.name || "General",
    status: normalizeStatus(f.status?.name),
    priority: normalizePriority(f.priority?.name),
    assignee: f.assignee?.displayName || "Unassigned",
    title: f.summary || "",
    summary_text: desc,
    due_date: f.duedate || null,
    story_points: Number.isFinite(story_points) ? story_points : undefined,
    labels: f.labels || [],
    components: (f.components || []).map((c) => c.name),
    epic: f.parent?.fields?.summary || f.parent?.key || undefined,
    team: typeof teamRaw === "string" ? teamRaw : teamRaw?.value || teamRaw?.name || undefined,
    has_email: f.reporter?.emailAddress ? "yes" : "no",
    url: `${base}/browse/${issue.key}`,
  };
}

function extractText(adf) {
  if (!adf) return "";
  if (typeof adf === "string") return adf;
  const parts = [];
  const walk = (n) => {
    if (!n) return;
    if (n.type === "text" && n.text) parts.push(n.text);
    (n.content || []).forEach(walk);
  };
  walk(adf);
  return parts.join(" ").slice(0, 2000);
}

function loadSampleCsv() {
  const csv = fs.readFileSync(path.join(DATA, "sample_data.csv"), "utf8").trim().split(/\r?\n/);
  const headers = csv.shift().split(",");
  return csv.map((line) => {
    const cols = parseCsvLine(line);
    const row = Object.fromEntries(headers.map((h, i) => [h, cols[i]]));
    return {
      id: row.ticket_id,
      created: row.created,
      sprint: row.sprint,
      issue_type: row.issue_type,
      category: row.category,
      status: row.status,
      work_type: row.work_type,
      team: row.team,
      epic: row.epic,
      story_points: Number(row.story_points),
      assignee: row.assignee,
      priority: row.priority,
      title: row.title,
      due_date: row.due_date,
      age_days: Number(row.age_days),
      has_email: row.has_email,
    };
  });
}

function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') q = !q;
    else if (c === "," && !q) { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out;
}
