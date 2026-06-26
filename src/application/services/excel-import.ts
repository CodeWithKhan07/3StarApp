import * as XLSX from "xlsx";
import type { BusinessDataSet, Client, Invoice, Project, Quotation } from "@/domain/entities/business";

type EntityName = "clients" | "projects" | "quotations" | "invoices";
type Row = unknown[];
type FieldAliases = Record<string, string[]>;
interface Detection { entity: EntityName; headerRow: number; map: Record<string, number>; score: number }

export interface ImportResult extends BusinessDataSet {
  fileName: string;
  warnings: string[];
  sheetMatches: Array<{ sheet: string; entity: EntityName; records: number }>;
}

const schemas: Record<EntityName, FieldAliases> = {
  clients: {
    companyName: ["company name", "client name", "customer name", "company", "client", "customer", "account name"],
    brandName: ["brand name", "trade name", "brand trade name"], contactPerson: ["contact person", "contact name", "representative"],
    mobile: ["mobile", "phone", "phone number", "contact number", "whatsapp"], email: ["email", "email address"], city: ["city", "location"],
    address: ["address", "customer address", "client address", "billing address"], country: ["country"],
    vatNumber: ["vat number", "vat no", "trn", "tax number"], crNumber: ["cr number", "cr no", "commercial registration"],
    storeName: ["store name", "branch", "store branch"], storeLocation: ["store location", "branch location"],
    contractStatus: ["contract status", "client status", "status"], remarks: ["remarks", "notes", "comments"],
  },
  projects: {
    id: ["project id", "project no", "project number", "job id", "job no"], company: ["company name", "client name", "customer name", "company", "client"],
    store: ["store branch", "store", "branch", "project store"], location: ["location", "site", "project location"], workDescription: ["work description", "scope of work", "description", "project description"],
    category: ["category", "work category", "project category"], quotationNo: ["quotation no", "quote no", "quotation number"], workOrderNo: ["wo no", "work order no", "po no"],
    value: ["project value sar", "project value", "contract value", "amount", "value"], startDate: ["start date", "project start"], expectedCompletion: ["expected completion", "exp completion", "due date"],
    actualCompletion: ["actual completion", "completion date"], status: ["project status", "status"], completion: ["completion", "completion percent", "progress", "progress percent"], remarks: ["remarks", "notes", "comments"],
  },
  quotations: {
    id: ["quotation no", "quotation number", "quote no", "quote number", "quotation id"], issueDate: ["issue date", "quotation date", "date"], validityDate: ["validity date", "valid until", "expiry date"],
    companyName: ["company name", "client name", "customer name", "company", "client"], store: ["store branch", "store", "branch"], scopeOfWork: ["scope of work", "work description", "description"],
    amount: ["amount sar", "quotation amount", "quote amount", "amount", "value"], status: ["quotation status", "quote status", "status"], followUpDate: ["follow up date", "followup date", "follow up"], remarks: ["remarks", "notes", "comments"],
  },
  invoices: {
    companyName: ["company name", "client name", "customer name", "company", "client"], project: ["project store", "project", "store", "branch"], id: ["invoice no", "invoice number", "invoice id"],
    invoiceDate: ["invoice date", "issue date", "date"], amount: ["invoice amount sar", "invoice amount", "amount", "total"], received: ["amt received sar", "amount received", "received", "paid amount"],
    paymentDate: ["payment date", "received date"], paymentMode: ["payment mode", "payment method", "method"], status: ["payment status", "invoice status", "status"],
    followUpDate: ["follow up date", "followup date", "follow up"], remarks: ["remarks", "notes", "comments"],
  },
};

