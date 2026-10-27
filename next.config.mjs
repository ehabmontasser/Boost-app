/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["pg"],
  // the template download reads these files at run time, so ship them with that function
  outputFileTracingIncludes: { "/api/templates": ["./templates/**/*"] },
  typescript: { ignoreBuildErrors: false },
  eslint: { ignoreDuringBuilds: true },
};
export default nextConfig;
