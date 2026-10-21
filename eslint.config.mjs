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
    files: ["experimental/**/*.mjs", "apps/**/*.mjs", "tests/**/*.mjs"],
    languageOptions: {
      sourceType: "module",
      globals: { document: "readonly", process: "readonly" },
    },
    rules: js.configs.recommended.rules,
  },
  {
    files: ["eslint.config.mjs"],
    languageOptions: {
      sourceType: "module",
    },
  },
]
