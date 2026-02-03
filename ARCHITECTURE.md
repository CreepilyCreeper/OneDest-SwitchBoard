# OneDest SwitchBoard Architecture

## System Overview

```
┌───────────────────────────────────────────────────────────────────┐
│                         User's Browser                            │
│  ┌────────────────────────────────────────────────────────────┐   │
│  │  Static Frontend (GitHub Pages)                            │   │
│  │  https://username.github.io/OneDest-SwitchBoard/           │   │
│  │                                                            │   │
│  │  Components:                                               │   │
│  │  • Map (React-Leaflet) - Visualize rail network            │   │
│  │  • SurveyUploader - Upload & reconcile survey reports      │   │
│  │  • RouterCard - Display router validation                  │   │
│  │  • SegmentedEdge - Color-coded rail segments               │   │
│  └────────────────────────────────────────────────────────────┘   │
└───────────────┬─────────────────────────┬─────────────────────────┘
                │                         │
                │                         │
    ┌───────────▼────────┐    ┌───────────▼──────────────────┐
    │  Cloudflare Worker │    │   GitHub API (OAuth)         │
    │  (Auth Backend)    │    │                              │
    │                    │◄───┤  • Authorization             │
    │  Endpoints:        │    │  • Code Exchange             │
    │  POST /create-pr   │    └──────────────────────────────┘
    │  GET  /health      │
    │                    │
    │  Secrets:          │    ┌──────────────────────────────┐
    │  • CLIENT_ID       │───►│  GitHub API (Repos)          │
    │  • CLIENT_SECRET   │    │                              │
    └────────────────────┘    │  • Create branches           │
                              │  • Commit files              │
                              │  • Open pull requests        │
                              └──────────────────────────────┘

┌───────────────────────────────────────────────────────────────────┐
│                    GitHub Actions (Pseudo Backend)                │
│  ┌────────────────────────────────────────────────────────────┐   │
│  │  Workflow: deploy-pages.yml                                │   │
│  │  Trigger: Push to main                                     │   │
│  │  Actions: Build → Test → Deploy to Pages                   │   │
│  └────────────────────────────────────────────────────────────┘   │
│  ┌────────────────────────────────────────────────────────────┐   │
│  │  Workflow: process-network-update.yml                      │   │
│  │  Trigger: Manual dispatch                                  │   │
│  │  Actions: Validate survey → Reconcile → Run tests → Comment│   │
│  └────────────────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────────────┘
```

## Data Flow Diagrams

### Survey Upload & PR Creation Flow

```
User                Browser               Cloudflare            GitHub
 │                     │                    Worker               API
 │                     │                      │                   │
 │  1. Upload survey   │                      │                   │
 ├────────────────────►│                      │                   │
 │                     │                      │                   │
 │                     │  2. Reconcile        │                   │
 │                     │     (client-side)    │                   │
 │                     │                      │                   │
 │  3. Preview diffs   │                      │                   │
 │◄────────────────────┤                      │                   │
 │                     │                      │                   │
 │  4. Approve         │                      │                   │
 ├────────────────────►│                      │                   │
 │                     │                      │                   │
 │                     │  5. Initiate PKCE    │                   │
 │                     │     OAuth popup      │                   │
 │                     ├──────────────────────┼──────────────────►│
 │                     │                      │   6. Auth code    │
 │                     │◄─────────────────────┼───────────────────┤
 │                     │                      │                   │
 │                     │  7. POST /create-pr  │                   │
 │                     │     {code, verifier, │                   │
 │                     │      network.json}   │                   │
 │                     ├─────────────────────►│                   │
 │                     │                      │                   │
 │                     │                      │  8. Exchange code │
 │                     │                      ├──────────────────►│
 │                     │                      │      for token    │
 │                     │                      │◄──────────────────┤
 │                     │                      │                   │
 │                     │                      │  9. Create branch │
 │                     │                      ├──────────────────►│
 │                     │                      │                   │
 │                     │                      │ 10. Commit file   │
 │                     │                      ├──────────────────►│
 │                     │                      │                   │
 │                     │                      │ 11. Open PR       │
 │                     │                      ├──────────────────►│
 │                     │                      │                   │
 │                     │                      │ 12. PR URL        │
 │                     │                      │◄──────────────────┤
 │                     │  13. Return PR URL   │                   │
 │                     │◄─────────────────────┤                   │
 │                     │                      │                   │
 │  14. Display PR URL │                      │                   │
 │◄────────────────────┤                      │                   │
```

### Deployment Flow (CI/CD)

```
Developer            GitHub              GitHub Actions        GitHub Pages
    │                  │                       │                    │
    │  1. git push     │                       │                    │
    │  main            │                       │                    │
    ├─────────────────►│                       │                    │
    │                  │                       │                    │
    │                  │  2. Trigger workflow  │                    │
    │                  │  deploy-pages.yml     │                    │
    │                  ├──────────────────────►│                    │
    │                  │                       │                    │
    │                  │                       │  3. Checkout code  │
    │                  │                       │                    │
    │                  │                       │  4. npm ci         │
    │                  │                       │                    │
    │                  │                       │  5. npm run build  │
    │                  │                       │     → ./out/       │
    │                  │                       │                    │
    │                  │                       │  6. Upload artifact│
    │                  │                       ├───────────────────►│
    │                  │                       │                    │
    │                  │                       │  7. Deploy         │
    │                  │                       ├───────────────────►│
    │                  │                       │                    │
    │                  │  8. Deployment done   │                    │
    │                  │◄──────────────────────┤                    │
    │                  │                       │                    │
    │  9. Visit site   │                       │                    │
    ├──────────────────┼───────────────────────┼───────────────────►│
    │                  │                       │    10. Serve HTML  │
    │◄─────────────────┼───────────────────────┼────────────────────┤
```

