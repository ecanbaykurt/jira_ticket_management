# Jane · Data Team triage

**Path:** `projects/service-field-operations/`  
**Audience:** The Data Team  
**Decision:** Assign epic, story points, owner, due date, and follow-up comment — then prioritize capacity.

## Run the app (Settings + Datasource + Actions)

```bash
cd projects/service-field-operations
npm install
npm start
```

Open **http://localhost:5500**

1. **Settings** (top right) — paste Jira + Google API credentials (stored only in local `.jane-secrets.json`, gitignored).
2. **Datasource** — shows which sources are connected and the last snapshot.
3. **Actions** — Sync Jira / Sync Google Sheets / Load demo / Test connections.
4. Dashboard reloads from `data/jira_snapshot.json` after each sync.

### Morning job (9:00)

```bash
npm run schedule          # keep process alive; runs sync at 09:00 (JANE_TZ)
npm run sync              # one-shot using Settings / .env
npm run sync:google       # one-shot Google Sheets
npm run sync:dry          # demo CSV only
```

## Contents

| File | Purpose |
|---|---|
| `index.html` | Interactive dashboard + Settings / Datasource / Actions |
| `backlog-board.html` | ClickOps P1/P2/P3 print board |
| `scripts/dev-server.mjs` | Local UI + API (required for Settings) |
| `scripts/jira-sync.mjs` | CLI sync |
| `scripts/schedule.mjs` | Daily 9:00 runner |
| `data/sample_data.csv` | Fictional fallback tickets |
| `env.example` | Optional `.env` placeholders |
| `.jane-secrets.json` | Created by Settings — **never commit** |

## Privacy

- API tokens stay on your machine (`.jane-secrets.json` / `.env`).
- Live snapshots are gitignored.
- Comment write-back to Jira is **off** unless you enable it in Settings.
