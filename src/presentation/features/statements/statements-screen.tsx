"use client";

import { exportStatementPdf } from "@/application/services/document-export";
import type { Client, Invoice } from "@/domain/entities/business";
import { routes } from "@/lib/routes";
import { PageHeader } from "@/presentation/components/ui";
import { money } from "@/presentation/data/sample-data";
import { useBusinessData } from "@/presentation/providers/business-data-provider";
import { collectCompanyNames } from "@/presentation/utils/company-filters";
import { CalendarDays, Download, FileText, ReceiptText, Search, WalletCards } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

const normalize = (value: string) => value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
const inRange = (date: string, start: string, end: string) => (!start || date >= start) && (!end || date <= end);

interface StatementGroup {
  companyName: string;
  client?: Client;
  invoices: Invoice[];
  taxable: number;
  vat: number;
  vatRate: number;
  invoiced: number;
  received: number;
  balance: number;
  latestDate: string;
  runningBalances: Record<string, number>;
}

export function StatementsScreen() {
  const router = useRouter();
  const { data } = useBusinessData();
  const [query, setQuery] = useState("");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [companySort, setCompanySort] = useState<"asc" | "desc">("asc");
  const [dateSort, setDateSort] = useState<"desc" | "asc">("desc");
  const [error, setError] = useState("");

  const companyNames = useMemo(() => {
    return collectCompanyNames(data);
  }, [data]);

  const groups = useMemo<StatementGroup[]>(() => {
    const search = normalize(query);
    const result = companyNames.map((companyName) => {
      const key = normalize(companyName);
      const client = data.clients.find((item) => normalize(item.companyName) === key);
      const invoices = data.invoices
        .filter((invoice) => normalize(invoice.companyName) === key && inRange(invoice.invoiceDate, startDate, endDate))
        .sort((a, b) => dateSort === "desc" ? b.invoiceDate.localeCompare(a.invoiceDate) : a.invoiceDate.localeCompare(b.invoiceDate));
      const taxable = invoices.reduce((sum, invoice) => sum + (invoice.subTotal ?? Math.max(0, invoice.amount - (invoice.vatAmount ?? 0))), 0);
      const vat = invoices.reduce((sum, invoice) => sum + (invoice.vatAmount ?? Math.max(0, invoice.amount - (invoice.subTotal ?? invoice.amount))), 0);
      const invoiced = invoices.reduce((sum, invoice) => sum + invoice.amount, 0);
      const received = invoices.reduce((sum, invoice) => sum + invoice.received, 0);
      let running = 0;
      const runningBalances: Record<string, number> = {};
      for (const invoice of [...invoices].sort((a, b) => a.invoiceDate.localeCompare(b.invoiceDate) || a.id.localeCompare(b.id))) {
        running += invoice.amount - invoice.received;
        runningBalances[invoice.id] = running;
      }
      return { companyName, client, invoices, taxable, vat, vatRate: taxable > 0 ? vat / taxable * 100 : 0, invoiced, received, balance: invoiced - received, latestDate: invoices.reduce((latest, invoice) => invoice.invoiceDate > latest ? invoice.invoiceDate : latest, ""), runningBalances };
    }).filter((group) => {
      if (companyFilter !== "all" && normalize(group.companyName) !== companyFilter) return false;
      if (!search) return true;
      const target = [group.companyName, group.client?.brandName, group.client?.contactPerson, group.client?.city, ...group.invoices.flatMap((invoice) => [invoice.id, invoice.project, invoice.quotationNo || ""])].join(" ").toLocaleLowerCase();
      return target.includes(search);
    });
    return result.sort((a, b) => companySort === "asc" ? a.companyName.localeCompare(b.companyName) : b.companyName.localeCompare(a.companyName));
  }, [companyFilter, companyNames, companySort, data.clients, data.invoices, dateSort, endDate, query, startDate]);

  const visibleTotals = useMemo(() => groups.reduce((summary, group) => ({
    invoices: summary.invoices + group.invoices.length,
    invoiced: summary.invoiced + group.invoiced,
    received: summary.received + group.received,
    balance: summary.balance + group.balance,
  }), { invoices: 0, invoiced: 0, received: 0, balance: 0 }), [groups]);

  function findQuotation(invoice: Invoice) {
    const keys = [invoice.quotationNo, invoice.quotationSerialNumber].map((value) => normalize(value || "")).filter(Boolean);
    return data.quotations.find((quotation) => [quotation.id, quotation.serialNumber].map((value) => normalize(value || "")).some((value) => keys.includes(value)));
  }

  async function exportGroup(group: StatementGroup) {
    setError("");
    if (!group.invoices.length) return setError(`There are no invoice lines in the selected period for ${group.companyName}.`);
    try {
      await exportStatementPdf({ customerName: group.companyName, client: group.client, invoices: group.invoices, company: data.company, startDate, endDate });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Statement export failed.");
    }
  }

  return <>
    <PageHeader title="Statements" description="Company account statements with live invoice, VAT, payment, and balance totals." />

    <section className="card table-toolbar statement-controls">
      <label className="toolbar-search statement-search"><Search size={17}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search company, invoice, project, PO..." /></label>
      <select className="select" value={companyFilter} onChange={(event) => setCompanyFilter(event.target.value)}><option value="all">All Companies</option>{companyNames.map((name) => <option key={name} value={normalize(name)}>{name}</option>)}</select>
      <label className="field statement-date"><span>From date</span><input type="date" value={startDate} max={endDate || undefined} onChange={(event) => setStartDate(event.target.value)} /></label>
      <label className="field statement-date"><span>To date</span><input type="date" value={endDate} min={startDate || undefined} onChange={(event) => setEndDate(event.target.value)} /></label>
      <select className="select" value={companySort} onChange={(event) => setCompanySort(event.target.value as "asc"|"desc")}><option value="asc">Company A–Z</option><option value="desc">Company Z–A</option></select>
      <select className="select" value={dateSort} onChange={(event) => setDateSort(event.target.value as "asc"|"desc")}><option value="desc">Newest invoices first</option><option value="asc">Oldest invoices first</option></select>
    </section>

    {error ? <div className="form-message form-message--error">{error}</div> : null}

    <section className="metrics statement-overview">
      <article className="metric-card card"><WalletCards size={20}/><p>Companies</p><strong>{groups.length}</strong></article>
      <article className="metric-card card"><FileText size={20}/><p>Invoice Lines</p><strong>{visibleTotals.invoices}</strong></article>
      <article className="metric-card card"><ReceiptText size={20}/><p>Total Including VAT</p><strong>{money(visibleTotals.invoiced)}</strong></article>
      <article className="metric-card card"><CalendarDays size={20}/><p>Outstanding</p><strong>{money(visibleTotals.balance)}</strong></article>
    </section>

    <section className="statement-company-list">
      {groups.length ? groups.map((group) => <article className="card statement-company-card" key={normalize(group.companyName)}>
        <header className="page-header statement-company-card__header">
          <div><span>ACCOUNT STATEMENT</span><h2>{group.companyName}</h2><p>{group.client?.brandName || group.client?.city || "Customer account"} · {group.invoices.length} transaction{group.invoices.length === 1 ? "" : "s"}{group.latestDate ? ` · Latest ${group.latestDate}` : ""}</p></div>
          <button className="button button--primary" type="button" disabled={!group.invoices.length} onClick={() => void exportGroup(group)}><Download size={15}/>Export PDF</button>
        </header>
        <div className="metrics statement-card-metrics"><article className="metric-card card statement-metric-tile"><p>Before VAT</p><strong>{money(group.taxable)}</strong></article><article className="metric-card card statement-metric-tile"><p>VAT Percentage</p><strong>{group.vatRate.toFixed(2)}%</strong></article><article className="metric-card card statement-metric-tile"><p>Total VAT</p><strong>{money(group.vat)}</strong></article><article className="metric-card card statement-metric-tile"><p>Total After VAT</p><strong>{money(group.invoiced)}</strong></article><article className="metric-card card statement-metric-tile"><p>Payments</p><strong>{money(group.received)}</strong></article><article className="metric-card card statement-metric-tile statement-balance"><p>Outstanding</p><strong>{money(group.balance)}</strong></article></div>
        <div className="table-wrap"><table className="data-table statement-table"><thead><tr><th>Date</th><th>PO / Quotation</th><th>Invoice</th><th>Description</th><th>Before VAT</th><th>VAT %</th><th>Total VAT</th><th>Total After VAT</th><th>Credit</th><th>Balance</th><th>View</th></tr></thead><tbody>{group.invoices.length ? group.invoices.map((invoice) => { const quotation=findQuotation(invoice); const taxable=invoice.subTotal??Math.max(0,invoice.amount-(invoice.vatAmount??0)); const vat=invoice.vatAmount??Math.max(0,invoice.amount-taxable); const vatRate=invoice.vatRate??(taxable>0?vat/taxable*100:0); return <tr className="plain-data-row" key={invoice.id} onClick={() => router.push(`${routes.recordDetail}?type=invoice&id=${encodeURIComponent(invoice.id)}`)}><td>{invoice.invoiceDate||"—"}</td><td>{invoice.quotationNo||"—"}</td><td className="strong-cell">{invoice.id}</td><td><span className="description-cell">{invoice.project||"Services"}</span></td><td className="money-cell">{money(taxable)}</td><td className="money-cell">{vatRate.toFixed(2)}%</td><td className="money-cell">{money(vat)}</td><td className="money-cell">{money(invoice.amount)}</td><td className="money-cell">{money(invoice.received)}</td><td className="money-cell">{money(group.runningBalances[invoice.id] ?? 0)}</td><td><div className="row-actions" onClick={(event) => event.stopPropagation()}><Link className="icon-button" href={`${routes.editInvoice}?id=${encodeURIComponent(invoice.id)}`} title="Edit invoice"><ReceiptText size={15}/></Link>{quotation?<Link className="icon-button" href={`${routes.recordDetail}?type=quotation&id=${encodeURIComponent(quotation.id)}`} title="Open quotation details"><FileText size={15}/></Link>:null}</div></td></tr>; }) : <tr className="empty-row"><td colSpan={11}>No activity in the selected date range.</td></tr>}</tbody></table></div>
      </article>) : <section className="card empty-state"><h2>No statements match</h2><p>Try clearing the company, search, or date filters.</p></section>}
    </section>
  </>;
}
