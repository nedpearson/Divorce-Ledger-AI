/** @type {import('next').NextConfig} */
const nextConfig = {
  // Ensure Turbopack treats this frontend folder as the root
  turbopack: {
    root: __dirname,
  },

  // Allow dev access from your local network origin to /_next resources
  allowedDevOrigins: [
    'localhost',
    '127.0.0.1',
    '192.168.20.11',
    'local-origin.dev',
    '*.local-origin.dev',
  ],
};

export default nextConfig;
