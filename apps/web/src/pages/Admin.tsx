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
import { orderQr } from "../lib/order-qr";
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
import { MenuDesigner } from "../components/MenuDesigner";
import { ImageDropzone } from "../components/ImageDropzone";
import { menuImage } from "../components/MenuCatalog";

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
    [creating, setCreating] = useState(false),
    [sourceCafeId, setSourceCafeId] = useState(""),
    [createError, setCreateError] = useState(""),
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
    if (creating) return;
    setCreating(true);
    setCreateError("");
    try {
      const { data, error } = await supabase.rpc("admin_create_cafe", {
        p_name: form.name,
        p_slug: normalizeSlug(form.slug || form.name),
        p_currency: form.currency,
        p_timezone: form.timezone,
        p_source_cafe_id: sourceCafeId || null,
      });
      if (error) {
        const messages: Record<string, string> = {
          SOURCE_CAFE_NOT_FOUND: "Le café source n’existe plus. Choisissez un autre menu.",
          SOURCE_MENU_EMPTY: "Ce café ne contient aucun produit à copier.",
          SOURCE_CURRENCY_MISMATCH: "Utilisez la même devise que le café source pour copier ses prix.",
          FORBIDDEN: "Seul un administrateur peut créer un café et copier son menu.",
        };
        setCreateError(error.code === "23505"
          ? "Cette adresse publique existe déjà. Choisissez une autre adresse."
          : messages[error.message] || error.message);
        return;
      }
      if (!data?.id) throw new Error("Réponse de création invalide. Vérifiez la liste des cafés avant de réessayer.");
      navigate(`/admin/cafes/${data.id}/${sourceCafeId ? "menu" : "apercu"}`);
    } catch {
      setCreateError("Création non confirmée. Vérifiez votre connexion et la liste des cafés avant de réessayer.");
    } finally {
      setCreating(false);
    }
  }
  const menuSources = [...cafes].sort((a, b) =>
    Number(/mondialito/i.test(b.name)) - Number(/mondialito/i.test(a.name)) || a.name.localeCompare(b.name),
  );
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
        <button className="btn primary" onClick={() => { setCreateError(""); setShow(true); }}>
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
                  {order.cafes?.name} · {order.fulfillment_type === 'delivery' ? 'Livraison' : order.cafe_tables?.label}
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
        <div className="modal-backdrop" onMouseDown={() => { if (!creating) setShow(false); }}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-cafe-title"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h2 id="new-cafe-title">Nouveau café</h2>
            <p className="muted">
              L’établissement restera privé jusqu’à sa publication.
            </p>
            <form onSubmit={create} className="form-grid" aria-busy={creating}>
              <label>
                Nom
                <input
                  required
                  disabled={creating}
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
                  disabled={creating}
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
                  required
                  disabled={creating || !!sourceCafeId}
                  value={form.currency}
                  onChange={(e) =>
                    setForm({ ...form, currency: e.target.value.toUpperCase() })
                  }
                />
              </label>
              <label>
                Fuseau horaire
                <input
                  disabled={creating}
                  value={form.timezone}
                  onChange={(e) =>
                    setForm({ ...form, timezone: e.target.value })
                  }
                />
              </label>
              <label className="span-2">
                Menu de départ
                <select
                  value={sourceCafeId}
                  disabled={creating}
                  onChange={(e) => {
                    const source = cafes.find((c) => c.id === e.target.value);
                    setSourceCafeId(e.target.value);
                    setCreateError("");
                    if (source) setForm((current) => ({ ...current, currency: source.currency }));
                  }}
                >
                  <option value="">Menu vide — ajouter mes produits moi-même</option>
                  {menuSources.map((source) => (
                    <option key={source.id} value={source.id}>Copier le menu de {source.name}</option>
                  ))}
                </select>
                <small>
                  Copiez les catégories, produits, descriptions, prix et images en une seule fois.
                  Chaque café garde ensuite son propre menu : modifier la copie ne change jamais l’original.
                  Les produits masqués ou indisponibles conservent leur état. Aucun menu n’est publié automatiquement.
                </small>
              </label>
              {createError && <div className="alert error span-2" role="alert">{createError}</div>}
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn secondary"
                  disabled={creating}
                  onClick={() => setShow(false)}
                >
                  Annuler
                </button>
                <button className="btn primary" disabled={creating}>
                  {creating ? "Création en cours…" : sourceCafeId ? "Créer et copier le menu" : "Créer le café"}
                </button>
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
    ["identite", "Design & templates"],
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
        <Route path="menu" element={<Menu cafe={cafe} showDesigner />} />
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

