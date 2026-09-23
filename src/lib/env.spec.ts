import { describe, expect, it } from 'vitest';
import { loadEnv } from './env';

describe('environment validation', () => {
  it('accepts public Supabase configuration', () => expect(loadEnv({ VITE_SUPABASE_URL: 'https://example.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'public-key' }).VITE_APP_NAME).toBe('AFhomes-ecofarm'));
  it('rejects a missing publishable key', () => expect(() => loadEnv({ VITE_SUPABASE_URL: 'https://example.supabase.co' })).toThrow());
});
