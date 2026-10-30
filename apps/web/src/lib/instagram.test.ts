import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { utils, write } from "xlsx";
import { parseInstagramContactWorkbook } from "./instagram-import";
import {
  DEFAULT_INSTAGRAM_MENU_LINK, DEFAULT_INSTAGRAM_MESSAGE, MAX_INSTAGRAM_CONTACTS,
  MAX_INSTAGRAM_FILE_BYTES, filterInstagramContacts, instagramMessageSettingsError,
  instagramProfileUrl, normalizeInstagramHandle, personalizeInstagramMessage,
  prepareInstagramContacts, validateInstagramContactFile,
} from "./instagram";

const csv = (text: string) => new TextEncoder().encode(text).buffer;
const contact = (id: string, name: string, instagram: string) => ({
  id, name, instagram, row: Number(id) + 1,
});

describe("Instagram account normalization", () => {
  it.each([
    ["@Cafe_Atlas", "cafe_atlas"],
    ["cafe.atlas", "cafe.atlas"],
    ["https://www.instagram.com/Cafe_Atlas/", "cafe_atlas"],
    ["instagram.com/cafe_atlas?hl=fr", "cafe_atlas"],
  ])("normalizes %s", (input, handle) => {
    expect(normalizeInstagramHandle(input)).toEqual({ handle });
  });

  it.each([
    "", "@café", "a".repeat(31), "cafe..atlas", "cafe.",
    "https://instagram.com/p/ABC", "https://example.com/cafe", "direct",
  ])("rejects invalid account %s", (input) => {
    expect(normalizeInstagramHandle(input).error).toBeTruthy();
  });

  it("builds a canonical HTTPS profile URL", () => {
    expect(instagramProfileUrl("cafe_atlas")).toBe("https://www.instagram.com/cafe_atlas/");
    expect(() => instagramProfileUrl("https://instagram.com/cafe_atlas")).toThrow();
  });
});

describe("Instagram message workflow", () => {
  it("personalizes French and Arabic text without recursively replacing content", () => {
    const message = personalizeInstagramMessage(DEFAULT_INSTAGRAM_MESSAGE, "Café Atlas & شمس", DEFAULT_INSTAGRAM_MENU_LINK);
    expect(message.match(/Café Atlas & شمس/g)).toHaveLength(2);
    expect(message).toContain(DEFAULT_INSTAGRAM_MENU_LINK);
    expect(message).not.toContain("{{name}}");
    expect(personalizeInstagramMessage("{{name}} / {{ name }} / {{link}}", "$& {{link}}", "https://example.com"))
      .toBe("$& {{link}} / $& {{link}} / https://example.com");
  });

  it("validates the editable message and link", () => {
    expect(instagramMessageSettingsError(DEFAULT_INSTAGRAM_MESSAGE, DEFAULT_INSTAGRAM_MENU_LINK)).toBeNull();
    expect(instagramMessageSettingsError("", DEFAULT_INSTAGRAM_MENU_LINK)).toBeTruthy();
    expect(instagramMessageSettingsError("{{link}}", "javascript:alert(1)")).toBeTruthy();
    expect(instagramMessageSettingsError("{{link}}", "https://user:pass@example.com")).toBeTruthy();
    expect(instagramMessageSettingsError("a".repeat(8001), "")).toBeTruthy();
    expect(instagramMessageSettingsError("Bonjour {{name}}", "")).toBeNull();
  });

  it("flags duplicate and incomplete rows, then filters by name, handle and copied state", () => {
    const contacts = prepareInstagramContacts([
      contact("1", "Atlas", "@Cafe_Atlas"),
      contact("2", "Atlas bis", "https://instagram.com/cafe_atlas/"),
      contact("3", "Jardin", "jardin.cafe"),
      contact("4", "", "sans_nom"),
    ]);
    expect(contacts[0].error).toBeUndefined();
    expect(contacts[1].error).toContain("Doublon");
    expect(contacts[3].error).toContain("Nom");
    const copied = new Set([contacts[0].openKey]);
    expect(filterInstagramContacts(contacts, "@cafe_atlas", "all", copied)).toHaveLength(2);
    expect(filterInstagramContacts(contacts, "JARDIN", "todo", copied)).toEqual([contacts[2]]);
    expect(filterInstagramContacts(contacts, "", "copied", copied)).toEqual([contacts[0]]);
  });
});

