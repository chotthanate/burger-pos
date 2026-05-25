import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: "/burger-pos/",
  plugins: [react()],
});
