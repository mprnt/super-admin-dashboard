// Read-only. Prints paid revenue per printer for every partner, and the revenue no
// printer can be credited with. It signs in, makes only GET requests, and signs out
// again, so no session is left open. Nothing is written.
//
//   MPRNT_API_URL=https://…/api/v1 EMAIL=you@x.com PASSWORD='…' PERIOD=month \
//     node scripts/printer-revenue.mjs
//
// PERIOD is day | week | month | year (default month). Nothing is written.

const base = (process.env.MPRNT_API_URL || '').replace(/\/+$/, '');
const email = process.env.EMAIL;
const password = process.env.PASSWORD;
const period = process.env.PERIOD || 'month';

if (!base || !email || !password) {
  console.error('Set MPRNT_API_URL, EMAIL and PASSWORD (see the header of this file).');
  process.exit(1);
}

const login = await fetch(`${base}/admin/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
});
const loginBody = await login.json();
if (!login.ok || !loginBody.data) {
  console.error(`Sign-in failed (${login.status}): ${loginBody.message ?? 'no detail'}`);
  process.exit(1);
}
const token = loginBody.data.accessToken;
const refreshToken = loginBody.data.refreshToken;
const role = loginBody.data.user?.role;
if (role !== 'super_admin') {
  console.error(`This account is "${role}". The split needs a platform (super_admin) account.`);
  process.exit(1);
}

async function get(path) {
  const res = await fetch(`${base}/admin/${path}`, { headers: { Authorization: `Bearer ${token}` } });
  const body = await res.json();
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}: ${body.message ?? ''}`);
  return body.data;
}

const money = (n) => `₹${(Math.round(n * 100) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

const orgs = (await get('organizations')).organizations;
const printers = (await get('printers')).printers;

// Every job in the period, paged, so the split covers all of them.
async function allJobs(orgId) {
  const jobs = [];
  for (let offset = 0; ; offset += 200) {
    const page = await get(`reports/sessions?organizationId=${orgId}&period=${period}&limit=200&offset=${offset}`);
    jobs.push(...page.sessions);
    if (page.sessions.length < 200 || offset + 200 >= page.total) break;
  }
  return jobs;
}

console.log(`Period: ${period}   Source: ${base}\n`);
let grand = 0;
for (const org of orgs) {
  const jobs = await allJobs(org.id);
  const paid = jobs.filter((j) => j.paymentStatus === 'paid');
  const total = paid.reduce((a, j) => a + (j.amount || 0), 0);
  grand += total;

  const byPrinter = new Map();
  for (const p of printers.filter((x) => x.organization?.id === org.id)) {
    byPrinter.set(p.printerId, { name: p.station.label, jobs: 0, revenue: 0 });
  }
  let loose = { jobs: 0, revenue: 0 };
  for (const j of paid) {
    const id = j.printer?.id;
    if (!id) {
      loose.jobs += 1;
      loose.revenue += j.amount || 0;
      continue;
    }
    const row = byPrinter.get(id) ?? { name: j.printer.name ?? id, jobs: 0, revenue: 0 };
    row.jobs += 1;
    row.revenue += j.amount || 0;
    byPrinter.set(id, row);
  }

  console.log(`${org.name}  —  partner paid revenue ${money(total)} (${paid.length} paid jobs, ${jobs.length} jobs in total)`);
  for (const p of printers.filter((x) => x.organization?.id === org.id)) {
    console.log(`    printer ${p.printerId}: status ${p.status}, key issued ${p.enrollment.keyIssuedAt ?? '—'}, enrolled ${p.enrollment.enrolled ? 'yes' : 'no'}`);
  }
  for (const j of paid.filter((x) => !x.printer?.id)) {
    console.log(`    unlinked job ${j.createdAt.slice(0, 16)}  status ${j.status.padEnd(10)} ${String(j.kiosk.code).padEnd(10)} ${money(j.amount).padStart(10)}  ${j.errorMessage ?? ''}`);
  }
  for (const [id, r] of [...byPrinter.entries()].sort((a, b) => b[1].revenue - a[1].revenue)) {
    console.log(`    ${r.name.padEnd(24)} ${id.padEnd(18)} ${String(r.jobs).padStart(4)} jobs   ${money(r.revenue).padStart(12)}`);
  }
  console.log(`    ${'Not at a printer'.padEnd(24)} ${''.padEnd(18)} ${String(loose.jobs).padStart(4)} jobs   ${money(loose.revenue).padStart(12)}`);
  console.log('');
}
console.log(`All partners, paid revenue: ${money(grand)}`);

// Sign out, so this read does not leave a session open.
await fetch(`${base}/admin/auth/logout`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ refreshToken }),
});
