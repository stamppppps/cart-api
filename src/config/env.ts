
import dotenv from "dotenv";

const isTest = process.env.NODE_ENV === "test";

const envFile = isTest ? ".env.test" : ".env";

const result = dotenv.config({
  path: envFile
});

if (result.error) {
  throw new Error(`Cannot load ${envFile}`);
}

const supabaseUrl = process.env.SUPABASE_URL;

if (!supabaseUrl) {
  throw new Error("Missing SUPABASE_URL");
}

const TEST_SUPABASE_HOST = "sangodjdoneskvnndfpb.supabase.co";

let parsedUrl: URL;

try {
  parsedUrl = new URL(supabaseUrl);
} catch {
  throw new Error("Invalid SUPABASE_URL");
}

if (
  parsedUrl.protocol !== "https:" ||
  parsedUrl.hostname !== TEST_SUPABASE_HOST
) {
  if (isTest) {
    throw new Error(
      "Safety Guard: Test environment must use cart-api-test"
    );
  }
}

export const isTestEnvironment = isTest;
