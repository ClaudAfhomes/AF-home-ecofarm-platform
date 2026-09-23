import { createClient } from '@supabase/supabase-js';
import { loadEnv } from './env';
import type { Database } from './database.types';

const env = loadEnv();
export const supabase = createClient<Database>(
  env.VITE_SUPABASE_URL,
  env.VITE_SUPABASE_PUBLISHABLE_KEY,
  {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  },
);
