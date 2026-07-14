export interface RecordQuery {
  query?: string;
  company?: string;
  dateFrom?: string;
  dateTo?: string;
}

const normalize = (value: unknown) =>
  String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase();

// Shared list matching keeps search, company, and inclusive ISO date rules
// identical across quotation, invoice, project, history, and trash screens.
export function matchesRecordQuery(
  fields: unknown[],
  companyName: string,
  date: string,
  filters: RecordQuery,
) {
  const query = normalize(filters.query);
  const company = normalize(filters.company);
  const normalizedCompany = normalize(companyName);
  const normalizedDate = date.trim();

  return (
    (!query || normalize(fields.join(" ")).includes(query)) &&
    (!company || company === "all" || normalizedCompany === company) &&
    (!filters.dateFrom || normalizedDate >= filters.dateFrom) &&
    (!filters.dateTo || normalizedDate <= filters.dateTo)
  );
}
