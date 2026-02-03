/** @type {import('next').NextConfig} */
// Debug: Log environment info
console.log('=== NEXT.JS CONFIG DEBUG ===');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('EXPORT_STATIC:', process.env.EXPORT_STATIC);
console.log('NEXT_PUBLIC_BASE_PATH:', process.env.NEXT_PUBLIC_BASE_PATH);

// Default repo path used for GitHub Pages. Adjust if your repo name changes.
// This should match the GitHub repo name (used as the Pages path).
// Use the GitHub Pages repo path (case-sensitive)
const REPO_BASE = '/OneDest-SwitchBoard';

// In development, always use empty basePath
// In production (static export), use the repo base path
const isDevelopment = !process.env.NODE_ENV || process.env.NODE_ENV === 'development';
const resolvedBase = isDevelopment 
  ? '' 
  : (process.env.NEXT_PUBLIC_BASE_PATH || REPO_BASE);

console.log('isDevelopment:', isDevelopment);
console.log('resolvedBase:', resolvedBase);
console.log('=== END DEBUG ===');

const nextConfig = {
  ...(isDevelopment ? {} : { output: 'export', distDir: 'out' }),
  images: {
    unoptimized: true,
  },
  basePath: resolvedBase,
  assetPrefix: resolvedBase,
  trailingSlash: true,
  // Turbopack configuration - set root to fix workspace detection
  turbopack: {
    root: __dirname,
  },
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
