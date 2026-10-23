import { useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronRight,
  Coffee,
  Minus,
  Plus,
  ShoppingBag,
  WifiOff,
  X,
} from "lucide-react";
import { useParams, useSearchParams } from "react-router-dom";
import {
  cartTotal,
  accessibleBrandColor,
  formatMoney,
  ORDER_LABELS,
  ORDER_STATUSES,
  type CartLine,
  type PublicMenu,
} from "@cafe/domain";
import { invoke, supabase } from "../lib/supabase";

type OrderResult = {
  order_id: string;
  public_ref: string;
  tracking_token: string;
  status: string;
};
const clamp = (n: number) => Math.max(1, Math.min(20, n));

export function PublicCafe() {
  const { slug } = useParams();
  const [params] = useSearchParams();
  const tableToken = params.get("table");
  const previewCafeId = params.get("preview");
  const isPreview = Boolean(previewCafeId);
  const [menu, setMenu] = useState<PublicMenu | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [cart, setCart] = useState<CartLine[]>([]),
    [open, setOpen] = useState(false),
    [sending, setSending] = useState(false),
    [submitError, setSubmitError] = useState("");
  const storageKey = `cafe-cart:${slug}`;
  useEffect(() => {
    try {
      setCart(JSON.parse(localStorage.getItem(storageKey) || "[]"));
    } catch {}
  }, [storageKey]);
  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(cart));
  }, [cart, storageKey]);
  async function load() {
    setLoading(true);
    setError("");
    if (previewCafeId) {
      const [cafeResult, brandingResult, categoriesResult, productsResult] =
        await Promise.all([
          supabase
            .from("cafes")
            .select(
              "id,name,slug,currency,contact_phone,contact_address,status",
            )
            .eq("id", previewCafeId)
            .eq("slug", slug)
            .single(),
          supabase
            .from("cafe_branding")
            .select(
              "description,primary_color,secondary_color,accent_color,logo_path",
            )
            .eq("cafe_id", previewCafeId)
            .maybeSingle(),
          supabase
            .from("menu_categories")
            .select("id,name,sort_order")
            .eq("cafe_id", previewCafeId)
            .eq("active", true)
            .order("sort_order"),
          supabase
            .from("products")
            .select(
              "id,category_id,name,description,price_minor,photo_path,available,sort_order",
            )
            .eq("cafe_id", previewCafeId)
            .eq("active", true)
            .order("sort_order"),
        ]);

      const previewError =
        cafeResult.error ||
        brandingResult.error ||
        categoriesResult.error ||
        productsResult.error;
      if (previewError || !cafeResult.data) {
        setError(
          "Aperçu indisponible. Reconnectez-vous avec un compte administrateur.",
        );
        setMenu(null);
      } else {
        const cafe = cafeResult.data;
        const branding = brandingResult.data;
        const products = productsResult.data || [];
        setMenu({
          cafe: {
            id: cafe.id,
            name: cafe.name,
            slug: cafe.slug,
            currency: cafe.currency,
            description: branding?.description || null,
            primary_color: branding?.primary_color || "#8B5E3C",
            secondary_color: branding?.secondary_color || "#557A64",
            accent_color: branding?.accent_color || "#D98C32",
            logo_url: branding?.logo_path || null,
            contact_phone: cafe.contact_phone,
            contact_address: cafe.contact_address,
          },
          categories: (categoriesResult.data || []).map((category) => ({
            ...category,
            products: products
              .filter((product) => product.category_id === category.id)
              .map(({ photo_path, ...product }) => ({
                ...product,
                photo_url: photo_path,
              })),
          })),
          table: { valid: false, id: null, label: null },
        });
      }
      setLoading(false);
      return;
    }
    const { data, error } = await supabase.rpc("public_get_menu", {
      p_slug: slug,
      p_table_token: tableToken,
    });
    if (error || !data) {
      setError("Ce café est introuvable ou temporairement indisponible.");
      setMenu(null);
    } else setMenu(data as PublicMenu);
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, [slug, tableToken, previewCafeId]);
  const count = cart.reduce((s, l) => s + l.quantity, 0),
    total = cartTotal(cart),
    hasUnavailable = cart.some((line) => !line.product.available);
  function add(p: any) {
    if (!p.available) return;
    setCart((c) => {
      const found = c.find((l) => l.product.id === p.id);
      return found
        ? c.map((l) =>
            l.product.id === p.id
              ? { ...l, quantity: clamp(l.quantity + 1) }
              : l,
          )
        : [...c, { product: p, quantity: 1 }];
    });
  }
  function qty(id: string, n: number) {
    setCart((c) =>
      n <= 0
        ? c.filter((l) => l.product.id !== id)
        : c.map((l) =>
            l.product.id === id ? { ...l, quantity: clamp(n) } : l,
          ),
    );
  }
  async function submit() {
    if (!menu?.table.valid)
      return setSubmitError("Scannez le QR de votre table pour commander.");
    if (!cart.length) return;
    setSending(true);
    setSubmitError("");
    let key = sessionStorage.getItem(`idem:${slug}`);
    if (!key) {
      key = crypto.randomUUID();
      sessionStorage.setItem(`idem:${slug}`, key);
    }
    try {
      const r = await invoke<OrderResult>("create-order", {
        slug,
        tableToken,
        idempotencyKey: key,
        items: cart.map((l) => ({
          productId: l.product.id,
          quantity: l.quantity,
          expectedPriceMinor: l.product.price_minor,
          note: l.note || null,
        })),
      });
      localStorage.removeItem(storageKey);
      sessionStorage.removeItem(`idem:${slug}`);
      location.href = `/suivi/${encodeURIComponent(r.tracking_token)}`;
    } catch (e) {
      const raw = (e as Error).message;
      if (raw.includes("CART_CHANGED")) {
        try {
          const payload = JSON.parse(raw);
          const changes = payload.changes || [];
          setCart((lines) =>
            lines.map((line) => {
              const change = changes.find(
                (value: any) => value.productId === line.product.id,
              );
              if (!change) return line;
              return {
                ...line,
                product: {
                  ...line.product,
                  available: change.reason !== "UNAVAILABLE",
                  price_minor: change.newPriceMinor ?? line.product.price_minor,
                },
              };
            }),
          );
          const priceChanges = changes
            .filter((value: any) => value.reason === "PRICE_CHANGED")
            .map(
              (value: any) =>
                `${formatMoney(value.oldPriceMinor, menu.cafe.currency)} → ${formatMoney(value.newPriceMinor, menu.cafe.currency)}`,
            );
          setSubmitError(
            `Votre panier a changé${priceChanges.length ? ` (${priceChanges.join(", ")})` : ""}. Retirez les produits indisponibles puis confirmez à nouveau.`,
          );
        } catch {
          setSubmitError(
            "Le prix ou la disponibilité d’un produit a changé. Vérifiez le panier.",
          );
        }
      } else {
        setSubmitError(
          "Impossible d’envoyer la commande. Votre panier est conservé; réessayez.",
        );
      }
      await load();
    } finally {
      setSending(false);
    }
  }
  if (loading) return <main className="public-state">Chargement du menu…</main>;
  if (error || !menu)
    return (
      <main className="public-state">
        <Coffee />
        <h1>Café indisponible</h1>
        <p>{error}</p>
      </main>
    );
  const style = {
    "--brand": accessibleBrandColor(menu.cafe.primary_color),
    "--secondary": menu.cafe.secondary_color,
    "--accent": menu.cafe.accent_color,
  } as React.CSSProperties;
  return (
    <main className="public-page" style={style}>
      {isPreview && (
        <div className="preview-banner">
          Aperçu administrateur — les clients ne voient pas encore cette
          version.
        </div>
      )}
      <header className="public-hero">
        <div className="hero-overlay">
          {menu.cafe.logo_url ? (
            <img
              className="public-logo"
              src={
                menu.cafe.logo_url.startsWith("http")
                  ? menu.cafe.logo_url
                  : supabase.storage
                      .from("cafe-branding")
                      .getPublicUrl(menu.cafe.logo_url).data.publicUrl
              }
              alt={`Logo ${menu.cafe.name}`}
            />
          ) : (
            <Coffee />
          )}
          <h1>{menu.cafe.name}</h1>
          <span className="ornament">◇</span>
          <p>{menu.cafe.description}</p>
          {menu.table.valid ? (
            <span className="table-pill">▣ {menu.table.label}</span>
          ) : (
            <span className="table-pill warning">Consultation uniquement</span>
          )}
        </div>
      </header>
      <nav className="category-nav" aria-label="Catégories">
        {menu.categories.map((c) => (
          <a href={`#cat-${c.id}`} key={c.id}>
            {c.name}
          </a>
        ))}
      </nav>
      <section className="menu-content">
        {menu.categories.map((c) => (
          <div key={c.id} id={`cat-${c.id}`}>
            <h2>{c.name}</h2>
            <div className="public-products">
              {c.products.map((p) => (
                <article
                  key={p.id}
                  className={!p.available ? "unavailable" : ""}
                >
                  <div className="public-product-image">
                    {p.photo_url ? (
                      <img
                        src={
                          p.photo_url.startsWith("http")
                            ? p.photo_url
                            : supabase.storage
                                .from("product-images")
                                .getPublicUrl(p.photo_url).data.publicUrl
                        }
                        alt=""
                      />
                    ) : (
                      <Coffee />
                    )}
                  </div>
                  <div className="public-product-copy">
                    <h3>{p.name}</h3>
                    {p.description && <p>{p.description}</p>}
                    <strong>
                      {formatMoney(p.price_minor, menu.cafe.currency)}
                    </strong>
                    {!p.available && <small>Indisponible</small>}
                  </div>
                  <button
                    aria-label={`Ajouter ${p.name}`}
                    disabled={!p.available}
                    onClick={() => add(p)}
                  >
                    <Plus />
                  </button>
                </article>
              ))}
            </div>
          </div>
        ))}
        {(menu.cafe.contact_address || menu.cafe.contact_phone) && (
          <footer className="public-contact">
            <h2>Nous trouver</h2>
            {menu.cafe.contact_address && <p>{menu.cafe.contact_address}</p>}
            {menu.cafe.contact_phone && (
              <a href={`tel:${menu.cafe.contact_phone}`}>
                {menu.cafe.contact_phone}
              </a>
            )}
          </footer>
        )}
      </section>
      {!isPreview && count > 0 && (
        <button className="cart-dock" onClick={() => setOpen(true)}>
          <ShoppingBag />
          <strong>Voir le panier</strong>
          <span>
            {count} article{count > 1 ? "s" : ""}
          </span>
          <b>{formatMoney(total, menu.cafe.currency)}</b>
          <ChevronRight />
        </button>
      )}
      {open && (
        <div className="drawer-backdrop" onMouseDown={() => setOpen(false)}>
          <section
            className="cart-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Votre panier"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <header>
              <div>
                <small>
                  {menu.table.valid ? menu.table.label : "QR requis"}
                </small>
                <h2>Votre panier</h2>
              </div>
              <button
                className="icon-btn"
                aria-label="Fermer"
                onClick={() => setOpen(false)}
              >
                <X />
              </button>
            </header>
            <div className="cart-lines">
              {cart.map((l) => (
                <article key={l.product.id}>
                  <div>
                    <h3>{l.product.name}</h3>
                    {!l.product.available && (
                      <small className="unavailable-text">
                        Indisponible — retirez ce produit
                      </small>
                    )}
                    <strong>
                      {formatMoney(
                        l.product.price_minor * l.quantity,
                        menu.cafe.currency,
                      )}
                    </strong>
                  </div>
                  <div className="quantity">
                    <button
                      aria-label="Retirer une unité"
                      onClick={() => qty(l.product.id, l.quantity - 1)}
                    >
                      <Minus />
                    </button>
                    <span>{l.quantity}</span>
                    <button
                      aria-label="Ajouter une unité"
                      onClick={() => qty(l.product.id, l.quantity + 1)}
                    >
                      <Plus />
                    </button>
                  </div>
                  <label>
                    Note pour ce produit
                    <input
                      maxLength={200}
                      value={l.note || ""}
                      placeholder="Ex. sans cannelle"
                      onChange={(e) =>
                        setCart((c) =>
                          c.map((x) =>
                            x.product.id === l.product.id
                              ? { ...x, note: e.target.value }
                              : x,
                          ),
                        )
                      }
                    />
                  </label>
                </article>
              ))}
            </div>
            <footer>
              <div className="cart-total">
                <span>Total</span>
                <strong>{formatMoney(total, menu.cafe.currency)}</strong>
              </div>
              {!menu.table.valid && (
                <div className="alert warning">
                  Scannez le QR de votre table pour commander.
                </div>
              )}
              {submitError && (
                <div className="alert error" role="alert">
                  {submitError}
                </div>
              )}
              <button
                className="btn primary wide"
                disabled={sending || !menu.table.valid || hasUnavailable}
                onClick={submit}
              >
                {sending ? "Envoi de la commande…" : "Envoyer la commande"}
              </button>
              <small>
                Aucune donnée personnelle n’est demandée. Évitez les
                informations sensibles dans les notes.
              </small>
            </footer>
          </section>
        </div>
      )}
    </main>
  );
}