export function StaffWorkspace() {
  const [profile, setProfile] = useState<any>(null);
  const [cafe, setCafe] = useState<Cafe | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return setError("Session introuvable.");
      const profileResult = await supabase
        .from("staff_profiles")
        .select("*")
        .eq("user_id", data.user.id)
        .single();
      if (profileResult.error || !profileResult.data?.cafe_id)
        return setError("Profil employé introuvable.");
      setProfile(profileResult.data);
      const cafeResult = await supabase
        .from("cafes")
        .select("*")
        .eq("id", profileResult.data.cafe_id)
        .single();
      if (cafeResult.error) return setError(cafeResult.error.message);
      setCafe(cafeResult.data);
    });
  }, []);
  if (error) return <main className="state-page error">{error}</main>;
  if (!profile || !cafe)
    return <main className="state-page">Chargement de votre espace…</main>;
  return (
    <div className="admin-shell">
      <aside className="sidebar">
        <div className="side-brand">
          <Coffee /> <span>{cafe.name}</span>
        </div>
        <p className="muted">Espace employé</p>
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
      <main className="admin-main">
        <header className="page-header">
          <div>
            <p className="eyebrow">Catalogue</p>
            <h1>{cafe.name}</h1>
            <p>Les actions disponibles dépendent des permissions de votre compte.</p>
          </div>
        </header>
        <Menu
          cafe={cafe}
          canManageCategories={profile.can_manage_categories}
          canManageProducts={profile.can_manage_products}
        />
      </main>
    </div>
  );
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

