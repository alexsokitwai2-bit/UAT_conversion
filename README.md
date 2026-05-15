# n8n Migration Assistant

Web tool for migrating n8n workflow JSON from UAT to PROD. Business rules follow `docs/n8n_migration_guide.md`; automated replacements use `docs/migration_mapping.json`. The `UAT/` folder in this repo holds **24 sample workflow exports** that were used to derive the guide, default webhook path targets, and manual-review priorities.

## Layout

- `frontend/` — React (Vite), Tailwind, Monaco, Zustand, React Query, react-arborist
- `backend/` — FastAPI: import, migration engine, structured JSON diff, review scanner, export ZIP
- `docs/` — migration guide and mapping (source of truth)
- `UAT/` — 24 reference n8n workflow JSON exports (see migration guide §0)

## Run locally

**Backend** (from repo root, Python 3.11+ recommended):

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8001
```

**Frontend**:

```powershell
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. The dev server proxies `/api` and `/health` to `http://127.0.0.1:8001`.

## Usage

1. **Import UAT folder** — choose a directory of `*.json` workflow exports.
2. **Migrate** — applies mapping (domains, credentials, workflow IDs, buckets, channels, emails, webhook paths) and removes `id`, `versionId`, `meta`; strips `[UAT]` from the workflow name per the guide.
3. Review the **structured diff**, **Monaco** side-by-side JSON, and the **manual review checklist**.
4. **Edit** PROD JSON when needed; **Save** runs server-side validation.
5. **Download workflow** or **Export ZIP** (workflows + `migration_report.json` + `manual_review_report.json`).

## API (FastAPI)

| Method | Path |
|--------|------|
| POST | `/api/import-folder` |
| POST | `/api/migrate?session_id=...` |
| GET | `/api/diff/{session_id}/{file_id}` |
| GET | `/api/review-items/{session_id}/{file_id}` |
| POST | `/api/save/{session_id}/{file_id}` |
| POST | `/api/mark-reviewed/{session_id}/{file_id}` |
| GET | `/api/export/{session_id}` |
| GET | `/api/workflow/{session_id}/{file_id}` |
| GET | `/api/session/{session_id}/summary` |

Sessions are kept in memory (restart clears them).
