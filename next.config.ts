import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ffmpeg-static ships a native binary; keep it out of the bundler and make
  // sure the file travels with the upload route's serverless function (#31).
  serverExternalPackages: ["ffmpeg-static"],
  outputFileTracingIncludes: {
    "/api/tracks": ["./node_modules/ffmpeg-static/ffmpeg"],
  },
};

export default nextConfig;
