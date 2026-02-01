# OneDest SwitchBoard

**Rail network visualization and maintenance tool for CivMC's OneDest system**

[![Deploy to Pages](https://github.com/CreepilyCreeper/OneDest-SwitchBoard/workflows/Deploy%20to%20GitHub%20Pages/badge.svg)](https://github.com/CreepilyCreeper/OneDest-SwitchBoard/actions)

## 🚀 Quick Links

- **Live Demo**: https://creepilycreeper.github.io/OneDest-SwitchBoard/
- **Deployment Guide**: [DEPLOYMENT.md](DEPLOYMENT.md)
- **Secrets Setup**: [docs/SECRETS.md](docs/SECRETS.md)

## Architecture

This project uses a **static frontend + serverless backend** architecture:

- **Frontend**: Next.js static export hosted on **GitHub Pages**
- **Auth Backend**: **Cloudflare Worker** for OAuth and PR creation
- **Pseudo Backend**: **GitHub Actions** workflows for data processing

## Features

✅ **Interactive Map**: Visualize rail network with color-coded copper coverage  
✅ **Survey Upload**: Upload RailScout surveys → reconcile → preview diffs → create PR  
✅ **Router Validation**: Detect OneDest argument prefix collisions  
✅ **OAuth Flow**: Secure PKCE authentication via GitHub  
✅ **Static Deployment**: Fully static site on GitHub Pages  
✅ **Unit Tests**: Comprehensive test coverage with Vitest  

## Quick Start

```bash
# Clone and install
git clone https://github.com/CreepilyCreeper/OneDest-SwitchBoard.git
cd OneDest-SwitchBoard
npm install

# Copy environment template
cp .env.example .env.local
# Edit .env.local with your values

# Run tests
npm test

# Build static export
npm run build

# Preview locally
npm run dev
```

For complete deployment instructions, see **[DEPLOYMENT.md](DEPLOYMENT.md)**

## Project Structure

```
OneDest-SwitchBoard/
├── .github/workflows/     # CI/CD pipelines
├── app/                   # Next.js pages
├── src/
│   ├── components/        # React components
│   ├── lib/router/        # Core routing logic + tests
│   ├── lib/oauth.ts       # PKCE helpers
│   └── worker/            # Cloudflare Worker
├── public/                # Static assets
└── docs/                  # Documentation
```

## Core Functionality

### 1. Routing Engine (`src/lib/router/`)

- **Dijkstra pathfinding** on directed weighted graph
- **Router validation**: Check for OneDest prefix conflicts
- **Survey reconciliation**: Match GPS samples to edges, update copper coverage

### 2. Interactive Map (`src/components/Map.tsx`)

- React-Leaflet visualization
- Segmented polylines (color-coded by copper coverage)
- Dynamic network loading from JSON

### 3. OAuth + PR Flow (`src/components/SurveyUploader.tsx`)

- PKCE OAuth flow (popup-based)
- Survey diff preview
- Cloudflare Worker creates GitHub PR with changes

### 4. Cloudflare Worker (`src/worker/create_pr_worker.ts`)

- Server-side OAuth code exchange
- GitHub API: branch creation, file commit, PR creation
- Never exposes access tokens to client

## Deployment

### Option 1: GitHub Pages (Recommended)

1. Configure GitHub OAuth App and Cloudflare Worker
2. Set repository secrets (see [DEPLOYMENT.md](DEPLOYMENT.md))
3. Enable GitHub Pages (Source: GitHub Actions)
4. Push to `main` → auto-deploys

### Option 2: Manual Static Export

```bash
npm run build
# Upload ./out directory to any static host
```

## Development

```bash
npm run dev          # Start dev server
npm test             # Run tests
npm run test:watch   # Watch mode
npm run build        # Build production
```

## Testing

Unit tests cover:
- Dijkstra shortest path
- Router layout validation (prefix conflicts)
- Survey reconciliation logic

```bash
npm test
```

## Environment Variables

Required for deployment (set as GitHub repository secrets):

- `NEXT_PUBLIC_GITHUB_CLIENT_ID` - GitHub OAuth Client ID
- `NEXT_PUBLIC_CF_WORKER_URL` - Cloudflare Worker URL
- `NEXT_PUBLIC_OAUTH_REDIRECT` - OAuth callback URL
- `NEXT_PUBLIC_BASE_PATH` - Base path for GitHub Pages (e.g., `/OneDest-SwitchBoard`)

See [.env.example](.env.example) for template.

## Security

- ✅ Client Secret stored only in Cloudflare Worker (never client-side)
- ✅ PKCE flow prevents authorization code interception
- ✅ Access tokens never exposed to client
- ⚠️ Production: Add CORS validation, rate limiting, payload size limits

## Status

🟢 **Ready for GitHub Pages deployment**

### What's Implemented

✅ Core routing logic (Dijkstra, validation, reconciliation)  
✅ Unit tests with Vitest  
✅ Interactive map with React-Leaflet  
✅ Survey uploader with PKCE OAuth  
✅ Cloudflare Worker for PR creation  
✅ **Static export for GitHub Pages**  
✅ **GitHub Actions CI/CD workflows**  
✅ **Complete deployment documentation**  

### Next Steps

1. Follow [DEPLOYMENT.md](DEPLOYMENT.md) to configure and deploy
2. Set up GitHub OAuth App
3. Deploy Cloudflare Worker
4. Configure repository secrets
5. Push to trigger deployment

---

## Original Handoff Summary
- Visualize segmented rail edges (copper coverage), reconcile RailScout survey reports with canonical network JSON, validate router logic (prefix collisions), and let maintainers propose network updates via GitHub PRs.

Handoff summary (concise)
- Core TypeScript library implemented: Dijkstra routing, validateRouterLayout(exits), reconcileSurvey(surveyReport, threshold).
- Unit tests present for core router logic (Vitest).
- Client: Next.js (app router) skeleton with react-leaflet Map and components:
  - SurveyUploader (wired with PKCE popup, reconciles surveys, previews diffs, POSTS to Worker)
  - RouterCard (router logic display)
  - SegmentedEdge (multi-colored polylines)
  - oauth-callback page (posts code to opener)
- Serverless: Cloudflare Worker at https://onedest-switchboard-auth.icenia-auth.workers.dev
  - POST /create-pr handles OAuth code exchange, branch/file commit, and PR creation
  - GET / and /health endpoints added for checks
- Deployment helpers:
  - wrangler.toml (configured for provided account_id)
  - scripts/setup_and_publish_worker.sh (creates wrangler.toml, sets secrets, publishes)
  - docs/SECRETS.md (exact commands for adding secrets and client env)
- Worker secrets required: GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET
- Defaults used: Owner= CreepilyCreeper, Repo= OneDest-SwitchBoard, Base=main, File=onedest-network.json

Files of interest
- src/lib/router/index.ts — core routing, validation, reconciliation
- src/lib/router/index.test.ts — unit tests
- src/lib/oauth.ts — PKCE helpers
- src/components/SurveyUploader.tsx — survey upload + PKCE + PR flow
- app/oauth-callback/page.tsx — OAuth redirect handler
- src/worker/create_pr_worker.ts — Cloudflare Worker PR creator
- wrangler.toml, scripts/setup_and_publish_worker.sh, docs/SECRETS.md

How to deploy & configure (summary)
1. Register GitHub OAuth App:
   - Redirect/callback: https://<your-site>/oauth-callback
   - Copy Client ID and Client Secret
2. Deploy Worker (local)
   - Install Wrangler v2: `npm install -g wrangler`
   - Ensure wrangler.toml present (script can create it)
   - Add secrets:
     - `wrangler secret put GITHUB_CLIENT_ID`
     - `wrangler secret put GITHUB_CLIENT_SECRET`
   - Deploy: `wrangler deploy`
3. Configure client env (build or runtime):
   - NEXT_PUBLIC_GITHUB_CLIENT_ID
   - NEXT_PUBLIC_CF_WORKER_URL (e.g. https://onedest-switchboard-auth.icenia-auth.workers.dev/create-pr)
   - NEXT_PUBLIC_OAUTH_REDIRECT (e.g. https://<your-site>/oauth-callback)
4. Test flow:
   - Open app, upload survey, preview diffs, Approve → authenticate via popup → Worker creates PR → confirm PR URL.

Security notes
- Never store GITHUB_CLIENT_SECRET client-side. Keep it as Worker secret.
- Worker returns only PR URL; it does not expose access_token.
- Add CORS/origin checks, request size limits, and rate limiting in production.
- Consider GitHub App flow for organization-level deployments.

Remaining & recommended next work
- E2E test: full OAuth → Worker → PR against sandbox repo
- CI: add GitHub Actions for Vitest + coverage
- UX: map interaction (click junction → RouterCard), legend, performance improvements
- Survey bundling: aggregate multiple survey reports into single PR
- Security: origin validation, payload size handling, retry/idempotency, rate-limiting

Immediate handoff checklist
- [x] Core router logic (Dijkstra, validation, reconciliation)
- [x] Unit tests for core logic
- [x] PKCE helpers & oauth-callback page
- [x] SurveyUploader wiring + preview diffs
- [x] Cloudflare Worker for PR creation (deployed)
- [x] Deployment helper script and secrets docs
- [ ] E2E testing (sandbox PR)
- [ ] CI & coverage
- [ ] UX polish & production security hardening

Contact / notes for maintainers
- Current repo owner is personal; update defaults when moving to organization.
- Worker host: https://onedest-switchboard-auth.icenia-auth.workers.dev
- If you want, I can implement CI workflow and run an E2E sandbox PR test (requires sandbox repo & consenting GitHub auth).