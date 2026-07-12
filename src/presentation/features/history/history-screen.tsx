"use client";

import { routes } from "@/lib/routes";
import { PageHeader, StatusBadge } from "@/presentation/components/ui";
import { money } from "@/presentation/data/sample-data";
import { useBusinessData } from "@/presentation/providers/business-data-provider";
import { collectCompanyNames, normalizeCompanyKey } from "@/presentation/utils/company-filters";
import { Search } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

type HistoryItem =
  | {
      type: "invoice";
      id: string;
      date: string;
      company: string;
      reference: string;
      description: string;
      amount: number;
      balance: number;
      status: string;
    }
  | {
      type: "quotation";
      id: string;
      date: string;
      company: string;
      reference: string;
      description: string;
      amount: number;
      balance: number;
      status: string;
    };

export function HistoryScreen() {
  const { data } = useBusinessData();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const [company, setCompany] = useState(searchParams.get("company") || "all");
  const [section, setSection] = useState<"all" | "invoices" | "quotations">("all");

  const companies = useMemo(() => collectCompanyNames(data), [data]);
  const items = useMemo<HistoryItem[]>(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const invoices: HistoryItem[] = data.invoices.map((invoice) => ({
      type: "invoice",
      id: invoice.id,
      date: invoice.invoiceDate || "",
      company: invoice.companyName,
      reference: invoice.purchaseOrderNumber || invoice.quotationSerialNumber || invoice.quotationNo || "-",
      description: invoice.project || "Invoice",
      amount: invoice.amount,
      balance: invoice.amount - invoice.received,
      status: invoice.status,
    }));
    const quotations: HistoryItem[] = data.quotations.map((quotation) => ({
      type: "quotation",
      id: quotation.id,
      date: quotation.issueDate || "",
      company: quotation.companyName,
      reference: quotation.serialNumber || "-",
      description: quotation.store || "Quotation",
      amount: quotation.amount,
      balance: quotation.amount,
      status: quotation.status,
    }));

    return [...invoices, ...quotations]
      .filter((item) => {
        const typeMatch =
          section === "all" ||
          (section === "invoices" && item.type === "invoice") ||
          (section === "quotations" && item.type === "quotation");
        const companyMatch = company === "all" || normalizeCompanyKey(item.company) === company;
        const target = [item.type, item.id, item.company, item.reference, item.description, item.status].join(" ").toLowerCase();
        return typeMatch && companyMatch && (!normalizedQuery || target.includes(normalizedQuery));
      })
      .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id, undefined, { numeric: true }));
  }, [company, data.invoices, data.quotations, query, section]);

  return (
    <>
      <PageHeader title="History" description="All invoice and quotation history in one plain list." />

      <section className="card table-toolbar history-controls">
        <label className="toolbar-search">
          <Search size={15} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search company, invoice, quotation, PO, job..." />
        </label>
        <select className="select" value={company} onChange={(event) => setCompany(event.target.value)}>
          <option value="all">All Companies</option>
          {companies.map((name) => <option key={name} value={normalizeCompanyKey(name)}>{name}</option>)}
        </select>
        <select className="select" value={section} onChange={(event) => setSection(event.target.value as typeof section)}>
          <option value="all">Invoices + Quotations</option>
          <option value="invoices">Invoices Only</option>
          <option value="quotations">Quotations Only</option>
        </select>
      </section>

      <section className="card plain-data-card">
        <div className="table-wrap plain-list-wrap">
          <table className="data-table statement-table history-table plain-data-table">
            <thead><tr><th>Date</th><th>Type</th><th>Record</th><th>Reference</th><th>Company</th><th>Total</th><th>Status</th></tr></thead>
            <tbody>
              {items.length ? items.map((item) => (
                <tr className="plain-data-row" key={`${item.type}:${item.id}`} onClick={() => router.push(`${routes.recordDetail}?type=${item.type}&id=${encodeURIComponent(item.id)}`)}>
                  <td>{item.date || "-"}</td>
                  <td>{item.type === "invoice" ? "Invoice" : "Quotation"}</td>
                  <td className="strong-cell">{item.id}</td>
                  <td>{item.reference}</td>
                  <td>{item.company}</td>
                  <td className="money-cell">{money(item.amount)}</td>
                  <td><StatusBadge value={item.status} /></td>
                </tr>
              )) : <tr className="empty-row"><td colSpan={7}>No history found.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
