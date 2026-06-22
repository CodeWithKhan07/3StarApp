const databaseName = "3star-local-attachments";
const storeName = "invoice-files";

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(storeName)) database.createObjectStore(storeName);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Local attachment database could not be opened."));
  });
}

export async function saveLocalInvoiceAttachment(key: string, file: File) {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).put({ blob: file, name: file.name, type: file.type }, key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("Attachment could not be saved locally."));
  });
  database.close();
}

export async function downloadLocalInvoiceAttachment(key: string) {
  const database = await openDatabase();
  const stored = await new Promise<{ blob: Blob; name: string } | undefined>((resolve, reject) => {
    const request = database.transaction(storeName, "readonly").objectStore(storeName).get(key);
    request.onsuccess = () => resolve(request.result as { blob: Blob; name: string } | undefined);
    request.onerror = () => reject(request.error);
  });
  database.close();
  if (!stored) throw new Error("The original attachment is not available on this device.");
  const url = URL.createObjectURL(stored.blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = stored.name;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
