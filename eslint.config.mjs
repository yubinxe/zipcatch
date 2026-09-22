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
    "next-env.d.ts",
    "sample/**",
    "artifacts/**",
    // 앱이 아니라 문서를 만드는 Node 스크립트다. 브라우저 규칙(모듈 방식,
    // 훅 사용)을 들이대면 고칠 것 없는 오류만 쌓인다.
    "docs/**",
    "scripts/**",
  ]),
]);

export default eslintConfig;
