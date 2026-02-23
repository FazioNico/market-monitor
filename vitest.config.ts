import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.spec.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      reportsDirectory: "coverage",
      include: ["src/**/*.ts"],
      thresholds: {
        lines: 75,
        statements: 75,
        functions: 75,
        branches: 55,
      },
    },
  },
});
