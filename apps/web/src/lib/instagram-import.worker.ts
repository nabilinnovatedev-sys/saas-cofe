import { parseInstagramContactWorkbook } from "./instagram-import";

self.onmessage = (event: MessageEvent<ArrayBuffer>) => {
  try { self.postMessage({ result: parseInstagramContactWorkbook(event.data) }); }
  catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : "Fichier illisible. Essayez un fichier Excel non protégé ou un CSV UTF-8." });
  }
};
