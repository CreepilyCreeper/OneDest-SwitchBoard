# Quick Deploy Checklist

## Prerequisites
- [ ] Node.js 20+ installed
- [ ] GitHub account
- [ ] Cloudflare account
- [ ] Git configured

## Step 1: Local Setup (5 min)
```bash
git clone https://github.com/CreepilyCreeper/OneDest-SwitchBoard.git
cd OneDest-SwitchBoard
npm install
cp .env.example .env.local
```

## Step 2: GitHub OAuth App (3 min)
- [ ] Go to https://github.com/settings/developers
- [ ] Click "New OAuth App"
- [ ] Fill in:
  - Name: `OneDest SwitchBoard`
  - Homepage: `https://USERNAME.github.io/OneDest-SwitchBoard`
  - Callback: `https://USERNAME.github.io/OneDest-SwitchBoard/oauth-callback`
- [ ] Save Client ID and Client Secret

## Step 3: Cloudflare Worker (5 min)
```bash
npm install -g wrangler
wrangler login
wrangler secret put GITHUB_CLIENT_ID      # Paste Client ID
wrangler secret put GITHUB_CLIENT_SECRET  # Paste Client Secret
wrangler deploy
```
- [ ] Note the Worker URL (e.g., `https://xxx.workers.dev`)

## Step 4: GitHub Repository Secrets (3 min)
Go to: `Settings` → `Secrets and variables` → `Actions` → `New repository secret`

Add these 4 secrets:
- [ ] `NEXT_PUBLIC_GITHUB_CLIENT_ID` = Your OAuth Client ID
- [ ] `NEXT_PUBLIC_CF_WORKER_URL` = `https://your-worker.workers.dev/create-pr`
- [ ] `NEXT_PUBLIC_OAUTH_REDIRECT` = `https://USERNAME.github.io/OneDest-SwitchBoard/oauth-callback`
- [ ] `NEXT_PUBLIC_BASE_PATH` = `/OneDest-SwitchBoard`

## Step 5: Enable GitHub Pages (1 min)
- [ ] Go to `Settings` → `Pages`
- [ ] Source: **GitHub Actions**
- [ ] Save

## Step 6: Deploy! (2 min)
```bash
git add .
git commit -m "Configure for deployment"
git push origin main
```

- [ ] Go to `Actions` tab and watch the deployment
- [ ] Visit `https://USERNAME.github.io/OneDest-SwitchBoard/`

## Verification
- [ ] Site loads without errors
- [ ] Map displays example network
- [ ] Survey uploader visible
- [ ] OAuth popup works (test with dummy survey)

## Troubleshooting
- Build fails? Check `Actions` tab for error logs
- OAuth fails? Verify callback URL matches exactly
- Map doesn't load? Check browser console, verify network.example.json exists
- Worker error? Check Cloudflare dashboard logs

---

**Total Time: ~20 minutes**

For detailed explanations, see [DEPLOYMENT.md](DEPLOYMENT.md)
