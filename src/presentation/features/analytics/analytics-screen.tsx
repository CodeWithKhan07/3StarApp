"use client";

import { routes } from "@/lib/routes";
import { DateRangeFields, PageHeader } from "@/presentation/components/ui";
import { money } from "@/presentation/data/sample-data";
import { useBusinessData } from "@/presentation/providers/business-data-provider";
import { CircleDollarSign, ReceiptText, TrendingUp, Users } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

export function AnalyticsScreen() {
  const { data } = useBusinessData();
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [client, setClient] = useState("all");

  const paidInvoices = useMemo(
    () =>
      data.invoices.filter((invoice) => {
        const date = invoice.profitRecordedAt || invoice.paymentDate || invoice.invoiceDate || "";
        return (
          invoice.status === "paid" &&
          (!dateFrom || date >= dateFrom) &&
          (!dateTo || date <= dateTo) &&
          (client === "all" || invoice.companyName === client)
        );
      }),
    [client, data.invoices, dateFrom, dateTo],
  );

  const clientNames = useMemo(
    () => [...new Set(data.invoices.map((invoice) => invoice.companyName).filter(Boolean))].sort(),
    [data.invoices],
  );

  const totals = useMemo(() => {
    const income = paidInvoices.reduce((sum, invoice) => sum + invoice.received, 0);
    const profit = paidInvoices.reduce((sum, invoice) => sum + (invoice.profitAmount || 0), 0);
    return { income, profit, costs: income - profit };
  }, [paidInvoices]);

  const byClient = useMemo(() => {
    const groups = new Map<string, { invoices: number; income: number; profit: number }>();
    for (const invoice of paidInvoices) {
      const current = groups.get(invoice.companyName) || { invoices: 0, income: 0, profit: 0 };
      current.invoices += 1;
      current.income += invoice.received;
      current.profit += invoice.profitAmount || 0;
      groups.set(invoice.companyName, current);
    }
    return [...groups.entries()].sort((a, b) => b[1].profit - a[1].profit);
  }, [paidInvoices]);

  return (
    <>
      <PageHeader title="Income & Profit Analytics" description="Paid invoice income and recorded profit, grouped by client and payment date." />

      <section className="card analytics-filter-bar">
        <select className="select" value={client} onChange={(event) => setClient(event.target.value)}>
          <option value="all">All clients</option>
          {clientNames.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
        <DateRangeFields from={dateFrom} to={dateTo} onFromChange={setDateFrom} onToChange={setDateTo} />
        <button className="button" type="button" onClick={() => { setClient("all"); setDateFrom(""); setDateTo(""); }}>Clear filters</button>
      </section>

      <section className="metrics analytics-metrics">
        <article className="metric-card card"><ReceiptText size={18}/><p>Total Income</p><strong>{money(totals.income)}</strong></article>
        <article className="metric-card card"><TrendingUp size={18}/><p>Total Profit</p><strong>{money(totals.profit)}</strong></article>
        <article className="metric-card card"><CircleDollarSign size={18}/><p>Estimated Costs</p><strong>{money(totals.costs)}</strong></article>
        <article className="metric-card card"><Users size={18}/><p>Paid Invoices</p><strong>{paidInvoices.length}</strong></article>
      </section>

      <section className="card analytics-detail-card">
        <header className="card__header"><h2>Profit by Client</h2><span>{byClient.length} clients</span></header>
        <div className="table-wrap">
          <table className="data-table plain-data-table analytics-table">
            <thead><tr><th>Client</th><th>Paid Invoices</th><th>Income</th><th>Profit</th><th>Margin</th></tr></thead>
            <tbody>
              {byClient.length ? byClient.map(([name, values]) => (
                <tr className="plain-data-row" key={name}>
                  <td><strong>{name}</strong></td><td>{values.invoices}</td><td className="money-cell">{money(values.income)}</td><td className="money-cell">{money(values.profit)}</td><td>{values.income ? ((values.profit / values.income) * 100).toFixed(1) : "0.0"}%</td>
                </tr>
              )) : <tr className="empty-row"><td colSpan={5}>No paid invoice profits in this period.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card analytics-detail-card">
        <header className="card__header"><h2>Paid Invoice Detail</h2><span>{paidInvoices.length} entries</span></header>
        <div className="table-wrap">
          <table className="data-table plain-data-table analytics-table">
            <thead><tr><th>Payment Date</th><th>Invoice</th><th>Client</th><th>Income</th><th>Profit</th><th>Open</th></tr></thead>
            <tbody>
              {paidInvoices.length ? paidInvoices.map((invoice) => (
                <tr className="plain-data-row" key={invoice.id}>
                  <td>{invoice.profitRecordedAt || invoice.paymentDate || invoice.invoiceDate}</td><td><strong>{invoice.id}</strong></td><td>{invoice.companyName}</td><td className="money-cell">{money(invoice.received)}</td><td className="money-cell">{money(invoice.profitAmount || 0)}</td><td><Link className="button" href={`${routes.recordDetail}?type=invoice&id=${encodeURIComponent(invoice.id)}`}>Details</Link></td>
                </tr>
              )) : <tr className="empty-row"><td colSpan={6}>No paid invoices in this period.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
