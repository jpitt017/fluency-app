import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  // Fallbacks allow local testing and prevent hard crashes if Vercel env vars aren't baked yet
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://YOUR_PROJECT_REF.supabase.co';
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJ...YOUR_SUPABASE_ANON_KEY';

  if (!supabaseUrl || supabaseUrl.includes('YOUR_PROJECT_REF') || !supabaseKey || supabaseKey.includes('YOUR_SUPABASE_ANON_KEY')) {
    console.error(
      'CRITICAL: Supabase environment variables are missing! Check your Vercel project settings or ensure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are defined.'
    );
  }

  return createBrowserClient(supabaseUrl, supabaseKey);
}