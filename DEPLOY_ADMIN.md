# Deploying admin server (app-admin.js)

This file describes how to deploy the separate admin service (`app-admin.js`) to Render or Heroku, and how to update the frontend to call the new admin service.

## Overview

- Goal: run `app-admin.js` as an independent web service that serves `/asielen` endpoints.
- Start command: `node app-admin.js`
- Port: the service should use the `PORT` environment variable (the file uses `process.env.ADMIN_PORT || 3002` — set `PORT` to the value Render/Heroku provides, or set `ADMIN_PORT` to 3002 if you want.

## Render (recommended quick steps)

1. In the Render dashboard, create a new "Web Service".
2. Connect the same GitHub repo and choose the branch (e.g., `main`).
3. For the Root directory, set `/` (repo root) unless you prefer a subdirectory.
4. Set the Build Command: leave empty (no build) or use `npm ci` if you want dependencies installed.
5. Set the Start Command to: `node app-admin.js`
6. Add Environment Variables (Render -> Environment):
   - `MONGO_URI` = your MongoDB connection string
   - `NODE_ENV` = `production` (optional)
   - (Optional) `ADMIN_PORT` = 3002 if you want to fix the port; Render sets `PORT` automatically so not required
7. Click Create and wait for the deploy to finish.
8. After deploy, Render gives you a URL (e.g., `https://my-express-app-admin.onrender.com`). Use that as your admin base URL in the mobile app.

Notes:

- If your `app-admin.js` listens on `process.env.ADMIN_PORT` instead of `process.env.PORT`, change the file or add an `ADMIN_PORT` env var. Render provides `PORT` only, so best to change `app-admin.js` to prefer `process.env.PORT || process.env.ADMIN_PORT || 3002`.

## Heroku (alternative)

1. Create a new Heroku app.
2. In Settings -> Config Vars, set `MONGO_URI` and any other env vars.
3. For the Procfile, add:
   web: node app-admin.js
4. Push to Heroku and verify the app is running; use the provided Heroku URL.

## Updating the mobile app to call the admin service

Your frontend `app/lib/api.ts` currently sets a `BASE` URL. After you deploy the admin service, you have two options:

Option A — quick edit (hardcode admin base):

- Change `app/lib/api.ts` to add an `ADMIN_BASE` constant and choose the base per request when `isAdmin` is true.

Example change (pseudo-code):

const BASE = 'https://my-express-app-ne4l.onrender.com';
const ADMIN_BASE = 'https://my-express-app-admin.onrender.com';

export async function apiFetch(path, opts = {}, isAdmin = false) {
const base = isAdmin ? ADMIN_BASE : BASE;
const url = `${base}${path}`;
...
}

Then update any call that should go to the admin service to pass `isAdmin = true`, for example:

api.post('/asielen', payload, true);

Option B — use environment config (recommended for CI/EAS):

- Add runtime environment values to the Expo app (EAS secrets or `app.config.js`) so the app uses `process.env.ADMIN_BASE` and `process.env.BASE`.
- This avoids hardcoding URLs in source.

## Test after deploy

1. After Render/Heroku deploy completes, run this from any machine (or your device):

curl -i -X POST https://<your-admin-url>/asielen \
 -H "Content-Type: application/json" \
 -d '{"name":"test","email":"t@example.com","password":"secret"}'

Expected: a 200/201 response (or JSON with error details) — not a 404.

## Additional suggestions

- If you want the simplest immediate fix, you already mounted `/asielen` on the main `app.js` and pushed that change — redeploy the existing main service to pick up the change.
- If you want separation, deploy `app-admin.js` as above and update the mobile `ADMIN_BASE`.
- Consider changing `app-admin.js` to prefer `process.env.PORT` so cloud hosts (Render/Heroku) work without extra env vars:

```js
const PORT = process.env.PORT || process.env.ADMIN_PORT || 3002;
```

## Troubleshooting

- If you get `Cannot POST /asielen` after deploy: verify the deployed logs to ensure `app-admin.js` or `app.js` mounted `/asielen` and that the process started without errors.
- If you see MongoDB connection errors, double-check `MONGO_URI` and that your DB allows connections from the host.

---

If you want, I can also:

- Edit `app-admin.js` to prefer `process.env.PORT` and open a small PR with that change.
- Update `app/lib/api.ts` to support `ADMIN_BASE` and pass `isAdmin` from admin pages.
- Walk through creating the Render service step-by-step and test curl after you deploy.
