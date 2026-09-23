import { z } from 'zod';

const schema = z.object({
  VITE_SUPABASE_URL: z.string().url(),
  VITE_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  VITE_APP_NAME: z.string().default('AFhomes-ecofarm'),
});

export type PublicEnv = z.infer<typeof schema>;

export function loadEnv(source: Record<string, unknown> = import.meta.env): PublicEnv {
  return schema.parse(source);
}

