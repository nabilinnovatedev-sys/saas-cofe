import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import {
  Check, Copy, Download, ExternalLink, Eye, FileSpreadsheet, Instagram,
  Search, ShieldCheck, Trash2, X,
} from "lucide-react";
import { AdminShell } from "../components/AdminShell";
import {
  DEFAULT_INSTAGRAM_MENU_LINK, DEFAULT_INSTAGRAM_MESSAGE, MAX_INSTAGRAM_CONTACTS,
  filterInstagramContacts, instagramMessageSettingsError, instagramProfileUrl,
  personalizeInstagramMessage, prepareInstagramContacts, validateInstagramContactFile,
  type ImportedInstagramContact, type InstagramContactFilter, type PreparedInstagramContact,
} from "../lib/instagram";
import type { InstagramContactImport } from "../lib/instagram-import";
import sampleCsv from "../assets/contacts-instagram.csv?raw";
import sampleUrl from "../assets/contacts-instagram.csv?url";
import "./whatsapp.css";
import "./instagram.css";

const PAGE_SIZE = 25;
const FILTERS: { id: InstagramContactFilter; label: string }[] = [
  { id: "all", label: "Tous" }, { id: "todo", label: "À faire" }, { id: "copied", label: "Copiés" },
];

export default function InstagramMessages() {
  const [contacts, setContacts] = useState<ImportedInstagramContact[]>([]);
  const [copied, setCopied] = useState<Set<string>>(new Set());
  const [template, setTemplate] = useState(DEFAULT_INSTAGRAM_MESSAGE);
  const [link, setLink] = useState(DEFAULT_INSTAGRAM_MENU_LINK);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<InstagramContactFilter>("all");
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
  const dialog = useRef<HTMLDialogElement>(null);

  function stopImport() {
    worker.current?.terminate();
    worker.current = null;
    window.clearTimeout(timer.current);
  }
  useEffect(() => () => { generation.current++; stopImport(); }, []);

  const prepared = useMemo(() => prepareInstagramContacts(contacts), [contacts]);
  const valid = prepared.filter((contact) => !contact.error);
  const copiedCount = valid.filter((contact) => copied.has(contact.openKey)).length;
  const invalidCount = prepared.length - valid.length;
  const filtered = useMemo(
    () => filterInstagramContacts(prepared, search, filter, copied),
    [prepared, search, filter, copied],
  );
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const settingsError = instagramMessageSettingsError(template, link);
  const preview = prepared.find((contact) => contact.id === previewId);
  const previewMessage = preview ? personalizeInstagramMessage(template, preview.name, link) : "";
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
    try { validateInstagramContactFile(file); }
    catch (issue) { setError((issue as Error).message); return; }
    setImporting(true);
    const request = ++generation.current;
    try {
      const parser = new Worker(new URL("../lib/instagram-import.worker.ts", import.meta.url), { type: "module" });
      worker.current = parser;
      timer.current = window.setTimeout(
        () => failImport("Lecture trop longue. Réduisez le fichier puis réessayez. Votre liste précédente est conservée."),
        15000,
      );
      parser.onerror = () => failImport("Impossible de lire ce fichier localement. Essayez un CSV UTF-8 ou un classeur non protégé.");
      parser.onmessage = (event: MessageEvent<{ result?: InstagramContactImport; error?: string }>) => {
        if (request !== generation.current) return;
        if (event.data.error || !event.data.result) {
          failImport(event.data.error || "Fichier illisible.");
          return;
        }
        const result = event.data.result;
        stopImport();
        setContacts(result.contacts);
        setCopied(new Set());
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
    setContacts([]);
    setCopied(new Set());
    setPreviewId(null);
    setFileLabel("");
    setNotice("Liste et progression effacées de cette page.");
    setError("");
    setPage(1);
  }

  function showPreview(contact: PreparedInstagramContact) {
    setPreviewId(contact.id);
    dialog.current?.showModal();
  }

  async function copyMessage(contact: PreparedInstagramContact, message: string) {
    if (contact.error || settingsError) return;
    setError("");
    try {
      await navigator.clipboard.writeText(message);
      setCopied((previous) => new Set(previous).add(contact.openKey));
      setNotice(`Message pour @${contact.handle} copié. Ouvrez Instagram puis collez-le dans la conversation.`);
    } catch {
      setError("Copie impossible dans ce navigateur. Ouvrez l’aperçu et copiez le texte manuellement.");
    }
  }

  function copyButton(contact: PreparedInstagramContact, message: string) {
    return <button className="btn primary" disabled={!!contact.error || !!settingsError}
      title={contact.error || settingsError || ""} onClick={() => void copyMessage(contact, message)}>
      <Copy aria-hidden="true" /> Copier le message
    </button>;
  }

  function profileButton(contact: PreparedInstagramContact) {
    if (contact.error) return <button className="btn secondary" disabled title={contact.error}>
      <Instagram aria-hidden="true" /> Ouvrir Instagram
    </button>;
    return <a className="btn secondary" href={instagramProfileUrl(contact.handle)} target="_blank"
      rel="noopener noreferrer" referrerPolicy="no-referrer"
      aria-label={`Ouvrir le profil Instagram de ${contact.name} (nouvel onglet)`}>
      <Instagram aria-hidden="true" /> Ouvrir Instagram <ExternalLink size={14} aria-hidden="true" />
    </a>;
  }

  return <AdminShell>
    <div className="wa-page ig-page">
      <header className="page-header">
        <div><p className="eyebrow">Un café, un message</p><h1>Messages Instagram</h1>
          <p>Préparez, copiez puis envoyez chaque message vous-même depuis Instagram.</p></div>
        <span className="wa-privacy"><ShieldCheck aria-hidden="true" /> Import 100 % local</span>
      </header>

      <div className="wa-setup">
        <section className="wa-panel" aria-labelledby="ig-import-title">
          <p className="eyebrow">01 · Vos comptes</p><h2 id="ig-import-title">Importer une liste</h2>
          <label className={`wa-dropzone ${dragging ? "is-dragging" : ""} ${importing ? "is-busy" : ""}`}
            onDragOver={(event) => { event.preventDefault(); if (!importing) setDragging(true); }}
            onDragLeave={() => setDragging(false)} onDrop={dropFile}>
            <FileSpreadsheet size={32} aria-hidden="true" />
            <strong>{importing ? "Lecture locale en cours…" : "Déposez votre fichier ici"}</strong>
            <span>ou cliquez pour choisir un fichier</span>
            <small>XLSX, XLS ou CSV · 5 Mo maximum</small>
            <input type="file" accept=".xlsx,.xls,.csv" onChange={chooseFile} disabled={importing}
              aria-label="Importer un fichier de comptes Instagram" className="wa-file-input" />
          </label>
          <p className="wa-help">Première feuille uniquement, avec les colonnes <code>nom</code> et <code>instagram</code>.
            {" "}Les en-têtes <bdi>اسم المقهى</bdi> et <bdi>حساب انستغرام</bdi> sont aussi reconnus ; les autres colonnes sont ignorées.
            Jusqu’à {MAX_INSTAGRAM_CONTACTS.toLocaleString("fr-FR")} lignes. Vous pouvez utiliser <code>@compte</code>, le nom du compte ou l’URL du profil.</p>
          <a className="link-btn wa-example" href={sampleUrl} download="contacts-instagram.csv"><Download size={17} aria-hidden="true" /> Télécharger un exemple CSV</a>
          <button type="button" className="btn secondary wide" disabled={importing}
            onClick={() => void importFile(new File([sampleCsv], "contacts-instagram.csv", { type: "text/csv" }))}>Tester avec l’exemple</button>
          <p className="wa-help">L’exemple contient des comptes illustratifs : ne leur envoyez pas de message.</p>
          <p className="wa-help">Un nouvel import remplace la liste et sa progression. Rien n’est conservé après fermeture, rechargement ou changement de page.</p>
          {fileLabel && <p className="wa-file-label"><FileSpreadsheet size={16} aria-hidden="true" /><span>{fileLabel}</span></p>}
        </section>

        <section className="wa-panel" aria-labelledby="ig-template-title">
          <p className="eyebrow">02 · Votre message</p><h2 id="ig-template-title">Personnaliser le modèle</h2>
          <label className="wa-message-label" htmlFor="ig-link">Lien de votre exemple
            <input id="ig-link" type="url" value={link} maxLength={2000} onChange={(event) => setLink(event.target.value)} dir="ltr" />
          </label>
          {previewLink && <div className="wa-warning">Ce lien contient un aperçu administrateur : vos destinataires risquent de ne pas pouvoir l’ouvrir.
            <button type="button" className="link-btn" onClick={() => setLink(publicLink)}>Utiliser le lien public sans « preview »</button></div>}
          <label className="wa-message-label ig-message-label" htmlFor="ig-template">Message français et arabe
            <textarea id="ig-template" value={template} rows={12} maxLength={8000} dir="auto"
              onChange={(event) => setTemplate(event.target.value)} />
          </label>
          <p className="wa-help"><code>{"{{name}}"}</code> devient le nom du café dans les deux langues ; <code>{"{{link}}"}</code> devient le lien ci-dessus.</p>
          {settingsError && <p className="alert error" role="alert">{settingsError}</p>}
        </section>
      </div>

      <div aria-live="polite">{notice && <p className="wa-notice">{notice}</p>}</div>
      {error && <p className="alert error" role="alert">{error}</p>}

      <section className="wa-panel wa-list" aria-labelledby="ig-list-title" aria-busy={importing}>
        <div className="wa-list-heading"><div><p className="eyebrow">03 · À vous de jouer</p><h2 id="ig-list-title">Vos cafés à contacter</h2></div>
          {!!contacts.length && <button className="btn secondary" onClick={clearContacts} disabled={importing}><Trash2 aria-hidden="true" /> Effacer la liste</button>}</div>
        <div className="wa-progress">
          <strong>{copiedCount} / {valid.length} messages copiés</strong>
          <progress value={copiedCount} max={valid.length || 1} aria-label="Progression des messages copiés" />
          <small>{invalidCount} ligne{invalidCount > 1 ? "s" : ""} à corriger · {contacts.length} importée{contacts.length > 1 ? "s" : ""}</small>
        </div>
        <p className="wa-help">Instagram ne permet pas de préremplir ce message depuis un simple lien. Copiez le texte, ouvrez le profil, démarrez la conversation puis collez-le. « Copié » ne signifie pas « envoyé ».</p>
        <div className="wa-toolbar">
          <label className="search"><Search aria-hidden="true" /><input type="search" aria-label="Rechercher un café ou un compte Instagram"
            placeholder="Rechercher par nom ou @compte…" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} /></label>
          <div className="wa-filters" role="group" aria-label="Filtrer les comptes">{FILTERS.map((item) =>
            <button key={item.id} type="button" aria-pressed={filter === item.id} onClick={() => { setFilter(item.id); setPage(1); }}>{item.label}</button>)}</div>
        </div>
        {!contacts.length ? <div className="wa-empty"><Instagram size={34} aria-hidden="true" /><h3>Votre prochaine conversation commence ici</h3><p>Importez un fichier pour préparer un message pour chaque café.</p></div>
          : !filtered.length ? <div className="wa-empty"><h3>Aucun résultat</h3><p>Essayez un autre nom, compte ou filtre.</p></div>
          : <ul className="wa-contacts">{visible.map((contact) => {
            const message = personalizeInstagramMessage(template, contact.name, link);
            const isCopied = copied.has(contact.openKey);
            return <li key={contact.id} className={`wa-contact ${contact.error ? "has-error" : ""}`}>
              <div className="wa-contact-heading"><div><h3 dir="auto">{contact.name || "Nom manquant"}</h3>
                <p className="wa-phone" dir="ltr">{contact.handle ? `@${contact.handle}` : contact.instagram || "Compte manquant"}</p>
                <small>Ligne {contact.row} · Importé : <bdi>{contact.instagram || "—"}</bdi></small></div>
                <span className={`wa-status ${isCopied ? "is-opened" : ""}`}>{isCopied ? <><Check size={14} aria-hidden="true" /> Copié</> : contact.error ? "À corriger" : "À faire"}</span></div>
              {contact.error && <p className="wa-row-error">{contact.error}</p>}
              <p className="wa-message-snippet" dir="auto">{message}</p>
              <div className="wa-contact-actions">
                <button className="btn secondary" onClick={() => showPreview(contact)} aria-label={`Aperçu du message pour ${contact.name || `la ligne ${contact.row}`}`}><Eye aria-hidden="true" /> Aperçu</button>
                {copyButton(contact, message)}
                {profileButton(contact)}
                {isCopied && <button className="link-btn" onClick={() => setCopied((previous) => { const next = new Set(previous); next.delete(contact.openKey); return next; })}>Remettre à faire</button>}
              </div>
            </li>;
          })}</ul>}
        {filtered.length > PAGE_SIZE && <nav className="wa-pagination" aria-label="Pages des comptes">
          <button className="btn secondary" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Précédent</button>
          <span>Page {currentPage} / {pages} · {filtered.length} résultats</span>
          <button className="btn secondary" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>Suivant</button>
        </nav>}
        <p className="wa-help wa-respect">Contactez uniquement les établissements pour lesquels votre proposition est pertinente. Personnalisez votre approche et respectez toute demande de ne plus être contacté.</p>
      </section>

      <dialog ref={dialog} className="wa-dialog" aria-labelledby="ig-preview-title" onClose={() => setPreviewId(null)}>
        <div className="wa-dialog-heading"><h2 id="ig-preview-title">Aperçu · {preview?.name || "Message"}</h2><button className="icon-btn" autoFocus aria-label="Fermer l’aperçu" onClick={() => dialog.current?.close()}><X /></button></div>
        {preview && <><p className="wa-phone" dir="ltr">@{preview.handle || preview.instagram}</p>
          <div className="wa-message-full">{previewMessage.split("\n\n").map((paragraph, index) => <p key={index} dir="auto">{paragraph}</p>)}</div>
          <p className="wa-help">Copiez ce texte, ouvrez le profil Instagram, démarrez la conversation et collez le message. Aucun envoi automatique.</p>
          {preview.error && <p className="alert error">{preview.error}</p>}
          <div className="wa-contact-actions">{copyButton(preview, previewMessage)}{profileButton(preview)}</div></>}
      </dialog>
    </div>
  </AdminShell>;
}
