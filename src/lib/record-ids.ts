export function createQuotationSerial() {
  const time = Date.now().toString(36).toUpperCase();
  const random = crypto.randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase();
  return `QSN-${time}-${random}`;
}

export function ensureQuotationSerial(id: string, existing?: string) {
  if (existing?.trim()) return existing.trim();
  const safe = id.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(-12) || "QUOTE";
  let hash = 2166136261;
  for (const character of id) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `QSN-${safe}-${(hash >>> 0).toString(36).toUpperCase()}`;
}

export function normalizeQuotationId(value: string) {
  return value.trim().toUpperCase();
}

export function normalizeInvoiceId(value: string) {
  return value.trim().toUpperCase();
}

export function createNextQuotationId(existingIds: string[], startAt = 150) {
  const highestNumericId = existingIds.reduce((highest, id) => {
    const trimmed = id.trim();

    if (!/^\d+$/.test(trimmed)) return highest;

    return Math.max(highest, Number(trimmed));
  }, startAt - 1);

  return String(highestNumericId + 1);
}

export function createNextInvoiceId(existingIds: string[], startAt = 85) {
  const highestNumericId = existingIds.reduce((highest, id) => {
    const trimmed = id.trim();
    const numericText = trimmed.match(/^(?:INV[-\s]*)?0*(\d+)$/i)?.[1];

    if (!numericText) return highest;

    return Math.max(highest, Number(numericText));
  }, startAt - 1);

  return `INV-${String(highestNumericId + 1).padStart(6, "0")}`;
}

// Project IDs advance from the highest existing numeric suffix so deletes
// cannot make a later create reuse an ID that is still present.
export function createNextProjectId(existingIds: string[], startAt = 1) {
  const highestNumericId = existingIds.reduce((highest, id) => {
    const numericText = id.trim().match(/^(?:PROJ[-\s]*)?0*(\d+)$/i)?.[1];

    if (!numericText) return highest;

    return Math.max(highest, Number(numericText));
  }, startAt - 1);

  return `PROJ-${String(highestNumericId + 1).padStart(5, "0")}`;
}
