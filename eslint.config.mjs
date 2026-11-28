import firebaseRulesPlugin from "@firebase/eslint-plugin-security-rules";

export default [
  {
    ignores: ["dist/**/*", "node_modules/**/*", "android/**/*"],
  },
  {
    files: ["**/*.rules"],
    ...firebaseRulesPlugin.configs["flat/recommended"],
  },
];
