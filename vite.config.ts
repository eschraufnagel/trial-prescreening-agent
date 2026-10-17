import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * Builds the page in `src/web/` into `dist/web/`, which the local server
 * serves as static files (spec §8.2). There is no dev server: `npm run app`
 * rebuilds on every start, and one process on one port is simpler to run.
 */
export default defineConfig({
  root: "src/web",
  plugins: [react()],
  build: {
    outDir: "../../dist/web",
    emptyOutDir: true,
  },
  logLevel: "warn",
});
