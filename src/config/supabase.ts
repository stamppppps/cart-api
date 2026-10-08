import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY!;

console.log("Supabase URL:", supabaseUrl);
console.log("Supabase Key exists:", !!supabaseServiceRoleKey);

export const supabase = createClient(
  supabaseUrl,
  supabaseServiceRoleKey
);