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
  required(env, 'E2E_USER_EMAIL');
  required(env, 'E2E_USER_PASSWORD');

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
    console.log(`E2E Supabase target verified: ${target.projectRef}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
