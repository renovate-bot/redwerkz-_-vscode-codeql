module.exports = {
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: 2018,
    sourceType: "module",
    project: ["tsconfig.json", "./src/**/tsconfig.json", "./test/**/tsconfig.json", "./gulpfile.ts/tsconfig.json", "./scripts/tsconfig.json", "./.storybook/tsconfig.json"],
  },
  plugins: [
    "github",
    "@typescript-eslint"
  ],
  env: {
    node: true,
    es6: true,
  },
  extends: [
    "eslint:recommended",
    "plugin:github/react",
    "plugin:github/recommended",
    "plugin:github/typescript",
    "plugin:jest-dom/recommended",
    "plugin:prettier/recommended",
    "plugin:@typescript-eslint/recommended"
  ],
  rules: {
    "@typescript-eslint/no-use-before-define": 0,
    "@typescript-eslint/no-unused-vars": [
      "warn",
      {
        vars: "all",
        args: "none",
        ignoreRestSiblings: false,
      },
    ],
    "@typescript-eslint/explicit-function-return-type": "off",
    "@typescript-eslint/explicit-module-boundary-types": "off",
    "@typescript-eslint/no-non-null-assertion": "off",
    "@typescript-eslint/no-explicit-any": "off",
    "@typescript-eslint/no-floating-promises": [ "error", { ignoreVoid: true } ],
    "@typescript-eslint/no-invalid-this": "off",
    "@typescript-eslint/no-shadow": "off",
    "prefer-const": ["warn", { destructuring: "all" }],
    "@typescript-eslint/no-throw-literal": "error",
    "no-useless-escape": 0,
    "camelcase": "off",
    "eqeqeq": "off",
    "escompat/no-regexp-lookbehind": "off",
    "filenames/match-regex": "off",
    "filenames/match-regexp": "off",
    "func-style": "off",
    "i18n-text/no-en": "off",
    "import/named": "off",
    "import/no-dynamic-require": "off",
    "import/no-dynamic-required": "off",
    "import/no-anonymous-default-export": "off",
    "import/no-commonjs": "off",
    "import/no-mutable-exports": "off",
    "import/no-namespace": "off",
    "import/no-unresolved": "off",
    "import/no-webpack-loader-syntax": "off",
    "jsx-a11y/anchor-is-valid": "off",
    "jsx-a11y/no-noninteractive-element-interactions": "off",
    "jsx-a11y/no-static-element-interactions": "off",
    "jsx-a11y/click-events-have-key-events": "off",
    "no-invalid-this": "off",
    "no-fallthrough": "off",
    "no-console": "off",
    "no-shadow": "off",
    "github/array-foreach": "off",
    "github/no-then": "off",
  },
};
