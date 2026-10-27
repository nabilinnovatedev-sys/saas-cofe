import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { utils, write } from "xlsx";
import { parseContactWorkbook } from "./whatsapp-import";
import {
  DEFAULT_MENU_LINK, DEFAULT_MESSAGE, MAX_CONTACTS, MAX_FILE_BYTES, filterContacts,
  messageSettingsError, normalizePhone, personalizeMessage, prepareContacts, validateContactFile, whatsappUrl,
} from "./whatsapp";

const csv = (text: string) => new TextEncoder().encode(text).buffer;
const contact = (id: string, name: string, telephone: string) => ({ id, name, telephone, row: Number(id) + 1 });

describe("phone normalization", () => {
  it.each([
    ["0612345678", "212612345678"], ["(06) 12-34-56-78", "212612345678"],
    ["+212 6 12 34 56 78", "212612345678"], ["00212 612345678", "212612345678"],
    ["212612345678", "212612345678"], ["612345678", "212612345678"],
    ["٠٦١٢٣٤٥٦٧٨", "212612345678"], ["۰۶۱۲۳۴۵۶۷۸", "212612345678"],
    ["+33 (6) 12 34 56 78", "33612345678"], ["0033612345678", "33612345678"],
  ])("normalizes %s", (input, phone) => expect(normalizePhone(input)).toEqual({ phone }));
  it("supports a configurable country without rewriting explicit international numbers", () => {
    expect(normalizePhone("0612345678", "+33").phone).toBe("33612345678");
    expect(normalizePhone("+212612345678", "33").phone).toBe("212612345678");
    expect(normalizePhone("0612345678", "0").error).toBeTruthy();
  });
  it.each(["", "123", "06123456", "06ABC345678", "=HYPERLINK(1)", "6.123E+8", "+2120612345678", "1234567890123456", "06+12345678"])("rejects invalid input %s", (input) => {
    expect(normalizePhone(input).error).toBeTruthy();
  });
});

describe("personalized messages and manual navigation", () => {
  it("replaces both name placeholders and the exact requested link", () => {
    const message = personalizeMessage(DEFAULT_MESSAGE, "Café Atlas & شمس", DEFAULT_MENU_LINK);
    expect(message.match(/Café Atlas & شمس/g)).toHaveLength(2);
    expect(message).toContain("السلام عليكم فريق Café Atlas & شمس");
    expect(message).toContain(DEFAULT_MENU_LINK);
    expect(message).not.toContain("{{name}}");
    expect(message).not.toContain("{{link}}");
  });
  it("encodes French, Arabic, newlines, ampersands and the preview query exactly once", () => {
    const message = personalizeMessage(DEFAULT_MESSAGE, "L’Étoile & مقهى", DEFAULT_MENU_LINK);
    const url = whatsappUrl("212612345678", message);
    expect(url).toBe(`https://wa.me/212612345678?text=${encodeURIComponent(message)}`);
    expect(new URL(url).searchParams.get("text")).toBe(message);
    expect(new URL(url).pathname).toBe("/212612345678");
  });
  it("does not recursively interpret placeholders or replacement patterns in names", () => {
    expect(personalizeMessage("{{name}} / {{ name }} / {{link}}", "$& {{link}}", "https://example.com"))
      .toBe("$& {{link}} / $& {{link}} / https://example.com");
  });
  it("validates editable message/link settings", () => {
    expect(messageSettingsError(DEFAULT_MESSAGE, DEFAULT_MENU_LINK)).toBeNull();
    expect(messageSettingsError("", DEFAULT_MENU_LINK)).toBeTruthy();
    expect(messageSettingsError("{{link}}", "javascript:alert(1)")).toBeTruthy();
    expect(messageSettingsError("{{link}}", "https://user:pass@example.com")).toBeTruthy();
    expect(messageSettingsError("a".repeat(8001), "")).toBeTruthy();
    expect(messageSettingsError("Bonjour {{name}}", "")).toBeNull();
    expect(() => whatsappUrl("0612345678", "Bonjour")).toThrow();
  });
  it("tracks unique opens and supports search, filters and country changes", () => {
    const contacts = prepareContacts([contact("1", "Atlas", "0612345678"), contact("2", "Jardin", "0712345678")], "212");
    const opened = new Set([contacts[0].openKey, contacts[0].openKey]);
    expect(opened.size).toBe(1);
    expect(filterContacts(contacts, "ATLAS", "all", opened)).toHaveLength(1);
    expect(filterContacts(contacts, "+212 7", "all", opened)).toEqual([contacts[1]]);
    expect(filterContacts(contacts, "", "todo", opened)).toEqual([contacts[1]]);
    expect(filterContacts(contacts, "", "opened", opened)).toEqual([contacts[0]]);
    expect(filterContacts(prepareContacts([contact("1", "Atlas", "0612345678")], "33"), "", "opened", opened)).toHaveLength(0);
  });
  it("flags invalid rows and normalized duplicate numbers without silently dropping them", () => {
    const rows = prepareContacts([contact("1", "Atlas", "0612345678"), contact("2", "Atlas bis", "+212612345678"), contact("3", "", "0712345678")], "212");
    expect(rows).toHaveLength(3);
    expect(rows[0].error).toBeUndefined();
    expect(rows[1].error).toContain("Doublon");
    expect(rows[2].error).toContain("Nom");
  });
});

