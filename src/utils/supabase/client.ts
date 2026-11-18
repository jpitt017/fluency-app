import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  // Hardcoded directly to bypass Vercel environment variable caching/sync issues
  const supabaseUrl = 'https:// https://iqekdshyoqgyqzckmgas.supabase.co ';
  const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9... sb_publishable_UUudh29PqHWiQDsgdulKCw_97wE7F8B ';

  return createBrowserClient(supabaseUrl, supabaseKey);
}
