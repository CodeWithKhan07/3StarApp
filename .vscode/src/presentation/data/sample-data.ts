import type { Client, Invoice, Project, Quotation } from "@/domain/entities/business";
import workbook from "@/data/workbook-data.json";

export const company = workbook.company;
export const clients = workbook.clients as Client[];
export const projects = workbook.projects as Project[];
export const quotations = workbook.quotations as Quotation[];
export const invoices = workbook.invoices as Invoice[];

export function money(value: number) {
  return new Intl.NumberFormat("en-SA", { style: "currency", currency: company.currency, maximumFractionDigits: 0 }).format(value);
}
