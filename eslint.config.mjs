import { FlatCompat } from "@eslint/eslintrc";
import { createRequire } from "node:module";
import { dirname } from "node:path";

const require = createRequire(import.meta.url);
const nextConfigDirectory = dirname(require.resolve("eslint-config-next/package.json"));
const compat = new FlatCompat({
  baseDirectory: nextConfigDirectory,
  resolvePluginsRelativeTo: nextConfigDirectory,
});

export default [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
];
