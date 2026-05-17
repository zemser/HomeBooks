import process from "node:process";

import { createClient } from "@supabase/supabase-js";

import { getSupabaseImportStorageConfig } from "./import-storage-env.mjs";

const { bucketName, supabaseSecretKey, supabaseUrl } = getSupabaseImportStorageConfig();
const supabase = createClient(supabaseUrl, supabaseSecretKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

const { data: existingBucket, error: lookupError } = await supabase.storage.getBucket(bucketName);

if (lookupError && lookupError.statusCode !== "404") {
  console.error(`Could not inspect Supabase bucket "${bucketName}": ${lookupError.message}`);
  process.exitCode = 1;
} else if (existingBucket) {
  console.log(`Supabase import bucket "${bucketName}" already exists.`);
} else {
  const { error: createError } = await supabase.storage.createBucket(bucketName, {
    public: false,
  });

  if (createError) {
    console.error(`Could not create Supabase bucket "${bucketName}": ${createError.message}`);
    process.exitCode = 1;
  } else {
    console.log(`Created private Supabase import bucket "${bucketName}".`);
  }
}
