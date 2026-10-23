import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  Coffee,
  ExternalLink,
  LayoutDashboard,
  LogOut,
  Plus,
  QrCode,
  Search,
  Send,
  Users,
} from "lucide-react";
import QRCode from "qrcode";
import {
  Link,
  Navigate,
  NavLink,
  Route,
  Routes,
  useNavigate,
  useParams,
} from "react-router-dom";
import {
  formatMoney,
  normalizeSlug,
  ORDER_LABELS,
  type OrderStatus,
} from "@cafe/domain";
import { invoke, supabase } from "../lib/supabase";

type Cafe = {
  id: string;
  name: string;
  slug: string;
  status: "draft" | "active" | "suspended";
  currency: string;
  timezone: string;
  created_at: string;
  published_version_id: string | null;
  contact_phone?: string | null;
  contact_address?: string | null;
};
const statusCafe = {
  draft: "Brouillon",
  active: "Actif",
  suspended: "Suspendu",
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="admin-shell">
      <aside className="sidebar">
        <Link to="/admin" className="side-brand">
          <Coffee /> <span>Café Console</span>
        </Link>
        <nav>
          <NavLink to="/admin">
            <LayoutDashboard /> Cafés
          </NavLink>
          <Link to="/admin#commandes">
            <Send /> Commandes
          </Link>
        </nav>
        <button
          className="sidebar-logout"
          onClick={async () => {
            await supabase.auth.signOut();
            location.href = "/connexion";
          }}
        >
          <LogOut /> Déconnexion
        </button>
      </aside>
      <main className="admin-main">{children}</main>
    </div>
  );
}

