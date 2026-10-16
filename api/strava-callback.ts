/* Strava OAuth-Callback (DUO-23). Vercel-Serverless-Funktion:
 * tauscht den Autorisierungscode gegen Tokens - das Client-Secret bleibt
 * ausschliesslich serverseitig. Die Uebergabe an die SPA laeuft ueber
 * localStorage, damit der Client die Tokens mit seiner eigenen
 * Supabase-Session (RLS: authenticated) speichern kann. */
export default async function handler(req: any, res: any) {
  res.setHeader("Cache-Control", "no-store");
  const code = typeof req.query?.code === "string" ? req.query.code : "";
  if (!code) {
    res.status(400).send("Fehlender Autorisierungscode von Strava.");
    return;
  }
  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    res.status(500).send("Strava ist auf dem Server noch nicht konfiguriert (STRAVA_CLIENT_ID / STRAVA_CLIENT_SECRET fehlen).");
    return;
  }
  try {
    const tokenRes = await fetch("https://www.strava.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code: code, grant_type: "authorization_code" })
    });
    if (!tokenRes.ok) {
      res.status(502).send("Token-Austausch mit Strava fehlgeschlagen (" + tokenRes.status + ").");
      return;
    }
    const token = await tokenRes.json();
    const athlete = token.athlete ?? {};
    const name = ((athlete.firstname ?? "") + " " + (athlete.lastname ?? "")).trim();
    const payload = JSON.stringify({
      athlete_id: athlete.id,
      athlete_name: name === "" ? null : name,
      access_token: token.access_token,
      refresh_token: token.refresh_token,
      expires_at: token.expires_at,
      scope: token.scope
    });
    const html = '<!doctype html><html><head><meta charset="utf-8"></head><body><p>Strava verbunden - zurueck zu Fuelix ...</p><script>localStorage.setItem("fuelix_strava", ' + payload + '); location.replace("/");</script></body></html>';
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(html);
  } catch (err) {
    res.status(500).send("Unerwarteter Fehler im Strava-Callback.");
  }
}
