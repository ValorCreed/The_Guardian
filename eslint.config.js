// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    rules: {
      // react-hooks/refs: flags the canonical RN Animated idiom
      // `useRef(new Animated.Value(x)).current` read during render. This
      // codebase predates the React Compiler lint layer and relies on that
      // pattern across ~30 files. Re-enable when the app is migrated to
      // React Compiler semantics. See backend/NEXT_STEPS.md.
      "react-hooks/refs": "off",
      // react-hooks/set-state-in-effect: flags standard data-loading and
      // form-hydration effects (fetch-then-setState, resets on prop change).
      // Valid in RN without the Compiler; rewritten to reducer patterns later.
      "react-hooks/set-state-in-effect": "off",
    },
  },
  {
    ignores: ["dist/*"],
  }
]);
