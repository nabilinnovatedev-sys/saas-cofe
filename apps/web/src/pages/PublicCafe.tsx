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
import { MenuCatalog } from "../components/MenuCatalog";

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
  const [fulfillment, setFulfillment] = useState<'dine_in' | 'delivery'>(params.get('mode') === 'delivery' ? 'delivery' : 'dine_in');
  const [phone, setPhone] = useState('');
  const [position, setPosition] = useState<{ latitude: number; longitude: number; accuracy: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState('');
  const validPhone = /^\+?[0-9]{8,15}$/.test(phone.replace(/[\s().-]/g, ''));
  useEffect(() => {
    setPhone(''); setPosition(null); setLocationError('');
    setFulfillment(params.get('mode') === 'delivery' ? 'delivery' : 'dine_in');
  }, [slug, params]);
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
              "id,name,slug,currency,contact_phone,contact_address,status,delivery_enabled",
            )
            .eq("id", previewCafeId)
            .eq("slug", slug)
            .single(),
          supabase
            .from("cafe_branding")
            .select(
              "*",
            )
            .eq("cafe_id", previewCafeId)
            .maybeSingle(),
          supabase
            .from("menu_categories")
            .select("id,name,sort_order,image_path")
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
            template_id: branding?.template_id || "cafe",
            menu_background_color: branding?.menu_background_color,
            menu_background_end: branding?.menu_background_end,
            menu_animation: branding?.menu_animation,
            intro_style: branding?.intro_style,
            intro_background_color: branding?.intro_background_color,
            intro_text_color: branding?.intro_text_color,
            intro_accent_color: branding?.intro_accent_color,
            intro_surface_color: branding?.intro_surface_color,
            intro_duration_ms: branding?.intro_duration_ms,
            hero_background_type: branding?.hero_background_type || "color",
            hero_background_color:
              branding?.hero_background_color || "#F3E7D7",
            hero_background_url: branding?.hero_background_path || null,
            logo_position: branding?.logo_position || "overlap",
            contact_phone: cafe.contact_phone,
            contact_address: cafe.contact_address,
            delivery_enabled: cafe.delivery_enabled,
          },
          categories: (categoriesResult.data || []).map((category) => ({
            id: category.id,
            name: category.name,
            sort_order: category.sort_order,
            image_url: category.image_path,
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
  function locate() {
    setLocationError(''); setPosition(null);
    if (!navigator.geolocation || !window.isSecureContext) {
      setLocationError('La localisation nécessite HTTPS et un navigateur compatible.'); return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => { setPosition({ latitude: coords.latitude, longitude: coords.longitude, accuracy: coords.accuracy }); setLocating(false); },
      (e) => { setLocating(false); setLocationError(e.code === 1 ? 'Autorisez la localisation dans les réglages du navigateur, puis réessayez.' : 'Position introuvable. Activez le GPS et réessayez.'); },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  }
  async function submit() {
    if (!menu || isPreview || sending) return;
    if (fulfillment === 'delivery' && (!menu?.cafe.delivery_enabled || !validPhone || !position))
      return setSubmitError('Pour la livraison, entrez votre téléphone et partagez votre position.');
    if (fulfillment === 'dine_in' && !menu?.table.valid)
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
        fulfillmentType: fulfillment,
        customerPhone: fulfillment === 'delivery' ? phone : undefined,
        latitude: fulfillment === 'delivery' ? position?.latitude : undefined,
        longitude: fulfillment === 'delivery' ? position?.longitude : undefined,
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
      if (raw.includes('DELIVERY_DISABLED')) {
        setMenu(m => m ? { ...m, cafe: { ...m.cafe, delivery_enabled: false } } : m);
        setSubmitError('Ce café a désactivé la livraison.');
        setSending(false); return;
      }
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
    "--menu-background": menu.cafe.hero_background_color || "#fffdf8",
  } as React.CSSProperties;
  return (
    <main className="public-page" style={style}>
      {isPreview && (
        <div className="preview-banner">
          Aperçu administrateur — les clients ne voient pas encore cette
          version.
        </div>
      )}
      <MenuCatalog key={menu.cafe.id} menu={menu} fullScreenIntro onAdd={isPreview ? undefined : add} />
      {!isPreview && (menu.cafe.delivery_enabled || fulfillment === 'delivery') && <div className="delivery-banner" role="status">{menu.cafe.delivery_enabled ? 'Livraison disponible · choisissez Livraison dans votre panier.' : 'La livraison est actuellement indisponible pour ce café.'}</div>}
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
                  {fulfillment === 'delivery' ? 'Livraison' : menu.table.valid ? menu.table.label : "QR requis"}
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
              <fieldset className="delivery-checkout" disabled={sending}>
                <legend>Mode de commande</legend>
                <label><input type="radio" name="fulfillment" checked={fulfillment === 'dine_in'} onChange={() => setFulfillment('dine_in')} /> Sur place {menu.table.valid ? `· ${menu.table.label}` : '(QR de table requis)'}</label>
                {(menu.cafe.delivery_enabled || fulfillment === 'delivery') && <label><input type="radio" name="fulfillment" checked={fulfillment === 'delivery'} disabled={!menu.cafe.delivery_enabled} onChange={() => setFulfillment('delivery')} /> Livraison {!menu.cafe.delivery_enabled && '(indisponible)'}</label>}
                {fulfillment === 'delivery' && <div className="delivery-fields">
                  <label>Téléphone pour la livraison<input type="tel" autoComplete="tel" maxLength={25} placeholder="Ex. 0612345678 ou +212612345678" value={phone} disabled={!menu.cafe.delivery_enabled} onChange={e => setPhone(e.target.value)} required /></label>
                  {phone && !validPhone && <small>Entrez un numéro valide (8 à 15 chiffres).</small>}
                  <p>Votre numéro et votre position actuelle seront transmis à l’équipe de ce café pour vous livrer. Partagez votre position depuis le lieu de livraison.</p>
                  <button className="btn secondary" type="button" disabled={locating || !menu.cafe.delivery_enabled} onClick={locate}>{locating ? 'Localisation…' : position ? 'Actualiser ma position' : 'Autoriser et partager ma position'}</button>
                  {position && <p role="status">Position reçue · précision ±{Math.round(position.accuracy)} m. <a target="_blank" rel="noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${position.latitude},${position.longitude}`}>Vérifier sur la carte</a>{position.accuracy > 200 && ' Position approximative : rapprochez-vous d’une fenêtre et réessayez.'}</p>}
                  {locationError && <p role="alert">{locationError}</p>}
                </div>}
              </fieldset>
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
              {fulfillment === 'dine_in' && !menu.table.valid && (
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
                disabled={sending || !cart.length || hasUnavailable || (fulfillment === 'delivery' ? !menu.cafe.delivery_enabled || !validPhone || !position || locating : !menu.table.valid)}
                onClick={submit}
              >
                {sending ? "Envoi de la commande…" : fulfillment === 'delivery' ? "Confirmer la livraison" : "Envoyer la commande"}
              </button>
              <small>
                Évitez les informations sensibles dans les notes. Le téléphone et la position ne sont demandés que pour la livraison.
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
          Votre commande {order.fulfillment_type === 'delivery' ? 'en livraison' : 'pour'} <strong>{order.fulfillment_type === 'delivery' ? '' : order.table_label}</strong> a bien été
          transmise.
        </p>
        <ol className="timeline">
          {ORDER_STATUSES.filter((s) => s !== "annulee").map((s, i) => (
            <li className={i <= current ? "done" : ""} key={s}>
              <span>{i < current ? <Check /> : i + 1}</span>
              <div>
                <strong>{s === 'servie' && order.fulfillment_type === 'delivery' ? 'Livrée' : ORDER_LABELS[s]}</strong>
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
