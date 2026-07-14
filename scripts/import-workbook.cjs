const ExcelJS = require("exceljs");
const fs = require("node:fs");
const path = require("node:path");

const source = process.argv[2];
if (!source)
  throw new Error("Usage: node scripts/import-workbook.cjs <workbook.xlsx>");

function value(cell) {
  const raw = cell?.value;
  if (raw == null) return "";
  if (raw instanceof Date) return raw.toISOString().slice(0, 10);
  if (typeof raw === "object") {
    if ("result" in raw && raw.result != null) return raw.result;
    if ("text" in raw) return raw.text;
    return "";
  }
  return raw;
}

function text(cell) {
  return String(value(cell) ?? "").trim();
}
function number(cell) {
  const parsed = Number(value(cell));
  return Number.isFinite(parsed) ? parsed : 0;
}
function slugStatus(input, fallback) {
  const normalized = String(input || fallback)
    .trim()
    .toLowerCase()
    .replaceAll(" ", "-");
  return normalized || fallback;
}

(async () => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(source);
  const companySheet = workbook.getWorksheet("Company Master");
  const projectSheet = workbook.getWorksheet("Project Register");
  const quotationSheet = workbook.getWorksheet("Quotation Tracking");
  const invoiceSheet = workbook.getWorksheet("Invoice & Payment");
  const quoteTemplate = workbook.getWorksheet("QTY");
  if (
    !companySheet ||
    !projectSheet ||
    !quotationSheet ||
    !invoiceSheet ||
    !quoteTemplate
  )
    throw new Error("Workbook is missing one or more required sheets.");

  const crVat =
    text(quoteTemplate.getCell("A5")) + " " + text(quoteTemplate.getCell("D5"));
  const cityPhone =
    text(quoteTemplate.getCell("A6")) + " " + text(quoteTemplate.getCell("D6"));
  const cityMatch = cityPhone.match(
    /City:\s*([^,]+),\s*(.+?)(?:\s+WhatsApp:|$)/i,
  );
  const data = {
    importedAt: new Date().toISOString(),
    sourceFile: path.basename(source),
    company: {
      businessName: text(quoteTemplate.getCell("A3")),
      legalCompanyName: text(quoteTemplate.getCell("A4")),
      crNumber: crVat.match(/CR No\.:\s*([0-9]+)/i)?.[1] || "",
      vatNumber: crVat.match(/VAT No\.:\s*([0-9]+)/i)?.[1] || "",
      city: cityMatch?.[1]?.trim() || "",
      country: cityMatch?.[2]?.trim() || "Saudi Arabia",
      phone: cityPhone.match(/WhatsApp:\s*([+0-9 ]+)/i)?.[1]?.trim() || "",
      currency: "SAR",
      vatRate: 15,
    },
    clients: [],
    projects: [],
    quotations: [],
    invoices: [],
  };

  for (let rowNumber = 6; rowNumber <= companySheet.rowCount; rowNumber += 1) {
    const row = companySheet.getRow(rowNumber);
    const companyName = text(row.getCell(2));
    if (!companyName) continue;
    data.clients.push({
      id: `C-${String(data.clients.length + 1).padStart(3, "0")}`,
      companyName,
      brandName: text(row.getCell(3)),
      contactPerson: text(row.getCell(4)),
      mobile: text(row.getCell(5)),
      email: text(row.getCell(6)),
      city: text(row.getCell(7)),
      contractStatus: slugStatus(text(row.getCell(8)), "active"),
      remarks: text(row.getCell(9)),
    });
  }

  for (let rowNumber = 6; rowNumber <= projectSheet.rowCount; rowNumber += 1) {
    const row = projectSheet.getRow(rowNumber);
    const company = text(row.getCell(2));
    const workDescription = text(row.getCell(5));
    if (!company && !workDescription) continue;
    data.projects.push({
      id:
        text(row.getCell(1)) ||
        `PRJ-${String(data.projects.length + 1).padStart(3, "0")}`,
      company,
      store: text(row.getCell(3)),
      location: text(row.getCell(4)),
      workDescription,
      category: text(row.getCell(6)),
      quotationNo: text(row.getCell(7)),
      workOrderNo: text(row.getCell(8)),
      value: number(row.getCell(9)),
      startDate: text(row.getCell(10)),
      expectedCompletion: text(row.getCell(11)),
      actualCompletion: text(row.getCell(12)),
      status: slugStatus(text(row.getCell(13)), "upcoming"),
      completion: number(row.getCell(14)),
      priority: "medium",
      remarks: text(row.getCell(15)),
    });
  }

  for (
    let rowNumber = 6;
    rowNumber <= quotationSheet.rowCount;
    rowNumber += 1
  ) {
    const row = quotationSheet.getRow(rowNumber);
    const quotationNo = text(row.getCell(1));
    const companyName = text(row.getCell(4));
    if (!quotationNo && !companyName) continue;
    data.quotations.push({
      id: quotationNo
        ? `QT-${quotationNo}`
        : `QT-${String(data.quotations.length + 1).padStart(3, "0")}`,
      issueDate: text(row.getCell(2)),
      validityDate: text(row.getCell(3)),
      companyName,
      store: text(row.getCell(5)),
      scopeOfWork: text(row.getCell(6)),
      amount: number(row.getCell(7)),
      status: slugStatus(text(row.getCell(8)), "draft"),
      followUpDate: text(row.getCell(9)),
      remarks: text(row.getCell(10)),
    });
  }

  for (let rowNumber = 6; rowNumber <= invoiceSheet.rowCount; rowNumber += 1) {
    const row = invoiceSheet.getRow(rowNumber);
    const companyName = text(row.getCell(1));
    const invoiceNo = text(row.getCell(3));
    if (!companyName && !invoiceNo) continue;
    data.invoices.push({
      id:
        invoiceNo || `INV-${String(data.invoices.length + 1).padStart(3, "0")}`,
      companyName,
      project: text(row.getCell(2)),
      invoiceDate: text(row.getCell(4)),
      amount: number(row.getCell(5)),
      received: number(row.getCell(6)),
      paymentDate: text(row.getCell(8)),
      paymentMode: text(row.getCell(9)),
      status: slugStatus(text(row.getCell(10)), "pending"),
      followUpDate: text(row.getCell(11)),
      remarks: text(row.getCell(12)),
    });
  }

  const output = path.resolve("src/data/workbook-data.json");
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(data, null, 2) + "\n");
  const template = path.resolve(
    "public/templates/3Star_Professional_Workbook.xlsx",
  );
  fs.mkdirSync(path.dirname(template), { recursive: true });
  fs.copyFileSync(source, template);
  console.log(
    `Imported ${data.clients.length} clients, ${data.projects.length} projects, ${data.quotations.length} quotations, and ${data.invoices.length} invoices.`,
  );
})();
