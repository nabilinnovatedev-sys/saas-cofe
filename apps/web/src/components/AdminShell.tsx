import type { ReactNode } from "react";
import { Coffee, Instagram, LayoutDashboard, LogOut, MessageCircle, Send } from "lucide-react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { supabase } from "../lib/supabase";
import "./admin-shell.css";

export function AdminShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return (
    <div className="admin-shell">
      <aside className="sidebar admin-sidebar">
        <Link to="/admin" className="side-brand"><Coffee /><span>Café Console</span></Link>
        <nav aria-label="Administration">
          <Link to="/admin" className={pathname === "/admin" || pathname.startsWith("/admin/cafes/") ? "active" : ""}>
            <LayoutDashboard /> Cafés
          </Link>
          <Link to="/admin#commandes"><Send /> Commandes</Link>
          <NavLink to="/admin/whatsapp"><MessageCircle /> WhatsApp</NavLink>
          <NavLink to="/admin/instagram"><Instagram /> Instagram</NavLink>
        </nav>
        <button className="sidebar-logout" onClick={async () => {
          await supabase.auth.signOut();
          location.href = "/connexion";
        }}><LogOut /> Déconnexion</button>
      </aside>
      <main className="admin-main">{children}</main>
    </div>
  );
}
