#!/usr/bin/env node
/**
 * Fails when the Supabase project the app points at is missing a table used by
 * the app. Uses the service-role-only verify_app_schema() RPC from migration
 * 0024. Set SUPABASE_LIVE_URL to check a specific project in CI; otherwise the
 * app's NEXT_PUBLIC_SUPABASE_URL is used.
 */

import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_LIVE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  throw new Error(
    'Live schema check requires SUPABASE_LIVE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY.',
  );
}

const supabase = createClient(url, serviceKey);
const { data, error } = await supabase.rpc('verify_app_schema');

if (error) throw new Error(`verify_app_schema failed: ${error.message}`);
if (!data?.covered) {
  throw new Error(`Live schema is missing tables used by the app: ${JSON.stringify(data?.missing_tables ?? [])}`);
}

console.log('PASS: live project contains every table used by the app.');
