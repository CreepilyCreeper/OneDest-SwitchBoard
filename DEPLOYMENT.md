# OneDest SwitchBoard — GitHub Pages Deployment

## Overview

**OneDest SwitchBoard** is a rail network visualization and maintenance tool for CivMC's OneDest rail system. This version is deployed as a static site on GitHub Pages with:
- **Frontend**: Next.js static export
- **Auth Backend**: Cloudflare Worker for GitHub OAuth
- **Pseudo Backend**: GitHub Actions workflows for data processing

## Architecture

```
┌─────────────────────┐
│  GitHub Pages       │
│  (Static Frontend)  │
│  - Map              │
│  - Survey Upload    │
│  - Router Validator │
└──────┬──────────────┘
       │
       ├─────────────────────────────────┐
       │                                 │
       v                                 v
┌──────────────────┐          ┌─────────────────────┐
│ Cloudflare Worker│          │ GitHub Actions      │
│ (OAuth Handler)  │          │ (Pseudo Backend)    │
│ - Code Exchange  │          │ - Process Updates   │
│ - PR Creation    │          │ - Run Tests         │
└──────────────────┘          │ - Validate Data     │
                              └─────────────────────┘
```

## Features

✅ **Core TypeScript library**: Dijkstra routing, router validation, survey reconciliation  
✅ **Unit tests**: Vitest test suite for router logic  
✅ **Interactive Map**: React-Leaflet with segmented edges (copper coverage)  
✅ **Survey Upload**: PKCE OAuth flow → reconcile → preview diffs → create PR  
✅ **Static Export**: Fully static site deployable to GitHub Pages  
✅ **GitHub Actions**: Automated deployment and pseudo-backend workflows  

## Quick Start

### Prerequisites

- Node.js 20+ and npm
- GitHub account
- Cloudflare account (for OAuth worker)

### 1. Clone and Install

```bash
git clone https://github.com/CreepilyCreeper/OneDest-SwitchBoard.git
cd OneDest-SwitchBoard
npm install
```

### 2. Configure Environment Variables

Copy the example file and fill in your values:

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```env
NEXT_PUBLIC_GITHUB_CLIENT_ID=your_oauth_app_client_id
NEXT_PUBLIC_CF_WORKER_URL=https://your-worker.workers.dev/create-pr
NEXT_PUBLIC_OAUTH_REDIRECT=https://username.github.io/OneDest-SwitchBoard/oauth-callback
NEXT_PUBLIC_BASE_PATH=/OneDest-SwitchBoard
```

### 3. GitHub OAuth App Setup

1. Go to GitHub → Settings → Developer Settings → OAuth Apps → New OAuth App
2. **Application name**: OneDest SwitchBoard
3. **Homepage URL**: `https://username.github.io/OneDest-SwitchBoard`
4. **Authorization callback URL**: `https://username.github.io/OneDest-SwitchBoard/oauth-callback`
5. Save the **Client ID** and **Client Secret**

### 4. Deploy Cloudflare Worker

The Worker handles OAuth code exchange and PR creation.

```bash
# Install wrangler
npm install -g wrangler

# Login to Cloudflare
wrangler login

# Add secrets
wrangler secret put GITHUB_CLIENT_ID
wrangler secret put GITHUB_CLIENT_SECRET

# Deploy
wrangler deploy
```

Note the Worker URL (e.g., `https://onedest-switchboard-auth.icenia-auth.workers.dev`)

### 5. Configure GitHub Repository Secrets

Go to your repository → Settings → Secrets and variables → Actions → New repository secret

Add these secrets:

- `NEXT_PUBLIC_GITHUB_CLIENT_ID`: Your GitHub OAuth Client ID
- `NEXT_PUBLIC_CF_WORKER_URL`: Your Cloudflare Worker URL + `/create-pr`
- `NEXT_PUBLIC_OAUTH_REDIRECT`: Your callback URL
- `NEXT_PUBLIC_BASE_PATH`: `/OneDest-SwitchBoard` (or your repo name)

### 6. Enable GitHub Pages

1. Go to repository Settings → Pages
2. Source: **GitHub Actions**
3. Save

### 7. Deploy

Push to the `main` branch or manually trigger the workflow:

```bash
git add .
git commit -m "Initial deploy"
git push origin main
```

The GitHub Actions workflow will automatically build and deploy to Pages.

Visit: `https://username.github.io/OneDest-SwitchBoard/`

## Development

### Local Development

```bash
npm run dev
```

Open http://localhost:3000

### Build for Production

```bash
npm run build
```

Output will be in the `out/` directory.

### Run Tests

```bash
npm test        # Run once
npm run test:watch  # Watch mode
```

## File Structure

