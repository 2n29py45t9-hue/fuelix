import { useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";

export default function Auth() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setInfo("");
    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
    } else {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) {
        setError(error.message);
        return;
      }
      if (!data.session) {
        setInfo("Bitte E-Mail-Postfach pruefen: Bestaetigungslink klicken, danach einloggen.");
      }
    }
  };

  return (
    <div className="app">
      <div className="card auth">
        <h1>Fuelix 🚴</h1>
        <h2>{mode === "login" ? "Anmelden" : "Konto erstellen"}</h2>
        <form onSubmit={submit}>
          <label>E-Mail</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <label>Passwort (mindestens 6 Zeichen)</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} required />
          {error ? <p className="error">{error}</p> : null}
          {info ? <p className="status">{info}</p> : null}
          <button type="submit">{mode === "login" ? "Einloggen" : "Registrieren"}</button>
        </form>
        <button className="link" onClick={() => setMode(mode === "login" ? "signup" : "login")}>
          {mode === "login" ? "Noch kein Konto? Registrieren" : "Schon ein Konto? Einloggen"}
        </button>
      </div>
    </div>
  );
}
