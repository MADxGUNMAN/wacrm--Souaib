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
    // Vendored minified opus-recorder encoder worker (served statically).
    "public/opus/**",
  ]),
  {
    // `value={x ?? undefined}` on a form control is the standard way to
    // accidentally flip it from uncontrolled to controlled. Base UI (and
    // React) decide which it is on the FIRST render by testing
    // `value !== undefined`, so a value that starts undefined and later
    // becomes a string logs a warning and can drop state. Pass '' or
    // null instead — Base UI renders its placeholder for both.
    // Genuine exceptions exist for custom components where undefined
    // means "unset"; disable inline with a reason.
    files: ["src/**/*.tsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "JSXAttribute[name.name='value'] LogicalExpression[operator='??'] > Identifier[name='undefined']",
          message:
            "value={x ?? undefined} switches a control from uncontrolled to controlled on the first change. Use '' or null for the empty state.",
        },
      ],
    },
  },
  {
    // The Google Sheets add-on (sheets-addon/) is Apps Script, not
    // Next.js: files share one global scope with no imports or exports,
    // and every entry point is called BY NAME from outside the code —
    // by Google (onOpen, onInstall), by HtmlService templates
    // (include), or by google.script.run from the sidebar. To
    // no-unused-vars each of those looks like dead code, so the rule
    // reports the whole public surface of the add-on. sourceType
    // "script" is the accurate description of these files but does not
    // change the verdict, so the rule is off here and on everywhere
    // else. The Apps Script globals are declared so a genuine typo in a
    // service name still fails no-undef.
    // Scoped to src/ only: sheets-addon/test/** is ordinary ESM run by
    // vitest in Node, so it must keep the default module parsing.
    files: ["sheets-addon/src/**/*.js"],
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
    },
    languageOptions: {
      sourceType: "script",
      globals: {
        // Apps Script services the add-on actually uses.
        SpreadsheetApp: "readonly",
        PropertiesService: "readonly",
        HtmlService: "readonly",
        UrlFetchApp: "readonly",
        Utilities: "readonly",
        Session: "readonly",
        ScriptApp: "readonly",
        LockService: "readonly",
        console: "readonly",
      },
    },
  },
]);

export default eslintConfig;
