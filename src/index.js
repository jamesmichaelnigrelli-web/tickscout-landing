// TickScout landing Worker.
// - POST /api/subscribe  -> add the email to Beehiiv via the official API (server-side key)
// - everything else      -> static assets in ./public (served before the Worker runs)

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Cache the resolved publication id for the life of the isolate to avoid an
// extra Beehiiv call on every subscribe.
let cachedPublicationId = null;

async function getPublicationId(env) {
  // Prefer an explicit secret/var if provided.
  if (env.BEEHIIV_PUBLICATION_ID) return env.BEEHIIV_PUBLICATION_ID;
  if (cachedPublicationId) return cachedPublicationId;

  // Otherwise discover it from the API key (uses the first publication).
  const resp = await fetch("https://api.beehiiv.com/v2/publications", {
    headers: { Authorization: "Bearer " + env.BEEHIIV_API_KEY },
  });
  if (!resp.ok) return null;
  const body = await resp.json();
  const id = body && body.data && body.data[0] && body.data[0].id;
  if (id) cachedPublicationId = id;
  return id || null;
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/subscribe") {
      if (request.method !== "POST") return json({ ok: false, error: "Method not allowed." }, 405);
      return handleSubscribe(request, env);
    }

    // Static assets (index.html, etc.). Matching assets are served before the
    // Worker even runs; this fallback covers anything that reaches the script.
    return env.ASSETS.fetch(request);
  },
};

async function handleSubscribe(request, env) {
  // Parse the email from JSON or form-encoded bodies.
  let email = "";
  try {
    const ct = request.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      const body = await request.json();
      email = String(body.email || "").trim();
    } else {
      const form = await request.formData();
      email = String(form.get("email") || "").trim();
    }
  } catch {
    return json({ ok: false, error: "Invalid request." }, 400);
  }

  if (!email || !EMAIL_RE.test(email)) {
    return json({ ok: false, error: "Please enter a valid email address." }, 400);
  }

  if (!env.BEEHIIV_API_KEY) {
    // Misconfiguration: API key secret not set yet.
    return json({ ok: false, error: "Signup is temporarily unavailable." }, 503);
  }

  let publicationId;
  try {
    publicationId = await getPublicationId(env);
  } catch {
    return json({ ok: false, error: "Signup is temporarily unavailable." }, 503);
  }
  if (!publicationId) {
    return json({ ok: false, error: "Signup is temporarily unavailable." }, 503);
  }

  const endpoint =
    "https://api.beehiiv.com/v2/publications/" +
    encodeURIComponent(publicationId) +
    "/subscriptions";

  let resp;
  try {
    resp = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + env.BEEHIIV_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        reactivate_existing: true,
        send_welcome_email: true,
        utm_source: "tickscouthq.com",
        referring_site: "tickscouthq.com",
      }),
    });
  } catch {
    return json({ ok: false, error: "Network error. Please try again." }, 502);
  }

  if (resp.ok) return json({ ok: true });

  // Surface the Beehiiv status to help diagnose, but don't leak the response body.
  return json(
    { ok: false, error: "Could not complete signup. Please try again.", upstreamStatus: resp.status },
    502
  );
}
