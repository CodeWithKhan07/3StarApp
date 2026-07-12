import type { BusinessDataSet } from "@/domain/entities/business";

export const normalizeCompanyKey = (value: string) =>
  value.trim().replace(/\s+/g, " ").toLocaleLowerCase();

function addCompany(names: Map<string, string>, value?: string) {
  const name = value?.trim();
  if (name) names.set(normalizeCompanyKey(name), name);
}

export function collectCompanyNames(data: BusinessDataSet) {
  const names = new Map<string, string>();

  for (const client of data.clients) addCompany(names, client.companyName);
  for (const project of data.projects) addCompany(names, project.company);
  for (const quotation of data.quotations) addCompany(names, quotation.companyName);
  for (const invoice of data.invoices) addCompany(names, invoice.companyName);

  return [...names.values()].sort((a, b) => a.localeCompare(b));
}
