import { FormEvent, useState } from "react";
import { Coffee } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

export function Login() {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      setError("Email ou mot de passe incorrect.");
      setLoading(false);
      return;
    }
    const { data: p } = await supabase
      .from("staff_profiles")
      .select("role,active")
      .eq("user_id", data.user.id)
      .single();
    if (!p?.active || !["platform_admin", "waiter"].includes(p.role)) {
      await supabase.auth.signOut();
      setError("Ce compte ne dispose pas d’un accès actif.");
      setLoading(false);
      return;
    }
    const requested = (location.state as { from?: string })?.from;
    const destination =
      p.role === "platform_admin"
        ? requested?.startsWith("/admin")
          ? requested
          : "/admin"
        : "/equipe";
    navigate(destination, {
      replace: true,
    });
  }
  return (
    <main className="login-page">
      <section className="login-card">
        <div className="brand-lockup">
          <span className="brand-mark">
            <Coffee />
          </span>
          <div>
            <strong>Café Console</strong>
            <small>Administration privée</small>
          </div>
        </div>
        <h1>Heureux de vous revoir</h1>
        <p className="muted">
          Connectez-vous pour gérer vos cafés et leurs commandes.
        </p>
        <form onSubmit={submit}>
          <label>
            Email
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@exemple.ma"
            />
          </label>
          <label>
            Mot de passe
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && (
            <div className="alert error" role="alert">
              {error}
            </div>
          )}
          <button className="btn primary wide" disabled={loading}>
            {loading ? "Connexion…" : "Se connecter"}
          </button>
        </form>
        <button
          className="link-btn"
          onClick={async () => {
            if (!email) return setError("Saisissez votre email.");
            await supabase.auth.resetPasswordForEmail(email);
            setError("Un lien de réinitialisation a été envoyé.");
          }}
        >
          Mot de passe oublié ?
        </button>
      </section>
    </main>
  );
}
