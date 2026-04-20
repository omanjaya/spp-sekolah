import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,
  // React-PDF uses yoga-wasm + font loader that hang when Next tries to bundle them.
  // Treat as external so it resolves from node_modules at runtime.
  serverExternalPackages: ['@react-pdf/renderer'],
  // Tree-shake icon/radix barrel imports. These packages export hundreds of
  // symbols; without this, importing a single icon pulls the whole barrel.
  experimental: {
    optimizePackageImports: [
      'lucide-react',
      '@radix-ui/react-avatar',
      '@radix-ui/react-checkbox',
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-popover',
      '@radix-ui/react-select',
      '@radix-ui/react-tabs',
      '@radix-ui/react-tooltip',
      'date-fns',
      'recharts',
    ],
  },
  // typedRoutes intentionally disabled until all routes are scaffolded by other tracks.
  async headers() {
    const isProd = process.env.NODE_ENV === 'production'
    // Dev butuh 'unsafe-eval' untuk HMR. Prod: hanya 'unsafe-inline' (masih
    // lemah; idealnya nonce-based CSP, tapi butuh refactor besar).
    const scriptSrc = isProd
      ? "script-src 'self' 'unsafe-inline'"
      : "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    return [
      // Global default: deny iframe embedding (clickjacking protection).
      {
        source: '/((?!api/v1/export/preview/).*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              scriptSrc,
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob:",
              "font-src 'self' data:",
              "connect-src 'self'",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "object-src 'none'",
            ].join('; '),
          },
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