export function AdminDashboard() {
  const [cafes, setCafes] = useState<Cafe[]>([]),
    [recentOrders, setRecentOrders] = useState<any[]>([]),
    [loading, setLoading] = useState(true),
    [show, setShow] = useState(false),
    [query, setQuery] = useState(""),
    [error, setError] = useState("");
  const [form, setForm] = useState({
    name: "",
    slug: "",
    currency: "MAD",
    timezone: "Africa/Casablanca",
  });
  const navigate = useNavigate();
  async function load() {
    setLoading(true);
    const [cafesResult, ordersResult] = await Promise.all([
      supabase.from("cafes").select("*").order("created_at"),
      supabase
        .from("orders")
        .select("*,cafes(name),cafe_tables(label)")
        .order("created_at", { ascending: false })
        .limit(20),
    ]);
    if (cafesResult.error) setError(cafesResult.error.message);
    setCafes(cafesResult.data || []);
    setRecentOrders(ordersResult.data || []);
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);
  async function create(e: FormEvent) {
    e.preventDefault();
    setError("");
    const { data, error } = await supabase
      .from("cafes")
      .insert({ ...form, slug: normalizeSlug(form.slug || form.name) })
      .select()
      .single();
    if (error) return setError(error.message);
    navigate("/admin/cafes/" + data.id + "/apercu");
  }
  const filtered = cafes.filter((c) =>
    c.name.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <Shell>
      <header className="page-header">
        <div>
          <p className="eyebrow">Vue d’ensemble</p>
          <h1>Vos cafés</h1>
          <p>Configurez vos établissements et suivez leur activité.</p>
        </div>
        <button className="btn primary" onClick={() => setShow(true)}>
          <Plus /> Créer un café
        </button>
      </header>
      <section className="stats">
        <article>
          <small>Établissements</small>
          <strong>{cafes.length}</strong>
        </article>
        <article>
          <small>Sites actifs</small>
          <strong>{cafes.filter((c) => c.status === "active").length}</strong>
        </article>
        <article>
          <small>Commandes actives</small>
          <strong>
            {
              recentOrders.filter((o) =>
                ["nouvelle", "acceptee", "en_preparation", "prete"].includes(
                  o.status,
                ),
              ).length
            }
          </strong>
        </article>
      </section>
      <div className="toolbar">
        <label className="search">
          <Search />
          <input
            aria-label="Rechercher"
            placeholder="Rechercher un café…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </div>
      {error && <div className="alert error">{error}</div>}
      {loading ? (
        <div className="state-card">Chargement des cafés…</div>
      ) : filtered.length === 0 ? (
        <div className="state-card">
          <Coffee />
          <h2>Aucun café</h2>
          <p>Créez votre premier établissement pour commencer.</p>
        </div>
      ) : (
        <div className="cafe-grid">
          {filtered.map((c) => (
            <Link
              className="cafe-card"
              key={c.id}
              to={`/admin/cafes/${c.id}/apercu`}
            >
              <div className="cafe-avatar">{c.name[0]}</div>
              <div>
                <span className={`badge ${c.status}`}>
                  ● {statusCafe[c.status]}
                </span>
                <h2>{c.name}</h2>
                <p>/{c.slug}</p>
              </div>
              <ExternalLink />
            </Link>
          ))}
        </div>
      )}
      <section id="commandes" className="global-orders">
        <div className="section-head">
          <div>
            <p className="eyebrow">Tous les établissements</p>
            <h2>Commandes récentes</h2>
          </div>
        </div>
        <div className="orders-table">
          {recentOrders.map((order) => (
            <Link key={order.id} to={`/admin/cafes/${order.cafe_id}/commandes`}>
              <div>
                <strong>{order.public_ref}</strong>
                <small>
                  {order.cafes?.name} · {order.cafe_tables?.label}
                </small>
              </div>
              <span className={`order-status ${order.status}`}>
                {ORDER_LABELS[order.status as OrderStatus]}
              </span>
              <p>{new Date(order.created_at).toLocaleString("fr-MA")}</p>
              <strong>{formatMoney(order.total_minor, order.currency)}</strong>
            </Link>
          ))}
        </div>
        {!recentOrders.length && (
          <div className="state-card">Aucune commande pour le moment.</div>
        )}
      </section>
      {show && (
        <div className="modal-backdrop" onMouseDown={() => setShow(false)}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h2>Nouveau café</h2>
            <p className="muted">
              L’établissement restera privé jusqu’à sa publication.
            </p>
            <form onSubmit={create} className="form-grid">
              <label>
                Nom
                <input
                  required
                  value={form.name}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      name: e.target.value,
                      slug: normalizeSlug(e.target.value),
                    })
                  }
                />
              </label>
              <label>
                Adresse publique
                <input
                  required
                  value={form.slug}
                  onChange={(e) =>
                    setForm({ ...form, slug: normalizeSlug(e.target.value) })
                  }
                />
                <small>/{form.slug || "mon-cafe"}</small>
              </label>
              <label>
                Devise
                <input
                  maxLength={3}
                  value={form.currency}
                  onChange={(e) =>
                    setForm({ ...form, currency: e.target.value.toUpperCase() })
                  }
                />
              </label>
              <label>
                Fuseau horaire
                <input
                  value={form.timezone}
                  onChange={(e) =>
                    setForm({ ...form, timezone: e.target.value })
                  }
                />
              </label>
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => setShow(false)}
                >
                  Annuler
                </button>
                <button className="btn primary">Créer le café</button>
              </div>
            </form>
          </section>
        </div>
      )}
    </Shell>
  );
}

