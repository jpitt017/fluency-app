// utils/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.https://iqekdshyoqgyqzckmgas.supabase.co !,
    process.env.sb_publishable_UUudh29PqHWiQDsgdulKCw_97wE7F8B!
  )
}