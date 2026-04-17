import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,
  // React-PDF uses yoga-wasm + font loader that hang when Next tries to bundle them.
  // Treat as external so it resolves from node_modules at runtime.
  serverExternalPackages: ['@react-pdf/renderer'],
  // typedRoutes intentionally disabled until all routes are scaffolded by other tracks.
  async headers() {
    return [
      // Global default: deny iframe embedding (clickjacking protection).
      {
        source: '/((?!api/v1/export/preview/).*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
      // Same-origin iframe preview for PDF export previews.
      {
        source: '/api/v1/export/preview/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
