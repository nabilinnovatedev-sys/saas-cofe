import { lazy, Suspense, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { configurationError, supabase } from "./lib/supabase";
const AdminDashboard = lazy(() =>
  import("./pages/Admin").then((module) => ({
    default: module.AdminDashboard,
  })),
);
const CafeWorkspace = lazy(() =>
  import("./pages/Admin").then((module) => ({ default: module.CafeWorkspace })),
);
const StaffWorkspace = lazy(() =>
  import("./pages/Admin").then((module) => ({ default: module.StaffWorkspace })),
);
const Login = lazy(() =>
  import("./pages/Login").then((module) => ({ default: module.Login })),
);
const WhatsAppMessages = lazy(() => import("./pages/WhatsAppMessages"));
const Loyalty = lazy(() => import("./pages/Loyalty"));
const PublicCafe = lazy(() =>
  import("./pages/PublicCafe").then((module) => ({
    default: module.PublicCafe,
  })),
);
const Tracking = lazy(() =>
  import("./pages/PublicCafe").then((module) => ({ default: module.Tracking })),
);

function Protected({
  children,
  roles,
}: {
  children: React.ReactNode;
  roles: Array<"platform_admin" | "waiter">;
}) {
  const [state, setState] = useState<"loading" | "ok" | "no">("loading");
  const location = useLocation();
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) return setState("no");
      supabase
        .from("staff_profiles")
        .select("role,active")
        .eq("user_id", data.session.user.id)
        .single()
        .then(({ data: profile }) =>
          setState(
            profile?.active && roles.includes(profile.role) ? "ok" : "no",
          ),
        );
    });
  }, [roles.join(",")]);
  if (state === "loading")
    return (
      <div className="state-page">
        <span className="spinner" />
        Vérification de la session…
      </div>
    );
  return state === "ok" ? (
    children
  ) : (
    <Navigate to="/connexion" replace state={{ from: location.pathname }} />
  );
}

export function App() {
  const [, setSession] = useState<Session | null>(null);
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);
  if (configurationError)
    return (
      <main className="state-page error">
        <h1>Configuration requise</h1>
        <p>{configurationError}</p>
        <code>VITE_SUPABASE_URL · VITE_SUPABASE_ANON_KEY</code>
      </main>
    );
  return (
    <Suspense fallback={<main className="state-page">Chargement…</main>}>
      <Routes>
        <Route path="/connexion" element={<Login />} />
        <Route
          path="/admin"
          element={
            <Protected roles={["platform_admin"]}>
              <AdminDashboard />
            </Protected>
          }
        />
        <Route
          path="/admin/whatsapp"
          element={
            <Protected roles={["platform_admin"]}>
              <WhatsAppMessages />
            </Protected>
          }
        />
        <Route
          path="/admin/cafes/:cafeId/*"
          element={
            <Protected roles={["platform_admin"]}>
              <CafeWorkspace />
            </Protected>
          }
        />
        <Route
          path="/equipe"
          element={
            <Protected roles={["waiter"]}>
              <StaffWorkspace />
            </Protected>
          }
        />
        <Route path="/suivi/:token" element={<Tracking />} />
        <Route path="/fidelite/:slug" element={<Loyalty />} />
        <Route path="/:slug" element={<PublicCafe />} />
        <Route path="/" element={<Navigate to="/connexion" replace />} />
        <Route
          path="*"
          element={
            <main className="state-page">
              <h1>Page introuvable</h1>
            </main>
          }
        />
      </Routes>
    </Suspense>
  );
}
