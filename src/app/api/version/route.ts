import { NextResponse } from 'next/server';

/**
 * What is this deployment actually running?
 *
 * "Is the live site serving the latest `main`?" was being answered by eye — by
 * reading strings off a page and guessing whether they were the new ones. That
 * is how a current deploy got reported as stale. This answers it exactly:
 * compare `commit` with `git rev-parse origin/main`.
 *
 * The commit comes from `VERCEL_GIT_COMMIT_SHA`, which Vercel sets on every
 * build, so it reflects the code that was compiled rather than what a later
 * request happens to see. Nothing secret is exposed: the repository is public
 * and the commit is already in its history.
 *
 * `cache-control: no-store` is deliberate. A cached answer to this question is
 * worse than no answer.
 */

export const dynamic = 'force-dynamic';

export function GET() {
  const commit = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GIT_COMMIT_SHA ?? null;
  const branch = process.env.VERCEL_GIT_COMMIT_REF ?? null;
  const environment = process.env.VERCEL_ENV ?? (process.env.NODE_ENV === 'production' ? 'production' : 'development');

  return NextResponse.json(
    {
      commit,
      shortCommit: commit ? commit.slice(0, 7) : null,
      branch,
      environment,
      // The one field that answers the original question at a glance.
      check: commit
        ? `Deployed commit: ${commit.slice(0, 7)}. Compare with: git rev-parse --short origin/main`
        : 'No commit recorded in this environment; the deploy metadata is unavailable.',
    },
    {
      headers: {
        'cache-control': 'no-store, max-age=0, must-revalidate',
        'x-robots-tag': 'noindex',
      },
    },
  );
}