export function Tracking() {
  const { token } = useParams();
  const [order, setOrder] = useState<any>(null),
    [error, setError] = useState(""),
    [offline, setOffline] = useState(!navigator.onLine);
  async function load() {
    try {
      setOrder(await invoke("track-order", { trackingToken: token }));
      setError("");
    } catch {
      setError(
        "Cette commande est introuvable ou le lien de suivi est invalide.",
      );
    }
  }
  useEffect(() => {
    load();
    const i = setInterval(load, 12000);
    const on = () => {
      setOffline(!navigator.onLine);
      if (navigator.onLine) load();
    };
    addEventListener("online", on);
    addEventListener("offline", on);
    return () => {
      clearInterval(i);
      removeEventListener("online", on);
      removeEventListener("offline", on);
    };
  }, [token]);
  if (error)
    return (
      <main className="public-state">
        <Coffee />
        <h1>Suivi indisponible</h1>
        <p>{error}</p>
      </main>
    );
  if (!order)
    return <main className="public-state">Chargement de la commande…</main>;
  const current = ORDER_STATUSES.indexOf(order.status);
  return (
    <main className="tracking-page">
      {offline && (
        <div className="offline">
          <WifiOff /> Connexion perdue — dernière information affichée.
        </div>
      )}
      <section className="tracking-card">
        <span className="success-icon">
          <Check />
        </span>
        <p className="eyebrow">Commande confirmée</p>
        <h1>{order.public_ref}</h1>
        <p>
          Votre commande pour <strong>{order.table_label}</strong> a bien été
          transmise.
        </p>
        <ol className="timeline">
          {ORDER_STATUSES.filter((s) => s !== "annulee").map((s, i) => (
            <li className={i <= current ? "done" : ""} key={s}>
              <span>{i < current ? <Check /> : i + 1}</span>
              <div>
                <strong>{ORDER_LABELS[s]}</strong>
                {s === order.status && <small>État actuel</small>}
              </div>
            </li>
          ))}
        </ol>
        {order.status === "annulee" && (
          <div className="alert error">
            Commande annulée
            {order.cancel_reason ? ` : ${order.cancel_reason}` : "."}
          </div>
        )}
        <div className="receipt">
          {order.items.map((i: any) => (
            <div key={i.id}>
              <span>
                {i.quantity}× {i.product_name_snapshot}
              </span>
              <strong>{formatMoney(i.line_total_minor, order.currency)}</strong>
            </div>
          ))}
          <div className="total">
            <span>Total</span>
            <strong>{formatMoney(order.total_minor, order.currency)}</strong>
          </div>
        </div>
        <button className="btn secondary wide" onClick={load}>
          Actualiser le suivi
        </button>
      </section>
    </main>
  );
}
