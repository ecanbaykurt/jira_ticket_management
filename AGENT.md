# AGENT.md — Jane · Data Team (Service & Field Operations shell)

Open-source Decision Lab starter customized for **Jane** / **The Data Team**. Paste a **Copy GitHub** prompt from the workshop site into Cursor Agent and work in this folder.

## Paths
- GitHub tree: https://github.com/ecanbaykurt/Human-Centered-AI-for-Data-Driven-Decision-Making/tree/main/projects/service-field-operations
- This folder: `projects/service-field-operations/`
- Live dashboard (monorepo app): `/dashboard/service-field-operations`
- ClickOps: `/ops/service-field-operations`
- Challenge: `/challenge/service-field-operations`

## Goal
Help the Data Team triage Jira intake: volume/status clarity plus actionable assignment of epic, points, owner, due date, and follow-up comment.

**Decision question:** Where should the Data Team prioritize tickets — and how should each ticket be routed?

## Ideas
- Sprint intake trend
- Open vs closed vs blocked
- Ad hoc vs planned mix (**prefer story points** over ticket counts for capacity)
- Load by requesting team
- Backlog board sorted by age × priority

## Data
- `data/sample_data.csv` — fictional Jira-style tickets
- Key fields: sprint, status (incl. Blocked), work_type, team, epic, story_points, assignee, priority, due_date, has_email
- Optional local CSV mapping note: date / category / value ↔ Issue Type fields from the Decision Lab form

## Agent instructions
1. Read README.md + this file + sample CSV.
2. Customize `index.html` and `backlog-board.html` to the user's brief (Jane).
3. Keep privacy: fictional data unless user supplies CSV; no secrets in git; env placeholders only.
4. Prefer decision-first UX over decorative charts.
5. Summarize how to open the result (`index.html`, `backlog-board.html`, or `npm run dev` for Next routes).

## Do not
- Commit API keys or real PII
- Claim real predictions from demo metrics
- Leave the project folder unless the user asks