## Technology Stack

### Frontend (Static)
- **Framework**: Next.js 16.1.5 (static export)
- **UI**: React 19.2.4
- **Map**: React-Leaflet 5.0.0 + Leaflet 1.9.4
- **Build**: Next.js Turbopack
- **Hosting**: GitHub Pages (CDN)

### Backend (Serverless)
- **OAuth Handler**: Cloudflare Worker (TypeScript)
- **Runtime**: Cloudflare Workers (V8 isolates)
- **Pseudo Backend**: GitHub Actions workflows

### Development
- **Language**: TypeScript 5.9.3
- **Testing**: Vitest 4.0.18
- **Package Manager**: npm
- **Build Tool**: Next.js built-in

## Security Model

```
┌──────────────────────────────────────────────────────────────┐
│                    Security Boundaries                       │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Public (Client-Side)           Private (Server-Side)        │
│  ┌────────────────────┐         ┌─────────────────────┐      │
│  │ • GitHub Client ID │         │ • Client Secret     │      │
│  │ • Worker URL       │         │   (Worker only)     │      │
│  │ • OAuth state      │         │ • Access Tokens     │      │
│  │ • Code verifier    │         │   (never exposed)   │      │
│  │   (localStorage)   │         │                     │      │
│  └────────────────────┘         └─────────────────────┘      │
│           │                              │                   │
│           │      Code + Verifier         │                   │
│           └─────────────────────────────►│                   │
│                                          │                   │
│                    Token never           │                   │
│                    sent to client        │                   │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### Security Features

✅ **PKCE Flow**: Protection against authorization code interception  
✅ **Server-side secrets**: Client Secret never exposed to browser  
✅ **Token isolation**: Access tokens remain in Worker  
✅ **HTTPS only**: All communication encrypted  
⚠️ **TODO**: Add CORS origin validation  
⚠️ **TODO**: Add rate limiting to Worker  
⚠️ **TODO**: Add request size limits  

## File Organization

```
OneDest-SwitchBoard/
│
├── Frontend (Client)
│   ├── app/                        # Next.js app router
│   │   ├── layout.tsx              # Root layout
│   │   ├── page.tsx                # Main map page
│   │   ├── globals.css             # Global styles
│   │   └── oauth-callback/         # OAuth redirect handler
│   │
│   ├── src/components/             # React components
│   │   ├── Map.tsx                 # Leaflet wrapper
│   │   ├── SegmentedEdge.tsx       # Polyline renderer
│   │   ├── RouterCard.tsx          # Router display
│   │   └── SurveyUploader.tsx      # Survey UI + OAuth
│   │
│   └── public/                     # Static assets
│       ├── network.example.json    # Sample data
│       └── .nojekyll                # Bypass Jekyll
│
├── Backend (Serverless)
│   ├── src/worker/                 # Cloudflare Worker
│   │   └── create_pr_worker.ts     # OAuth + PR creation
│   │
│   └── .github/workflows/          # GitHub Actions
│       ├── deploy-pages.yml        # CI/CD
│       └── process-network-update.yml  # Pseudo backend
│
├── Core Logic (Shared)
│   └── src/lib/
│       ├── router/
│       │   ├── index.ts            # Routing algorithms
│       │   └── index.test.ts       # Unit tests
│       ├── oauth.ts                # PKCE helpers
│       └── github.ts               # GitHub API
│
├── Configuration
│   ├── next.config.js              # Next.js config
│   ├── tsconfig.json               # TypeScript config
│   ├── wrangler.toml               # Worker config
│   ├── package.json                # Dependencies
│   ├── .env.example                # Environment template
│   └── .gitignore                  # Git exclusions
│
└── Documentation
    ├── README.md                   # Main overview
    ├── DEPLOYMENT.md               # Deployment guide
    ├── QUICKSTART.md               # 20-min checklist
    ├── REFACTOR_SUMMARY.md         # Refactor details
    ├── ARCHITECTURE.md             # This file
    └── docs/SECRETS.md             # Secrets guide
```

## Scalability Considerations

### Current Limits
- **GitHub Pages**: 1 GB site size, 100 GB/month bandwidth
- **Cloudflare Workers**: 100,000 requests/day (free tier)
- **GitHub Actions**: 2,000 minutes/month (free tier)

### Scaling Strategies
1. **CDN**: GitHub Pages already uses CDN
2. **Worker caching**: Add response caching for repeated requests
3. **Rate limiting**: Implement per-user limits
4. **Paid tiers**: Upgrade for higher limits if needed

## Monitoring & Debugging

### Production Monitoring
```
┌─────────────────────────────────────────────────┐
│ Monitoring Points                               │
├─────────────────────────────────────────────────┤
│ 1. GitHub Actions logs                          │
│    → Settings → Actions → Workflow runs         │
│                                                 │
│ 2. Cloudflare Worker logs                       │
│    → Cloudflare Dashboard → Workers → Logs      │
│                                                 │
│ 3. Browser console (client errors)              │
│    → F12 → Console                              │
│                                                 │
│ 4. GitHub Pages deployment                      │
│    → Settings → Pages                           │
└─────────────────────────────────────────────────┘
```

### Debug Endpoints
- `GET https://worker-url.workers.dev/health` - Worker health check
- `GET https://worker-url.workers.dev/` - Worker status

---

**Architecture Version**: 2.0 (GitHub Pages Static)  
**Last Updated**: January 31, 2026  
**Status**: Production Ready
