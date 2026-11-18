import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Native binaries: load them from node_modules at runtime instead of bundling.
  serverExternalPackages: ["sharp", "ffmpeg-static"],
  // The ffmpeg binary is only found by path at runtime, so ship it explicitly
  // with the routes that run background steps.
  outputFileTracingIncludes: {
    "/api/work": ["./node_modules/ffmpeg-static/ffmpeg"],
    "/api/generate": ["./node_modules/ffmpeg-static/ffmpeg"],
    "/api/comics/*": ["./node_modules/ffmpeg-static/ffmpeg"],
    "/api/comics/[id]/redraw": ["./node_modules/ffmpeg-static/ffmpeg"],
    "/api/comics/[id]/pages/[pageId]": ["./node_modules/ffmpeg-static/ffmpeg"],
    "/api/comics/[id]/extend": ["./node_modules/ffmpeg-static/ffmpeg"],
    // Share cards letter titles in the masthead face.
    "/api/og/[id]": ["./assets/**"],
    "/opengraph-image": ["./assets/**", "./public/og-art.jpg"],
    "/twitter-image": ["./assets/**", "./public/og-art.jpg"],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