function CafeLayout() {
  const { cafeId } = useParams();
  const [cafe, setCafe] = useState<Cafe | null>(null);
  useEffect(() => {
    supabase
      .from("cafes")
      .select("*")
      .eq("id", cafeId)
      .single()
      .then(({ data }) => setCafe(data));
  }, [cafeId]);
  if (!cafe)
    return (
      <Shell>
        <div className="state-page">Chargement…</div>
      </Shell>
    );
  const tabs = [
    ["apercu", "Aperçu"],
    ["identite", "Identité"],
    ["menu", "Menu"],
    ["tables", "Tables & QR"],
    ["serveurs", "Serveurs"],
    ["commandes", "Commandes"],
    ["publication", "Publication"],
  ];
  const basePath = `/admin/cafes/${cafe.id}`;
  return (
    <Shell>
      <header className="cafe-head">
        <div>
          <Link to="/admin" className="back">
            ← Tous les cafés
          </Link>
          <h1>
            {cafe.name}{" "}
            <span className={`badge ${cafe.status}`}>
              ● {statusCafe[cafe.status]}
            </span>
          </h1>
          <p>Gérez votre établissement et son menu en quelques clics.</p>
        </div>
        <a
          className="btn secondary"
          href={`/${cafe.slug}?preview=${cafe.id}`}
          target="_blank"
          rel="noreferrer"
        >
          Prévisualiser <ExternalLink />
        </a>
      </header>
      <nav className="tabs">
        {tabs.map(([path, label]) => (
          <NavLink key={path} to={`${basePath}/${path}`}>
            {label}
          </NavLink>
        ))}
      </nav>
      <Routes>
        <Route
          path="apercu"
          element={<Overview cafe={cafe} reload={() => location.reload()} />}
        />
        <Route path="identite" element={<Identity cafe={cafe} />} />
        <Route path="menu" element={<Menu cafe={cafe} />} />
        <Route path="tables" element={<Tables cafe={cafe} />} />
        <Route path="serveurs" element={<Staff cafe={cafe} />} />
        <Route path="commandes" element={<Orders cafe={cafe} />} />
        <Route path="publication" element={<Publication cafe={cafe} />} />
        <Route
          path="*"
          element={<Navigate to={`${basePath}/apercu`} replace />}
        />
      </Routes>
    </Shell>
  );
}
export function CafeWorkspace() {
  return <CafeLayout />;
}

function Overview({ cafe, reload }: { cafe: Cafe; reload: () => void }) {
  async function toggle() {
    const status = cafe.status === "suspended" ? "active" : "suspended";
    let suspension_reason: string | null = null;
    if (status === "suspended") {
      suspension_reason = prompt(
        "Motif de suspension (obligatoire). Les nouvelles commandes seront bloquées.",
      )?.trim() || null;
      if (!suspension_reason) return;
    } else if (!confirm("Réactiver ce café ?")) return;
    await supabase
      .from("cafes")
      .update({ status, suspension_reason })
      .eq("id", cafe.id);
    reload();
  }
  return (
    <section className="content-panel">
      <div className="overview-grid">
        <article>
          <span className="kicker">Site public</span>
          <h2>/{cafe.slug}</h2>
          <p>
            {cafe.published_version_id
              ? "Une version est publiée."
              : "Aucune version publiée."}
          </p>
          <Link
            className="text-link"
            to={`/admin/cafes/${cafe.id}/publication`}
          >
            Gérer la publication →
          </Link>
        </article>
        <article>
          <span className="kicker">État</span>
          <h2>{statusCafe[cafe.status]}</h2>
          <p>
            {cafe.status === "suspended"
              ? "Le traitement des commandes existantes reste possible."
              : "Le café accepte son fonctionnement normal."}
          </p>
          <button
            className={`btn ${cafe.status === "suspended" ? "primary" : "danger"}`}
            onClick={toggle}
          >
            {cafe.status === "suspended" ? "Réactiver" : "Suspendre"}
          </button>
        </article>
      </div>
    </section>
  );
}

