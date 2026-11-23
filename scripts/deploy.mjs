/**
 * Deploy Retention First to Cloudflare Pages, the same way as the other
 * agency sites (see landing-page-template/scripts/deploy.mjs).
 *
 *   npm run deploy                    → build, deploy, and attach DOMAIN
 *   npm run deploy -- foo.example.com → attach a different domain instead
 *
 * Runs on every push to main (.github/workflows/deploy.yml). Locally it needs
 * CLOUDFLARE_API_TOKEN (Pages: Edit and DNS: Edit on the domain's zone);
 * without one, wrangler falls back to its own login and the domain step is
 * skipped.
 *
 * DOMAIN DAY: once retentionfirst.co's nameservers point at Cloudflare and the
 * zone is active in this account, change DOMAIN below to 'retentionfirst.co'
 * and push. The page then drops its noindex (src/layouts/Layout.astro).
 */
import { execSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';

const PROJECT = 'retentionfirst';
const DOMAIN = 'retentionfirst.bradenseidl.com';

// The Cloudflare account the agency sites live under (an ID, not a secret).
process.env.CLOUDFLARE_ACCOUNT_ID ||= 'c0c0039e43747ca70b940c3058edee4d';

const domain = process.argv.slice(2).find((a) => a.includes('.')) ?? DOMAIN;
const token = process.env.CLOUDFLARE_API_TOKEN;
const run = (cmd) => execSync(cmd, { stdio: 'inherit' });

// The build reads its own address from here (astro.config.mjs): og tags, and
// whether the page is a preview that stays out of search results.
process.env.SITE_URL = `https://${domain}`;

console.log('\n▲  Building the site…');
run('npm run build');

console.log(`\n☁  Ensuring Cloudflare Pages project "${PROJECT}" exists…`);
try {
  run(`npx wrangler pages project create ${PROJECT} --production-branch=main`);
} catch {
  // Already exists.
}

// --branch=main makes every deploy the production one, so the domain always
// shows the latest build.
console.log(`\n☁  Deploying to "${PROJECT}"…`);
run(`npx wrangler pages deploy dist --project-name=${PROJECT} --branch=main --commit-dirty=true`);

if (token) await attachDomain(domain);
else console.log(`\n⚠  No CLOUDFLARE_API_TOKEN: skipped attaching ${domain}.`);

console.log(`\n✓  Done. Live at https://${domain}`);
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Deployed\n\n[https://${domain}](https://${domain})\n`);
}

/**
 * Points `name` at the project: a proxied CNAME to the project's pages.dev
 * address, and the domain registered on the project. Safe to repeat.
 */
async function attachDomain(name) {
  const api = 'https://api.cloudflare.com/client/v4';
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const call = async (path, init = {}) => {
    const res = await fetch(`${api}${path}`, { ...init, headers });
    const body = await res.json().catch(() => ({}));
    return { ok: res.ok && body.success !== false, body };
  };

  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  // The project's own address. Usually <project>.pages.dev, but Cloudflare
  // adds a suffix when that name is taken, so read it rather than assume it.
  const project = (await call(`/accounts/${account}/pages/projects/${PROJECT}`)).body?.result;
  const target = project?.subdomain ?? `${PROJECT}.pages.dev`;

  // The zone is the registrable part of the name (last two labels).
  const zoneName = name.split('.').slice(-2).join('.');
  const zone = (await call(`/zones?name=${zoneName}`)).body?.result?.[0];
  if (!zone) {
    console.log(`⚠  Zone "${zoneName}" isn't in this account (yet): skipped attaching ${name}.`);
    return;
  }

  const existing = (await call(`/zones/${zone.id}/dns_records?name=${name}`)).body?.result ?? [];
  const record = { type: 'CNAME', name, content: target, proxied: true };
  const same = existing.find((r) => r.type === 'CNAME' && r.content === target);
  if (same) {
    console.log(`✓  DNS already points ${name} → ${target}`);
  } else if (existing.length) {
    // Never overwrite a record that isn't ours: on a real domain the apex
    // may carry mail or other records. Fix by hand, then re-run.
    console.log(`⚠  ${name} already has DNS records (${existing.map((r) => r.type).join(', ')}): left alone.`);
  } else {
    const made = await call(`/zones/${zone.id}/dns_records`, { method: 'POST', body: JSON.stringify(record) });
    console.log(made.ok ? `✓  Created DNS ${name} → ${target}` : '⚠  Creating the DNS record failed');
  }

  const added = await call(`/accounts/${account}/pages/projects/${PROJECT}/domains`, {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
  const msg = added.body?.errors?.[0]?.message ?? '';
  console.log(added.ok || /already/i.test(msg) ? `✓  ${name} is attached to "${PROJECT}"` : `⚠  Attaching ${name} failed: ${msg}`);
}
