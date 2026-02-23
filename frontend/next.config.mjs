/** @type {import('next').NextConfig} */
const nextConfig = {
  // Treat this project directory as the Turbopack root
  turbopack: {
    root: '.',
  },

  // Allow builds even if TypeScript finds type errors in app code
  typescript: {
    ignoreBuildErrors: true,
  },

  // Allow dev access from your local/network origins to /_next resources
  allowedDevOrigins: [
    'localhost',
    '127.0.0.1',
    '192.168.20.11',
    'local-origin.dev',
    '*.local-origin.dev',
  ],
};

export default nextConfig;
