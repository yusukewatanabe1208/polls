import { FlatCompat } from "@eslint/eslintrc";
import tseslint from "typescript-eslint";

/**
 * ESLint のフラット設定。
 *
 * 以前は package.json に lint スクリプトがあるだけで eslint 本体が入っておらず、
 * 実行しても設定を促されるだけで一度も検査されていなかった。
 * `next lint` は Next.js 16 で無くなるため、ESLint CLI を直接使う。
 */
const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

export default tseslint.config(
  {
    ignores: [
      ".next/**",
      ".pgtest/**",
      "node_modules/**",
      "next-env.d.ts",
      "supabase/**",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      // 未使用の変数は消す。ただし _ で始まる引数は「使わないが受け取る」印として許す
      // （DB側が auth.uid() を見るようになり、形だけ残っている引数がある）
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrors: "none",
        },
      ],
    },
  },
  {
    // 使い捨てスクリプトは緩めにする
    files: ["scripts/**"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
);
