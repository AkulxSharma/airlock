import path from "node:path";
import type { NextConfig } from "next";

// The ElevenLabs key lives in the repo-root .env (git-ignored). Load it for the server routes
// only. NEXT_PUBLIC_* variables are the only ones the browser can see, and the key is not one.
try {
  process.loadEnvFile(path.join(process.cwd(), "..", ".env"));
} catch {
  // no .env: the voice routes will answer with a clear "key not set" error
}

const nextConfig: NextConfig = {
  // The voice helpers live in ../voice, so Turbopack must be allowed to read the repo root.
  turbopack: {
    root: path.join(process.cwd(), ".."),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