function Identity({ cafe }: { cafe: Cafe }) {
  const [form, setForm] = useState<any>({
    name: cafe.name,
    slug: cafe.slug,
    primary_color: "#8B5E3C",
    secondary_color: "#557A64",
    accent_color: "#D98C32",
    description: "",
    contact_phone: cafe.contact_phone || "",
    contact_address: cafe.contact_address || "",
  });
  const [saved, setSaved] = useState("");
  useEffect(() => {
    supabase
      .from("cafe_branding")
      .select("*")
      .eq("cafe_id", cafe.id)
      .maybeSingle()
      .then(({ data }) => data && setForm((f: any) => ({ ...f, ...data })));
  }, [cafe.id]);
  async function save(e: FormEvent) {
    e.preventDefault();
    setSaved("");
    const { name, slug, contact_phone, contact_address, ...branding } = form;
    const a = await supabase
      .from("cafes")
      .update({
        name,
        slug: normalizeSlug(slug),
        contact_phone: contact_phone || null,
        contact_address: contact_address || null,
      })
      .eq("id", cafe.id);
    const b = await supabase
      .from("cafe_branding")
      .upsert({ ...branding, cafe_id: cafe.id });
    setSaved(
      a.error?.message || b.error?.message || "Modifications enregistrées.",
    );
  }
  async function upload(file: File) {
    if (file.size > 2_000_000)
      return setSaved("Le logo ne doit pas dépasser 2 Mo.");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
      return setSaved("Format autorisé : JPEG, PNG ou WebP.");
    const path = `${cafe.id}/logo-${crypto.randomUUID()}.${file.name.split(".").pop()}`;
    const { error } = await supabase.storage
      .from("cafe-branding")
      .upload(path, file);
    if (error) return setSaved(error.message);
    setForm({ ...form, logo_path: path });
  }
  return (
    <section className="split-panel">
      <form onSubmit={save} className="panel form-grid">
        <div>
          <p className="eyebrow">Identité & marque</p>
          <h2>Votre univers visuel</h2>
        </div>
        <label>
          Nom du café
          <input
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </label>
        <label>
          Slug
          <input
            required
            value={form.slug}
            onChange={(e) => setForm({ ...form, slug: e.target.value })}
          />
        </label>
        <label>
          Description
          <textarea
            rows={4}
            value={form.description || ""}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </label>
        <label>
          Logo
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
          />
        </label>
        <div className="color-row">
          <label>
            Principale
            <input
              type="color"
              value={form.primary_color}
              onChange={(e) =>
                setForm({ ...form, primary_color: e.target.value })
              }
            />
          </label>
          <label>
            Téléphone
            <input
              type="tel"
              value={form.contact_phone || ""}
              onChange={(e) =>
                setForm({ ...form, contact_phone: e.target.value })
              }
            />
          </label>
          <label>
            Adresse
            <input
              value={form.contact_address || ""}
              onChange={(e) =>
                setForm({ ...form, contact_address: e.target.value })
              }
            />
          </label>
          <label>
            Secondaire
            <input
              type="color"
              value={form.secondary_color}
              onChange={(e) =>
                setForm({ ...form, secondary_color: e.target.value })
              }
            />
          </label>
          <label>
            Accent
            <input
              type="color"
              value={form.accent_color}
              onChange={(e) =>
                setForm({ ...form, accent_color: e.target.value })
              }
            />
          </label>
        </div>
        {saved && <div className="alert info">{saved}</div>}
        <button className="btn primary">Enregistrer</button>
      </form>
      <article
        className="brand-preview"
        style={
          {
            "--brand": form.primary_color,
            "--secondary": form.secondary_color,
          } as React.CSSProperties
        }
      >
        <span>Aperçu</span>
        <div className="preview-hero">
          <Coffee />
          <h2>{form.name}</h2>
          <p>
            {form.description ||
              "Une halte gourmande au cœur des saveurs marocaines."}
          </p>
        </div>
        <button>Voir le panier</button>
      </article>
    </section>
  );
}

