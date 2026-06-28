// ============================================================================
// CAP NEON SPEND — bound the prod DB bill so a runaway cron / traffic spike /
// loop can never produce a "crazy bill". Two layers:
//
//   Layer 1 (rate ceiling): autoscale min/max CU on the compute endpoint.
//            This caps the per-hour rate. With max 0.5 CU the worst case is
//            ~$39/mo even running 24/7 at full peak ($0.106/CU-h on Launch).
//
//   Layer 2 (hard kill-switch): a monthly compute_time_seconds quota on the
//            project. When hit, Neon SUSPENDS all computes until the next
//            billing period. Set generously so it never false-trips during a
//            match — it's a catastrophe backstop, not a tight leash.
//
// Dry-run by default (prints current vs target). Pass --apply to write.
//
//   NEON_API_KEY=... npx tsx scripts/cap-neon-spend.ts          # preview
//   NEON_API_KEY=... npx tsx scripts/cap-neon-spend.ts --apply  # write
//
// The key is NOT read from the DB connection string — create one at
// https://console.neon.tech/app/settings/api-keys (or pass --key=<key>).
// ============================================================================

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ---- Target settings (tune here) -------------------------------------------
const MIN_CU = 0.25; // floor — tiny, keeps idle cost low
const MAX_CU = 0.5; // ceiling — bounds worst-case rate to ~$39/mo at 24/7 peak
const PRICE_PER_CU_HOUR = 0.106; // Launch plan, for the cost printout only

// Layer-2 backstop: ~450 CU-hours/month ≈ $47 of compute. ~2x the realistic
// ~$22 expected spend, so it won't trip in normal operation but still catches
// a true runaway. Raise/lower or set to null to skip the quota entirely.
const QUOTA_CU_HOURS: number | null = 450;
const QUOTA_COMPUTE_TIME_SECONDS =
  QUOTA_CU_HOURS == null ? null : Math.round(QUOTA_CU_HOURS * 3600);

// The compute endpoint baked into DATABASE_URL (…@ep-gentle-sound-ahfafep3-…)
const ENDPOINT_PREFIX = 'ep-gentle-sound-ahfafep3';

const API = 'https://console.neon.tech/api/v2';

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}

// Pull NEON_API_KEY from --key=, the environment, or a line in .env (this
// script isn't loaded through Next/Prisma's dotenv, so check the file too).
const KEY_NAMES = ['NEON_API_KEY', 'NEON_KEY'];

function resolveKey(): string | undefined {
  const fromArg = arg('key');
  if (fromArg) return fromArg.trim();
  for (const name of KEY_NAMES) {
    if (process.env[name]) return process.env[name]!.trim();
  }
  try {
    const env = readFileSync(join(process.cwd(), '.env'), 'utf8');
    for (const name of KEY_NAMES) {
      const line = env.split(/\r?\n/).find((l) => l.startsWith(`${name}=`));
      if (line) return line.slice(name.length + 1).replace(/^["']|["']$/g, '').trim();
    }
  } catch {
    /* no .env — fine */
  }
  return undefined;
}

async function neon(path: string, init?: RequestInit, key?: string) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON error body */
  }
  if (!res.ok) {
    throw new Error(`Neon API ${res.status} on ${path}: ${json?.message || text || res.statusText}`);
  }
  return json;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const key = resolveKey();

  if (!key) {
    console.error(
      'No Neon API key. Pass --key=<key>, set NEON_API_KEY in the env, or add a\n' +
        'NEON_API_KEY=... line to .env. Create one at:\n' +
        '  https://console.neon.tech/app/settings/api-keys',
    );
    process.exit(1);
  }

  console.log(`Mode: ${apply ? 'APPLY (writing)' : 'DRY RUN (no changes)'}\n`);

  // 1) Find the project that owns our compute endpoint. Personal accounts can
  // list /projects directly; org-scoped accounts require ?org_id=, so fall
  // back to enumerating the user's organizations and listing per org.
  let projects: any[] = [];
  try {
    projects = (await neon('/projects', undefined, key)).projects;
  } catch (e: any) {
    if (!/org_id is required/i.test(e.message)) throw e;
    const { organizations } = await neon('/users/me/organizations', undefined, key);
    for (const org of organizations || []) {
      const res = await neon(`/projects?org_id=${org.id}`, undefined, key);
      projects.push(...(res.projects || []));
    }
  }
  let projectId: string | null = null;
  let endpointId: string | null = null;
  let current: any = null;

  for (const p of projects) {
    const { endpoints } = await neon(`/projects/${p.id}/endpoints`, undefined, key);
    const match = endpoints.find((e: any) => String(e.id).startsWith(ENDPOINT_PREFIX));
    if (match) {
      projectId = p.id;
      endpointId = match.id;
      current = { project: p, endpoint: match };
      break;
    }
  }

  if (!projectId || !endpointId) {
    throw new Error(
      `Could not find an endpoint starting with "${ENDPOINT_PREFIX}" in any project ` +
        `for this API key. Is the key for the right Neon account?`,
    );
  }

  const ep = current.endpoint;
  const curQuota = current.project?.settings?.quota?.compute_time_seconds ?? null;

  console.log(`Project:  ${current.project.name} (${projectId})`);
  console.log(`Endpoint: ${endpointId}\n`);

  console.log('Layer 1 — autoscale (rate ceiling):');
  console.log(
    `  min CU: ${ep.autoscaling_limit_min_cu}  ->  ${MIN_CU}` +
      `   |   max CU: ${ep.autoscaling_limit_max_cu}  ->  ${MAX_CU}`,
  );
  console.log(
    `  worst case at max ${MAX_CU} CU, 24/7: ` +
      `$${(MAX_CU * 730 * PRICE_PER_CU_HOUR).toFixed(2)}/mo\n`,
  );

  console.log('Layer 2 — monthly compute quota (hard kill-switch):');
  if (QUOTA_COMPUTE_TIME_SECONDS == null) {
    console.log('  (skipped — QUOTA_CU_HOURS is null)\n');
  } else {
    const curStr = curQuota ? `${(curQuota / 3600).toFixed(0)} CU-h` : 'none';
    console.log(
      `  ${curStr}  ->  ${QUOTA_CU_HOURS} CU-h ` +
        `(~$${(QUOTA_CU_HOURS! * PRICE_PER_CU_HOUR).toFixed(0)} backstop; ` +
        `suspends compute until next billing cycle if hit)\n`,
    );
  }

  if (!apply) {
    console.log('Dry run — re-run with --apply to write these.');
    return;
  }

  // 2) Apply Layer 1 — endpoint autoscaling.
  await neon(
    `/projects/${projectId}/endpoints/${endpointId}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        endpoint: { autoscaling_limit_min_cu: MIN_CU, autoscaling_limit_max_cu: MAX_CU },
      }),
    },
    key,
  );
  console.log('✓ autoscale min/max applied');

  // 3) Apply Layer 2 — project quota.
  if (QUOTA_COMPUTE_TIME_SECONDS != null) {
    await neon(
      `/projects/${projectId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          project: { settings: { quota: { compute_time_seconds: QUOTA_COMPUTE_TIME_SECONDS } } },
        }),
      },
      key,
    );
    console.log('✓ compute quota applied');
  }

  console.log('\nDone. Both caps are live.');
}

main().catch((e) => {
  console.error('\nFailed:', e.message);
  process.exit(1);
});
