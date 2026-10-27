export const DEFAULT_MENU_LINK = "https://saas-cofe-tqyi.vercel.app/cafe-mondialito?preview=43868c8d-f8e8-4d0a-baaf-f550a5199221";
export const DEFAULT_MESSAGE = `Bonjour à l’équipe de {{name}}, je m’appelle Nabil. Je propose la création ou l’amélioration de menus digitaux et de sites web pour les cafés, à un tarif de lancement accessible. L’objectif : présenter vos spécialités, vos prix et ce qui distingue votre établissement, tout en facilitant l’accès au menu, à l’adresse et au contact depuis un téléphone. Une présence en ligne claire aide les clients à vous découvrir et à préparer leur visite. Seriez-vous intéressés par un exemple adapté à votre café ? Merci !

السلام عليكم فريق {{name}}، أنا نبيل. كنقدم خدمة إنشاء أو تحسين المينو الرقمي والمواقع الإلكترونية للمقاهي، بثمن رمزي فالبداية. الهدف هو نبرز التخصصات ديالكم، الأثمنة والحوايج اللي كتميز المقهى ديالكم، ونسهّل على الزبون يشوف المينو والعنوان ويتواصل معاكم من التلفون. حضور واضح فالإنترنت كيعاون الزبناء يتعرفو عليكم ويوجدو الزيارة ديالهم. واش مهتمين نوريكم مثال مناسب للمقهى ديالكم؟ شكراً!

شوفو مثال ديال المينو من هنا:
{{link}}`;

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_CONTACTS = 2000;
export type ImportedContact = { id: string; row: number; name: string; telephone: string; importError?: string };
export type PreparedContact = ImportedContact & { phone: string; error?: string; openKey: string };
export type ContactFilter = "all" | "todo" | "opened";

export function asciiDigits(value: string): string {
  return value.replace(/[٠-٩۰-۹]/g, (digit) => String(digit.charCodeAt(0) - (digit <= "٩" ? 0x660 : 0x6f0)));
}

export function countryCode(value: string): string {
  return asciiDigits(value).trim().replace(/^\+/, "");
}

// Numbers explicitly marked + / 00 are international and do not use the default country.
export function normalizePhone(raw: string, defaultCountry = "212"): { phone: string; error?: string } {
  const country = countryCode(defaultCountry);
  if (!/^[1-9]\d{0,2}$/.test(country)) return { phone: "", error: "Indicatif invalide (1 à 3 chiffres, sans zéro initial)." };
  const text = asciiDigits(raw).trim();
  if (!text) return { phone: "", error: "Numéro manquant." };
  if (!/^\+?[\d\s().\-\u2010-\u2015]+$/.test(text)) return { phone: "", error: "Numéro invalide : utilisez des chiffres, sans extension ni formule." };
  let phone = text.replace(/[\s().\-\u2010-\u2015+]/g, "");
  if (text.startsWith("+")) {
    // Already international.
  } else if (phone.startsWith("00")) {
    phone = phone.slice(2);
  } else if (phone.startsWith("0")) {
    phone = country + phone.slice(1);
  } else if (!phone.startsWith(country) && phone.length <= 10) {
    // Excel numeric cells can lose the national leading zero.
    phone = country + phone;
  }
  if (!/^[1-9]\d{7,14}$/.test(phone)) return { phone, error: "Numéro international attendu : 8 à 15 chiffres." };
  if (phone.startsWith("212") && !/^212[5-8]\d{8}$/.test(phone)) {
    return { phone, error: "Numéro marocain invalide (exemple : 0612345678)." };
  }
  return { phone };
}

export function personalizeMessage(template: string, name: string, link: string): string {
  // A single pass prevents names containing placeholders or `$&` from being interpreted.
  return template.replace(/\{\{\s*(name|link)\s*\}\}/g, (_, key: string) => key === "name" ? name : link.trim());
}

export function messageSettingsError(template: string, link: string): string | null {
  if (!template.trim()) return "Le message est vide.";
  if (template.length > 8000) return "Le modèle est limité à 8 000 caractères.";
  if (/\{\{\s*link\s*\}\}/.test(template)) {
    try {
      const url = new URL(link.trim());
      if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) throw new Error();
    } catch { return "Saisissez un lien complet commençant par https:// ou http://."; }
  }
  return null;
}

export function whatsappUrl(phone: string, message: string): string {
  if (!/^[1-9]\d{7,14}$/.test(phone)) throw new Error("Numéro WhatsApp invalide.");
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

export function prepareContacts(contacts: ImportedContact[], country: string): PreparedContact[] {
  const seen = new Set<string>();
  return contacts.map((contact) => {
    const { phone, error: phoneError } = normalizePhone(contact.telephone, country);
    let error = contact.importError || (!contact.name.trim() ? "Nom du café manquant." : undefined) || phoneError;
    if (!error && seen.has(phone)) error = "Doublon : ce numéro apparaît déjà dans la liste.";
    if (!error) seen.add(phone);
    return { ...contact, phone, error, openKey: `${contact.id}:${phone}` };
  });
}

export function filterContacts(contacts: PreparedContact[], search: string, filter: ContactFilter, opened: Set<string>): PreparedContact[] {
  const query = search.trim().toLocaleLowerCase();
  const digits = asciiDigits(query).replace(/[\s()+.\-]/g, "");
  return contacts.filter((contact) => {
    const matches = contact.name.toLocaleLowerCase().includes(query)
      || contact.telephone.toLocaleLowerCase().includes(query)
      || (!!digits && /^\d+$/.test(digits) && contact.phone.includes(digits));
    return matches && (filter === "all" || (filter === "opened" ? opened.has(contact.openKey) : !opened.has(contact.openKey)));
  });
}

export function validateContactFile(file: { name: string; size: number }): void {
  if (!/\.(xlsx|xls|csv)$/i.test(file.name)) throw new Error("Choisissez un fichier .xlsx, .xls ou .csv.");
  if (!file.size) throw new Error("Ce fichier est vide.");
  if (file.size > MAX_FILE_BYTES) throw new Error("Le fichier dépasse la limite de 5 Mo.");
}