function Menu({ cafe }: { cafe: Cafe }) {
  const [categories, setCategories] = useState<any[]>([]),
    [products, setProducts] = useState<any[]>([]),
    [show, setShow] = useState<"category" | "product" | null>(null),
    [edit, setEdit] = useState<any>(null),
    [message, setMessage] = useState("");
  async function load() {
    const [c, p] = await Promise.all([
      supabase
        .from("menu_categories")
        .select("*")
        .eq("cafe_id", cafe.id)
        .order("sort_order"),
      supabase
        .from("products")
        .select("*")
        .eq("cafe_id", cafe.id)
        .order("sort_order"),
    ]);
    setCategories(c.data || []);
    setProducts(p.data || []);
  }
  useEffect(() => {
    load();
  }, [cafe.id]);
  async function saveCategory(e: FormEvent) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget as HTMLFormElement);
    await supabase.from("menu_categories").insert({
      cafe_id: cafe.id,
      name: fd.get("name"),
      sort_order: categories.length,
    });
    setShow(null);
    load();
  }
  async function saveProduct(e: FormEvent) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget as HTMLFormElement);
    let photo_path = edit?.photo_path || null;
    const photo = fd.get("photo") as File;
    if (photo?.size) {
      if (photo.size > 5_000_000) return setMessage("Image limitée à 5 Mo.");
      if (!["image/jpeg", "image/png", "image/webp"].includes(photo.type))
        return setMessage("Image JPEG, PNG ou WebP uniquement.");
      photo_path = `${cafe.id}/${crypto.randomUUID()}.${photo.name.split(".").pop()}`;
      const uploaded = await supabase.storage
        .from("product-images")
        .upload(photo_path, photo);
      if (uploaded.error) return setMessage(uploaded.error.message);
    }
    const payload = {
      cafe_id: cafe.id,
      category_id: fd.get("category_id"),
      name: fd.get("name"),
      description: fd.get("description"),
      price_minor: Math.round(Number(fd.get("price")) * 100),
      photo_path,
      available: edit?.available ?? true,
      sort_order: edit?.sort_order ?? products.length,
    };
    const res = edit
      ? await supabase.from("products").update(payload).eq("id", edit.id)
      : await supabase.from("products").insert(payload);
    if (res.error) return setMessage(res.error.message);
    setShow(null);
    setEdit(null);
    load();
  }
  async function availability(p: any) {
    await supabase
      .from("products")
      .update({ available: !p.available })
      .eq("id", p.id);
    load();
  }
  async function move(
    table: "menu_categories" | "products",
    item: any,
    list: any[],
    delta: number,
  ) {
    const ordered = [...list].sort((a, b) => a.sort_order - b.sort_order);
    const index = ordered.findIndex((value) => value.id === item.id);
    const other = ordered[index + delta];
    if (!other) return;
    await Promise.all([
      supabase
        .from(table)
        .update({ sort_order: other.sort_order })
        .eq("id", item.id),
      supabase
        .from(table)
        .update({ sort_order: item.sort_order })
        .eq("id", other.id),
    ]);
    load();
  }
  async function renameCategory(category: any) {
    const name = prompt("Nouveau nom de la catégorie", category.name)?.trim();
    if (!name || name === category.name) return;
    const { error } = await supabase
      .from("menu_categories")
      .update({ name })
      .eq("id", category.id);
    if (error) setMessage(error.message);
    load();
  }
  return (
    <section className="content-panel">
      <div className="section-head">
        <div>
          <p className="eyebrow">Menu</p>
          <h2>Produits</h2>
          <p>Gérez les prix, les catégories et la disponibilité immédiate.</p>
        </div>
        <div>
          <button className="btn secondary" onClick={() => setShow("category")}>
            <Plus /> Catégorie
          </button>{" "}
          <button className="btn primary" onClick={() => setShow("product")}>
            <Plus /> Ajouter un produit
          </button>
        </div>
      </div>
      {message && <div className="alert error">{message}</div>}
      <div className="category-manager" aria-label="Ordre des catégories">
        {categories.map((category) => (
          <div key={category.id}>
            <strong>{category.name}</strong>
            <button
              aria-label={`Monter ${category.name}`}
              onClick={() => move("menu_categories", category, categories, -1)}
            >
              ↑
            </button>
            <button
              aria-label={`Descendre ${category.name}`}
              onClick={() => move("menu_categories", category, categories, 1)}
            >
              ↓
            </button>
            <button onClick={() => renameCategory(category)}>Renommer</button>
            <button
              onClick={async () => {
                await supabase
                  .from("menu_categories")
                  .update({ active: !category.active })
                  .eq("id", category.id);
                load();
              }}
            >
              {category.active ? "Désactiver" : "Activer"}
            </button>
          </div>
        ))}
      </div>
      <div className="product-grid">
        {products.map((p) => (
          <article className="product-card" key={p.id}>
            <div className="product-image">
              {p.photo_path ? (
                <img
                  src={
                    supabase.storage
                      .from("product-images")
                      .getPublicUrl(p.photo_path).data.publicUrl
                  }
                  alt=""
                />
              ) : (
                <Coffee />
              )}
            </div>
            <div>
              <span className={`badge ${p.available ? "active" : "suspended"}`}>
                {p.available ? "Disponible" : "Indisponible"}
              </span>
              <h3>{p.name}</h3>
              <strong className="price">
                {formatMoney(p.price_minor, cafe.currency)}
              </strong>
              <p>{p.description}</p>
              <div className="card-actions">
                <button
                  className="btn secondary"
                  onClick={() => {
                    setEdit(p);
                    setShow("product");
                  }}
                >
                  Modifier
                </button>
                <button className="link-btn" onClick={() => availability(p)}>
                  {p.available ? "Rendre indisponible" : "Rendre disponible"}
                </button>
                <button
                  className="icon-btn"
                  aria-label={`Monter ${p.name}`}
                  onClick={() =>
                    move(
                      "products",
                      p,
                      products.filter(
                        (item) => item.category_id === p.category_id,
                      ),
                      -1,
                    )
                  }
                >
                  ↑
                </button>
                <button
                  className="icon-btn"
                  aria-label={`Descendre ${p.name}`}
                  onClick={() =>
                    move(
                      "products",
                      p,
                      products.filter(
                        (item) => item.category_id === p.category_id,
                      ),
                      1,
                    )
                  }
                >
                  ↓
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
      {!products.length && (
        <div className="state-card">
          Aucun produit. Ajoutez une catégorie puis votre premier produit.
        </div>
      )}
      {show && (
        <div className="modal-backdrop">
          <section className="modal">
            <h2>
              {show === "category"
                ? "Nouvelle catégorie"
                : edit
                  ? "Modifier le produit"
                  : "Nouveau produit"}
            </h2>
            {show === "category" ? (
              <form onSubmit={saveCategory} className="form-grid">
                <label>
                  Nom
                  <input name="name" required autoFocus />
                </label>
                <div className="modal-actions">
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={() => setShow(null)}
                  >
                    Annuler
                  </button>
                  <button className="btn primary">Ajouter</button>
                </div>
              </form>
            ) : (
              <form onSubmit={saveProduct} className="form-grid">
                <label>
                  Nom
                  <input
                    name="name"
                    defaultValue={edit?.name}
                    required
                    autoFocus
                  />
                </label>
                <label>
                  Catégorie
                  <select
                    name="category_id"
                    defaultValue={edit?.category_id}
                    required
                  >
                    <option value="">Choisir…</option>
                    {categories.map((c) => (
                      <option value={c.id} key={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Description
                  <textarea
                    name="description"
                    defaultValue={edit?.description}
                  />
                </label>
                <label>
                  Prix ({cafe.currency})
                  <input
                    name="price"
                    type="number"
                    min="0"
                    step="0.01"
                    defaultValue={edit ? edit.price_minor / 100 : ""}
                    required
                  />
                </label>
                <label>
                  Photo 4:3
                  <input
                    name="photo"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                  />
                </label>
                <div className="modal-actions">
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={() => {
                      setShow(null);
                      setEdit(null);
                    }}
                  >
                    Annuler
                  </button>
                  <button className="btn primary">Enregistrer</button>
                </div>
              </form>
            )}
          </section>
        </div>
      )}
    </section>
  );
}

function Tables({ cafe }: { cafe: Cafe }) {
  const [tables, setTables] = useState<any[]>([]),
    [label, setLabel] = useState(""),
    [message, setMessage] = useState("");
  async function load() {
    const { data } = await supabase
      .from("cafe_tables")
      .select("*")
      .eq("cafe_id", cafe.id)
      .order("label");
    setTables(data || []);
  }
  useEffect(() => {
    load();
  }, [cafe.id]);
  async function create(e: FormEvent) {
    e.preventDefault();
    const { data, error } = await supabase.rpc("admin_create_table", {
      p_cafe_id: cafe.id,
      p_label: label,
    });
    if (error) return setMessage(error.message);
    setLabel("");
    await download(data.label, data.token, "png");
    load();
  }
  async function download(label: string, token: string, format: "png" | "pdf") {
    const base = import.meta.env.VITE_PUBLIC_MENU_URL || location.origin;
    const url = `${base}/${cafe.slug}?table=${encodeURIComponent(token)}`;
    const png = await QRCode.toDataURL(url, {
      width: 1024,
      margin: 3,
      color: { dark: "#2B2118", light: "#FFFDF8" },
    });
    if (format === "pdf") {
      const { jsPDF } = await import("jspdf");
      const pdf = new jsPDF();
      pdf.setFontSize(22);
      pdf.text(cafe.name, 105, 28, { align: "center" });
      pdf.setFontSize(16);
      pdf.text(label, 105, 40, { align: "center" });
      pdf.addImage(png, "PNG", 45, 52, 120, 120);
      pdf.setFontSize(11);
      pdf.text("Scannez pour consulter le menu et commander", 105, 184, {
        align: "center",
      });
      pdf.save(`${cafe.slug}-${label}.pdf`);
      return;
    }
    const a = document.createElement("a");
    a.href = png;
    a.download = `${cafe.slug}-${label}.png`;
    a.click();
  }
  async function rotate(t: any, format: "png" | "pdf") {
    if (
      !confirm(`Régénérer le QR de ${t.label} ? L’ancien lien sera invalidé.`)
    )
      return;
    const { data, error } = await supabase.rpc("admin_rotate_table_token", {
      p_table_id: t.id,
    });
    if (error) return setMessage(error.message);
    await download(t.label, data.token, format);
  }
  return (
    <section className="content-panel">
      <div className="section-head">
        <div>
          <p className="eyebrow">Tables & QR</p>
          <h2>Points de commande</h2>
        </div>
        <form className="inline-form" onSubmit={create}>
          <input
            aria-label="Libellé"
            placeholder="Table 07"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            required
          />
          <button className="btn primary">
            <Plus /> Créer
          </button>
        </form>
      </div>
      {message && <div className="alert error">{message}</div>}
      <div className="table-list">
        {tables.map((t) => (
          <article key={t.id}>
            <span className="qr-icon">
              <QrCode />
            </span>
            <div>
              <h3>{t.label}</h3>
              <p>
                {t.active ? "QR actif" : "Désactivée"} · secret affiché une
                seule fois
              </p>
            </div>
            <button className="btn secondary" onClick={() => rotate(t, "png")}>
              Nouveau PNG
            </button>
            <button className="btn secondary" onClick={() => rotate(t, "pdf")}>
              Nouveau PDF
            </button>
            <button
              className="link-btn"
              onClick={async () => {
                await supabase
                  .from("cafe_tables")
                  .update({ active: !t.active })
                  .eq("id", t.id);
                load();
              }}
            >
              {t.active ? "Désactiver" : "Activer"}
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

function Staff({ cafe }: { cafe: Cafe }) {
  const [staff, setStaff] = useState<any[]>([]),
    [message, setMessage] = useState(""),
    [form, setForm] = useState({ email: "", display_name: "" });
  async function load() {
    const { data } = await supabase
      .from("staff_profiles")
      .select("*")
      .eq("cafe_id", cafe.id);
    setStaff(data || []);
  }
  useEffect(() => {
    load();
  }, [cafe.id]);
  async function invite(e: FormEvent) {
    e.preventDefault();
    setMessage("Invitation en cours…");
    try {
      await invoke("admin-staff", {
        action: "invite",
        cafeId: cafe.id,
        ...form,
      });
      setForm({ email: "", display_name: "" });
      setMessage("Invitation envoyée.");
      load();
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  async function action(userId: string, active: boolean) {
    try {
      await invoke("admin-staff", {
        action: active ? "disable" : "enable",
        userId,
      });
      load();
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  return (
    <section className="content-panel">
      <div className="section-head">
        <div>
          <p className="eyebrow">Équipe</p>
          <h2>Serveurs</h2>
          <p>Les serveurs accèdent uniquement aux commandes de ce café.</p>
        </div>
      </div>
      <form className="invite-form" onSubmit={invite}>
        <label>
          Nom
          <input
            value={form.display_name}
            onChange={(e) => setForm({ ...form, display_name: e.target.value })}
            required
          />
        </label>
        <label>
          Email
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
          />
        </label>
        <button className="btn primary">
          <Users /> Inviter
        </button>
      </form>
      {message && <div className="alert info">{message}</div>}
      <div className="table-list">
        {staff.map((s) => (
          <article key={s.user_id}>
            <div className="cafe-avatar">{s.display_name?.[0] || "S"}</div>
            <div>
              <h3>{s.display_name}</h3>
              <p>{s.active ? "Compte actif" : "Compte désactivé"}</p>
            </div>
            <button
              className={`btn ${s.active ? "danger" : "primary"}`}
              onClick={() => action(s.user_id, s.active)}
            >
              {s.active ? "Désactiver" : "Réactiver"}
            </button>
            <button
              className="link-btn"
              onClick={() =>
                invoke("admin-staff", {
                  action: "reset",
                  userId: s.user_id,
                }).then(() => setMessage("Lien de réinitialisation envoyé."))
              }
            >
              Réinitialiser le mot de passe
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

function Orders({ cafe }: { cafe: Cafe }) {
  const [orders, setOrders] = useState<any[]>([]),
    [status, setStatus] = useState("");
  useEffect(() => {
    let q = supabase
      .from("orders")
      .select("*,cafe_tables(label),order_items(*)")
      .eq("cafe_id", cafe.id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (status) q = q.eq("status", status);
    q.then(({ data }) => setOrders(data || []));
  }, [cafe.id, status]);
  return (
    <section className="content-panel">
      <div className="section-head">
        <div>
          <p className="eyebrow">Supervision</p>
          <h2>Commandes</h2>
        </div>
        <select
          aria-label="Filtrer par statut"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">Tous les statuts</option>
          {Object.entries(ORDER_LABELS).map(([v, l]) => (
            <option value={v} key={v}>
              {l}
            </option>
          ))}
        </select>
      </div>
      <div className="orders-table">
        {orders.map((o) => (
          <article key={o.id}>
            <div>
              <strong>{o.public_ref}</strong>
              <small>
                {o.cafe_tables?.label} ·{" "}
                {new Date(o.created_at).toLocaleString("fr-MA")}
              </small>
            </div>
            <span className={`order-status ${o.status}`}>
              {ORDER_LABELS[o.status as OrderStatus]}
            </span>
            <p>
              {o.order_items
                ?.map((i: any) => `${i.quantity}× ${i.product_name_snapshot}`)
                .join(", ")}
            </p>
            <strong>{formatMoney(o.total_minor, o.currency)}</strong>
          </article>
        ))}
      </div>
      {!orders.length && (
        <div className="state-card">Aucune commande pour ce filtre.</div>
      )}
    </section>
  );
}

function Publication({ cafe }: { cafe: Cafe }) {
  const [message, setMessage] = useState(""),
    [loading, setLoading] = useState(false);
  async function publish() {
    setLoading(true);
    const { data, error } = await supabase.rpc("admin_publish_cafe", {
      p_cafe_id: cafe.id,
    });
    setMessage(error?.message || `Menu publié — version ${data?.version_no}.`);
    setLoading(false);
  }
  return (
    <section className="content-panel narrow">
      <p className="eyebrow">Mise en ligne</p>
      <h2>Publier le site</h2>
      <p>
        La publication crée un instantané cohérent de l’identité, des catégories
        et des produits. La disponibilité des produits reste immédiate.
      </p>
      <ul className="checklist">
        <li>✓ Identité et couleurs configurées</li>
        <li>✓ Au moins une catégorie active</li>
        <li>✓ Au moins un produit actif</li>
        <li>✓ URL publique : /{cafe.slug}</li>
      </ul>
      {message && <div className="alert info">{message}</div>}
      <button className="btn primary" disabled={loading} onClick={publish}>
        <Send /> {loading ? "Publication…" : "Publier maintenant"}
      </button>
    </section>
  );
}
