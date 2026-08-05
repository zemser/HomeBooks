import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const config = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "next-env.d.ts",
      "src/db/migrations/**",
      "supabase/.branches/**",
      "supabase/.temp/**",
    ],
  },
  ...nextVitals,
  ...nextTypescript,
  {
    // Existing client effects intentionally synchronize server-provided props
    // and async request state; migrating those components is outside PLATFORM-003.
    rules: {
      "react-hooks/set-state-in-effect": "off",
    },
  },
];

export default config;
