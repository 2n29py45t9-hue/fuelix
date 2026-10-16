/* Strava Token-Refresh (DUO-23): Access-Tokens laufen alle 6 h ab.
 * Der Refresh braucht das Client-Secret -> Serverless-Funktion. */
export default async function handler(req: any, res: any) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.status(405).send("Nur POST erlaubt.");
    return;
  }
  const refreshToken = typeof req.body?.refresh_token === "string" ? req.body.refresh_token : "";
  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;
  if (!refreshToken || !clientId || !clientSecret) {
    res.status(400).send("Refresh-Token oder Strava-Konfiguration fehlt.");
    return;
  }
  try {
    const tokenRes = await fetch("https://www.strava.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, grant_type: "refresh_token", refresh_token: refreshToken })
    });
    if (!tokenRes.ok) {
      res.status(502).send("Token-Erneuerung bei Strava fehlgeschlagen (" + tokenRes.status + ").");
      return;
    }
    const token = await tokenRes.json();
    res.setHeader("Content-Type", "application/json");
    res.status(200).send(JSON.stringify({ access_token: token.access_token, refresh_token: token.refresh_token, expires_at: token.expires_at }));
  } catch (err) {
    res.status(500).send("Unerwarteter Fehler beim Token-Refresh.");
  }
}
