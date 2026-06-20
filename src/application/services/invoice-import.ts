import * as XLSX from "xlsx";

export interface InvoiceImportLineItem {
  id: string;
  description: string;
  quantity: number;
  unitCode: string;
  unitPrice: number;
  amount: number;
  vatRate: number;
}

export interface InvoiceImportDraft {
  id: string;
  uuid: string;
  invoiceDate: string;
  companyName: string;
  customerAddress: string;
  customerVatNumber: string;
  project: string;
  quotationNo: string;
  purchaseOrderNumber?: string;
  dueDate?: string;
  paymentTerms?: string;
  supplierName: string;
  supplierLegalName: string;
  supplierAddress: string;
  supplierCrNumber: string;
  supplierVatNumber: string;
  supplierPhone?: string;
  supplierEmail?: string;
  notes?: string;
  currency: string;
  subTotal: number;
  vatRate: number;
  vatAmount: number;
  discountAmount: number;
  amount: number;
  received: number;
  paymentDate: string;
  paymentMode: string;
  status: "pending" | "partial" | "paid" | "overdue";
  remarks: string;
  lineItems: InvoiceImportLineItem[];
}

const clean = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim();
const numberValue = (value: unknown) => {
  const parsed = Number(clean(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

function tag(text: string, name: string) {
  return clean(text.match(new RegExp(`<${name}(?:\\s+[^>]*)?>(.*?)<\\/\\s*${name}>`, "i"))?.[1]);
}

function section(text: string, name: string) {
  return clean(text.match(new RegExp(`<${name}(?:\\s+[^>]*)?>(.*?)<\\/\\s*${name}>`, "i"))?.[1]);
}

function xmlValues(text: string, localName: string) {
  const expression = new RegExp(
    `<\\s*(?:[a-z]+\\s*:\\s*)?${localName}\\b[^>]*>\\s*([^<]*)`,
    "gi"
  );
  return Array.from(text.matchAll(expression), (entry) => clean(entry[1])).filter(Boolean);
}

function xmlValueAfter(text: string, marker: RegExp, localName: string, occurrence = 0) {
  const index = text.search(marker);
  if (index < 0) return "";
  return xmlValues(text.slice(index), localName)[occurrence] || "";
}

function labeled(text: string, pattern: RegExp) {
  return clean(text.match(pattern)?.[1]);
}

function normalizedDate(value: string) {
  const numeric = value.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (numeric) {
    const year = numeric[3].length === 2 ? `20${numeric[3]}` : numeric[3];
    return `${year}-${numeric[2].padStart(2, "0")}-${numeric[1].padStart(2, "0")}`;
  }
  const named = new Date(value);
  return Number.isNaN(named.getTime()) ? "" : named.toISOString().slice(0, 10);
}

function parseUblInvoice(text: string, fileName: string): InvoiceImportDraft | null {
  const normalized = clean(text)
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replace(/<\s+/g, "<")
    .replace(/<\/\s+/g, "</")
    .replace(/\s+>/g, ">");
  const looksLikeUbl = /(?:UBLVersionID|InvoiceTypeCode|AccountingCustomerParty|DocumentCurrencyCode)/i.test(normalized);
  if (!looksLikeUbl || !/Issue\s*Date/i.test(normalized)) return null;

  const supplier = section(normalized, "cac:AccountingSupplierParty");
  const customer = section(normalized, "cac:AccountingCustomerParty");
  const monetary = section(normalized, "cac:LegalMonetaryTotal");
  const taxTotal = section(normalized, "cac:TaxTotal");
  const supplierTax = section(supplier, "cac:PartyTaxScheme");
  const supplierLegal = section(supplier, "cac:PartyLegalEntity");
  const customerTax = section(customer, "cac:PartyTaxScheme");
  const lines = Array.from(normalized.matchAll(/<cac:InvoiceLine(?:\s+[^>]*)?>(.*?)<\/\s*cac:InvoiceLine>/gi));
  const lineItems = lines.map((entry) => {
    const line = entry[1];
    const quantityTag = line.match(/<cbc:InvoicedQuantity(?:\s+unitCode="([^"]*)")?[^>]*>(.*?)<\/\s*cbc:InvoicedQuantity>/i);
    return {
      id: tag(line, "cbc:ID"),
      description: tag(section(line, "cac:Item"), "cbc:Name"),
      quantity: numberValue(quantityTag?.[2]),
      unitCode: clean(quantityTag?.[1]),
      unitPrice: numberValue(tag(section(line, "cac:Price"), "cbc:PriceAmount")),
      amount: numberValue(tag(line, "cbc:LineExtensionAmount")),
      vatRate: numberValue(tag(section(line, "cac:ClassifiedTaxCategory"), "cbc:Percent")),
    };
  });
  const supplierValues = xmlValues(supplier || normalized.slice(Math.max(0, normalized.search(/AccountingSupplierParty/i))), "CompanyID");
  const customerValues = xmlValues(customer || normalized.slice(Math.max(0, normalized.search(/AccountingCustomerParty/i))), "CompanyID");
  const taxRate = numberValue(tag(section(taxTotal, "cac:TaxCategory"), "cbc:Percent") || xmlValueAfter(normalized, /TaxSubtotal/i, "Percent"));
  const payable = numberValue(tag(monetary, "cbc:PayableAmount") || xmlValueAfter(normalized, /LegalMonetaryTotal/i, "PayableAmount"));
  const invoiceId = tag(normalized, "cbc:ID") || xmlValues(normalized, "ID").find((value) => /^INV[-/]/i.test(value)) || "";
  const invoiceDate = tag(normalized, "cbc:IssueDate") || xmlValueAfter(normalized, /Issue\s*Date/i, "IssueDate") || labeled(normalized, /Issue\s*Date\s*>\s*(\d{4}-\d{2}-\d{2})/i);
  const customerName = tag(section(customer, "cac:PartyName"), "cbc:Name") || xmlValueAfter(normalized, /AccountingCustomerParty/i, "Name");
  const totalAmount = payable || numberValue(tag(monetary, "cbc:TaxInclusiveAmount") || xmlValueAfter(normalized, /LegalMonetaryTotal/i, "TaxInclusiveAmount"));

  if (!customerName || !totalAmount) return null;

  return {
    id: invoiceId,
    uuid: tag(normalized, "cbc:UUID") || xmlValues(normalized, "UUID")[0] || "",
    invoiceDate,
    companyName: customerName,
    customerAddress: tag(section(customer, "cac:PostalAddress"), "cbc:StreetName") || xmlValueAfter(normalized, /AccountingCustomerParty/i, "StreetName"),
    customerVatNumber: tag(customerTax, "cbc:CompanyID") || customerValues[0] || "",
    project: "",
    quotationNo: tag(section(normalized, "cac:ContractDocumentReference"), "cbc:ID") || "",
    purchaseOrderNumber: tag(section(normalized, "cac:OrderReference"), "cbc:ID") || "",
    dueDate: tag(normalized, "cbc:DueDate") || "",
    paymentTerms: tag(section(normalized, "cac:PaymentTerms"), "cbc:Note") || "",
    supplierName: tag(section(supplier, "cac:PartyName"), "cbc:Name") || xmlValueAfter(normalized, /AccountingSupplierParty/i, "Name"),
    supplierLegalName: tag(supplierLegal, "cbc:RegistrationName") || xmlValueAfter(normalized, /AccountingSupplierParty/i, "RegistrationName"),
    supplierAddress: tag(section(supplier, "cac:PostalAddress"), "cbc:StreetName") || xmlValueAfter(normalized, /AccountingSupplierParty/i, "StreetName"),
    supplierCrNumber: tag(supplierLegal, "cbc:CompanyID") || supplierValues[1] || "",
    supplierVatNumber: tag(supplierTax, "cbc:CompanyID") || supplierValues[0] || "",
    supplierPhone: tag(section(supplier, "cac:Contact"), "cbc:Telephone") || "",
    supplierEmail: tag(section(supplier, "cac:Contact"), "cbc:ElectronicMail") || "",
    notes: tag(normalized, "cbc:Note") || "",
    currency: tag(normalized, "cbc:DocumentCurrencyCode") || xmlValues(normalized, "DocumentCurrencyCode")[0] || "SAR",
    subTotal: numberValue(tag(monetary, "cbc:TaxExclusiveAmount") || xmlValueAfter(normalized, /LegalMonetaryTotal/i, "TaxExclusiveAmount")),
    vatRate: taxRate || lineItems.find((item) => item.vatRate)?.vatRate || 0,
    vatAmount: numberValue(tag(taxTotal, "cbc:TaxAmount") || xmlValueAfter(normalized, /TaxTotal/i, "TaxAmount")),
    discountAmount: numberValue(tag(monetary, "cbc:AllowanceTotalAmount") || xmlValueAfter(normalized, /LegalMonetaryTotal/i, "AllowanceTotalAmount")),
    amount: totalAmount,
    received: 0,
    paymentDate: "",
    paymentMode: "",
    status: "pending",
    remarks: `Imported from ${fileName}. ZATCA UUID: ${tag(normalized, "cbc:UUID") || xmlValues(normalized, "UUID")[0] || "not provided"}`,
    lineItems,
  };
}

function parseVisualInvoice(text: string, fileName: string): InvoiceImportDraft {
  if (!/(?:\bTAX\s+INVOICE\b|\bINVOICE\s+(?:DATE|NO|NUMBER)\b|#\s*INV[-/])/i.test(text)) {
    throw new Error("This document does not appear to be an invoice.");
  }
  const foundDate = labeled(text, /Invoice\s*Date\s*[:#-]?\s*(\d{4}-\d{2}-\d{2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})/i)
    || labeled(text, /\b(\d{1,2}\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{4})\b/i);
  const invoiceDate = normalizedDate(foundDate);
  const total = numberValue(
    labeled(text, /Balance\s+Due.*?\bSAR\s*([0-9,.]+)/i)
      || labeled(text, /(?:Grand\s+Total|Total\s+Amount|Amount\s+Due)\s*[:#-]?\s*(?:SAR)?\s*([0-9,.]+)/i)
      || labeled(text, /\bSAR\s*([0-9,.]+)\s+Amount\b/i)
  );
  const companyName = labeled(text, /(?:Customer|Client|Company)\s*(?:Name)?\s*[:#-]?\s*(.+?)(?=\s+(?:VAT|Address|Invoice|Project|Total)\b)/i)
    || labeled(text, /\bRate\s+(.+?(?:CO\.?\s*LTD|COMPANY|L\.L\.C\.?|LLC|ESTABLISHMENT))\b/i)
    || labeled(text, /Bill\s+To\s+(.+?)(?=\s+(?:TRN|VAT|Address|Invoice)\b)/i);
  if (!companyName || !total) throw new Error("The PDF is readable, but its customer or total amount could not be identified.");

  const vatRate = numberValue(labeled(text, /VAT\s*\(([0-9.]+)%\)/i) || labeled(text, /([0-9.]+)\s+Tax\s*%/i));
  const vatAmount = numberValue(labeled(text, /VAT\s*\([^)]+\)\s*([0-9,.]+)/i));
  const calculatedVat = vatAmount || (vatRate > 0 ? total - total / (1 + vatRate / 100) : 0);
  const subTotal = numberValue(labeled(text, /Sub-?Total\s*[:#-]?\s*(?:SAR)?\s*([0-9,.]+)/i)) || total - calculatedVat;
  const fifteenDigitNumbers = Array.from(text.matchAll(/\b(3\d{14})\b/g), (entry) => entry[1]);
  const description = labeled(text, /POWERED\s+BY\s+(.+?)(?=\s+Balance\s+Due\b)/i);
  const project = labeled(text, /Subject\s*:\s*(.+?)(?=\s+Item\s*&\s*Description)/i);
  const invoiceId = labeled(text, /Invoice\s*(?:No\.?|Number|ID)\s*[:#-]?\s*([A-Z0-9/-]+)/i)
    || labeled(text, /#\s*(INV[-/][A-Z0-9/-]+)/i);
  const purchaseOrder = labeled(text, /Quotation\s*(?:No\.?)?\s*[:#-]?\s*([A-Z0-9/-]+)/i)
    || labeled(text, /P\.?\s*O\.?#?\s*:\s*([A-Z0-9/-]+)/i);
  const visualMeta = text.match(/(\d{1,2}\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{4})\s+(Due\s+on\s+Receipt|Net\s+\d+|Due\s+in\s+\d+\s+days)\s+(\d{1,2}\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{4})\s+([A-Z0-9/-]{6,})\s+(3\d{14})\s+Bill/i);
  const quantityRate = text.match(/([0-9,.]+)\s+Qty\s+([0-9,.]+)\s+Rate/i);
  const customerIndex = text.toLocaleLowerCase().indexOf(companyName.toLocaleLowerCase());
  const customerTail = customerIndex >= 0 ? text.slice(customerIndex + companyName.length) : "";
  const customerAddress = clean(customerTail.match(/^\s*(.+?)\s+TRN\s+3\d{14}/i)?.[1]);
  const supplierAddress = clean(text.match(/Item\s*&\s*Description\s+(.+?)\s+TRN\s*\d{10}/i)?.[1]);
  const noteBlock = clean(text.match(/Bill\s+To\s+Notes\s+(.+?)\s+Layla\s+Maqbula/i)?.[1]);
  const quantity = numberValue(quantityRate?.[1]) || 1;
  const unitPrice = numberValue(quantityRate?.[2]) || subTotal;

  return {
    id: invoiceId,
    uuid: labeled(text, /UUID\s*[:#-]?\s*([A-Z0-9-]+)/i),
    invoiceDate,
    companyName,
    customerAddress,
    customerVatNumber: labeled(text, /Customer\s+VAT\s*(?:No\.?)?\s*[:#-]?\s*([0-9]+)/i) || fifteenDigitNumbers[1] || fifteenDigitNumbers[0] || "",
    project: project || labeled(text, /Project\s*[:#-]?\s*(.+?)(?=\s+(?:Invoice|VAT|Total)\b)/i),
    quotationNo: "",
    purchaseOrderNumber: /^VAT$/i.test(purchaseOrder) ? "" : purchaseOrder || visualMeta?.[4] || "",
    dueDate: normalizedDate(visualMeta?.[3] || "") || invoiceDate,
    paymentTerms: clean(visualMeta?.[2]) || "Due on Receipt",
    supplierName: labeled(text, /([A-Z][A-Za-z ]+(?:Contracting|Maintenance)[A-Za-z ]*(?:Establishment|Company|Works))/i),
    supplierLegalName: "", supplierAddress,
    supplierCrNumber: labeled(text, /CR\s*(?:No\.?)?\s*[:#-]?\s*([0-9]+)/i) || labeled(text, /TRN\s*(\d{10})\b/i),
    supplierVatNumber: labeled(text, /VAT\s*(?:No\.?)?\s*[:#-]?\s*([0-9]{10,})/i) || fifteenDigitNumbers[0] || "",
    supplierPhone: labeled(noteBlock, /(05\d{8})/i),
    supplierEmail: labeled(noteBlock, /([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i),
    notes: noteBlock,
    currency: /\bSAR\b/i.test(text) ? "SAR" : "SAR",
    subTotal,
    vatRate,
    vatAmount: Number(calculatedVat.toFixed(2)),
    discountAmount: 0, amount: total, received: 0, paymentDate: "", paymentMode: "", status: "pending",
    remarks: `Imported from ${fileName}.`,
    lineItems: description ? [{ id: "1", description, quantity, unitCode: "Service", unitPrice, amount: Number((quantity * unitPrice).toFixed(2)) || Number(subTotal.toFixed(2)), vatRate }] : [],
  };
}

async function parsePdf(file: File) {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
  const document = await getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const content = await (await document.getPage(pageNumber)).getTextContent();
    pages.push(content.items.map((item) => ("str" in item ? item.str : "")).join(" "));
  }
  const text = clean(pages.join(" "));
  if (text.length < 20) {
    throw new Error("This PDF contains no selectable text. Export a text-based PDF or import its Excel file; scanned-image invoices require OCR.");
  }
  return parseUblInvoice(text, file.name) || parseVisualInvoice(text, file.name);
}

const aliases: Record<string, string[]> = {
  id: ["invoice no", "invoice number", "invoice id"], invoiceDate: ["invoice date", "issue date", "date"],
  companyName: ["company name", "client name", "customer name", "company", "client"], project: ["project", "project store", "store"],
  quotationNo: ["quotation no", "quotation number", "quote no"], amount: ["invoice amount", "total amount", "amount", "total"],
  received: ["amount received", "received", "paid amount"], paymentDate: ["payment date"], paymentMode: ["payment mode", "payment method"],
  status: ["payment status", "invoice status", "status"], vatNumber: ["vat number", "vat no"], crNumber: ["cr number", "cr no"],
};

function parseExcel(fileName: string, workbook: XLSX.WorkBook): InvoiceImportDraft {
  for (const sheetName of workbook.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], { header: 1, raw: false, defval: "" });
    for (let headerIndex = 0; headerIndex < Math.min(rows.length, 30); headerIndex += 1) {
      const map: Record<string, number> = {};
      rows[headerIndex].forEach((cell, column) => {
        const label = clean(cell).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
        for (const [field, options] of Object.entries(aliases)) if (!(field in map) && options.some((option) => label === option || label.includes(option))) map[field] = column;
      });
      if (!("id" in map) || !("companyName" in map) || !("amount" in map)) continue;
      const record = rows.slice(headerIndex + 1).find((row) => clean(row[map.id]) || clean(row[map.companyName]));
      if (!record) continue;
      const get = (field: string) => map[field] == null ? "" : record[map[field]];
      const invoiceAmount = numberValue(get("amount"));
      const received = numberValue(get("received"));
      return {
        id: clean(get("id")), uuid: "", invoiceDate: clean(get("invoiceDate")), companyName: clean(get("companyName")), customerAddress: "", customerVatNumber: "",
        project: clean(get("project")), quotationNo: clean(get("quotationNo")), supplierName: "", supplierLegalName: "", supplierAddress: "",
        supplierCrNumber: clean(get("crNumber")), supplierVatNumber: clean(get("vatNumber")), currency: "SAR", subTotal: invoiceAmount, vatRate: 0, vatAmount: 0,
        discountAmount: 0, amount: invoiceAmount, received, paymentDate: clean(get("paymentDate")), paymentMode: clean(get("paymentMode")),
        status: (clean(get("status")).toLowerCase() || (received >= invoiceAmount && invoiceAmount > 0 ? "paid" : received > 0 ? "partial" : "pending")) as InvoiceImportDraft["status"],
        remarks: `Imported from ${fileName} (${sheetName}).`, lineItems: [],
      };
    }
  }
  throw new Error("No invoice table was found in the workbook.");
}

export async function parseInvoiceDocument(file: File): Promise<InvoiceImportDraft> {
  if (file.size > 30 * 1024 * 1024) throw new Error("The invoice document exceeds the 30 MB import limit.");
  const extension = file.name.toLowerCase().split(".").pop();
  if (extension === "pdf") return parsePdf(file);
  if (["xlsx", "xls", "xlsm", "xlsb", "ods", "csv"].includes(extension || "")) {
    return parseExcel(file.name, XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true }));
  }
  throw new Error("Upload a PDF, Excel, OpenDocument, or CSV invoice file.");
}
