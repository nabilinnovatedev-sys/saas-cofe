export const DEFAULT_INSTAGRAM_MENU_LINK = "https://saas-cofe-tqyi.vercel.app/cafe-mondialito?preview=43868c8d-f8e8-4d0a-baaf-f550a5199221";

export const DEFAULT_INSTAGRAM_MESSAGE = `Bonjour {{name}} 👋

Je m’appelle Nabil. Je crée des menus digitaux et des sites web pour les cafés afin de présenter clairement leurs spécialités, leurs prix, leur adresse et leurs contacts sur téléphone.

J’ai préparé un exemple ici : {{link}}

Si cela vous intéresse, je peux vous montrer une version adaptée à votre café. Merci !

السلام عليكم {{name}} 👋

أنا نبيل، كنصايب المينو الرقمي والمواقع الإلكترونية للمقاهي باش يقدرو يبينو التخصصات، الأثمنة، العنوان وطرق التواصل بشكل واضح فالتلفون.

هذا مثال: {{link}}

إلا عجباتكم الفكرة نقدر نوريكم نسخة مناسبة للمقهى ديالكم. شكراً!`;

export const MAX_INSTAGRAM_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_INSTAGRAM_CONTACTS = 2000;

export type ImportedInstagramContact = {
  id: string;
  row: number;
  name: string;
  instagram: string;
  importError?: string;
};

export type PreparedInstagramContact = ImportedInstagramContact & {
  handle: string;
  error?: string;
  openKey: string;
};

export type InstagramContactFilter = "all" | "todo" | "copied";

const RESERVED_PATHS = new Set([
  "about", "accounts", "api", "developer", "direct", "directory", "emails",
  "explore", "legal", "p", "privacy", "reel", "reels", "stories", "terms", "web",
]);

export function normalizeInstagramHandle(raw: string): { handle: string; error?: string } {
  let value = raw.trim();
  if (!value) return { handle: "", error: "Compte Instagram manquant." };

  value = value.replace(/^@+/, "");
  if (/^(?:https?:\/\/)?(?:www\.)?instagram\.com\//i.test(value)) {
    try {
      const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
      if (!/(^|\.)instagram\.com$/i.test(url.hostname) || url.username || url.password) throw new Error();
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts.length !== 1) return { handle: "", error: "Utilisez un profil Instagram, pas une publication ou une conversation." };
      value = parts[0];
    } catch {
      return { handle: "", error: "Lien Instagram invalide." };
    }
  }

  value = value.toLowerCase();
  if (RESERVED_PATHS.has(value)) return { handle: value, error: "Ce lien ne correspond pas à un profil Instagram." };
  if (!/^[a-z0-9._]{1,30}$/.test(value)) {
    return { handle: value, error: "Identifiant invalide : 1 à 30 lettres, chiffres, points ou tirets bas." };
  }
  if (value.endsWith(".") || value.includes("..")) {
    return { handle: value, error: "Identifiant invalide : pas de point final ou de points consécutifs." };
  }
  return { handle: value };
}

export function instagramProfileUrl(handle: string): string {
  const normalized = normalizeInstagramHandle(handle);
  if (normalized.error || normalized.handle !== handle.toLowerCase()) throw new Error("Compte Instagram invalide.");
  return `https://www.instagram.com/${encodeURIComponent(normalized.handle)}/`;
}

export function personalizeInstagramMessage(template: string, name: string, link: string): string {
  return template.replace(/\{\{\s*(name|link)\s*\}\}/g, (_, key: string) => key === "name" ? name : link.trim());
}

export function instagramMessageSettingsError(template: string, link: string): string | null {
  if (!template.trim()) return "Le message est vide.";
  if (template.length > 8000) return "Le modèle est limité à 8 000 caractères.";
  if (/\{\{\s*link\s*\}\}/.test(template)) {
    try {
      const url = new URL(link.trim());
      if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) throw new Error();
    } catch {
      return "Saisissez un lien complet commençant par https:// ou http://.";
    }
  }
  return null;
}

export function prepareInstagramContacts(contacts: ImportedInstagramContact[]): PreparedInstagramContact[] {
  const seen = new Set<string>();
  return contacts.map((contact) => {
    const { handle, error: handleError } = normalizeInstagramHandle(contact.instagram);
    let error = contact.importError || (!contact.name.trim() ? "Nom du café manquant." : undefined) || handleError;
    if (!error && seen.has(handle)) error = "Doublon : ce compte apparaît déjà dans la liste.";
    if (!error) seen.add(handle);
    return { ...contact, handle, error, openKey: `${contact.id}:${handle}` };
  });
}

export function filterInstagramContacts(
  contacts: PreparedInstagramContact[],
  search: string,
  filter: InstagramContactFilter,
  copied: Set<string>,
): PreparedInstagramContact[] {
  const query = search.trim().toLocaleLowerCase().replace(/^@/, "");
  return contacts.filter((contact) => {
    const matches = contact.name.toLocaleLowerCase().includes(query)
      || contact.instagram.toLocaleLowerCase().includes(query)
      || contact.handle.includes(query);
    return matches && (filter === "all" || (filter === "copied" ? copied.has(contact.openKey) : !copied.has(contact.openKey)));
  });
}

export function validateInstagramContactFile(file: { name: string; size: number }): void {
  if (!/\.(xlsx|xls|csv)$/i.test(file.name)) throw new Error("Choisissez un fichier .xlsx, .xls ou .csv.");
  if (!file.size) throw new Error("Ce fichier est vide.");
  if (file.size > MAX_INSTAGRAM_FILE_BYTES) throw new Error("Le fichier dépasse la limite de 5 Mo.");
}
