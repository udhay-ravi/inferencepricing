import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base is set from the repo name so GitHub Pages serves assets correctly.
// Change REPO_NAME if you fork this under a different name.
const REPO_NAME = "inference-pricing-board";

export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === "build" ? `/${REPO_NAME}/` : "/",
}));
