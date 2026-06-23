/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    // Server-side: use internal Docker network URL; browser falls back to localhost
    const backendUrl =
      process.env.BACKEND_INTERNAL_URL ??
      process.env.NEXT_PUBLIC_API_URL ??
      "http://localhost:8000";
    return [
      {
        source: "/auth/:path*",
        destination: `${backendUrl}/auth/:path*`,
      },
      {
        source: "/api/:path*",
        destination: `${backendUrl}/api/:path*`,
      },
      {
        source: "/relay/:path*",
        destination: `${backendUrl}/relay/:path*`,
      },
      // Panel WebSocket → backend (ws.ts connects to /ws/panel via this proxy)
      {
        source: "/ws/:path*",
        destination: `${backendUrl}/ws/:path*`,
      },
    ];
  },
};

export default nextConfig;
