import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SUPABASE_URL = 'https://iqekdshyoqgyqzckmgas.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_UUudh29PqHWiQDsgdulKCw_97wE7F8B'; // Paste your Publishable key here

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
