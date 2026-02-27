import type { NextConfig } from 'next';
import path from 'path';

const rawApiUrl = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:4000';
// Ensure the URL always has a protocol prefix
const apiUrl =
  rawApiUrl.startsWith('http://') || rawApiUrl.startsWith('https://')
    ? rawApiUrl
    : `https://${rawApiUrl}`;

const nextConfig: NextConfig = {
  output: 'standalone',
  transpilePackages: ['@excelflow/shared'],
  outputFileTracingRoot: path.join(__dirname, '../../'),
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${apiUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
