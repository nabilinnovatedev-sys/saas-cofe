export const ORDER_STATUSES = [
  "nouvelle",
  "acceptee",
  "en_preparation",
  "prete",
  "servie",
  "annulee",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_LABELS: Record<OrderStatus, string> = {
  nouvelle: "Nouvelle",
  acceptee: "Acceptée",
  en_preparation: "En préparation",
  prete: "Prête",
  servie: "Servie",
  annulee: "Annulée",
};

export const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  nouvelle: "acceptee",
  acceptee: "en_preparation",
  en_preparation: "prete",
  prete: "servie",
};

export const NEXT_ACTION: Partial<Record<OrderStatus, string>> = {
  nouvelle: "Accepter",
  acceptee: "Démarrer la préparation",
  en_preparation: "Déclarer prête",
  prete: "Marquer servie",
};

export function canTransition(
  from: OrderStatus,
  to: OrderStatus,
  reason?: string,
): boolean {
  if (to === "annulee")
    return !["servie", "annulee"].includes(from) && Boolean(reason?.trim());
  return NEXT_STATUS[from] === to;
}

export function formatMoney(
  minor: number,
  currency = "MAD",
  locale = "fr-MA",
): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(
    minor / 100,
  );
}

export function normalizeSlug(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 63);
}

function luminance(hex: string): number {
  const rgb = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}
export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}
export function accessibleBrandColor(hex: string): string {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return "#8B5E3C";
  if (contrastRatio(hex, "#FFFFFF") >= 4.5) return hex;
  let [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  while (
    contrastRatio(
      `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`,
      "#FFFFFF",
    ) < 4.5
  ) {
    r = Math.max(0, Math.round(r * 0.88));
    g = Math.max(0, Math.round(g * 0.88));
    b = Math.max(0, Math.round(b * 0.88));
  }
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

export type MenuProduct = {
  id: string;
  category_id: string;
  name: string;
  description: string | null;
  price_minor: number;
  photo_url: string | null;
  available: boolean;
  sort_order: number;
};
export type MenuCategory = {
  id: string;
  name: string;
  sort_order: number;
  products: MenuProduct[];
};
export type PublicMenu = {
  cafe: {
    id: string;
    name: string;
    slug: string;
    currency: string;
    description: string | null;
    primary_color: string;
    secondary_color: string;
    accent_color: string;
    logo_url: string | null;
    contact_phone?: string | null;
    contact_address?: string | null;
  };
  table: { valid: boolean; id: string | null; label: string | null };
  categories: MenuCategory[];
};

export type CartLine = {
  product: MenuProduct;
  quantity: number;
  note?: string;
};
export const cartTotal = (lines: CartLine[]) =>
  lines.reduce((sum, l) => sum + l.product.price_minor * l.quantity, 0);