```
OneDest-SwitchBoard/
├── .github/
│   └── workflows/
│       ├── deploy-pages.yml          # GitHub Pages deployment
│       └── process-network-update.yml # Pseudo-backend workflow
├── app/
│   ├── layout.tsx                    # Root layout
│   ├── page.tsx                      # Main map page
│   ├── globals.css                   # Global styles
│   └── oauth-callback/
│       └── page.tsx                  # OAuth callback handler
├── src/
│   ├── components/
│   │   ├── Map.tsx                   # Leaflet map wrapper
│   │   ├── SegmentedEdge.tsx         # Multi-colored polylines
│   │   ├── RouterCard.tsx            # Router logic display
│   │   └── SurveyUploader.tsx        # Survey upload + OAuth flow
│   ├── lib/
│   │   ├── router/
│   │   │   ├── index.ts              # Core routing logic
│   │   │   └── index.test.ts         # Unit tests
│   │   ├── oauth.ts                  # PKCE helpers
│   │   └── github.ts                 # GitHub API helpers
│   └── worker/
│       └── create_pr_worker.ts       # Cloudflare Worker (OAuth)
├── public/
│   └── network.example.json          # Sample network data
├── docs/
│   └── SECRETS.md                    # Secrets configuration guide
├── next.config.js                    # Next.js configuration
├── tsconfig.json                     # TypeScript configuration
├── wrangler.toml                     # Cloudflare Worker config
├── package.json                      # Dependencies and scripts
└── README.md                         # This file
```

## Usage

### Visualize Network

The map displays the rail network with color-coded segments:
- **Green**: Coppered rails (8 m/s)
- **Red**: Uncoppered rails (4 m/s)

### Upload Survey Report

1. Click "Survey Uploader" in the top-left
2. Select a JSON survey file (format: `{ samples: [{ coords: [x,y,z], speed: number }...] }`)
3. Preview the reconciled differences
4. Click "Approve & Create PR"
5. Authorize via GitHub OAuth popup
6. Worker creates a PR with the updated network.json

### Router Validation

Components can use `validateRouterLayout(exits)` to check for OneDest argument prefix collisions.

## GitHub Actions Workflows

### Deploy to Pages (`.github/workflows/deploy-pages.yml`)

- **Trigger**: Push to `main` or manual dispatch
- **Actions**: 
  1. Checkout code
  2. Install dependencies
  3. Build Next.js static export
  4. Deploy to GitHub Pages

### Process Network Update (`.github/workflows/process-network-update.yml`)

Pseudo-backend workflow for processing network updates.

- **Trigger**: Manual workflow dispatch
- **Inputs**:
  - `survey_data`: Base64-encoded survey JSON
  - `update_type`: Type of update (survey_reconciliation, manual_update, bulk_import)
  - `pr_number`: Optional PR number to comment on
- **Actions**:
  1. Validate survey data
  2. Run reconciliation logic
  3. Run tests
  4. Comment on related PR

**Example: Trigger from CLI**

```bash
# Base64 encode survey data
SURVEY_B64=$(cat survey.json | base64 -w 0)

# Trigger workflow
gh workflow run process-network-update.yml \
  -f survey_data="$SURVEY_B64" \
  -f update_type="survey_reconciliation" \
  -f pr_number="123"
```

## Cloudflare Worker (OAuth Handler)

Located in `src/worker/create_pr_worker.ts`. Handles:
1. OAuth code → access token exchange
2. Creates new branch from base
3. Commits file changes
4. Opens pull request
5. Returns PR URL to client

**Endpoints**:
- `GET /` - Health check
- `GET /health` - Health check
- `POST /create-pr` - Create PR with OAuth

**Required Secrets** (via `wrangler secret put`):
- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`

## Security Notes

- ✅ Client Secret stored only in Worker (server-side)
- ✅ PKCE flow protects against authorization code interception
- ✅ Access tokens never exposed to client
- ⚠️ Add CORS origin validation in production
- ⚠️ Add rate limiting to Worker
- ⚠️ Validate payload sizes (prevent abuse)

## Troubleshooting

### Build fails with "Module not found"

Ensure all dependencies are installed:
```bash
rm -rf node_modules package-lock.json
npm install
```

### OAuth redirect fails

1. Check that `NEXT_PUBLIC_OAUTH_REDIRECT` matches your GitHub OAuth App callback URL exactly
2. Ensure `NEXT_PUBLIC_BASE_PATH` is set correctly for GitHub Pages
3. Verify GitHub OAuth App is approved and active

### Map doesn't load

1. Check browser console for errors
2. Verify `public/network.example.json` exists
3. Check that basePath is correctly configured

### Worker returns 500

1. Check Worker logs in Cloudflare dashboard
2. Verify secrets are set: `wrangler secret list`
3. Test Worker directly: `curl https://your-worker.workers.dev/health`

## Next Steps & Improvements

### Completed ✅
- [x] Core router logic (Dijkstra, validation, reconciliation)
- [x] Unit tests for core logic
- [x] PKCE OAuth flow
- [x] Survey uploader with diff preview
- [x] Cloudflare Worker for PR creation
- [x] GitHub Pages static deployment
- [x] GitHub Actions CI/CD
- [x] Deployment documentation

### Recommended Enhancements
- [ ] E2E testing with Playwright
- [ ] Map interactions (click junction → view router layout)
- [ ] Legend for segment colors
- [ ] Survey data bundling (multiple reports → single PR)
- [ ] Real-time map updates via WebSocket
- [ ] Network graph editor (add/remove edges)
- [ ] Performance optimization for large networks
- [ ] Mobile-responsive design
- [ ] Dark mode

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## License

ISC

## Contact

- **Repository**: https://github.com/CreepilyCreeper/OneDest-SwitchBoard
- **Issues**: https://github.com/CreepilyCreeper/OneDest-SwitchBoard/issues
- **CivMC Discord**: Find maintainers in the OneDest channels

---

**Status**: Ready for GitHub Pages deployment 🚀

For detailed secrets configuration, see [docs/SECRETS.md](docs/SECRETS.md)
