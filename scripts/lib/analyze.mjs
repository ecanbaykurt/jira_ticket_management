/**
 * Jane triage heuristics — epic, points, assignee, due date, follow-up comment.
 * 1 story point ≈ 8h workday; floor 0.25. Suggestions only unless write mode enabled.
 */

export const EPIC_RULES = [
  { epic: "Data-Quality", owner: "Data", keywords: ["pipeline", "null", "duplicate", "schema", "sync", "timezone", "export", "status mapping", "warehouse", "quality"] },
  { epic: "Field-Ops-Insights", owner: "Data", keywords: ["ops", "field", "sla", "neighborhood", "backlog board", "blocked tickets", "service categor"] },
  { epic: "Self-Serve-BI", owner: "Data", keywords: ["marketing", "campaign", "roi", "channel", "exec pack", "reporting", "tile"] },
  { epic: "ML-Assist", owner: "Data Science", keywords: ["model", "estimator", "ml", "cohort", "predict", "recommend"] },
  { epic: "BI-Platform", owner: "Data", keywords: ["dashboard", "funnel", "epic routing", "due-date", "assignee", "comment template", "analytics", "platform"] },
];

export const EPIC_OWNERS = {
  "BI-Platform": "Data Team · BI-Platform owner",
  "Self-Serve-BI": "Data Team · Self-Serve-BI owner",
  "Data-Quality": "Data Team · Data-Quality owner",
  "Field-Ops-Insights": "Data Team · Field-Ops owner",
  "ML-Assist": "Data Science · ML-Assist owner",
};

const P_ORDER = { Highest: "P1", High: "P1", Medium: "P2", Low: "P3", Lowest: "P3", P1: "P1", P2: "P2", P3: "P3" };

export function normalizePriority(raw) {
  if (!raw) return "P2";
  const s = String(raw);
  if (P_ORDER[s]) return P_ORDER[s];
  if (/p1|critical|highest|blocker/i.test(s)) return "P1";
  if (/p3|low|trivial|minor/i.test(s)) return "P3";
  return "P2";
}

export function normalizeStatus(raw) {
  const s = String(raw || "Open").toLowerCase();
  if (/done|closed|resolved|complete/.test(s)) return "Closed";
  if (/block|impediment|waiting/.test(s)) return "Blocked";
  if (/progress|doing|dev|review/.test(s)) return "In progress";
  return "Open";
}

export function suggestEpic(title, summary = "") {
  const text = `${title} ${summary}`.toLowerCase();
  for (const rule of EPIC_RULES) {
    if (rule.keywords.some((k) => text.includes(k))) return rule.epic;
  }
  return "BI-Platform";
}

/** Heuristic points: 1pt = 8h; never below 0.25 */
export function estimatePoints({ issue_type, title = "", summary = "", existing }) {
  if (typeof existing === "number" && existing >= 0.25) return roundQuarter(existing);
  const text = `${title} ${summary}`.toLowerCase();
  const type = String(issue_type || "").toLowerCase();
  let pts = 1;
  if (/bug|hotfix|fix|typo|one-off|quick|ad hoc|adhoc/.test(`${type} ${text}`)) pts = 0.5;
  if (/spike|research|investigate/.test(text)) pts = 1;
  if (/dashboard|model|platform|migration|pipeline redesign/.test(text)) pts = 5;
  if (/epic routing|estimator|template pack|scorecard/.test(text)) pts = 3;
  if (/story/.test(type) && pts < 2) pts = 2;
  if (/epic/.test(type)) pts = 8;
  if (text.length > 400) pts = Math.max(pts, 3);
  return Math.max(0.25, roundQuarter(pts));
}

function roundQuarter(n) {
  return Math.round(n * 4) / 4;
}

export function suggestWorkType(issue_type, labels = []) {
  const blob = `${issue_type} ${(labels || []).join(" ")}`.toLowerCase();
  if (/bug|hot|interrupt|ad-?hoc|unplanned|support/.test(blob)) return "Ad hoc";
  return "Planned";
}

export function nextSprintEndMonday(from = new Date()) {
  const d = new Date(from);
  // next Monday (or today if Monday morning before sync — use upcoming Monday)
  const day = d.getDay(); // 0 Sun … 6 Sat
  const add = day === 1 ? 7 : (8 - day) % 7 || 7;
  d.setDate(d.getDate() + add);
  return isoDate(d);
}

export function quarterEnd(from = new Date()) {
  const y = from.getFullYear();
  const m = from.getMonth(); // 0-based
  const qEndMonth = m <= 2 ? 2 : m <= 5 ? 5 : m <= 8 ? 8 : 11;
  return isoDate(new Date(y, qEndMonth + 1, 0));
}