const Identity = MenuDesigner;
function Menu({
  cafe,
  showDesigner = false,
  canManageCategories = true,
  canManageProducts = true,
}: {
  cafe: Cafe;
  showDesigner?: boolean;
  canManageCategories?: boolean;
  canManageProducts?: boolean;
}) {
  const [categories, setCategories] = useState<any[]>([]),
    [products, setProducts] = useState<any[]>([]),
    [show, setShow] = useState<"category" | "product" | null>(null),
    [edit, setEdit] = useState<any>(null),
    [editCategory, setEditCategory] = useState<any>(null),
    [categoryImage, setCategoryImage] = useState<File | null>(null),
    [productImage, setProductImage] = useState<File | null>(null),
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
    let image_path = editCategory?.image_path || null;
    const image = categoryImage;
    if (image?.size) {
      if (image.size > 5_000_000) return setMessage("Image limitée à 5 Mo.");
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(image.type))
        return setMessage("Image JPEG, PNG ou WebP uniquement.");
      image_path = `${cafe.id}/category-${crypto.randomUUID()}.${image.name.split('.').pop()}`;
      const uploaded = await supabase.storage
        .from("product-images")
        .upload(image_path, image);
      if (uploaded.error) return setMessage(uploaded.error.message);
    }
    const payload = {
      cafe_id: cafe.id,
      name: fd.get("name"),
      image_path,
      sort_order: editCategory?.sort_order ?? categories.length,
    };
    const result = editCategory
      ? await supabase.from("menu_categories").update(payload).eq("id", editCategory.id)
      : await supabase.from("menu_categories").insert(payload);
    if (result.error) return setMessage(result.error.message);
    setShow(null);
    setEditCategory(null);
    setCategoryImage(null);
    load();
  }
  async function saveProduct(e: FormEvent) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget as HTMLFormElement);
    let photo_path = edit?.photo_path || null;
    const photo = productImage;
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
    setProductImage(null);
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
        <div className="menu-actions">
          {showDesigner && <Link className="btn secondary" to={`/admin/cafes/${cafe.id}/identite`}>Choisir un template</Link>}
          {canManageCategories && (
            <button className="btn secondary" onClick={() => setShow("category")}>
              <Plus /> Catégorie
            </button>
          )}
          {canManageProducts && (
            <button className="btn primary" onClick={() => setShow("product")}>
              <Plus /> Ajouter un produit
            </button>
          )}
        </div>
      </div>
      {message && <div className="alert error">{message}</div>}
      <div className="category-manager" aria-label="Ordre des catégories">
        {categories.map((category) => (
          <div key={category.id}>
            {category.image_path && (
              <img
                className="category-manager-image"
                src={supabase.storage.from("product-images").getPublicUrl(category.image_path).data.publicUrl}
                alt=""
              />
            )}
            <strong>{category.name}</strong>
            {canManageCategories && <>
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
            <button onClick={() => {
              setEditCategory(category);
              setShow("category");
            }}>Modifier</button>
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
            </>}
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
              {canManageProducts && <div className="card-actions">
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
              </div>}
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
                ? editCategory ? "Modifier la catégorie" : "Nouvelle catégorie"
                : edit
                  ? "Modifier le produit"
                  : "Nouveau produit"}
            </h2>
            {show === "category" ? (
              <form onSubmit={saveCategory} className="form-grid">
                <label>
                  Nom
                  <input name="name" defaultValue={editCategory?.name} required autoFocus />
                </label>
                <ImageDropzone label="Image de la catégorie" value={menuImage(editCategory?.image_path, 'product-images')} onFile={file => setCategoryImage(file)} />
                <div className="modal-actions">
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={() => {
                      setShow(null);
                      setEditCategory(null);
                      setCategoryImage(null);
                    }}
                  >
                    Annuler
                  </button>
                  <button className="btn primary">Enregistrer</button>
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
                <ImageDropzone label="Photo du produit" value={menuImage(edit?.photo_path, 'product-images')} onFile={file => setProductImage(file)} />
                <div className="modal-actions">
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={() => {
                      setShow(null);
                      setEdit(null);
                      setProductImage(null);
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
  const [deliveryEnabled, setDeliveryEnabled] = useState(false);
  const [deliveryLoading, setDeliveryLoading] = useState(true);
  const [deliveryQr, setDeliveryQr] = useState('');
  const base = (import.meta.env.VITE_PUBLIC_MENU_URL || location.origin).replace(/\/$/, '');
  const deliveryUrl = `${base}/${encodeURIComponent(cafe.slug)}?mode=delivery`;
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
    setDeliveryLoading(true);
    supabase.from('cafes').select('delivery_enabled').eq('id', cafe.id).single().then(({ data, error }) => {
      if (error) setMessage(error.message);
      else { setDeliveryEnabled(data.delivery_enabled); setDeliveryLoading(false); }
    });
  }, [cafe.id]);
  useEffect(() => { orderQr(deliveryUrl, 'Livraison').then(setDeliveryQr).catch(e => setMessage(e.message)); }, [deliveryUrl]);
  async function toggleDelivery() {
    setDeliveryLoading(true); setMessage('');
    const { error } = await supabase.from('cafes').update({ delivery_enabled: !deliveryEnabled }).eq('id', cafe.id);
    if (error) setMessage(error.message); else setDeliveryEnabled(!deliveryEnabled);
    setDeliveryLoading(false);
  }
  async function create(e: FormEvent) {
    e.preventDefault();
    const { data, error } = await supabase.rpc("admin_create_table", {
      p_cafe_id: cafe.id,
      p_label: label,
    });
    if (error) return setMessage(error.message);
    setLabel("");
    await download(data.label, data.token, "png").catch(e => setMessage(e.message));
    load();
  }
  async function download(label: string, token: string | null, format: "png" | "pdf") {
    const url = token === null ? deliveryUrl : `${base}/${encodeURIComponent(cafe.slug)}?table=${encodeURIComponent(token)}`;
    const centerLabel = token === null ? 'Livraison' : label.match(/\d+/)?.[0] || label;
    const png = await orderQr(url, centerLabel);
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
    await download(t.label, data.token, format).catch(e => setMessage(e.message));
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
      <div className="delivery-qr-panel">
        <div>
          <h3>Commandes en livraison</h3>
          <p>Activez la livraison pour ce café. Téléphone et position obligatoires avant confirmation.</p>
          <label className="delivery-switch"><input type="checkbox" checked={deliveryEnabled} disabled={deliveryLoading} onChange={toggleDelivery} /> {deliveryEnabled ? 'Livraison activée' : 'Activer la livraison'}</label>
          <p>Le QR livraison ouvre le menu avec le mode livraison présélectionné. Il ne correspond à aucune table. Le café doit être publié.</p>
          {base.includes('localhost') && <p className="alert warning">Pour scanner depuis un téléphone, configurez VITE_PUBLIC_MENU_URL avec l’adresse HTTPS publique, pas localhost.</p>}
          <div className="actions"><button className="btn secondary" disabled={!deliveryEnabled} onClick={() => void download('Livraison', null, 'png').catch(e => setMessage(e.message))}>QR livraison · PNG</button><button className="btn secondary" disabled={!deliveryEnabled} onClick={() => void download('Livraison', null, 'pdf').catch(e => setMessage(e.message))}>PDF</button></div>
        </div>
        {deliveryQr && <img src={deliveryQr} alt="QR du menu pour les commandes en livraison" width={180} height={180} />}
      </div>
      <p>Les nouveaux QR de table portent le numéro de la table au centre. Régénérer un QR invalide l’ancien.</p>
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
    [form, setForm] = useState({
      email: "",
      password: "",
      display_name: "",
      can_manage_categories: false,
      can_manage_products: false,
    });
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
        action: "create",
        cafeId: cafe.id,
        ...form,
      });
      setForm({
        email: "",
        password: "",
        display_name: "",
        can_manage_categories: false,
        can_manage_products: false,
      });
      setMessage("Compte employé créé.");
      load();
    } catch (e) {
      const detail = (e as Error).message;
      setMessage(
        detail.includes("EMAIL_ALREADY_EXISTS")
          ? "Cet email possède déjà un compte. Utilisez une autre adresse email."
          : detail,
      );
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
  async function permissions(
    userId: string,
    canManageCategories: boolean,
    canManageProducts: boolean,
  ) {
    try {
      await invoke("admin-staff", {
        action: "permissions",
        userId,
        can_manage_categories: canManageCategories,
        can_manage_products: canManageProducts,
      });
      setMessage("Permissions mises à jour.");
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
        <label>
          Mot de passe temporaire
          <input
            type="password"
            minLength={12}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required
          />
          <small>12 caractères minimum.</small>
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={form.can_manage_categories}
            onChange={(e) =>
              setForm({ ...form, can_manage_categories: e.target.checked })
            }
          />
          Peut modifier les catégories
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={form.can_manage_products}
            onChange={(e) =>
              setForm({ ...form, can_manage_products: e.target.checked })
            }
          />
          Peut modifier les produits
        </label>
        <button className="btn primary">
          <Users /> Créer le compte
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
              <small>
                Catégories : {s.can_manage_categories ? "édition" : "lecture"}
                {" · "}Produits : {s.can_manage_products ? "édition" : "lecture"}
              </small>
            </div>
            <button
              className={`btn ${s.active ? "danger" : "primary"}`}
              onClick={() => action(s.user_id, s.active)}
            >
              {s.active ? "Désactiver" : "Réactiver"}
            </button>
            <button
              className="btn secondary"
              onClick={() =>
                permissions(
                  s.user_id,
                  !s.can_manage_categories,
                  s.can_manage_products,
                )
              }
            >
              {s.can_manage_categories ? "Retirer catégories" : "Autoriser catégories"}
            </button>
            <button
              className="btn secondary"
              onClick={() =>
                permissions(
                  s.user_id,
                  s.can_manage_categories,
                  !s.can_manage_products,
                )
              }
            >
              {s.can_manage_products ? "Retirer produits" : "Autoriser produits"}
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
                {o.fulfillment_type === 'delivery' ? 'Livraison' : o.cafe_tables?.label} ·{" "}
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
