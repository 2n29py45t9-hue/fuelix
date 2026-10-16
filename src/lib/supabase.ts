import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string;
const key = import.meta.env.VITE_SUPABASE_KEY as string;

if (!url || !key) {
  throw new Error("Fehlende VITE_SUPABASE_URL oder VITE_SUPABASE_KEY. Siehe .env.example.");
}

export const supabase = createClient(url, key);
