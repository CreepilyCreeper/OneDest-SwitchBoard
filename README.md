# OneDest SwitchBoard — GitHub Pages Static Export

This is a static export of the OneDest SwitchBoard application.
Deployed via GitHub Pages with GitHub Actions.

## Features
- Interactive rail network map
- Survey report reconciliation
- Router logic validation
- GitHub PR creation via OAuth (Cloudflare Worker)

## Architecture
- **Frontend**: Next.js static export on GitHub Pages
- **Auth Backend**: Cloudflare Worker for OAuth flow
- **Data Backend**: GitHub Actions workflows (pseudo-backend)
