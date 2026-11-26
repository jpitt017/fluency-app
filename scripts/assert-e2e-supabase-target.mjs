import { pathToFileURL } from 'node:url';

// This guard intentionally pins Playwright to the dedicated CI project. If that
// project is ever recreated, update this allowlist deliberately before running
// any migrations or browser tests.
export const E2E_PROJECT_REF = 'frkciyjvjlnqpaifkwtz';
export const E2E_PROJECT_URL = `https://${E2E_PROJECT_REF}.supabase.co`;
export const LIVE_PROJECT_REF = 'ebzmkhrssgnzmixfsuso';

function required(env, name) {
  const value = env[name];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Missing required E2E configuration: ${name}`);
  }
  return value;
}

function jwtProjectRef(value) {
  const parts = value.split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return typeof payload.ref === 'string' ? payload.ref : null;
  } catch {
    return null;
  }
}

export function assertE2ESupabaseTarget(env = process.env) {
  const projectRef = required(env, 'E2E_SUPABASE_PROJECT_REF');
  const projectUrl = required(env, 'E2E_SUPABASE_URL');
  const anonKey = required(env, 'E2E_SUPABASE_ANON_KEY');
  const serviceRoleKey = required(env, 'E2E_SUPABASE_SERVICE_ROLE_KEY');
  const databaseUrl = required(env, 'E2E_SUPABASE_DB_URL');
  const runId = required(env, 'E2E_RUN_ID');
  const runAttempt = required(env, 'E2E_RUN_ATTEMPT');
  const userEmail = required(env, 'E2E_USER_EMAIL');
  required(env, 'E2E_USER_PASSWORD');
  if (env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_LIVE_URL || env.SUPABASE_LIVE_ANON_KEY) {
    throw new Error('Refusing E2E configuration with legacy production Supabase credentials');
  }

  if (userEmail !== `e2e-${runId}-${runAttempt}@example.invalid`) {
    throw new Error('E2E_USER_EMAIL must be unique to this GitHub run and attempt');
  }

  if (projectRef !== E2E_PROJECT_REF) {
    throw new Error(`Refusing E2E database access: expected dedicated project ${E2E_PROJECT_REF}`);
  }

  let parsedProjectUrl;
  try {
    parsedProjectUrl = new URL(projectUrl);
  } catch {
    throw new Error('E2E_SUPABASE_URL must be a valid URL');
  }
  if (parsedProjectUrl.origin !== E2E_PROJECT_URL || parsedProjectUrl.pathname !== '/') {
    throw new Error(`Refusing E2E API access: URL must target the dedicated project ${E2E_PROJECT_REF}`);
  }
  if (projectUrl.includes(LIVE_PROJECT_REF)) {
    throw new Error('Refusing E2E API access: the live project is not an E2E target');
  }
  if (env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_URL !== E2E_PROJECT_URL) {
    throw new Error('Refusing E2E app configuration: NEXT_PUBLIC_SUPABASE_URL must target the dedicated E2E project');
  }
  if (env.NEXT_PUBLIC_SUPABASE_ANON_KEY && env.NEXT_PUBLIC_SUPABASE_ANON_KEY !== anonKey) {
    throw new Error('Refusing E2E app configuration: public anon key must match E2E_SUPABASE_ANON_KEY');
  }

  let parsedDatabaseUrl;
  try {
    parsedDatabaseUrl = new URL(databaseUrl);
  } catch {
    throw new Error('E2E_SUPABASE_DB_URL must be a valid Postgres URL');
  }
  const databaseTarget = `${decodeURIComponent(parsedDatabaseUrl.username)} ${parsedDatabaseUrl.hostname}`;
  if (!databaseTarget.includes(E2E_PROJECT_REF) || databaseUrl.includes(LIVE_PROJECT_REF)) {
    throw new Error(`Refusing E2E migration access: database URL must target project ${E2E_PROJECT_REF}`);
  }

  for (const [name, key] of [
    ['E2E_SUPABASE_ANON_KEY', anonKey],
    ['E2E_SUPABASE_SERVICE_ROLE_KEY', serviceRoleKey],
  ]) {
    const keyRef = jwtProjectRef(key);
    if (keyRef && keyRef !== E2E_PROJECT_REF) {
      throw new Error(`Refusing E2E access: ${name} belongs to a different Supabase project`);
    }
  }

  return { projectRef: E2E_PROJECT_REF, projectUrl: E2E_PROJECT_URL };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const target = assertE2ESupabaseTarget();
    console.log(`E2E Supabase target verified: ${target.projectRef}; run ${process.env.E2E_RUN_ID}, attempt ${process.env.E2E_RUN_ATTEMPT}`);
  } catch (error) {
    // Put the non-secret reason on the check run itself so CI configuration
    // failures are diagnosable even if Actions log downloads are unavailable.
    console.error(`::error title=E2E Supabase target guard::${error.message}`);
    process.exitCode = 1;
  }
}