describe("local spreadsheet import", () => {
  it("imports the downloadable example CSV with French and Arabic names", () => {
    const bytes = readFileSync(new URL("../assets/contacts-whatsapp.csv", import.meta.url));
    const result = parseContactWorkbook(Uint8Array.from(bytes).buffer);
    expect(result.contacts).toHaveLength(3);
    expect(result.contacts[0].name).toBe("Café Exemple Atlas");
    expect(result.contacts[0].telephone).toBe("0612345678");
    expect(result.contacts[2].name).toBe("مقهى المثال");
    expect(prepareContacts(result.contacts, "212").every((row) => !row.error)).toBe(true);
  });
  it.each(["xlsx", "biff8"] as const)("imports a real %s workbook with numeric and text phone cells", (bookType) => {
    const book = utils.book_new();
    utils.book_append_sheet(book, utils.aoa_to_sheet([
      ["nom", "telephone"], ["Café numérique", 612345678], ["مقهى عربي", "0712345678"],
    ]), "Cafés");
    const result = parseContactWorkbook(write(book, { type: "array", bookType }));
    expect(result.sheetName).toBe("Cafés");
    expect(result.contacts.map((row) => row.name)).toEqual(["Café numérique", "مقهى عربي"]);
    expect(prepareContacts(result.contacts, "212").map((row) => row.phone)).toEqual(["212612345678", "212712345678"]);
  });
  it("supports BOM, accented/case-insensitive headers, quoted commas, semicolons and multiline names", () => {
    const result = parseContactWorkbook(csv('\uFEFF NOM , Téléphone \r\n"Café, Atlas",0612345678\r\n"Café; Jardin\nAnnexe",0712345678'));
    expect(result.contacts[0].name).toBe("Café, Atlas");
    expect(result.contacts[1].name).toBe("Café; Jardin\nAnnexe");
  });
  it("uses only the first worksheet", () => {
    const book = utils.book_new();
    utils.book_append_sheet(book, utils.aoa_to_sheet([["nom", "telephone"], ["Premier", "0612345678"]]), "Première");
    utils.book_append_sheet(book, utils.aoa_to_sheet([["nom", "telephone"], ["Second", "0712345678"]]), "Seconde");
    expect(parseContactWorkbook(write(book, { type: "array", bookType: "xlsx" })).contacts.map((row) => row.name)).toEqual(["Premier"]);
  });
  it.each(["xlsx", "biff8"] as const)("imports Arabic café headers and ignores additional columns in %s", (bookType) => {
    const book = utils.book_new();
    const sheet = utils.aoa_to_sheet([
      ["الترتيب", "اسم المقهى", "الهاتف المنشور", "العنوان فالدار البيضاء", "رابط خرائط غوغل / المصدر", "الرابط الموجود فخانة الموقع", "الملاحظة على الحضور الرقمي"],
      [1, "Café Exemple", "0522123456", "Adresse exemple", "https://example.com/maps", "https://example.com", "ملاحظة"],
      [2, "مقهى تجريبي", 612345678, "", "", "", ""],
    ]);
    utils.book_append_sheet(book, sheet, "50 كافي إضافي");
    utils.book_append_sheet(book, utils.aoa_to_sheet([["كيفاش تستعمل اللائحة"]]), "تعليمات");
    const result = parseContactWorkbook(write(book, { type: "array", bookType }));
    expect(result.contacts.map(({ name, telephone }) => ({ name, telephone }))).toEqual([
      { name: "Café Exemple", telephone: "0522123456" }, { name: "مقهى تجريبي", telephone: "612345678" },
    ]);
    expect(prepareContacts(result.contacts, "212").map(({ phone }) => phone)).toEqual(["212522123456", "212612345678"]);
  });
  it("normalizes Arabic header direction marks, diacritics and whitespace", () => {
    const result = parseContactWorkbook(csv("\u200fإسم  المقهى;\u202bالهَاتف\nالمَنشور\u202c".replace("\n", " ") + "\nمثال;0612345678"));
    expect(result.contacts[0].name).toBe("مثال");
  });
  it("rejects ambiguous duplicate columns even when the aliases use different languages", () => {
    expect(() => parseContactWorkbook(csv("nom;اسم المقهى;الهاتف المنشور\nA;B;0612345678"))).toThrow(/une seule colonne/);
    expect(() => parseContactWorkbook(csv("اسم المقهى;telephone;الهاتف المنشور\nA;0612345678;0712345678"))).toThrow(/une seule colonne/);
  });
  it.each(["nom;email\nAtlas;a@b.c", "nom;telephone;telephone\nAtlas;0612345678;0712345678", "nom;telephone"])("rejects unusable headers or empty lists", (text) => {
    expect(() => parseContactWorkbook(csv(text))).toThrow();
  });
  it("ignores blank rows and preserves incomplete rows for correction", () => {
    const result = parseContactWorkbook(csv("nom;telephone\nAtlas;0612345678\n;\nSans numéro;\n;0712345678"));
    expect(result.contacts).toHaveLength(3);
    expect(result.blankRows).toBe(1);
    expect(prepareContacts(result.contacts, "212").filter((row) => row.error)).toHaveLength(2);
  });
  it("blocks spreadsheet formulas without executing them", () => {
    const book = utils.book_new();
    const sheet = utils.aoa_to_sheet([["nom", "telephone"], ["Formule", "0612345678"]]);
    sheet.B2 = { t: "s", f: 'HYPERLINK("https://example.com")', v: "0612345678" };
    utils.book_append_sheet(book, sheet, "Contacts");
    const rows = parseContactWorkbook(write(book, { type: "array", bookType: "xlsx" })).contacts;
    expect(rows[0].importError).toContain("formule");
    expect(prepareContacts(rows, "212")[0].error).toBeTruthy();
  });
  it("enforces size, extension and row limits without truncation", () => {
    expect(() => validateContactFile({ name: "contacts.xlsx", size: 12 })).not.toThrow();
    expect(() => validateContactFile({ name: "contacts.exe", size: 12 })).toThrow();
    expect(() => validateContactFile({ name: "contacts.csv", size: 0 })).toThrow();
    expect(() => validateContactFile({ name: "contacts.csv", size: MAX_FILE_BYTES + 1 })).toThrow();
    expect(() => parseContactWorkbook(new ArrayBuffer(0))).toThrow();
    const many = "nom;telephone\n" + Array.from({ length: MAX_CONTACTS + 1 }, () => "Atlas;0612345678").join("\n");
    expect(() => parseContactWorkbook(csv(many))).toThrow(/Limite/);
  });
});
