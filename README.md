# TickScout Landing Page

Marketing/waitlist landing page for **TickScout** — AI-powered tick detection for
people and pets. Single static page plus a small Cloudflare Worker that handles
inline email signups into Beehiiv.

- **Live:** https://tickscouthq.com
- **Worker URL:** https://tickscout-landing.jamesmichaelnigrelli.workers.dev
- **Repo:** https://github.com/jamesmichaelnigrelli-web/tickscout-landing (public)

---

## Stack & hosting

- **Frontend:** one file, `public/index.html` — all CSS/JS inline, no frameworks.
  Only external dependency is Google Fonts (Inter).
- **Backend:** Cloudflare **Worker** (`src/index.js`) serving the static assets
  *and* a `POST /api/subscribe` endpoint.
- **Hosting:** Cloudflare Workers (static assets + Worker), Worker name
  `tickscout-landing`. SSL is automatic.
- **Deploys:** **Git-connected** via Cloudflare Workers Builds. Every push to
  `main` runs `npx wrangler deploy` and goes live automatically. No manual uploads.

### Repo layout
```
tickscout-landing/
├── public/
│   └── index.html        # the entire landing page (HTML/CSS/JS inline)
├── src/
│   └── index.js          # Worker: /api/subscribe + static asset fallback
├── wrangler.jsonc        # Worker config (name, main, assets binding)
├── .gitignore
└── README.md
```

---

## How signup works (inline, no redirect)

1. User submits the email form on the page.
2. JS `fetch('/api/subscribe', { method:'POST', body:{ email } })` — stays on page.
3. The Worker validates the email, then calls the **Beehiiv API v2**:
   `POST https://api.beehiiv.com/v2/publications/{pubId}/subscriptions`
   with `reactivate_existing: true`, `send_welcome_email: true`, and
   `utm_source`/`referring_site` = `tickscouthq.com`.
4. On success the form is replaced with an inline confirmation; on error an
   in-place red message shows and the button re-enables.

The Beehiiv **publication ID is auto-discovered** from the API key
(`GET /v2/publications`, first publication, cached per isolate), so only the API
key needs to be configured. Current publication: **TickScout**
(`pub_ec11b759-6dcb-4f01-bb52-7a91936d62e7`).

### Required secret (Cloudflare, runtime — NOT in git)
| Name | Type | Where |
|------|------|-------|
| `BEEHIIV_API_KEY` | Secret (encrypted) | Worker → **Settings → Variables and Secrets** |
| `BEEHIIV_PUBLICATION_ID` | optional var | only if you want to pin the publication instead of auto-discovery |

> ⚠️ Set these under the Worker's **runtime** Settings → Variables and Secrets —
> **not** the Build section's variables (those are build-time only and invisible at runtime).

---

## Local preview

A preview config exists at `../.claude/launch.json` (server name **`landing`**),
which serves `landing/public` on **http://localhost:4321** via Python's
`http.server`.

> Note: the static preview does **not** run the Worker, so `/api/subscribe`
> returns 404 locally. To test the API path locally you'd need `wrangler dev`
> (requires Node). The endpoint is validated against the deployed Worker instead.

---

## Deploying changes

Just commit and push to `main`:
```
git add -A
git commit -m "..."
git push origin main
```
Cloudflare Workers Builds picks it up and deploys automatically.

**Build configuration (set once in the dashboard):**
- Production branch: `main`
- Build command: *(none)*
- Deploy command: `npx wrangler deploy`
- Root directory: `/`

---

## Page content (current)

- **Nav:** logo + "Join Waitlist".
- **Hero:** "Find ticks before they find you." + badge **"Coming Soon"**.
- **How it works:** **Scan → Identify → Stay Safe**.
- **Signup:** inline Beehiiv form.
- **Footer:** Instagram/TikTok (@tickscouthq), contact, and a legal disclaimer
  ("TickScout is not a medical device…").
- Deliberately contains **no** lab-testing / shipping / telehealth / doctor /
  medical-referral copy — detection + waitlist only.

### Design tokens
- Gradient `#0D1B17 → #1A3A2E → #0F2818` (135°), accent `#4ade80`,
  text `#FFFFFF` / subtle `#A8D5B5`, font Inter.
- Logo is an inline SVG (tick-burrow emblem + "Tick Scout" wordmark). The
  `viewBox` is cropped to the content (`24 30 222 62`) and the wordmark sits at
  `x=80` so the emblem/wordmark spacing is tight. Source of truth for the logo
  also lives in Notion ("🦈 Logo — All Variants").

---

## Operational notes / gotchas

- **No email on signup yet:** Beehiiv only emails new subscribers if a **welcome
  email** is configured or **double opt-in** is enabled. Both are currently off,
  so signups land as `active` silently. Enable either in Beehiiv → Settings →
  Publication. (Code already requests `send_welcome_email: true`.)
- **Two domains is normal:** the Worker has its free `*.workers.dev` URL *and*
  the `tickscouthq.com` custom domain — both point to the same Worker.
- **Cloudflare CDN/WAF may return 403 to bots:** automated fetchers can get 403
  on `tickscouthq.com`; a real browser gets 200.
- **API key hygiene:** if the key is ever exposed, rotate it in Beehiiv and
  update the `BEEHIIV_API_KEY` secret — no code change needed.

---

## Quick checks (replace KEY)

```bash
# Endpoint reachable? invalid email -> 400 validation
curl -s -X POST -H "Content-Type: application/json" \
  -d '{"email":"bad"}' https://tickscouthq.com/api/subscribe

# List recent subscribers
curl -s -H "Authorization: Bearer KEY" \
  "https://api.beehiiv.com/v2/publications/pub_ec11b759-6dcb-4f01-bb52-7a91936d62e7/subscriptions?limit=10&order_by=created&direction=desc"
```
