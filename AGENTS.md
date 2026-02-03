# AGENTS.md - OneDest SwitchBoard

Guidelines for AI agents working on the OneDest SwitchBoard codebase.

## Build/Lint/Test Commands

```bash
# Install dependencies
npm install

# Development server
npm run dev

# Build static export (production)
npm run build

# Run linter (Next.js built-in)
npm run lint

# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run a single test file
npx vitest run src/lib/router/index.test.ts

# Run a single test by name pattern
npx vitest run -t "finds shortest path"
```

## Tech Stack

- **Framework**: Next.js 16 with App Router (static export)
- **Language**: TypeScript 5.9 (strict mode enabled)
- **UI**: React 19, React-Leaflet for maps
- **Testing**: Vitest (no config file, uses defaults)
- **Styling**: CSS (globals.css), no Tailwind
- **Auth**: PKCE OAuth via Cloudflare Worker
- **Deploy**: GitHub Pages (out/ directory)

## Code Style Guidelines

### TypeScript Conventions

- Use strict TypeScript (enabled in tsconfig)
- Prefer `type` over `interface` for object shapes (see existing codebase)
- Use explicit return types on exported functions
- Use `any` sparingly; prefer `unknown` with type guards
- File-level JSDoc comments describing exports (see src/lib/router/index.ts pattern)

### Naming Conventions

- **Files**: camelCase for utilities (oauth.ts), PascalCase for components (Map.tsx)
- **Types**: PascalCase with descriptive names (EdgeDef, SurveyReport)
- **Functions**: camelCase, descriptive verbs (validateRouterLayout, reconcileSurvey)
- **Constants**: camelCase (no ALL_CAPS convention observed)
- **Test files**: Co-located as `.test.ts` next to source file

### Imports

```typescript
// Group imports: React/Next first, then third-party, then local
import React, { useEffect } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import SegmentedEdge from "./SegmentedEdge";
import type { EdgeDef } from "../lib/router";
```

- Use double quotes for strings and imports
- Use explicit `type` imports for type-only imports
- Path aliases: Use `@/*` mapped to `./src/*` (configured in tsconfig)

### Code Organization

- Keep core logic in `src/lib/` (router, oauth, github)
- React components in `src/components/`
- Next.js pages in `app/` directory (App Router)
- Cloudflare Worker in `src/worker/`
- Tests co-located with source files (index.test.ts next to index.ts)

### Error Handling

- Use explicit error types where possible
- Return union types for error cases (e.g., `{ status: 'CONFLICT_DETECTED' | 'UNORDERED_SAFE' }`)
- Avoid throwing for expected failure modes
- Use `as any` type assertions only in test files when necessary

### Comments

- File headers describing the module's purpose and exports
- Inline comments for complex logic (e.g., geometric calculations)
- JSDoc for public API functions

### Testing (Vitest)

```typescript
import { describe, it, expect } from 'vitest';

describe('featureName', () => {
  it('does something specific', () => {
    expect(result).toBe(expected);
  });
});
```

- Use `describe` blocks to group related tests
- Test descriptions should read like sentences ("it finds shortest path...")
- Type-annotate test data for clarity
- Test both success and failure cases

### React Components

- Use "use client" directive for client components
- Use function declarations: `export default function ComponentName()`
- Props interface at top of file
- Destructure props in function parameters

### Environment Variables

- Client-side: Prefix with `NEXT_PUBLIC_`
- Set in `.env.local` for local development
- Never commit secrets (see .env.example for template)

### Git Conventions

- Main branch: `main`
- No CI tests currently (deploy workflow exists in .github/workflows/deploy.yml)
- Static export to `out/` directory (configured in next.config.js)

## Quick Reference

```bash
# Most common commands
npm run dev          # Start dev server
npm test             # Run all tests
npx vitest run -t "test name"  # Run specific test
npm run build        # Production build
```
