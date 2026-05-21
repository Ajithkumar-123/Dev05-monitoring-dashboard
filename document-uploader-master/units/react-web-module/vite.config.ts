import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

// `vite build`              → library mode (published @docuploader/react-web-module)
// `vite dev` / `--mode demo` → SystemStatus demo page rooted at index.html
export default defineConfig(({ command, mode }) => {
  const isDemo = command === "serve" || mode === "demo";
  return {
    plugins: [react()],
    build: isDemo
      ? { outDir: "dist-demo", sourcemap: true }
      : {
          lib: {
            entry: resolve(__dirname, "src/index.ts"),
            name: "DocuploaderModule",
            formats: ["es"],
            fileName: () => "index.js",
          },
          sourcemap: true,
          rollupOptions: {
            external: ["react", "react-dom"],
            output: { globals: { react: "React", "react-dom": "ReactDOM" } },
          },
        },
  };
});
