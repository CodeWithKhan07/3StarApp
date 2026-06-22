import * as XLSX from "xlsx";

export interface QuotationImportDraft {
  id: string;
  issueDate: string;
  validityDate: string;
  companyName: string;
  store: string;
  scopeOfWork: string;
  amount: number;
  followUpDate: string;
  remarks: string;
  crNumber: string;
  vatNumber: string;
  supplierBusinessName: string;
  supplierLegalName: string;
  supplierCity: string;
  supplierCountry: string;
  supplierPhone: string;
  supplierEmail: string;
  supplierWebsite: string;
  currency: string;
  subTotal: number;
  vatRate: number;
  vatAmount: number;
  totalAmount: number;
  termsAndConditions: string;
  lineItems: QuotationLineItem[];
}

export interface QuotationLineItem {
  serialNo: number;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

interface PdfTextItem {
  str: string;
  x: number;
  y: number;
}

const normalize = (value: unknown) =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();

function isoDate(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  const input = normalize(value);
  const match = input.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (!match) return /^\d{4}-\d{2}-\d{2}$/.test(input) ? input : "";

  const year = match[3].length === 2 ? `20${match[3]}` : match[3];
  return `${year}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
}

function addDays(date: string, days: number) {
  if (!date) return "";
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return "";
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function amount(value: unknown) {
  const parsed = Number(normalize(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function match(text: string, pattern: RegExp) {
  return normalize(text.match(pattern)?.[1]);
}

function quotationId(value: unknown) {
  const raw = normalize(value).replace(/^quotation\s*(?:no\.?|number)?\s*[:#-]?\s*/i, "");
  if (!raw) return "";
  return /^QT-/i.test(raw) ? raw : `QT-${raw}`;
}

function parsePdfLineItems(items: PdfTextItem[]): QuotationLineItem[] {
  const serials = items
    .filter((item) => item.x >= 65 && item.x <= 95 && item.y >= 400 && item.y <= 530 && /^\d+$/.test(item.str.trim()))
    .map((item) => ({ serialNo: Number(item.str), y: item.y }))
    .sort((a, b) => b.y - a.y);

  return serials.map((serial, index) => {
    const upper = index === 0 ? 530 : (serials[index - 1].y + serial.y) / 2;
    const lower = index === serials.length - 1 ? 415 : (serial.y + serials[index + 1].y) / 2;
    const row = items.filter((item) => item.y <= upper && item.y >= lower);
    const description = row
      .filter((item) => item.x >= 100 && item.x < 300)
      .sort((a, b) => b.y - a.y || a.x - b.x)
      .map((item) => normalize(item.str))
      .filter(Boolean)
      .join(" ");
    const numeric = (minimumX: number, maximumX: number) =>
      amount(row.find((item) => item.x >= minimumX && item.x < maximumX)?.str);

    return {
      serialNo: serial.serialNo,
      description,
      quantity: numeric(300, 330),
      unitPrice: numeric(330, 390),
      amount: numeric(390, 460),
    };
  }).filter((item) => item.description);
}

function parsePdfText(text: string, fileName: string, items: PdfTextItem[]): QuotationImportDraft {
  const compact = normalize(text);
  const issueDate = isoDate(match(compact, /\bDate\s*[:#-]?\s*(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})/i));
  const validityDays = Number(match(compact, /valid\s+for\s+(\d+)\s+days/i)) || 30;
  const client = match(compact, /Client\s*Name\s*[:#-]?\s*(.+?)(?=\s+Store\s*Name\b)/i);
  const storeName = match(compact, /Store\s*Name\s*[:#-]?\s*(.+?)(?=\s+Store\s*Location\b)/i);
  const location = match(compact, /Store\s*Location\s*[:#-]?\s*(.+?)(?=\s+(?:Sr\.?\s*No\.?|Description\s+of\s+Work)\b)/i);
  const scope = match(
    compact,
    /Description\s+of\s+Work\s*\/\s*Item\s+Qty\s+(.+?)(?=\s+3\s+Star\s+Automatic\s+Door|\s+TERMS\s*&\s*CONDITIONS)/i
  );
  const total = match(
    compact,
    /TOTAL\s+AMOUNT(?:\s*\([^)]*\))?\s*[:#-]?\s*([0-9,]+(?:\.\d{1,2})?)/i
  ) || match(compact, /Grand\s+Total\s*[:#-]?\s*([0-9,]+(?:\.\d{1,2})?)/i);
  const subTotal = amount(match(compact, /Sub-?Total\s*[:#-]?\s*([0-9,]+(?:\.\d{1,2})?)/i));
  const vatRate = amount(match(compact, /VAT\s*\(([0-9.]+)%\)/i));
  const vatAmount = amount(match(compact, /VAT\s*\([^)]+\)\s*[:#-]?\s*([0-9,]+(?:\.\d{1,2})?)/i));
  const cityCountry = match(compact, /City\s*:\s*(.+?)(?=\s+WhatsApp\s*:)/i).split(",");
  const lineItems = parsePdfLineItems(items);
  const terms = Array.from(compact.matchAll(/\b\d+\.\s+(.+?)(?=\s+\d+\.|\s+Sub-?Total\s*:)/gi))
    .map((entry, index) => `${index + 1}. ${normalize(entry[1])}`)
    .join("\n");

  const draft = {
    id: quotationId(match(compact, /Quotation\s*(?:No\.?|Number)\s*[:#-]?\s*([A-Z0-9/-]+)/i)),
    issueDate,
    validityDate: addDays(issueDate, validityDays),
    companyName: client,
    store: [storeName, location].filter(Boolean).join(" — "),
    scopeOfWork: scope,
    amount: amount(total),
    followUpDate: "",
    remarks: `Imported from ${fileName}${location ? `. Store location: ${location}.` : "."}`,
    crNumber: match(compact, /CR\s*No\.?\s*:\s*([0-9]+)/i),
    vatNumber: match(compact, /VAT\s*No\.?\s*:\s*([0-9]+)/i),
    supplierBusinessName: match(compact, /(3\s+Star\s+Automatic\s+Door\s*&\s*Maintenance\s+Works)/i),
    supplierLegalName: "",
    supplierCity: normalize(cityCountry[0]),
    supplierCountry: normalize(cityCountry.slice(1).join(",")),
    supplierPhone: match(compact, /WhatsApp\s*:\s*([+0-9 ]+)/i),
    supplierEmail: match(compact, /Email\s*:\s*([^\s|]+)/i),
    supplierWebsite: match(compact, /(https?:\/\/[^\s|]+)/i),
    currency: /\bSAR\b/i.test(compact) ? "SAR" : "SAR",
    subTotal,
    vatRate,
    vatAmount,
    totalAmount: amount(total),
    termsAndConditions: terms,
    lineItems,
  };

  if (!draft.companyName || !draft.scopeOfWork) {
    throw new Error(
      "The PDF text was readable, but the client name or scope of work could not be identified. Use a text-based quotation PDF with labeled fields."
    );
  }

  return draft;
}

async function parsePdf(file: File) {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // Load PDF.js' worker handler into the current bundle before creating the
  // document. This uses PDF.js' supported in-process worker path and works for
  // both Next static exports and Electron's custom app:// protocol, where a
  // separate worker URL is not guaranteed to resolve.
  await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const document = await getDocument({ data: bytes }).promise;
  const pages: string[] = [];
  const items: PdfTextItem[] = [];

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    content.items.forEach((item) => {
      if (!("str" in item) || !item.str.trim()) return;
      items.push({ str: item.str, x: item.transform[4], y: item.transform[5] });
    });
    pages.push(
      content.items
        .map((item) => ("str" in item ? item.str : ""))
        .filter(Boolean)
        .join(" ")
    );
  }

  return parsePdfText(pages.join(" "), file.name, items);
}

const aliases = {
  id: ["quotation no", "quotation number", "quote no", "quote number"],
  issueDate: ["issue date", "quotation date", "date"],
  validityDate: ["validity date", "valid until", "expiry date"],
  companyName: ["client name", "company name", "customer name", "company", "client"],
  store: ["store name", "store branch", "store", "branch"],
  location: ["store location", "location", "site"],
  scopeOfWork: ["description of work item", "description of work", "scope of work", "description"],
  amount: ["total amount", "quotation amount", "quote amount", "amount sar", "amount"],
} as const;

function heading(value: unknown) {
  return normalize(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function parseExcel(fileName: string, workbook: XLSX.WorkBook): QuotationImportDraft {
  for (const sheetName of workbook.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
      header: 1,
      raw: false,
      defval: "",
    });

    for (let rowIndex = 0; rowIndex < Math.min(rows.length, 30); rowIndex += 1) {
      const row = rows[rowIndex];
      const fields: Record<string, number> = {};

      row.forEach((cell, column) => {
        const label = heading(cell);
        for (const [field, options] of Object.entries(aliases)) {
          if (!(field in fields) && options.some((option) => label === option || label.includes(option))) {
            fields[field] = column;
          }
        }
      });

      if (!("companyName" in fields) || !("scopeOfWork" in fields) || Object.keys(fields).length < 4) continue;

      const record = rows.slice(rowIndex + 1).find((candidate) =>
        normalize(candidate[fields.companyName]) && normalize(candidate[fields.scopeOfWork])
      );
      if (!record) continue;

      const get = (field: string) => fields[field] == null ? "" : record[fields[field]];
      const location = normalize(get("location"));
      return {
        id: quotationId(get("id")),
        issueDate: isoDate(get("issueDate")),
        validityDate: isoDate(get("validityDate")),
        companyName: normalize(get("companyName")),
        store: [normalize(get("store")), location].filter(Boolean).join(" — "),
        scopeOfWork: normalize(get("scopeOfWork")),
        amount: amount(get("amount")),
        followUpDate: "",
        remarks: `Imported from ${fileName} (${sheetName}).`,
        crNumber: "",
        vatNumber: "",
        supplierBusinessName: "",
        supplierLegalName: "",
        supplierCity: "",
        supplierCountry: "",
        supplierPhone: "",
        supplierEmail: "",
        supplierWebsite: "",
        currency: "SAR",
        subTotal: amount(get("amount")),
        vatRate: 0,
        vatAmount: 0,
        totalAmount: amount(get("amount")),
        termsAndConditions: "",
        lineItems: [],
      };
    }
  }

  throw new Error(
    "No quotation table was found in the workbook. Include labeled columns for client, scope of work, quotation number, date, and amount."
  );
}

export async function parseQuotationDocument(file: File): Promise<QuotationImportDraft> {
  if (file.size > 30 * 1024 * 1024) {
    throw new Error("The quotation document exceeds the 30 MB import limit.");
  }

  const extension = file.name.toLowerCase().split(".").pop();
  if (extension === "pdf") return parsePdf(file);

  if (["xlsx", "xls", "xlsm", "xlsb", "ods", "csv"].includes(extension || "")) {
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
      return parseExcel(file.name, workbook);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("No quotation table")) throw error;
      throw new Error("The Excel quotation could not be read.");
    }
  }

  throw new Error("Upload a PDF, Excel, OpenDocument, or CSV quotation file.");
}
