# Secrets & OAuth Setup — Quick Instructions

This file shows exact commands and steps to add GitHub OAuth credentials to the Cloudflare Worker and configure the client.

## 1) Create GitHub OAuth App (one-time)
1. Go to GitHub → Settings → Developer settings → OAuth Apps → New OAuth App.
2. App name: OneDest SwitchBoard (or your org name)
3. Homepage URL: https://<your-site>
4. Authorization callback URL: https://<your-site>/oauth-callback
5. After creation copy the Client ID and Client Secret.

## 2) Deploy Worker and add secrets (recommended: wrangler)
Prereqs:
- Install Wrangler: `npm install -g @cloudflare/wrangler`
- Login: `wrangler login`
- Ensure `wrangler.toml` exists in project root (script `scripts/setup_and_publish_worker.sh` can create it).

Add secrets to the Worker using wrangler:
```bash
# store the client id
wrangler secret put GITHUB_CLIENT_ID
# (paste the GitHub OAuth Client ID when prompted)

# store the client secret
wrangler secret put GITHUB_CLIENT_SECRET
# (paste the GitHub OAuth Client Secret when prompted)
```

Publish the worker:
```bash
wrangler publish
```

Verify the Worker URL printed by `wrangler publish` (or see it in Cloudflare Dashboard). Example Worker endpoint used by the client:
https://onedest-switchboard-auth.icenia-auth.workers.dev/create-pr

## 3) Alternative: Add secrets via Cloudflare Dashboard
1. Cloudflare → Workers → Select your Worker → Settings → Variables / Secrets.
2. Add secret keys:
   - `GITHUB_CLIENT_ID` → paste Client ID
   - `GITHUB_CLIENT_SECRET` → paste Client Secret

## 4) Client configuration (Next.js / static site)
Set client-visible vars at build-time or runtime (these are safe to expose):
- NEXT_PUBLIC_GITHUB_CLIENT_ID — the GitHub OAuth client id (public)
- NEXT_PUBLIC_CF_WORKER_URL — your worker endpoint (e.g. https://onedest-switchboard-auth.icenia-auth.workers.dev/create-pr)
- NEXT_PUBLIC_OAUTH_REDIRECT — https://<your-host>/oauth-callback

Example .env.local:
```env
NEXT_PUBLIC_GITHUB_CLIENT_ID=ghp_xxxCLIENTIDxxx
NEXT_PUBLIC_CF_WORKER_URL=https://onedest-switchboard-auth.icenia-auth.workers.dev/create-pr
NEXT_PUBLIC_OAUTH_REDIRECT=https://your-site.example/oauth-callback
```
After editing `.env.local` rebuild the site if needed.

## 5) Security notes
- DO NOT put `GITHUB_CLIENT_SECRET` in client-side env or repo. It must only be stored as a Worker secret.
- Worker should not return access_token to client.
- Validate `state` in the client and verify origins when using postMessage.
- Limit worker origins (CORS) to your hosted domain.

## 6) Quick test checklist
- [ ] GitHub OAuth App created; Client ID/Secret copied.
- [ ] Worker deployed and `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` secrets set.
- [ ] NEXT_PUBLIC_* env vars set in client (or SurveyUploader runtime prompt will ask).
- [ ] OAuth callback URL configured in GitHub matches `NEXT_PUBLIC_OAUTH_REDIRECT`.
- [ ] Test: Upload survey → Approve → Authenticate via GitHub → Worker should create PR and return PR URL.