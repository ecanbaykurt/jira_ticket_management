/**
 * Read a Google Sheet used as a Jane ticket datasource.
 * Sheet should include a header row. Common columns:
 * ticket_id/id/key, title/summary, status, team, sprint, story_points, ...
 */
export async function fetchGoogleSheetTickets({ apiKey, spreadsheetId, range }) {
  if (!apiKey || !spreadsheetId) {
    throw new Error("Google Sheets needs apiKey + spreadsheetId");
  }
  const encodedRange = encodeURIComponent(range || "Tickets!A:P");
  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodedRange}` +
    `?key=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Google Sheets failed ${res.status}: ${body.slice(0, 400)}`);
  }
  const data = await res.json();
  const values = data.values || [];
  if (values.length < 2) return [];

  const headers = values[0].map((h) => String(h || "").trim().toLowerCase());
  return values.slice(1).map((row) => rowToTicket(headers, row)).filter((t) => t.id && t.title);
}

function rowToTicket(headers, row) {
  const get = (...aliases) => {
    for (const a of aliases) {
      const i = headers.indexOf(a);
      if (i >= 0 && row[i] != null && String(row[i]).trim() !== "") return String(row[i]).trim();
    }
    return "";
  };

  const id = get("ticket_id", "id", "key", "issue", "issue key");
  const title = get("title", "summary", "name");
  const created = get("created", "created_at", "date") || new Date().toISOString().slice(0, 10);
  const points = Number(get("story_points", "points", "estimate") || "1");

  return {
    id,
    created,
    sprint: get("sprint") || "Backlog",
    issue_type: get("issue_type", "type", "issue type") || "Task",
    category: get("category", "issue_type", "type") || "General",
    status: get("status") || "Open",
    work_type: get("work_type", "work type", "planned") || undefined,
    team: get("team", "requesting team") || undefined,
    epic: get("epic") || undefined,
    story_points: Number.isFinite(points) && points > 0 ? points : undefined,
    assignee: get("assignee", "owner", "assigned") || "Unassigned",
    priority: get("priority", "pri") || "P2",
    title,
    due_date: get("due_date", "due", "due date") || null,
    age_days: Number(get("age_days", "age") || "") || undefined,
    has_email: /^(no|false|0)$/i.test(get("has_email", "email")) ? "no" : "yes",
    labels: get("labels") ? get("labels").split(/[;,]/).map((s) => s.trim()) : [],
    components: [],
    url: get("url", "link") || null,
  };
}
