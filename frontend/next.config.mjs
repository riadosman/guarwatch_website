/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    // Server-side: use internal Docker network URL; browser-side falls back to localhost
    const backendUrl = process.env.BACKEND_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
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
    ];
  },
};

export default nextConfig;
