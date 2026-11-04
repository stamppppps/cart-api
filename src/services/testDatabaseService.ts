
import { isTestEnvironment } from "../config/env.js";
import { supabase } from "../config/supabase.js";

const TEST_SUPABASE_HOST =
  "sangodjdoneskvnndfpb.supabase.co";

export async function resetTestDatabase() {
  // 1. ต้องทำงานใน Test Environment เท่านั้น
  if (!isTestEnvironment) {
    throw new Error(
      "Safety Guard: Database reset is only allowed in Test"
    );
  }

  // 2. ตรวจสอบ Supabase Project
  const supabaseUrl = process.env.SUPABASE_URL;

  if (!supabaseUrl) {
    throw new Error("Missing SUPABASE_URL");
  }

  const hostname = new URL(supabaseUrl).hostname;

  if (hostname !== TEST_SUPABASE_HOST) {
    throw new Error(
      "Safety Guard: Cannot reset a non-Test database"
    );
  }

  // 3. เรียก Supabase Function
  const { data, error } = await supabase.rpc(
    "reset_test_data"
  );

  if (error) {
    throw new Error(
      `Test database reset failed: ${error.message}`
    );
  }

  console.log("TEST DATABASE RESET:", data);

  return data;
}
