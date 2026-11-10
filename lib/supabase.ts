import { createClient } from '@supabase/supabase-js';

function requiredPublicEnv(name: 'NEXT_PUBLIC_SUPABASE_URL' | 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY') {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const supabase = createClient(
  requiredPublicEnv('NEXT_PUBLIC_SUPABASE_URL'),
  requiredPublicEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY')
);
