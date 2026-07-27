/** @type {import("@commitlint/types").UserConfig} */
export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    // Scopes are free-form: a module name (search, storage, ingest) or a party id.
    "scope-enum": [0],
    "body-max-line-length": [1, "always", 100],
  },
};
