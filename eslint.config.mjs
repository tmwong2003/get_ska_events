import js from "@eslint/js"

export default [
  {
    ignores: ["node_modules/**"],
  },
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "script",
    },
    rules: {
      ...js.configs.recommended.rules,
      // Apps Script files share globals, so declarations in other files are invisible here.
      "no-undef": "off",
      "no-unused-vars": ["error", { args: "none", vars: "local" }],
    },
  },
  {
    files: ["eslint.config.mjs"],
    languageOptions: {
      sourceType: "module",
    },
  },
]
