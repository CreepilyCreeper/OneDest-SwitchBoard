/** @type {import('next').NextConfig} */
// Default repo path used for GitHub Pages. Adjust if your repo name changes.
const REPO_BASE = '/OneDest-SwitchBoard';

// Use explicit basePath/assetPrefix when building for production on GH Pages.
const resolvedBase =
  process.env.NEXT_PUBLIC_BASE_PATH || (process.env.NODE_ENV === 'production' ? REPO_BASE : '');

const nextConfig = {
  output: 'export',
  distDir: 'out',
  images: {
    unoptimized: true,
  },
  basePath: resolvedBase,
  assetPrefix: resolvedBase,
  trailingSlash: true,
  // Disable server-side features for static export
  reactStrictMode: true,
  // Environment variables will be baked in at build time
  env: {
    NEXT_PUBLIC_GITHUB_CLIENT_ID: process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID,
    NEXT_PUBLIC_CF_WORKER_URL: process.env.NEXT_PUBLIC_CF_WORKER_URL,
    NEXT_PUBLIC_OAUTH_REDIRECT: process.env.NEXT_PUBLIC_OAUTH_REDIRECT,
    NEXT_PUBLIC_BASE_PATH: resolvedBase,
  },
};

module.exports = nextConfig;
