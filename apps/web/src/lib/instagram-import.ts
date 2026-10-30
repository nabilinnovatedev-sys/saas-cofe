import { read, set_cptable, utils, type CellObject, type WorkSheet } from "xlsx";
import * as codepages from "xlsx/dist/cpexcel.full.mjs";
import {
  MAX_INSTAGRAM_CONTACTS,
  MAX_INSTAGRAM_FILE_BYTES,
  type ImportedInstagramContact,
} from "./instagram";

export type InstagramContactImport = { contacts: ImportedInstagramContact[]; sheetName: string; blankRows: number };
const MAX_COLUMNS = 100;
set_cptable(codepages);

function header(value: string): string {
  const normalized = value.normalize("NFKD")
    .replace(/[\u0300-\u036f\u064b-\u065f\u0670\u0640]/g, "")
    .replace(/[\u200b-\u200f\u202a-\u202e\u2066-\u2069\uFEFF]/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ").trim().toLowerCase();
  if (["nom", "nom du cafe", "اسم المقهى"].includes(normalized)) return "nom";
  if ([
    "instagram", "instagram username", "username instagram", "instagram handle",
    "compte instagram", "profil instagram", "lien instagram", "حساب انستغرام",
    "حساب الانستغرام", "اسم المستخدم انستغرام",
  ].includes(normalized)) return "instagram";
  return normalized;
}

function cellText(cell?: CellObject): string {
  if (!cell || cell.v === undefined || cell.v === null) return "";
  if (cell.f || ["e", "d", "b"].includes(cell.t)) throw new Error("Utilisez du texte, pas une formule, une date ou une erreur Excel.");
  if (typeof cell.v === "number" && (!Number.isSafeInteger(cell.v) || cell.v < 0)) throw new Error("Valeur numérique invalide : utilisez du texte.");
  return String(cell.v).trim();
}

function sheetContacts(sheet: WorkSheet, sheetName: string): InstagramContactImport {
  if (!sheet["!ref"]) throw new Error("La première feuille est vide.");
  const range = utils.decode_range(sheet["!fullref"] || sheet["!ref"]);
  if (range.e.r + 1 > MAX_INSTAGRAM_CONTACTS + 1 || range.e.c + 1 > MAX_COLUMNS) {
    throw new Error(`Limite : ${MAX_INSTAGRAM_CONTACTS} lignes de contacts et ${MAX_COLUMNS} colonnes. Aucun import partiel n’a été effectué.`);
  }
  let headerRow = range.s.r;
  let names: string[] = [];
  for (; headerRow <= range.e.r; headerRow++) {
    names = Array.from({ length: range.e.c + 1 }, (_, col) => header(cellText(sheet[utils.encode_cell({ r: headerRow, c: col })])));
    if (names.some(Boolean)) break;
  }
  if (names.filter((name) => name === "nom").length !== 1 || names.filter((name) => name === "instagram").length !== 1) {
    throw new Error('La première feuille doit contenir une seule colonne de nom (« nom » ou « اسم المقهى ») et une seule colonne Instagram (« instagram », « compte instagram » ou « حساب انستغرام »).');
  }
  const nameCol = names.indexOf("nom");
  const instagramCol = names.indexOf("instagram");
  const contacts: ImportedInstagramContact[] = [];
  let blankRows = 0;
  for (let row = headerRow + 1; row <= range.e.r; row++) {
    const nameCell = sheet[utils.encode_cell({ r: row, c: nameCol })] as CellObject | undefined;
    const instagramCell = sheet[utils.encode_cell({ r: row, c: instagramCol })] as CellObject | undefined;
    const empty = (cell?: CellObject) => !cell?.f && (cell?.v == null || String(cell.v).trim() === "");
    if (empty(nameCell) && empty(instagramCell)) { blankRows++; continue; }
    let name = "", instagram = "", importError: string | undefined;
    try { name = cellText(nameCell); } catch (error) { importError = (error as Error).message; }
    try { instagram = cellText(instagramCell); } catch (error) { importError = (error as Error).message; }
    if (name.length > 200 || instagram.length > 300) importError = "Nom limité à 200 caractères et compte Instagram à 300 caractères.";
    contacts.push({
      id: `row-${row + 1}`,
      row: row + 1,
      name: name.slice(0, 200),
      instagram: instagram.slice(0, 300),
      importError,
    });
  }
  if (!contacts.length) throw new Error("Aucun contact trouvé sous les en-têtes.");
  return { contacts, sheetName, blankRows };
}

export function parseInstagramContactWorkbook(buffer: ArrayBuffer): InstagramContactImport {
  if (!buffer.byteLength || buffer.byteLength > MAX_INSTAGRAM_FILE_BYTES) throw new Error("Fichier vide ou supérieur à 5 Mo.");
  const workbook = read(buffer, {
    type: "array", sheets: 0, sheetRows: MAX_INSTAGRAM_CONTACTS + 2, raw: true,
    cellDates: true, cellFormula: true, cellHTML: false, bookVBA: false, codepage: 65001,
  });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName || !workbook.Sheets[sheetName]) throw new Error("Aucune feuille lisible dans ce fichier.");
  return sheetContacts(workbook.Sheets[sheetName], sheetName);
}
