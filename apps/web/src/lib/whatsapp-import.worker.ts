import { parseContactWorkbook } from "./whatsapp-import";

self.onmessage = (event: MessageEvent<ArrayBuffer>) => {
  try { self.postMessage({ result: parseContactWorkbook(event.data) }); }
  catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : "Fichier illisible. Essayez un fichier Excel non protégé ou un CSV UTF-8." });
  }
};