const required: Record<EntityName, string[]> = { clients: ["companyName"], projects: ["company", "workDescription"], quotations: ["id", "companyName"], invoices: ["companyName", "id"] };
const normalize = (input: unknown) => String(input ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const stringValue = (input: unknown) => input instanceof Date ? input.toISOString().slice(0, 10) : String(input ?? "").trim();
const numberValue = (input: unknown) => { const value = Number(String(input ?? "").replace(/[^0-9.-]/g, "")); return Number.isFinite(value) ? value : 0; };
const statusValue = (input: unknown, fallback: string) => normalize(input).replaceAll(" ", "-") || fallback;

function headerMap(row: Row, aliases: FieldAliases) {
  const result: Record<string, number> = {};
  row.forEach((cell, index) => {
    const heading = normalize(cell);
    if (!heading) return;
    for (const [field, options] of Object.entries(aliases)) {
      if (!(field in result) && options.some((alias) => heading === normalize(alias) || heading.includes(normalize(alias)))) result[field] = index;
    }
  });
  return result;
}

function detectTable(rows: Row[]): Detection | null {
  let best: Detection | null = null;
  const candidates = rows.slice(0, 30);
  for (let headerRow = 0; headerRow < candidates.length; headerRow += 1) {
    const row = candidates[headerRow];
    for (const entity of Object.keys(schemas) as EntityName[]) {
      const map = headerMap(row, schemas[entity]);
      const fields = Object.keys(map);
      const requiredHits = required[entity].filter((field) => field in map).length;
      const score = fields.length + requiredHits * 2;
      if (requiredHits >= 1 && fields.length >= 3 && (!best || score > best.score)) best = { entity, headerRow, map, score };
    }
  }
  return best;
}

function pick(row: Row, map: Record<string, number>, field: string) { return map[field] == null ? "" : row[map[field]]; }
function uniqueBy<T>(items: T[], key: (item: T) => string) { const seen = new Set<string>(); return items.filter((item) => { const id = normalize(key(item)); if (!id || seen.has(id)) return false; seen.add(id); return true; }); }

function parseCompany(rows: Row[], current: BusinessDataSet["company"]) {
  const flat = rows.slice(0, 20).flat().map(stringValue).filter(Boolean);
  const joined = flat.join(" | ");
  const named = (label: RegExp) => joined.match(label)?.[1]?.trim() || "";
  const likelyName = flat.find((entry) => /automatic|maintenance|contract|trading|company|works/i.test(entry) && entry.length > 8 && !/dashboard|quotation|invoice|report/i.test(entry));
  return { ...current, businessName: likelyName || current.businessName, crNumber: named(/CR\s*(?:No\.?|Number)?\s*[:#-]?\s*([0-9]+)/i) || current.crNumber, vatNumber: named(/VAT\s*(?:No\.?|Number|Reg(?:istration)?)?\s*[:#-]?\s*([0-9]+)/i) || current.vatNumber, phone: named(/(?:WhatsApp|Phone|Mobile)\s*[:#-]?\s*([+0-9 ()-]+)/i) || current.phone };
}

export async function parseBusinessWorkbook(file: File, current: BusinessDataSet): Promise<ImportResult> {
  if (file.size > 30 * 1024 * 1024) throw new Error("The workbook exceeds the 30 MB import limit.");
  const bytes = await file.arrayBuffer();
  let workbook: XLSX.WorkBook;
  try { workbook = XLSX.read(bytes, { type: "array", cellDates: true, dense: true }); }
  catch { throw new Error("The file could not be read as an Excel, OpenDocument, or CSV workbook."); }
  const clients: Client[] = [], projects: Project[] = [], quotations: Quotation[] = [], invoices: Invoice[] = [];
  const warnings: string[] = [], sheetMatches: ImportResult["sheetMatches"] = [];
  let company = current.company;

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Row>(sheet, { header: 1, raw: false, defval: "" });
    company = parseCompany(rows, company);
    const table = detectTable(rows);
    if (!table) continue;
    let imported = 0;
    for (const row of rows.slice(table.headerRow + 1)) {
      const hasRequired = required[table.entity].some((field) => stringValue(pick(row, table.map, field)));
      if (!hasRequired) continue;
      if (table.entity === "clients") {
        const companyName = stringValue(pick(row, table.map, "companyName")); if (!companyName) continue;
        clients.push({ id: `C-${clients.length + 1}`, companyName, brandName: stringValue(pick(row, table.map, "brandName")), contactPerson: stringValue(pick(row, table.map, "contactPerson")), mobile: stringValue(pick(row, table.map, "mobile")), email: stringValue(pick(row, table.map, "email")), address: stringValue(pick(row, table.map, "address")), city: stringValue(pick(row, table.map, "city")), country: stringValue(pick(row, table.map, "country")), vatNumber: stringValue(pick(row, table.map, "vatNumber")), crNumber: stringValue(pick(row, table.map, "crNumber")), storeName: stringValue(pick(row, table.map, "storeName")), storeLocation: stringValue(pick(row, table.map, "storeLocation")), contractStatus: statusValue(pick(row, table.map, "contractStatus"), "active") as Client["contractStatus"], remarks: stringValue(pick(row, table.map, "remarks")) });
      } else if (table.entity === "projects") {
        projects.push({ id: stringValue(pick(row, table.map, "id")) || `PRJ-${projects.length + 1}`, company: stringValue(pick(row, table.map, "company")), store: stringValue(pick(row, table.map, "store")), workDescription: stringValue(pick(row, table.map, "workDescription")), category: stringValue(pick(row, table.map, "category")), value: numberValue(pick(row, table.map, "value")), startDate: stringValue(pick(row, table.map, "startDate")), expectedCompletion: stringValue(pick(row, table.map, "expectedCompletion")), completion: numberValue(pick(row, table.map, "completion")), status: statusValue(pick(row, table.map, "status"), "upcoming") as Project["status"], priority: "medium" });
      } else if (table.entity === "quotations") {
        quotations.push({ id: stringValue(pick(row, table.map, "id")) || `QT-${quotations.length + 1}`, issueDate: stringValue(pick(row, table.map, "issueDate")), validityDate: stringValue(pick(row, table.map, "validityDate")), companyName: stringValue(pick(row, table.map, "companyName")), scopeOfWork: stringValue(pick(row, table.map, "scopeOfWork")), amount: numberValue(pick(row, table.map, "amount")), status: statusValue(pick(row, table.map, "status"), "draft") as Quotation["status"], followUpDate: stringValue(pick(row, table.map, "followUpDate")) });
      } else {
        const amount = numberValue(pick(row, table.map, "amount")); const received = numberValue(pick(row, table.map, "received"));
        invoices.push({ id: stringValue(pick(row, table.map, "id")) || `INV-${invoices.length + 1}`, companyName: stringValue(pick(row, table.map, "companyName")), project: stringValue(pick(row, table.map, "project")), invoiceDate: stringValue(pick(row, table.map, "invoiceDate")), amount, received, paymentDate: stringValue(pick(row, table.map, "paymentDate")), paymentMode: stringValue(pick(row, table.map, "paymentMode")), status: statusValue(pick(row, table.map, "status"), received >= amount && amount > 0 ? "paid" : received > 0 ? "partial" : "pending") as Invoice["status"], followUpDate: stringValue(pick(row, table.map, "followUpDate")) });
      }
      imported += 1;
    }
    if (imported) sheetMatches.push({ sheet: sheetName, entity: table.entity, records: imported });
  }

  const result = { clients: uniqueBy(clients, (item) => item.companyName), projects: uniqueBy(projects, (item) => item.id), quotations: uniqueBy(quotations, (item) => item.id), invoices: uniqueBy(invoices, (item) => item.id) };
  if (!Object.values(result).some((items) => items.length)) throw new Error("No recognizable client, project, quotation, or invoice table was found. Include descriptive field headers and retry.");
  (Object.keys(result) as EntityName[]).forEach((entity) => { if (!result[entity].length) warnings.push(`No ${entity} records were detected; existing ${entity} will be retained.`); });
  return { fileName: file.name, company, ...result, warnings, sheetMatches };
}
