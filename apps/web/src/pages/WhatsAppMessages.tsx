import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { Check, Download, Eye, FileSpreadsheet, MessageCircle, Search, ShieldCheck, Trash2, X } from "lucide-react";
import { AdminShell } from "../components/AdminShell";
import {
  DEFAULT_MENU_LINK, DEFAULT_MESSAGE, MAX_CONTACTS, countryCode, filterContacts,
  messageSettingsError, personalizeMessage, prepareContacts, validateContactFile, whatsappUrl,
  type ContactFilter, type ImportedContact, type PreparedContact,
} from "../lib/whatsapp";
import type { ContactImport } from "../lib/whatsapp-import";
import sampleCsv from "../assets/contacts-whatsapp.csv?raw";
import sampleUrl from "../assets/contacts-whatsapp.csv?url";
import "./whatsapp.css";

const PAGE_SIZE = 25;
const FILTERS: { id: ContactFilter; label: string }[] = [
  { id: "all", label: "Tous" }, { id: "todo", label: "À faire" }, { id: "opened", label: "Ouverts" },
];

export default function WhatsAppMessages() {
  const [contacts, setContacts] = useState<ImportedContact[]>([]);
  const [opened, setOpened] = useState<Set<string>>(new Set());
  const [template, setTemplate] = useState(DEFAULT_MESSAGE);
  const [link, setLink] = useState(DEFAULT_MENU_LINK);
  const [country, setCountry] = useState("212");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ContactFilter>("all");
  const [page, setPage] = useState(1);
  const [importing, setImporting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [fileLabel, setFileLabel] = useState("");
  const [previewId, setPreviewId] = useState<string | null>(null);
  const worker = useRef<Worker | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const generation = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  function stopImport() {
    worker.current?.terminate();
    worker.current = null;
    window.clearTimeout(timer.current);
  }
  useEffect(() => () => { generation.current++; stopImport(); }, []);

  const prepared = useMemo(() => prepareContacts(contacts, country), [contacts, country]);
  const valid = prepared.filter((contact) => !contact.error);
  const openedCount = valid.filter((contact) => opened.has(contact.openKey)).length;
  const invalidCount = prepared.length - valid.length;
  const filtered = useMemo(() => filterContacts(prepared, search, filter, opened), [prepared, search, filter, opened]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const settingsError = messageSettingsError(template, link)
    || (!/^[1-9]\d{0,2}$/.test(countryCode(country)) ? "Indicatif invalide : 1 à 3 chiffres, par exemple 212." : null);
  const preview = prepared.find((contact) => contact.id === previewId);
  const previewMessage = preview ? personalizeMessage(template, preview.name, link) : "";
  let previewLink = false;
  let publicLink = link;
  try {
    const url = new URL(link);
    previewLink = url.searchParams.has("preview");
    url.searchParams.delete("preview");
    publicLink = url.toString();
  } catch { /* Validated in settingsError. */ }

  function failImport(message: string) {
    stopImport();
    generation.current++;
    setImporting(false);
    setError(message);
  }

  async function importFile(file: File) {
    if (importing) return;
    setError("");
    setNotice("");
    try { validateContactFile(file); }
    catch (issue) { setError((issue as Error).message); return; }
    setImporting(true);
    const request = ++generation.current;
    try {
      const parser = new Worker(new URL("../lib/whatsapp-import.worker.ts", import.meta.url), { type: "module" });
      worker.current = parser;
      timer.current = window.setTimeout(() => failImport("Lecture trop longue. Réduisez le fichier puis réessayez. Votre liste précédente est conservée."), 15000);
      parser.onerror = () => failImport("Impossible de lire ce fichier localement. Essayez un CSV UTF-8 ou un classeur non protégé.");
      parser.onmessage = (event: MessageEvent<{ result?: ContactImport; error?: string }>) => {
        if (request !== generation.current) return;
        if (event.data.error || !event.data.result) {
          failImport(event.data.error || "Fichier illisible.");
          return;
        }
        const result = event.data.result;
        stopImport();
        setContacts(result.contacts);
        setOpened(new Set());
        setSearch("");
        setFilter("all");
        setPage(1);
        setPreviewId(null);
        setFileLabel(`${file.name} · ${result.sheetName}`);
        setNotice(`${result.contacts.length} lignes importées localement${result.blankRows ? ` · ${result.blankRows} lignes vides ignorées` : ""}.`);
        setImporting(false);
      };
      const buffer = await file.arrayBuffer();
      if (request === generation.current) parser.postMessage(buffer, [buffer]);
    } catch {
      if (request === generation.current) failImport("Lecture impossible. Vérifiez que le fichier est accessible et non protégé par un mot de passe.");
    }
  }

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void importFile(file);
  }
  function dropFile(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    if (importing) return;
    if (event.dataTransfer.files.length !== 1) { setError("Importez un seul fichier à la fois."); return; }
    void importFile(event.dataTransfer.files[0]);
  }
  function clearContacts() {
    dialog.current?.close();
    setContacts([]); setOpened(new Set()); setPreviewId(null);
    setFileLabel(""); setNotice("Liste et progression effacées de cette page."); setError(""); setPage(1);
  }
  function showPreview(contact: PreparedContact) {
    setPreviewId(contact.id);
    dialog.current?.showModal();
  }
  function markOpened(contact: PreparedContact) {
    // No request or sending API: the anchor navigation is initiated by the user only.
    setOpened((previous) => new Set(previous).add(contact.openKey));
  }
  function openButton(contact: PreparedContact, message: string) {
    if (contact.error || settingsError) return <button className="btn primary" disabled title={contact.error || settingsError || ""}>
      <MessageCircle aria-hidden="true" /> Ouvrir WhatsApp
    </button>;
    return <a className="btn primary" href={whatsappUrl(contact.phone, message)} target="_blank" rel="noopener noreferrer"
      referrerPolicy="no-referrer" onClick={() => markOpened(contact)} onAuxClick={(event) => { if (event.button === 1) markOpened(contact); }}
      aria-label={`Ouvrir WhatsApp pour ${contact.name} (nouvel onglet)`}>
      <MessageCircle aria-hidden="true" /> Ouvrir WhatsApp
    </a>;
  }

  return <AdminShell>
    <div className="wa-page">
      <header className="page-header">
        <div><p className="eyebrow">Un café, un message</p><h1>Messages WhatsApp</h1>
          <p>Préparez vos messages personnalisés. Vous gardez la main sur chaque envoi.</p></div>
        <span className="wa-privacy"><ShieldCheck aria-hidden="true" /> Import 100 % local</span>
      </header>
      <div className="wa-setup">
        <section className="wa-panel" aria-labelledby="wa-import-title">
          <p className="eyebrow">01 · Vos contacts</p><h2 id="wa-import-title">Importer une liste</h2>
          <label className={`wa-dropzone ${dragging ? "is-dragging" : ""} ${importing ? "is-busy" : ""}`}
            onDragOver={(event) => { event.preventDefault(); if (!importing) setDragging(true); }}
            onDragLeave={() => setDragging(false)} onDrop={dropFile}>
            <FileSpreadsheet size={32} aria-hidden="true" />
            <strong>{importing ? "Lecture locale en cours…" : "Déposez votre fichier ici"}</strong>
            <span>ou cliquez pour choisir un fichier</span>
            <small>XLSX, XLS ou CSV · 5 Mo maximum</small>
            <input ref={fileInput} type="file" accept=".xlsx,.xls,.csv" onChange={chooseFile} disabled={importing}
              aria-label="Importer un fichier de contacts" className="wa-file-input" />
          </label>
          <p className="wa-help">Première feuille uniquement, avec les colonnes <code>nom</code> et <code>telephone</code>.
            {" "}Les en-têtes <bdi>اسم المقهى</bdi> et <bdi>الهاتف المنشور</bdi> sont aussi reconnus ; les autres colonnes sont ignorées.
            Jusqu’à {MAX_CONTACTS.toLocaleString("fr-FR")} lignes. Format texte conseillé pour les téléphones.</p>
          <a className="link-btn wa-example" href={sampleUrl} download="contacts-whatsapp.csv"><Download size={17} aria-hidden="true" /> Télécharger un exemple CSV</a>
          <button type="button" className="btn secondary wide" disabled={importing}
            onClick={() => void importFile(new File([sampleCsv], "contacts-whatsapp.csv", { type: "text/csv" }))}>Tester avec l’exemple</button>
          <p className="wa-help">L’exemple contient des contacts illustratifs : ne leur envoyez pas de message.</p>
          <p className="wa-help">Un nouvel import remplace la liste et sa progression. Rien n’est conservé après fermeture, rechargement ou changement de page.</p>
          {fileLabel && <p className="wa-file-label"><FileSpreadsheet size={16} aria-hidden="true" /><span>{fileLabel}</span></p>}
        </section>
        <section className="wa-panel" aria-labelledby="wa-template-title">
          <p className="eyebrow">02 · Votre message</p><h2 id="wa-template-title">Personnaliser le modèle</h2>
          <div className="wa-settings">
            <label htmlFor="wa-country">Indicatif par défaut<input id="wa-country" value={country} inputMode="tel" maxLength={5}
              onChange={(event) => { setCountry(event.target.value); setPage(1); }} aria-describedby="wa-country-help" /></label>
            <label htmlFor="wa-link">Lien de votre exemple<input id="wa-link" type="url" value={link} maxLength={2000}
              onChange={(event) => setLink(event.target.value)} dir="ltr" /></label>
          </div>
          <p id="wa-country-help" className="wa-help">212 pour le Maroc : 0612345678 → 212612345678. Les préfixes + et 00 indiquent un numéro international.</p>
          {previewLink && <div className="wa-warning">Ce lien contient un aperçu administrateur : vos destinataires risquent de ne pas pouvoir l’ouvrir.
            <button type="button" className="link-btn" onClick={() => setLink(publicLink)}>Utiliser le lien public sans « preview »</button></div>}
          <label className="wa-message-label" htmlFor="wa-template">Message français et arabe
            <textarea id="wa-template" value={template} rows={10} maxLength={8000} dir="auto" onChange={(event) => setTemplate(event.target.value)} />
          </label>
          <p className="wa-help"><code>{"{{name}}"}</code> devient le nom du café dans les deux langues ; <code>{"{{link}}"}</code> devient le lien ci-dessus.</p>
          {settingsError && <p className="alert error" role="alert">{settingsError}</p>}
        </section>
      </div>
      <div aria-live="polite">{notice && <p className="wa-notice">{notice}</p>}</div>
      {error && <p className="alert error" role="alert">{error}</p>}
      <section className="wa-panel wa-list" aria-labelledby="wa-list-title" aria-busy={importing}>
        <div className="wa-list-heading"><div><p className="eyebrow">03 · À vous de jouer</p><h2 id="wa-list-title">Vos cafés à contacter</h2></div>
          {!!contacts.length && <button className="btn secondary" onClick={clearContacts} disabled={importing}><Trash2 aria-hidden="true" /> Effacer la liste</button>}</div>
        <div className="wa-progress">
          <strong>{openedCount} / {valid.length} contacts ouverts</strong>
          <progress value={openedCount} max={valid.length || 1} aria-label="Progression des contacts ouverts" />
          <small>{invalidCount} ligne{invalidCount > 1 ? "s" : ""} à corriger · {contacts.length} importée{contacts.length > 1 ? "s" : ""}</small>
        </div>
        <p className="wa-help">« Ouvert » signifie que vous avez cliqué sur le lien, pas que le message a été envoyé. Confirmez vous-même l’envoi dans WhatsApp ; aucun envoi automatique. Le contact et le texte sont transmis à WhatsApp uniquement à l’ouverture du lien.</p>
        <div className="wa-toolbar">
          <label className="search"><Search aria-hidden="true" /><input type="search" aria-label="Rechercher un café ou un numéro"
            placeholder="Rechercher par nom ou numéro…" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} /></label>
          <div className="wa-filters" role="group" aria-label="Filtrer les contacts">{FILTERS.map((item) =>
            <button key={item.id} type="button" aria-pressed={filter === item.id} onClick={() => { setFilter(item.id); setPage(1); }}>{item.label}</button>)}</div>
        </div>
        {!contacts.length ? <div className="wa-empty"><MessageCircle size={34} aria-hidden="true" /><h3>Votre prochaine conversation commence ici</h3><p>Importez un fichier pour préparer un message pour chaque café.</p></div>
          : !filtered.length ? <div className="wa-empty"><h3>Aucun résultat</h3><p>Essayez un autre nom, numéro ou filtre.</p></div>
          : <ul className="wa-contacts">{visible.map((contact) => {
            const message = personalizeMessage(template, contact.name, link);
            const isOpened = opened.has(contact.openKey);
            return <li key={contact.id} className={`wa-contact ${contact.error ? "has-error" : ""}`}>
              <div className="wa-contact-heading"><div><h3 dir="auto">{contact.name || "Nom manquant"}</h3>
                <p className="wa-phone" dir="ltr">{contact.phone ? `+${contact.phone}` : contact.telephone || "Téléphone manquant"}</p>
                <small>Ligne {contact.row} · Importé : <bdi>{contact.telephone || "—"}</bdi></small></div>
                <span className={`wa-status ${isOpened ? "is-opened" : ""}`}>{isOpened ? <><Check size={14} aria-hidden="true" /> Ouvert</> : contact.error ? "À corriger" : "À faire"}</span></div>
              {contact.error && <p className="wa-row-error">{contact.error}</p>}
              <p className="wa-message-snippet" dir="auto">{message}</p>
              <div className="wa-contact-actions"><button className="btn secondary" onClick={() => showPreview(contact)} aria-label={`Aperçu du message pour ${contact.name || `la ligne ${contact.row}`}`}><Eye aria-hidden="true" /> Aperçu du message</button>
                {openButton(contact, message)}
                {isOpened && <button className="link-btn" onClick={() => setOpened((previous) => { const next = new Set(previous); next.delete(contact.openKey); return next; })}>Remettre à faire</button>}</div>
            </li>;
          })}</ul>}
        {filtered.length > PAGE_SIZE && <nav className="wa-pagination" aria-label="Pages des contacts">
          <button className="btn secondary" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Précédent</button>
          <span>Page {currentPage} / {pages} · {filtered.length} résultats</span>
          <button className="btn secondary" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>Suivant</button>
        </nav>}
        <p className="wa-help wa-respect">Vérifiez les numéros et contactez uniquement les établissements pour lesquels votre proposition est pertinente. Respectez toute demande de ne plus être contacté.</p>
      </section>
      <dialog ref={dialog} className="wa-dialog" aria-labelledby="wa-preview-title" onClose={() => setPreviewId(null)}>
        <div className="wa-dialog-heading"><h2 id="wa-preview-title">Aperçu · {preview?.name || "Message"}</h2><button className="icon-btn" autoFocus aria-label="Fermer l’aperçu" onClick={() => dialog.current?.close()}><X /></button></div>
        {preview && <><p className="wa-phone" dir="ltr">+{preview.phone || preview.telephone}</p>
          <div className="wa-message-full">{previewMessage.split("\n\n").map((paragraph, index) => <p key={index} dir="auto">{paragraph}</p>)}</div>
          <p className="wa-help">Ce bouton prépare la conversation ; vous devrez encore cliquer sur « Envoyer » dans WhatsApp.</p>
          {preview.error && <p className="alert error">{preview.error}</p>}{openButton(preview, previewMessage)}</>}
      </dialog>
    </div>
  </AdminShell>;
}
