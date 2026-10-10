# MPrnt Platform Console

The console for **platform operators** (super admin accounts). It sees and changes
every partner, QR point, printer, staff account, job, rate and audit entry on the
platform. It is a separate app from the shop dashboard, in its own folder, with
its own cookies, its own port (3003) and its own build. Nothing from the shop app
is imported here, and no platform code is in the shop app.

**Platform accounts only.** A shop account can sign in with the right password and
still be refused (see [Who can get in](#who-can-get-in)).

---

## Run it

```bash
npm install
cp .env.example .env.local      # MPRNT_API_URL; the backend must be running
npm run dev                     # http://localhost:3003
```

| Variable | Default | Purpose |
|---|---|---|
| `MPRNT_API_URL` | `http://localhost:3000/api/v1` | Backend base URL, no trailing slash |
| `MPRNT_PROXY_SECRET` | empty | Shared with the backend's `ADMIN_PROXY_SECRET`, so the audit log records the operator's real IP |

Create a platform account on the backend, on the machine it runs on. There is no
HTTP route to do it:

```bash
cd mprnt-backend && npx ts-node scripts/create-super-admin.ts you@example.com "Your Name"
```

The password is printed once. The account must change it at first sign-in.

Tests: `npm test` (pure logic: the route allowlist, query rules, origin checks,
CSP, formatting, the tree). `npm run typecheck`, `npm run lint`, `npm run build`.

---

## Design: light, dark, and built for a phone

The palette is MPrnt's: **forest green `#195032`** for the main colour, and **warm
off-white `#F7F5EF`** for the body colour. Dark mode uses the same green lifted for
legibility on a deep green-black ground.

- **Theme.** Light by default, or the system setting. A **System / Light / Dark**
  switch lives in *More* on a phone and in the top bar on a desktop. The choice is
  stored on this device only, and a script in `app/layout.tsx` applies it before the
  first paint, so there is no flash.
- **Phone.** A bottom tab bar holds Home, Partners, Printers, Attention and More.
  The navigator opens as a full sheet from *More → Explorer*, and Find (`⌘K`) is in the
  top bar. Dialogs rise as bottom sheets with a grab handle, above the home indicator.
  Every control is at least 44px tall. Inputs are 16px so iOS does not zoom on focus.
  Lists are cards, and no page scrolls sideways. Wide tables scroll inside their own box.
- **Desktop.** The navigator is a sidebar, and lists are dense tables.
- **Motion.** Respects `prefers-reduced-motion`.

## What you can see and change

The left side is a **tree**. Every node is a page, and every page has a URL.

```
Platform
  Overview · Business models · Partner comparison · Print queue · Leads
Partners
  <Partner>
    Overview          record, performance, recent changes, edit, suspend, delete
    Business model    model now, model at registration, the four models, change, history
    Staff             owners, managers, viewers
      <Person>        record, activity, permissions, reset password, unlock, remove
    QR points         the QR points of this partner
      <QR point>      record, edit, enrol a printer, move to another partner, jobs
        <Printer>     its own page: record, key, heartbeat, paper, ink, jobs, rotate, revoke
    Printers          every printer at this partner
    Money             revenue, volume, by day, by QR point
    Sessions          jobs: filter, export CSV, open any job
    Pricing           rates in force per QR point, rate history, publish rates
    Attention         paid jobs that have not printed, refund
    Audit             every audited action for this partner
Across every partner
  Printers · Staff and platform accounts · Sessions · Pricing · Attention
  Audit trail · Permissions · My account
```

- **Business model.** The model a partner is on *now* is `organizations.business_model`. The
  model it *registered* with is not stored separately. The backend writes it into
  the `organization.created` audit entry, and the console reads it from there. Every
  change is an `organization.model_changed` entry, so the history is complete.
- **Every record.** Each detail page shows its fields in a readable layout, and a
  **Raw record (JSON)** panel below with the exact payload. If the designed view does
  not show a field, the raw panel does.
- **Find anything.** `⌘K` / `Ctrl+K` opens a palette over every partner, QR point,
  printer and person. The tree filter narrows the navigator the same way.

### Changes you can make

Each one asks for a typed confirmation or a reason, and each is written to the audit log by the backend.

| Area | Change | Confirmation |
|---|---|---|
| Partner | create; edit name, timezone, contacts, notes; suspend or reactivate; delete | typed name / slug |
| Business model | change the partnership model | typed name |
| Staff | add (temporary password shown once); edit name, role, active; reset password (shown once); unlock; remove; grant, deny or reset single permissions | typed email; permission changes reviewed as a list |
| QR point | create; edit name, location, status; move to another partner; enrol a printer (key shown once) | typed code for a move |
| Printer | edit name and station; rotate key (new key shown once); revoke | typed printer ID |
| Pricing | publish rates for the platform, a partner or one QR point | typed `PUBLISH` |
| Job | refund a paid job that has not printed | reason (3+ characters) and the job's prefix |
| Account | change own password (signs you out everywhere) | current password |

Secrets (printer keys, temporary passwords) are shown **once**. The dialog cannot be
closed until the operator ticks "I have saved this". The value is held only in that
dialog's state, and closing it clears it.

---

## Who can get in

1. **Sign-in refuses non-platform accounts.** `POST /api/auth/login` checks the
   backend's `role`. A shop account gets a 403 and the session the backend issued
   is revoked straight away, so a refused sign-in leaves no live token.
2. **The middleware gates every page.** Without a platform session the page redirects
   to sign-in. A session whose profile is not a platform account is cleared. This is
   a convenience. The security boundary is below.
3. **The backend decides.** Every request is answered by the backend's
   `requireSuperAdmin` and `resolveTenant`, from the token. A shop token gets 403 on
   platform routes even when it talks to the backend directly.
4. **Temporary passwords** go to `/account` before anything else. The backend refuses
   every route except the two that change it.

---

## How the console is protected

**Tokens never reach the browser.** Access and refresh tokens are `httpOnly` cookies
(`mprnt_sa_at`, `mprnt_sa_rt`), attached on the server. The one readable cookie
(`mprnt_sa_profile`) holds display facts only, and nothing decides access from it.

**The proxy is an allowlist, not a pass-through.** Every browser call goes through
`/api/proxy/*`, which applies these rules in order:

1. The method and path must be on `PLATFORM_ROUTES` (`lib/gate.ts`). Anything else
   is a 404, the same answer an unknown path gets. There is no catch-all.
2. Ids are typed: UUIDs and printer IDs. A segment that does not match is refused.
3. The query string may contain only the parameters in `QUERY_RULES`, each with its
   own value check. An unknown parameter, or a repeated one (`organizationId` twice,
   a parameter-pollution attempt), is a 400.
4. The request must not be cross-site (`Sec-Fetch-Site`), and a state-changing
   request must come from this host (`Origin` or `Referer`). Otherwise 403.
5. A body must be a single JSON object, at most 64 KB.
6. The access token is attached on the server. On a 401 it refreshes once, and
   concurrent refreshes share one exchange, because refresh tokens rotate. Only the
   backend refusing the refresh token ends the session (`classifyRefreshStatus`). A
   rate limit or a backend error answers the request with a 503 and keeps the cookies,
   so a busy moment does not sign anyone out.

**Content-Security-Policy with a per-request nonce** (`lib/csp.ts`, `middleware.ts`).
Scripts run only with this response's nonce, or from a nonced script. There are no
third-party origins. `unsafe-eval` appears only in development, for hot reload.
Every page is rendered per request, because a prerendered page would ship scripts
the policy then blocks.

**Session lengths.** The browser keeps the session for at most 12 hours. The console
signs you out after 20 minutes without input, and sign-out revokes the refresh token
at the backend.

**Headers.** `frame-ancestors 'none'`, `X-Frame-Options: DENY`, HSTS, `nosniff`,
`no-referrer`, `Cross-Origin-Opener-Policy: same-origin`, `noindex` (header and meta),
and `Cache-Control: no-store`.

**Cookies are not shared with the shop app.** Cookies are scoped by host, not port, so on
`localhost` the two apps would otherwise read each other's sessions. The names differ.

---

## Limits and what is not built

These are facts about the backend, not the console. Each one is a decision for
the backend team, and the console does not work around any of them.

- **Access tokens outlive sign-out for up to 15 minutes.** Sign-out revokes the refresh
  token, but the backend keeps no access-token denylist. A copied access token works
  until it expires. The shop dashboard has the same property.
- **The refresh token lives 7 days** at the backend. The browser cookie is 12 hours,
  but a copied refresh token is valid for the full backend lifetime unless someone
  signs out.
- **No MFA** for platform accounts. The shop README lists this as not built too.
- **No single-job endpoint.** A job's payment record, gateway response, documents and
  queue attempts are not returned to admins. The job drawer shows the list row, and
  the console does not add the rest.
- **Customer documents and network details are not in any admin response.** The
  backend leaves out document names, storage keys and customer IP and user agent on
  purpose. This console does not add them. If that should change, it is a privacy
  decision.
- **No printer heartbeat or queue history.** Only the latest heartbeat values are returned.
- **Audit entries cannot be filtered by person.** A person's activity is taken from the
  latest 200 partner entries and filtered in the browser. The page says so.
- **Kiosk capabilities are not returned.** They are shown on each printer instead.
- **Partner notes are write-only.** The API does not return them.
- **Partner-wide effective rates are not returned.** Rates are resolved per QR point only.
- **Platform accounts cannot be created or changed here.** The backend makes them
  from the command line, by design.
- **No restore** for a removed partner or person, and **no un-revoke** for a printer.
  A revoked printer has to be enrolled again under a new ID.
- **No move** for a printer between QR points.

---

## Structure

```
app/
  login/                    sign-in (platform accounts only)
  (console)/                every signed-in page, behind the shared shell
    page.tsx                platform overview
    partners/               directory; [orgId]/ is one partner, with its own tabs
    printers/ staff/ sessions/ pricing/ attention/ audit/   across every partner
    business-models/ reports/ queue/ leads/ permissions/ account/
  api/
    auth/login|logout       sign-in (refuses non-platform) and sign-out
    proxy/[...path]/        the only route to the backend
components/
  console/                  Shell (tab bar, More sheet, sidebar), TreeNav, Palette, LoginForm
  ui/                       primitives, dialogs (bottom sheets, typed confirm, show-once
                            secret), responsive lists, theme switch, icons
  views/                    one component per screen group
lib/
  gate.ts                   allowlist, query rules, origin and refresh checks (pure)
  csp.ts                    the policy and the nonce (pure)
  tree.ts                   the navigator, from the four lists (pure)
  theme.ts                  the theme choice and its storage key (pure)
  format.ts  models.ts  profile.ts  types.ts
  client/                   the browser's API wrapper and the console data provider
  server/                   config and cookies (server only)
middleware.ts               CSP nonce, page gate, password-change gate
tests/                      node --test on the pure modules
```

---

## Checked

- `npm test`: 46 tests on the allowlist, query rules, origin and cross-site checks, JSON
  body limits, single-flight refresh, CSP, formatting, profile parsing and the tree.
- Against the local backend, with a real platform account and a real shop account:
  a shop account with the correct password is refused and gets no cookie; a
  temporary password goes to `/account` and the API refuses it with
  `PASSWORD_CHANGE_REQUIRED`; the password change works; unknown and repeated
  parameters, cross-site requests and shop-only routes are refused; the CSV export
  passes through; logout revokes the refresh token.
- In the browser, both the development and the production build: every page loads
  with real data, the navigator opens a branch, `⌘K` finds printers across partners,
  a printer's key rotation runs its full confirm-and-show flow, the refund dialog
  requires a reason and the typed prefix, and the phone layout has no horizontal
  scroll. The production build ran with no console errors under the strict CSP.
