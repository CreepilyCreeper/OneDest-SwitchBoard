#!/bin/bash
# Quick setup script for OneDest SwitchBoard deployment

set -e

echo "🚀 OneDest SwitchBoard - GitHub Pages Setup"
echo "==========================================="
echo ""

# Check if .env.local exists
if [ ! -f .env.local ]; then
  echo "📝 Creating .env.local from template..."
  cp .env.example .env.local
  echo "⚠️  Please edit .env.local with your actual values!"
  echo ""
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install
echo "✅ Dependencies installed"
echo ""

# Run tests
echo "🧪 Running tests..."
npm test
echo "✅ Tests passed"
echo ""

# Build the project
echo "🔨 Building Next.js static export..."
npm run build
echo "✅ Build complete - output in ./out"
echo ""

echo "🎉 Setup complete!"
echo ""
echo "Next steps:"
echo "1. Edit .env.local with your GitHub OAuth credentials"
echo "2. Deploy Cloudflare Worker: cd to project root && wrangler deploy"
echo "3. Configure GitHub repository secrets (see DEPLOYMENT.md)"
echo "4. Enable GitHub Pages in repository settings"
echo "5. Push to main branch to trigger deployment"
echo ""
echo "For detailed instructions, see DEPLOYMENT.md"
