/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Needed in Next.js 14.2 for instrumentation.ts (the summary scheduler).
    instrumentationHook: true,
  },
};

module.exports = nextConfig;
