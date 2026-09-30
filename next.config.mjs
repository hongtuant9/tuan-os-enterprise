/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
  deploymentId: process.env.NEXT_DEPLOYMENT_ID || undefined,
  serverExternalPackages: ["puppeteer-core"],
};

export default nextConfig;
