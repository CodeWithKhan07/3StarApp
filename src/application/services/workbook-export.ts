import type { Client, Invoice, Project, Quotation } from "@/domain/entities/business";

export interface WorkbookData {
  clients: Client[];
  projects: Project[];
  quotations: Quotation[];
  invoices: Invoice[];
}

export async function exportBusinessWorkbook(data: WorkbookData, filename = "3Star_Business_Suite.xlsx") {
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "3Star Business Suite";
  workbook.created = new Date();

  const addSheet = (name: string, rows: Record<string, unknown>[]) => {
    const sheet = workbook.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
    const keys = rows.length ? Object.keys(rows[0]) : ["status"];
    sheet.columns = keys.map((key) => ({ header: key.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase()), key, width: 22 }));
    rows.forEach((row) => sheet.addRow(row));
    sheet.getRow(1).eachCell((cell) => { cell.font = { bold: true, color: { argb: "FFFFFFFF" } }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } }; });
    sheet.autoFilter = { from: "A1", to: `${String.fromCharCode(64 + Math.min(keys.length, 26))}1` };
  };

  const normalize = <T extends object>(rows: T[]) => rows.map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([key, value]) => [
        key,
        value && typeof value === "object" ? JSON.stringify(value) : value,
      ])
    )
  );

  addSheet("Clients", normalize(data.clients));
  addSheet("Projects", normalize(data.projects));
  addSheet("Quotations", normalize(data.quotations));
  addSheet("Invoices & Payments", data.invoices.map((invoice) => ({ ...invoice, balanceDue: invoice.amount - invoice.received })));
  addSheet("Pending Payments", data.invoices.filter((invoice) => ["pending", "partial", "overdue"].includes(invoice.status)).map((invoice) => ({ ...invoice, outstanding: invoice.amount - invoice.received })));

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([new Uint8Array(buffer)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = filename; anchor.click();
  URL.revokeObjectURL(url);
}
