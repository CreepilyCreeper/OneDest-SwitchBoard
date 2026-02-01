/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  distDir: 'out',
  images: {
    unoptimized: true,
  },
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || '',
  assetPrefix: process.env.NEXT_PUBLIC_BASE_PATH || '',
  trailingSlash: true,
  // Disable server-side features for static export
  reactStrictMode: true,
  // Environment variables will be baked in at build time
  env: {
    NEXT_PUBLIC_GITHUB_CLIENT_ID: process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID,
    NEXT_PUBLIC_CF_WORKER_URL: process.env.NEXT_PUBLIC_CF_WORKER_URL,
    NEXT_PUBLIC_OAUTH_REDIRECT: process.env.NEXT_PUBLIC_OAUTH_REDIRECT,
    NEXT_PUBLIC_BASE_PATH: process.env.NEXT_PUBLIC_BASE_PATH || '',
  },
};

module.exports = nextConfig;
