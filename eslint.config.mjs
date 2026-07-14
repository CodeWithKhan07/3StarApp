import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    ".test-build/**",
    // A legacy tracked backup under .vscode is not part of the application
    // module graph and must not be linted as a second source tree.
    ".vscode/src/**",
    "next-env.d.ts",
  ]),
  // Node utility scripts intentionally use CommonJS because package.json
  // does not opt the repository into ESM globally.
  {
    files: ["scripts/**/*.cjs", "electron/**/*.cjs", "tests/**/*.cjs"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
]);

export default eslintConfig;