export function suggestDueDate({ priority, points, existing, asOf = new Date() }) {
  if (existing) return existing;
  if (priority === "P1" || points <= 1) return isoDate(addDays(asOf, 2));
  if (points >= 5) return quarterEnd(asOf);
  return nextSprintEndMonday(asOf);
}

export function suggestAssignee({ assignee, epic }) {
  if (assignee && assignee !== "Unassigned") return assignee;
  return EPIC_OWNERS[epic] || "Data Team queue";
}

export function suggestComment(ticket) {
  if (ticket.has_email === "no" || ticket.has_email === false) {
    return "Please reply with a work email + acceptance criteria so we can assign epic & due date.";
  }
  if (ticket.status === "Blocked") {
    return `FYI — blocked; dependency must clear before target ${ticket.due_date || "sprint-end Monday"}.`;
  }
  if (!ticket.assignee || ticket.assignee === "Unassigned") {
    return `FYI — routing to Data Team under epic ${ticket.epic}; confirming points (${ticket.story_points}) this sprint.`;
  }
  return `FYI — queued under ${ticket.epic}; owner ${ticket.assignee}; target ${ticket.due_date}.`;
}

export function inferTeam(labels = [], components = [], text = "") {
  const blob = `${labels.join(" ")} ${components.join(" ")} ${text}`.toLowerCase();
  if (/data.?science|ml|model/.test(blob)) return "Data Science";
  if (/mkt|marketing|campaign/.test(blob)) return "Mkt";
  if (/product|prd/.test(blob)) return "Product";
  if (/ops|field|support/.test(blob)) return "Ops";
  if (/data\b|analytics|bi/.test(blob)) return "Data";
  return "Data";
}

export function enrichTicket(raw) {
  const title = raw.title || raw.summary || "";
  const summary = raw.summary_text || raw.description || "";
  const epic = raw.epic && raw.epic !== "Unassigned" ? raw.epic : suggestEpic(title, summary);
  const story_points = estimatePoints({
    issue_type: raw.issue_type,
    title,
    summary,
    existing: raw.story_points,
  });
  const priority = normalizePriority(raw.priority);
  const status = normalizeStatus(raw.status);
  const assignee = raw.assignee || "Unassigned";
  const due_date = suggestDueDate({
    priority,
    points: story_points,
    existing: raw.due_date,
  });
  const work_type = raw.work_type || suggestWorkType(raw.issue_type, raw.labels);
  const team = raw.team || inferTeam(raw.labels, raw.components, `${title} ${summary}`);
  const ticket = {
    id: raw.id,
    created: raw.created,
    sprint: raw.sprint || "Backlog",
    issue_type: raw.issue_type || "Task",
    category: raw.category || raw.issue_type || "General",
    status,
    work_type,
    team,
    epic,
    story_points,
    assignee,
    priority,
    title,
    due_date,
    age_days: raw.age_days ?? ageDays(raw.created),
    has_email: raw.has_email === false || raw.has_email === "no" ? "no" : "yes",
    url: raw.url || null,
  };
  ticket.suggested_assignee = suggestAssignee(ticket);
  ticket.suggested_comment = suggestComment(ticket);
  return ticket;
}

export function buildMorningReport(tickets, meta = {}) {
  const active = tickets.filter((t) => t.status !== "Closed");
  const lines = [
    `# Jane morning triage — ${meta.generatedAt || isoDate(new Date())}`,
    "",
    `Source: ${meta.source || "unknown"} · Issues: ${tickets.length} · Active: ${active.length}`,
    "",
    "## Status",
    `- Open: ${tickets.filter((t) => t.status === "Open").length}`,
    `- In progress: ${tickets.filter((t) => t.status === "In progress").length}`,
    `- Blocked: ${tickets.filter((t) => t.status === "Blocked").length}`,
    `- Closed: ${tickets.filter((t) => t.status === "Closed").length}`,
    "",
    "## Top priority actions (P1 / aging)",
  ];
  const top = [...active]
    .sort((a, b) => {
      const po = { P1: 0, P2: 1, P3: 2 };
      return (po[a.priority] - po[b.priority]) || b.age_days - a.age_days;
    })
    .slice(0, 15);
  for (const t of top) {
    lines.push(
      `- **${t.id}** [${t.priority}] ${t.title}`,
      `  - Epic: ${t.epic} · Assign: ${t.suggested_assignee} · Pts: ${t.story_points} · Due: ${t.due_date}`,
      `  - Comment: ${t.suggested_comment}`,
    );
  }
  lines.push("", "_Suggestions only — confirm before writing back to Jira._", "");
  return lines.join("\n");
}

function ageDays(created) {
  if (!created) return 0;
  const t = new Date(created).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / 86400000));
}

function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}
