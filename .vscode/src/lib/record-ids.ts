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
