import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Relative asset URLs, so the same build runs at the root or under a path
  // prefix (https://venue/nofilter/). They resolve against <base href>:
  // index.html's own "/" at the root, the server-injected one under a prefix.
  base: "./",
  server: {
    host: true,
    port: 5173,
  },
});
