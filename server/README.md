Admin server (optional) — GPT-5 Mini demo

This lightweight server exposes two endpoints for demo/admin purposes:
- `GET /status` — returns `{ enabled: boolean }`
- `POST /status` — accepts `{ enabled: boolean }` in JSON body and updates the persisted status. Requires header `X-Admin-Token` matching `ADMIN_TOKEN` env var (default `dev-token`).

Run locally

1. Install dependencies:

```bash
cd server
npm install
```

2. Start server (optionally set an admin token):

```bash
ADMIN_TOKEN=my-secret-token npm start
```

3. The popup can be configured to `http://localhost:3000` and the token above to sync changes.

Security
- This server is intentionally minimal and file-backed for demonstration only. Do NOT use in production.
