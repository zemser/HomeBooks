const hostedMode =
  process.env.VERCEL === "1"
  || process.env.FINAPP_AUTH_MODE === "supabase"
  || process.env.FINAPP_IMPORT_STORAGE === "supabase";

if (!hostedMode) {
  process.exit(0);
}

const required = [
  "DATABASE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
];

if (process.env.FINAPP_IMPORT_STORAGE === "supabase") {
  required.push("SUPABASE_SECRET_KEY", "SUPABASE_IMPORT_BUCKET");
}

const missing = required.filter((name) => !process.env[name]);

if (missing.length > 0) {
  console.error("Hosted build is missing required environment variables:");
  for (const name of missing) {
    console.error(`- ${name}`);
  }
  console.error("");
  console.error("Set these in Vercel Project Settings -> Environment Variables.");
  process.exit(1);
}

if (process.env.FINAPP_AUTH_MODE !== "supabase") {
  console.warn(
    "Hosted build is not using FINAPP_AUTH_MODE=supabase. The app will use seeded dev workspace resolution.",
  );
}

if (process.env.FINAPP_IMPORT_STORAGE !== "supabase") {
  console.warn(
    "Hosted build is not using FINAPP_IMPORT_STORAGE=supabase. Imports will use local filesystem storage.",
  );
}
