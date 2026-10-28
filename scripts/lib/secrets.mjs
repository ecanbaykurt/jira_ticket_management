import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SECRETS_PATH = path.join(ROOT, ".jane-secrets.json");

const EMPTY = {
  jira: {
    baseUrl: "",
    email: "",
    apiToken: "",
    jql: "project = BI ORDER BY created DESC",
    maxResults: 200,
    fieldStoryPoints: "",
    fieldSprint: "",
    fieldTeam: "",
    writeComments: false,
  },
  google: {
    apiKey: "",
    spreadsheetId: "",
    range: "Tickets!A:P",
    enabled: false,
  },
  schedule: {
    timezone: "America/New_York",
    hour: 9,
    minute: 0,
  },
  meta: {
    updatedAt: null,
  },
};

export function secretsPath() {
  return SECRETS_PATH;
}

export function loadSecrets() {
  if (!fs.existsSync(SECRETS_PATH)) return structuredClone(EMPTY);
  try {
    const raw = JSON.parse(fs.readFileSync(SECRETS_PATH, "utf8"));
    return {
      ...structuredClone(EMPTY),
      ...raw,
      jira: { ...EMPTY.jira, ...(raw.jira || {}) },
      google: { ...EMPTY.google, ...(raw.google || {}) },
      schedule: { ...EMPTY.schedule, ...(raw.schedule || {}) },
      meta: { ...EMPTY.meta, ...(raw.meta || {}) },
    };
  } catch {
    return structuredClone(EMPTY);
  }
}

export function saveSecrets(next) {
  const merged = {
    ...structuredClone(EMPTY),
    ...next,
    jira: { ...EMPTY.jira, ...(next.jira || {}) },
    google: { ...EMPTY.google, ...(next.google || {}) },
    schedule: { ...EMPTY.schedule, ...(next.schedule || {}) },
    meta: { updatedAt: new Date().toISOString() },
  };
  fs.writeFileSync(SECRETS_PATH, JSON.stringify(merged, null, 2) + "\n");
  return statusFromSecrets(merged);
}

export function statusFromSecrets(s = loadSecrets()) {
  return {
    jira: {
      configured: Boolean(s.jira.baseUrl && s.jira.email && s.jira.apiToken),
      baseUrl: s.jira.baseUrl || null,
      email: maskEmail(s.jira.email),
      jql: s.jira.jql,
      writeComments: Boolean(s.jira.writeComments),
    },
    google: {
      configured: Boolean(s.google.apiKey && s.google.spreadsheetId),
      spreadsheetId: s.google.spreadsheetId
        ? `${s.google.spreadsheetId.slice(0, 6)}…`
        : null,
      range: s.google.range,
      enabled: Boolean(s.google.enabled),
    },
    schedule: s.schedule,
    updatedAt: s.meta?.updatedAt || null,
    secretsFile: path.basename(SECRETS_PATH),
  };
}

function maskEmail(email) {
  if (!email || !email.includes("@")) return null;
  const [u, d] = email.split("@");
  return `${u.slice(0, 2)}…@${d}`;
}

/** Apply secrets into process.env for sync scripts */
export function applySecretsToEnv(s = loadSecrets()) {
  if (s.jira.baseUrl) process.env.JIRA_BASE_URL = s.jira.baseUrl;
  if (s.jira.email) process.env.JIRA_EMAIL = s.jira.email;
  if (s.jira.apiToken) process.env.JIRA_API_TOKEN = s.jira.apiToken;
  if (s.jira.jql) process.env.JIRA_JQL = s.jira.jql;
  if (s.jira.maxResults) process.env.JIRA_MAX_RESULTS = String(s.jira.maxResults);
  if (s.jira.fieldStoryPoints) process.env.JIRA_FIELD_STORY_POINTS = s.jira.fieldStoryPoints;
  if (s.jira.fieldSprint) process.env.JIRA_FIELD_SPRINT = s.jira.fieldSprint;
  if (s.jira.fieldTeam) process.env.JIRA_FIELD_TEAM = s.jira.fieldTeam;
  process.env.JIRA_WRITE_COMMENTS = s.jira.writeComments ? "true" : "false";
  if (s.google.apiKey) process.env.GOOGLE_API_KEY = s.google.apiKey;
  if (s.google.spreadsheetId) process.env.GOOGLE_SHEETS_ID = s.google.spreadsheetId;
  if (s.google.range) process.env.GOOGLE_SHEETS_RANGE = s.google.range;
  if (s.schedule.timezone) process.env.JANE_TZ = s.schedule.timezone;
}
