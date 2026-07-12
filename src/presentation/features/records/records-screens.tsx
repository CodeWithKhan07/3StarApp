"use client";

import type { Invoice, Project } from "@/domain/entities/business";
import { routes } from "@/lib/routes";
import { EmptyTableRow, PageHeader, StatusBadge } from "@/presentation/components/ui";
import { money } from "@/presentation/data/sample-data";
import { useBusinessData } from "@/presentation/providers/business-data-provider";
import { collectCompanyNames, normalizeCompanyKey } from "@/presentation/utils/company-filters";
import { Plus, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";

function Toolbar({
  query,
  onQuery,
  placeholder,
  children,
}: {
  query: string;
  onQuery: (value: string) => void;
  placeholder: string;
  children?: ReactNode;
}) {
  return (
    <div className="toolbar">
      <label className="search-field">
        <Search size={14} />
        <input value={query} onChange={(event) => onQuery(event.target.value)} placeholder={placeholder} />
      </label>
      {children}
    </div>
  );
}

const invoiceStatusOptions: Array<{ label: string; value: Invoice["status"] }> = [
  { label: "Pending", value: "pending" },
  { label: "Partial", value: "partial" },
  { label: "Pending PO", value: "po" },
  { label: "Paid", value: "paid" },
  { label: "Overdue", value: "overdue" },
];

export function ClientsScreen() {
  const router = useRouter();
  const { data, createRecord } = useBusinessData();
  const [query, setQuery] = useState("");
  const [company, setCompany] = useState("all");
  const [city, setCity] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const companyOptions = useMemo(() => collectCompanyNames(data), [data]);
  const filtered = data.clients.filter((client) => {
    const target = [
      client.companyName,
      client.brandName,
      client.contactPerson,
      client.mobile,
      client.email,
      client.address,
      client.vatNumber,
      client.crNumber,
      client.storeName,
      client.storeLocation,
    ].join(" ").toLowerCase();

    return (
      target.includes(query.toLowerCase()) &&
      (company === "all" || normalizeCompanyKey(client.companyName) === company) &&
      (city === "all" || client.city === city)
    );
  });

  async function addClient(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const value = (key: string) => String(form.get(key) || "").trim();
    await createRecord("clients", {
      id: crypto.randomUUID(),
      companyName: value("companyName"),
      brandName: value("brandName"),
      contactPerson: value("contactPerson"),
      mobile: value("mobile"),
      email: value("email"),
      address: value("address"),
      city: value("city"),
      country: value("country"),
      vatNumber: value("vatNumber"),
      crNumber: value("crNumber"),
      storeName: value("storeName"),
      storeLocation: value("storeLocation"),
      contractStatus: "active",
      remarks: value("remarks"),
    });
    setShowForm(false);
  }

  return (
    <>
      <PageHeader
        title="Clients"
        description="Plain client list with quick details."
        actions={<button className="button button--primary" onClick={() => setShowForm((value) => !value)}><Plus size={14} />New Client</button>}
      />

      {showForm ? (
        <form className="card form-card" onSubmit={(event) => void addClient(event)}>
          <div className="form-grid">
            {[
              ["companyName", "Company Name *"],
              ["brandName", "Brand Name"],
              ["contactPerson", "Contact Person"],
              ["mobile", "Mobile / WhatsApp"],
              ["email", "Email"],
              ["vatNumber", "VAT Number"],
              ["crNumber", "CR Number"],
              ["city", "City"],
              ["country", "Country"],
              ["storeName", "Default Store / Branch"],
              ["storeLocation", "Default Store Location"],
            ].map(([name, label]) => (
              <label className="field" key={name}>
                <span>{label}</span>
                <input name={name} type={name === "email" ? "email" : "text"} required={name === "companyName"} />
              </label>
            ))}
            <label className="field field--full"><span>Address</span><input name="address" /></label>
            <label className="field field--full"><span>Remarks</span><textarea name="remarks" rows={3} /></label>
          </div>
          <div className="form-actions">
            <button type="button" className="button" onClick={() => setShowForm(false)}>Cancel</button>
            <button className="button button--primary">Save Client</button>
          </div>
        </form>
      ) : null}

      <section className="card plain-data-card">
        <Toolbar query={query} onQuery={setQuery} placeholder="Search company, brand, VAT, or address...">
          <select className="select" value={company} onChange={(event) => setCompany(event.target.value)}>
            <option value="all">All Companies</option>
            {companyOptions.map((name) => <option key={name} value={normalizeCompanyKey(name)}>{name}</option>)}
          </select>
          <select className="select" value={city} onChange={(event) => setCity(event.target.value)}>
            <option value="all">All Cities</option>
            {[...new Set(data.clients.map((item) => item.city).filter(Boolean))].map((item) => <option key={item}>{item}</option>)}
          </select>
        </Toolbar>
        <div className="table-wrap plain-list-wrap">
          <table className="data-table clients-table plain-data-table">
            <thead><tr><th>Company</th><th>Brand / Store</th><th>Contact</th><th>Tax Details</th><th>Location</th><th>Status</th></tr></thead>
            <tbody>
              {filtered.length ? filtered.map((client) => (
                <tr className="plain-data-row" key={client.id} onClick={() => router.push(`${routes.recordDetail}?type=client&id=${encodeURIComponent(client.id)}`)}>
                  <td>{client.companyName}<br /><small>{client.address || "-"}</small></td>
                  <td>{client.brandName || client.storeName || "-"}<br /><small>{client.storeLocation || ""}</small></td>
                  <td>{client.contactPerson || "-"}<br /><small>{client.mobile || client.email || "-"}</small></td>
                  <td>VAT: {client.vatNumber || "-"}<br /><small>CR: {client.crNumber || "-"}</small></td>
                  <td>{client.city || "-"}{client.country ? `, ${client.country}` : ""}</td>
                  <td><StatusBadge value={client.contractStatus} /></td>
                </tr>
              )) : <EmptyTableRow columns={6} />}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

export function ProjectsScreen({ status }: { status?: Project["status"] }) {
  const router = useRouter();
  const { data } = useBusinessData();
  const [query, setQuery] = useState("");
  const [company, setCompany] = useState("all");
  const companyOptions = useMemo(() => collectCompanyNames(data), [data]);
  const source = status ? data.projects.filter((item) => item.status === status) : data.projects;
  const filtered = source
    .filter((item) =>
      `${item.id} ${item.company} ${item.store} ${item.workDescription}`.toLowerCase().includes(query.toLowerCase()) &&
      (company === "all" || normalizeCompanyKey(item.company) === company),
    )
    .sort((a, b) => String(b.startDate || "").localeCompare(String(a.startDate || "")) || String(b.id).localeCompare(String(a.id), undefined, { numeric: true }));
  const title = status === "in-progress" ? "Ongoing Projects" : status === "completed" ? "Completed Projects" : "Projects";

  return (
    <>
      <PageHeader title={title} description="Plain project list with quick details." />
      <section className="card plain-data-card">
        <Toolbar query={query} onQuery={setQuery} placeholder="Search projects...">
          <select className="select" value={company} onChange={(event) => setCompany(event.target.value)}>
            <option value="all">All Companies</option>
            {companyOptions.map((name) => <option key={name} value={normalizeCompanyKey(name)}>{name}</option>)}
          </select>
        </Toolbar>
        <div className="table-wrap plain-list-wrap">
          <table className="data-table mobile-projects-table plain-data-table">
            <thead><tr><th>ID</th><th>Company</th><th>Store</th><th>Start Date</th><th>Value</th><th>Completion</th><th>Status</th></tr></thead>
            <tbody>
              {filtered.length ? filtered.map((project) => (
                <tr className="plain-data-row" key={project.id} onClick={() => router.push(`${routes.recordDetail}?type=project&id=${encodeURIComponent(project.id)}`)}>
                  <td>{project.id}</td>
                  <td>{project.company}</td>
                  <td>{project.store}</td>
                  <td>{project.startDate || "-"}</td>
                  <td>{money(project.value)}</td>
                  <td>{project.completion}%</td>
                  <td><StatusBadge value={project.status} /></td>
                </tr>
              )) : <EmptyTableRow columns={7} />}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

export function InvoicesScreen({ pendingOnly = false, poOnly = false }: { pendingOnly?: boolean; poOnly?: boolean }) {
  const router = useRouter();
  const { data } = useBusinessData();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [company, setCompany] = useState("all");
  const companyOptions = useMemo(() => collectCompanyNames(data), [data]);
  const source = useMemo(() => {
    if (poOnly) return data.invoices.filter((item) => item.status === "po");
    if (pendingOnly) return data.invoices.filter((item) => ["pending", "partial", "overdue"].includes(item.status));
    return data.invoices;
  }, [data.invoices, pendingOnly, poOnly]);
  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return source
      .filter((item) => {
        const target = [item.id, item.companyName, item.project, item.quotationNo, item.quotationSerialNumber, item.purchaseOrderNumber, item.status].join(" ").toLowerCase();
        return (
          (!normalizedQuery || target.includes(normalizedQuery)) &&
          (status === "all" || item.status === status) &&
          (company === "all" || normalizeCompanyKey(item.companyName || "") === company)
        );
      })
      .sort((a, b) => String(b.invoiceDate || "").localeCompare(String(a.invoiceDate || "")) || String(b.id).localeCompare(String(a.id), undefined, { numeric: true }));
  }, [company, query, source, status]);
  const total = source.reduce((sum, item) => sum + item.amount, 0);
  const received = source.reduce((sum, item) => sum + item.received, 0);
  const title = poOnly ? "Pending PO" : pendingOnly ? "Pending Payments" : "Invoices & Payments";

  return (
    <>
      <PageHeader
        title={title}
        description={poOnly ? "Invoices waiting on purchase order confirmation." : pendingOnly ? "Follow up outstanding balances." : "Plain invoice list with quick details."}
        actions={!pendingOnly && !poOnly ? <Link className="button button--primary" href={routes.newInvoice}><Plus size={14} />New Invoice</Link> : undefined}
      />
      <section className="metrics">
        <article className="metric-card card"><p>Total Invoiced</p><strong>{money(total)}</strong></article>
        <article className="metric-card card"><p>Total Received</p><strong>{money(received)}</strong></article>
        <article className="metric-card card"><p>Outstanding</p><strong>{money(total - received)}</strong></article>
      </section>
      <section className="card plain-data-card">
        <Toolbar query={query} onQuery={setQuery} placeholder="Search invoice, company, project, PO...">
          <select className="select" value={company} onChange={(event) => setCompany(event.target.value)}>
            <option value="all">All Companies</option>
            {companyOptions.map((name) => <option key={name} value={normalizeCompanyKey(name)}>{name}</option>)}
          </select>
          <select className="select" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="all">All Statuses</option>
            {invoiceStatusOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </Toolbar>
        <div className="table-wrap plain-list-wrap">
          <table className="data-table invoices-table plain-data-table">
            <thead><tr><th>Date</th><th>Invoice</th><th>PO</th><th>Customer</th><th>Status</th><th>Due Date</th><th>Amount</th><th>Balance Due</th></tr></thead>
            <tbody>
              {filtered.length ? filtered.map((invoice) => (
                <tr className="plain-data-row" key={invoice.id} onClick={() => router.push(`${routes.recordDetail}?type=invoice&id=${encodeURIComponent(invoice.id)}`)}>
                  <td>{invoice.invoiceDate || "-"}</td>
                  <td className="strong-cell">{invoice.id}</td>
                  <td>{invoice.purchaseOrderNumber || invoice.quotationNo || "-"}</td>
                  <td>{invoice.companyName}<br /><small>{invoice.project || "No project"}</small></td>
                  <td><StatusBadge value={invoice.status} /></td>
                  <td>{invoice.dueDate || invoice.followUpDate || "-"}</td>
                  <td className="money-cell">{money(invoice.amount)}</td>
                  <td className="money-cell">{money(invoice.amount - invoice.received)}</td>
                </tr>
              )) : <EmptyTableRow columns={8} message="No invoices found." />}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
