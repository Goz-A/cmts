# CMTS – Change Management & Tracking System (Core Banking Application Support)

MIT professional project prototype: React · Node/Express · PostgreSQL · JWT/RBAC · Chart.js.
All data is **synthetic**; nothing connects to a live banking system.

## Run locally

```bash
createdb cmts
cd backend && npm install && cp .env.example .env
npm run seed            # creates schema + synthetic data (DROPS existing tables)
npm start               # API on http://localhost:4000

cd ../frontend && npm install && npm run dev     # UI (Vite proxies /api to :4000)
npm test --prefix ../backend                      # 24 integration tests (needs the seeded DB)
```

Demo logins (password `Password123!`): `engineer1`, `reviewer1`, `approver1`, `admin` @cmts.local.

## Deployment

| Part | Where | How |
|---|---|---|
| API + PostgreSQL | Render | `render.yaml` Blueprint (New → Blueprint). Set `CORS_ORIGIN` to the Pages origin. |
| Frontend (static) | GitHub Pages | `.github/workflows/deploy-frontend.yml`. Set repo variable `VITE_API_URL` to the Render API URL, and enable Pages → Source: GitHub Actions. |

Seed the hosted database once from your machine with the Render *external* connection string:
`DATABASE_URL='<external url>' DATABASE_SSL=true npm run seed --prefix backend`

## Workflow (backend/src/workflow.js is the single source of truth)

Draft → Submitted → (Reviewer) Under Review | Returned → (Approver) Approved | Rejected | Returned
→ (Engineer records implementation) Monitoring → Closed. `GET /api/changes/workflow` returns the table.

- Roles: Support Engineer (raise/implement/close), Reviewer, Approver, Administrator (users only).
- Segregation of duties: a requester can never review or approve their own change.
- High-risk (score ≥ 60) changes need the CAB outcome recorded in the approval comment.
- **Correlation**: same application + module, incident opened within 72h after implementation (proximity, not causation).
- **Change failure rate** = implemented changes recorded Failed/Rolled Back, or with a P1/P2 incident linked, ÷ implemented changes.