describe("local Instagram spreadsheet import", () => {
  it("imports the downloadable example CSV and prepares its accounts", () => {
    const bytes = readFileSync(new URL("../assets/contacts-instagram.csv", import.meta.url));
    const result = parseInstagramContactWorkbook(Uint8Array.from(bytes).buffer);
    expect(result.contacts).toHaveLength(3);
    expect(result.contacts[0]).toMatchObject({ name: "Café Exemple Atlas", instagram: "@cafe_exemple_atlas" });
    expect(result.contacts[2].name).toBe("مقهى المثال");
    expect(prepareInstagramContacts(result.contacts).every((row) => !row.error)).toBe(true);
  });

  it.each(["xlsx", "biff8"] as const)("imports a real %s workbook", (bookType) => {
    const book = utils.book_new();
    utils.book_append_sheet(book, utils.aoa_to_sheet([
      ["nom", "compte instagram"],
      ["Café numérique", "@cafe_numerique"],
      ["مقهى عربي", "https://instagram.com/maqha_arabi/"],
    ]), "Cafés");
    const result = parseInstagramContactWorkbook(write(book, { type: "array", bookType }));
    expect(result.sheetName).toBe("Cafés");
    expect(prepareInstagramContacts(result.contacts).map((row) => row.handle))
      .toEqual(["cafe_numerique", "maqha_arabi"]);
  });

  it("supports Arabic headers, ignores extra columns and preserves incomplete rows", () => {
    const result = parseInstagramContactWorkbook(csv(
      "الترتيب;اسم المقهى;حساب انستغرام;العنوان\n1;مثال;@maqha_exemple;الرباط\n2;;sans_nom;\n3;بدون حساب;;",
    ));
    expect(result.contacts).toHaveLength(3);
    expect(result.contacts[0]).toMatchObject({ name: "مثال", instagram: "@maqha_exemple" });
    expect(prepareInstagramContacts(result.contacts).filter((row) => row.error)).toHaveLength(2);
  });

  it("rejects ambiguous columns, formulas and unusable files", () => {
    expect(() => parseInstagramContactWorkbook(csv("nom;instagram;compte instagram\nAtlas;a;b"))).toThrow(/une seule colonne/);
    expect(() => parseInstagramContactWorkbook(csv("nom;telephone\nAtlas;0612345678"))).toThrow();
    expect(() => parseInstagramContactWorkbook(csv("nom;instagram"))).toThrow();

    const book = utils.book_new();
    const sheet = utils.aoa_to_sheet([["nom", "instagram"], ["Formule", "cafe_atlas"]]);
    sheet.B2 = { t: "s", f: 'HYPERLINK("https://example.com")', v: "cafe_atlas" };
    utils.book_append_sheet(book, sheet, "Contacts");
    const rows = parseInstagramContactWorkbook(write(book, { type: "array", bookType: "xlsx" })).contacts;
    expect(rows[0].importError).toContain("formule");
    expect(prepareInstagramContacts(rows)[0].error).toBeTruthy();
  });

  it("enforces file extension, size and row limits", () => {
    expect(() => validateInstagramContactFile({ name: "contacts.xlsx", size: 12 })).not.toThrow();
    expect(() => validateInstagramContactFile({ name: "contacts.exe", size: 12 })).toThrow();
    expect(() => validateInstagramContactFile({ name: "contacts.csv", size: 0 })).toThrow();
    expect(() => validateInstagramContactFile({ name: "contacts.csv", size: MAX_INSTAGRAM_FILE_BYTES + 1 })).toThrow();
    expect(() => parseInstagramContactWorkbook(new ArrayBuffer(0))).toThrow();
    const many = "nom;instagram\n" + Array.from({ length: MAX_INSTAGRAM_CONTACTS + 1 }, (_, index) => `Atlas;atlas_${index}`).join("\n");
    expect(() => parseInstagramContactWorkbook(csv(many))).toThrow(/Limite/);
  });
});
