"use client";

import type { Invoice, Project } from "@/domain/entities/business";
import { exportInvoicePdf } from "@/application/services/document-export";
import { matchesRecordQuery } from "@/application/services/record-query";
import { routes } from "@/lib/routes";
import {
    DateRangeFields,
    EmptyTableRow,
    PageHeader,
    StatusBadge,
} from "@/presentation/components/ui";
import { money } from "@/presentation/data/sample-data";
import { useBusinessData } from "@/presentation/providers/business-data-provider";
import {
    collectCompanyNames,
    normalizeCompanyKey,
} from "@/presentation/utils/company-filters";
import { Edit3, FileText, Plus, Printer, ReceiptText, Search, Trash2 } from "lucide-react";
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
        <input
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          placeholder={placeholder}
        />
      </label>
      {children}
    </div>
  );
}

const invoiceStatusOptions: Array<{ label: string; value: Invoice["status"] }> =
  [
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
  const [error, setError] = useState("");
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
    ]
      .join(" ")
      .toLowerCase();

    return (
      target.includes(query.toLowerCase()) &&
      (company === "all" ||
        normalizeCompanyKey(client.companyName) === company) &&
      (city === "all" || client.city === city)
    );
  });

  async function addClient(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const value = (key: string) => String(form.get(key) || "").trim();
    setError("");
    try {
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
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Client could not be created. Please try again.",
      );
    }
  }

  return (
    <>
      <PageHeader
        title="Clients"
        description="Plain client list with quick details."
        actions={
          <button
            className="button button--primary"
            onClick={() => setShowForm((value) => !value)}
          >
            <Plus size={14} />
            New Client
          </button>
        }
      />

      {showForm ? (
        <form
          className="card form-card"
          onSubmit={(event) => void addClient(event)}
        >
          {error && (
            <div
              style={{
                color: "#d32f2f",
                marginBottom: "12px",
                fontSize: "14px",
              }}
            >
              {error}
            </div>
          )}
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
                <input
                  name={name}
                  type={name === "email" ? "email" : "text"}
                  required={name === "companyName"}
                />
              </label>
            ))}
            <label className="field field--full">
              <span>Address</span>
              <input name="address" />
            </label>
            <label className="field field--full">
              <span>Remarks</span>
              <textarea name="remarks" rows={3} />
            </label>
          </div>
          <div className="form-actions">
            <button
              type="button"
              className="button"
              onClick={() => setShowForm(false)}
            >
              Cancel
            </button>
            <button className="button button--primary">Save Client</button>
          </div>
        </form>
      ) : null}

      <section className="card plain-data-card">
        <Toolbar
          query={query}
          onQuery={setQuery}
          placeholder="Search company, brand, VAT, or address..."
        >
          <select
            className="select"
            value={company}
            onChange={(event) => setCompany(event.target.value)}
          >
            <option value="all">All Companies</option>
            {companyOptions.map((name) => (
              <option key={name} value={normalizeCompanyKey(name)}>
                {name}
              </option>
            ))}
          </select>
          <select
            className="select"
            value={city}
            onChange={(event) => setCity(event.target.value)}
          >
            <option value="all">All Cities</option>
            {[
              ...new Set(data.clients.map((item) => item.city).filter(Boolean)),
            ].map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </Toolbar>
        <div className="table-wrap plain-list-wrap">
          <table className="data-table clients-table plain-data-table">
            <thead>
              <tr>
                <th>Company</th>
                <th>Brand / Store</th>
                <th>Contact</th>
                <th>Tax Details</th>
                <th>Location</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length ? (
                filtered.map((client) => (
                  <tr
                    className="plain-data-row"
                    key={client.id}
                    onClick={() =>
                      router.push(
                        `${routes.recordDetail}?type=client&id=${encodeURIComponent(client.id)}`,
                      )
                    }
                  >
                    <td>
                      {client.companyName}
                      <br />
                      <small>{client.address || "-"}</small>
                    </td>
                    <td>
                      {client.brandName || client.storeName || "-"}
                      <br />
                      <small>{client.storeLocation || ""}</small>
                    </td>
                    <td>
                      {client.contactPerson || "-"}
                      <br />
                      <small>{client.mobile || client.email || "-"}</small>
                    </td>
                    <td>
                      VAT: {client.vatNumber || "-"}
                      <br />
                      <small>CR: {client.crNumber || "-"}</small>
                    </td>
                    <td>
                      {client.city || "-"}
                      {client.country ? `, ${client.country}` : ""}
                    </td>
                    <td>
                      <StatusBadge value={client.contractStatus} />
                    </td>
                  </tr>
                ))
              ) : (
                <EmptyTableRow columns={6} />
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

export function ProjectsScreen({ status }: { status?: Project["status"] }) {
  const router = useRouter();
  const { data, patchRecord, deleteRecord } = useBusinessData();
  const [query, setQuery] = useState("");
  const [company, setCompany] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const companyOptions = useMemo(() => collectCompanyNames(data), [data]);
  const source = status
    ? data.projects.filter((item) => item.status === status)
    : data.projects;
  const filtered = source
    .filter(
      (item) =>
        matchesRecordQuery(
          [item.id, item.company, item.store, item.workDescription],
          item.company,
          item.startDate,
          { query, company, dateFrom, dateTo },
        ),
    )
    .sort(
      (a, b) =>
        String(b.startDate || "").localeCompare(String(a.startDate || "")) ||
        String(b.id).localeCompare(String(a.id), undefined, { numeric: true }),
    );
  const title =
    status === "in-progress"
      ? "Ongoing Projects"
      : status === "completed"
        ? "Completed Projects"
        : "Projects";

  function linkedQuotation(project: Project) {
    return data.quotations.find(
      (quotation) =>
        quotation.linkedProjectId === project.id ||
        quotation.id === project.quotationNo,
    );
  }

  async function changeProjectWorkState(project: Project, nextState: string) {
    const workCompleted = nextState === "completed";
    if (workCompleted === Boolean(project.workCompleted)) return;
    await patchRecord("projects", project.id, {
      workCompleted,
      completion: workCompleted
        ? 100
        : project.completion === 100
          ? 0
          : project.completion,
    });
  }

  async function deleteProject(project: Project) {
    if (!window.confirm(`Delete project ${project.id}? You can restore it from Trash.`)) return;
    await deleteRecord("projects", project.id);
  }

  return (
    <>
      <PageHeader
        title={title}
        description="Plain project list with quick details."
      />
      <section className="card plain-data-card">
        <Toolbar
          query={query}
          onQuery={setQuery}
          placeholder="Search projects..."
        >
          <select
            className="select"
            value={company}
            onChange={(event) => setCompany(event.target.value)}
          >
            <option value="all">All Companies</option>
            {companyOptions.map((name) => (
              <option key={name} value={normalizeCompanyKey(name)}>
                {name}
              </option>
            ))}
          </select>
          <DateRangeFields
            from={dateFrom}
            to={dateTo}
            onFromChange={setDateFrom}
            onToChange={setDateTo}
          />
        </Toolbar>
        <div className="table-wrap plain-list-wrap">
          <table className="data-table mobile-projects-table plain-data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Company</th>
                <th>Store</th>
                <th>Start Date</th>
                <th>Value</th>
                <th>Completion</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length ? (
                filtered.map((project) => {
                  const quotation = linkedQuotation(project);
                  const invoice = quotation
                    ? data.invoices.find(
                        (item) =>
                          item.quotationSerialNumber === quotation.serialNumber ||
                          (!item.quotationSerialNumber && item.quotationNo === quotation.id),
                      )
                    : undefined;

                  return (
                  <tr
                    className={`plain-data-row${project.workCompleted && project.status !== "completed" ? " project-work-complete" : ""}`}
                    key={project.id}
                    onClick={() =>
                      router.push(
                        `${routes.recordDetail}?type=project&id=${encodeURIComponent(project.id)}`,
                      )
                    }
                  >
                    <td>{project.id}</td>
                    <td>{project.company}</td>
                    <td>{project.store}</td>
                    <td>{project.startDate || "-"}</td>
                    <td>{money(project.value)}</td>
                    <td>{project.completion}%</td>
                    <td onClick={(event) => event.stopPropagation()}>
                      <select
                        className="inline-select status-inline-select"
                        value={project.workCompleted ? "completed" : "pending"}
                        aria-label={`Change work status for project ${project.id}`}
                        onChange={(event) => void changeProjectWorkState(project, event.target.value)}
                      >
                        <option value="pending">Pending</option>
                        <option value="completed">Completed</option>
                      </select>
                    </td>
                    <td onClick={(event) => event.stopPropagation()}>
                      <div className="row-actions project-row-actions">
                        {project.workCompleted && quotation ? (
                          <Link
                            className="button button--primary project-invoice-action"
                            href={
                              invoice
                                ? `${routes.editInvoice}?id=${encodeURIComponent(invoice.id)}`
                                : `${routes.quotationInvoice}?projectId=${encodeURIComponent(project.id)}`
                            }
                          >
                            <ReceiptText size={15} />
                            {invoice ? "Open Invoice" : "Create Invoice"}
                          </Link>
                        ) : null}
                        <Link
                          className="icon-button"
                          href={`${routes.editProject}?id=${encodeURIComponent(project.id)}`}
                          title={`Edit project ${project.id}`}
                          aria-label={`Edit project ${project.id}`}
                        >
                          <Edit3 size={16} />
                        </Link>
                        <button
                          className="icon-button icon-button--danger"
                          type="button"
                          title={`Delete project ${project.id}`}
                          aria-label={`Delete project ${project.id}`}
                          onClick={() => void deleteProject(project)}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })
              ) : (
                <EmptyTableRow columns={8} />
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

export function InvoicesScreen({
  pendingOnly = false,
  poOnly = false,
}: {
  pendingOnly?: boolean;
  poOnly?: boolean;
}) {
  const router = useRouter();
  const {
    data,
    updateInvoiceStatus,
    completeInvoicePayment,
    deleteRecord,
  } = useBusinessData();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [company, setCompany] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [payingInvoice, setPayingInvoice] = useState<Invoice | null>(null);
  const [profitInput, setProfitInput] = useState("");
  const [paymentError, setPaymentError] = useState("");
  const [savingPayment, setSavingPayment] = useState(false);
  const companyOptions = useMemo(() => collectCompanyNames(data), [data]);
  const source = useMemo(() => {
    if (poOnly) return data.invoices.filter((item) => item.status === "po");
    if (pendingOnly)
      return data.invoices.filter((item) =>
        ["pending", "partial", "overdue"].includes(item.status),
      );
    return data.invoices;
  }, [data.invoices, pendingOnly, poOnly]);
  const filtered = useMemo(() => {
    return source
      .filter((item) => {
        return (
          matchesRecordQuery(
            [
              item.id,
              item.companyName,
              item.project,
              item.quotationNo,
              item.quotationSerialNumber,
              item.purchaseOrderNumber,
              item.status,
            ],
            item.companyName,
            item.invoiceDate,
            { query, company, dateFrom, dateTo },
          ) &&
          (status === "all" || item.status === status)
        );
      })
      .sort(
        (a, b) =>
          String(b.invoiceDate || "").localeCompare(
            String(a.invoiceDate || ""),
          ) ||
          String(b.id).localeCompare(String(a.id), undefined, {
            numeric: true,
          }),
      );
  }, [company, dateFrom, dateTo, query, source, status]);
  // Summary values follow the active filters so the figures always describe
  // the records currently visible to the user.
  const total = filtered.reduce((sum, item) => sum + item.amount, 0);
  const received = filtered.reduce((sum, item) => sum + item.received, 0);
  const title = poOnly
    ? "Pending PO"
    : pendingOnly
      ? "Pending Payments"
      : "Invoices & Payments";

  async function changeInvoiceStatus(invoice: Invoice, nextStatus: string) {
    if (nextStatus === invoice.status) return;
    if (nextStatus === "paid") {
      setPayingInvoice(invoice);
      setProfitInput(
        invoice.profitAmount === undefined ? "" : String(invoice.profitAmount),
      );
      setPaymentError("");
      return;
    }
    await updateInvoiceStatus(invoice.id, nextStatus as Invoice["status"]);
  }

  async function confirmPaidInvoice(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!payingInvoice) return;
    const profitAmount = Number(profitInput);
    if (!profitInput.trim() || !Number.isFinite(profitAmount) || profitAmount < 0) {
      setPaymentError("Enter the profit earned from this invoice. Use 0 if there was no profit.");
      return;
    }
    if (profitAmount > payingInvoice.amount) {
      setPaymentError("Profit cannot be greater than the invoice total.");
      return;
    }

    setSavingPayment(true);
    setPaymentError("");
    try {
      await completeInvoicePayment(payingInvoice.id, profitAmount);
      setPayingInvoice(null);
      setProfitInput("");
    } catch (caught) {
      setPaymentError(caught instanceof Error ? caught.message : "Payment could not be completed.");
    } finally {
      setSavingPayment(false);
    }
  }

  async function deleteInvoice(invoice: Invoice) {
    if (!window.confirm(`Delete invoice ${invoice.id}? You can restore it from Trash.`)) return;
    await deleteRecord("invoices", invoice.id);
  }

  async function printInvoice(invoice: Invoice) {
    await exportInvoicePdf(invoice, data.company);
  }

  function linkedQuotationForInvoice(invoice: Invoice) {
    return data.quotations.find(
      (quotation) =>
        quotation.linkedProjectId === invoice.linkedProjectId ||
        quotation.serialNumber === invoice.quotationSerialNumber ||
        quotation.id === invoice.quotationNo,
    );
  }

  return (
    <>
      <PageHeader
        title={title}
        description={
          poOnly
            ? "Invoices waiting on purchase order confirmation."
            : pendingOnly
              ? "Follow up outstanding balances."
              : "Plain invoice list with quick details."
        }
        actions={
          !pendingOnly && !poOnly ? (
            <Link className="button button--primary" href={routes.newInvoice}>
              <Plus size={14} />
              New Invoice
            </Link>
          ) : undefined
        }
      />
      <section className="metrics">
        <article className="metric-card card">
          <p>Total Invoiced</p>
          <strong>{money(total)}</strong>
        </article>
        <article className="metric-card card">
          <p>Total Received</p>
          <strong>{money(received)}</strong>
        </article>
        <article className="metric-card card">
          <p>Outstanding</p>
          <strong>{money(total - received)}</strong>
        </article>
      </section>
      <section className="card plain-data-card">
        <Toolbar
          query={query}
          onQuery={setQuery}
          placeholder="Search invoice, company, project, PO..."
        >
          <select
            className="select"
            value={company}
            onChange={(event) => setCompany(event.target.value)}
          >
            <option value="all">All Companies</option>
            {companyOptions.map((name) => (
              <option key={name} value={normalizeCompanyKey(name)}>
                {name}
              </option>
            ))}
          </select>
          <DateRangeFields
            from={dateFrom}
            to={dateTo}
            onFromChange={setDateFrom}
            onToChange={setDateTo}
          />
          <select
            className="select"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="all">All Statuses</option>
            {invoiceStatusOptions.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </Toolbar>
        <div className="table-wrap plain-list-wrap">
          <table className="data-table invoices-table plain-data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Invoice</th>
                <th>PO</th>
                <th>Customer</th>
                <th>Status</th>
                <th>Due Date</th>
                <th>Amount</th>
                <th>Balance Due</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length ? (
                filtered.map((invoice) => (
                  <tr
                    className="plain-data-row"
                    key={invoice.id}
                    onClick={() =>
                      router.push(
                        `${routes.recordDetail}?type=invoice&id=${encodeURIComponent(invoice.id)}`,
                      )
                    }
                  >
                    <td>{invoice.invoiceDate || "-"}</td>
                    <td className="strong-cell">{invoice.id}</td>
                    <td>
                      {invoice.purchaseOrderNumber ||
                        invoice.quotationNo ||
                        "-"}
                    </td>
                    <td>
                      {invoice.companyName}
                      <br />
                      <small>{invoice.project || "No project"}</small>
                    </td>
                    <td onClick={(event) => event.stopPropagation()}>
                      <select
                        className="inline-select status-inline-select"
                        aria-label={`Change status for invoice ${invoice.id}`}
                        value={invoice.status}
                        onChange={(event) =>
                          void changeInvoiceStatus(invoice, event.target.value)
                        }
                      >
                        {invoiceStatusOptions.map((item) => (
                          <option key={item.value} value={item.value}>
                            {item.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>{invoice.dueDate || invoice.followUpDate || "-"}</td>
                    <td className="money-cell">{money(invoice.amount)}</td>
                    <td className="money-cell">
                      {money(invoice.amount - invoice.received)}
                    </td>
                    <td onClick={(event) => event.stopPropagation()}>
                      <div className="row-actions">
                        <button
                          className="icon-button"
                          type="button"
                          title={`Print invoice ${invoice.id}`}
                          aria-label={`Print invoice ${invoice.id}`}
                          onClick={() => void printInvoice(invoice)}
                        >
                          <Printer size={17} />
                        </button>
                        {linkedQuotationForInvoice(invoice) ? (
                          <Link
                            className="icon-button"
                            href={`${routes.recordDetail}?type=quotation&id=${encodeURIComponent(linkedQuotationForInvoice(invoice)!.id)}`}
                            title={`Open quotation for ${invoice.id}`}
                            aria-label={`Open quotation for invoice ${invoice.id}`}
                          >
                            <FileText size={17} />
                          </Link>
                        ) : null}
                        <Link
                          className="icon-button"
                          href={`${routes.editInvoice}?id=${encodeURIComponent(invoice.id)}`}
                          title={`Edit invoice ${invoice.id}`}
                          aria-label={`Edit invoice ${invoice.id}`}
                        >
                          <Edit3 size={17} />
                        </Link>
                        <button
                          className="icon-button icon-button--danger"
                          type="button"
                          title={`Delete invoice ${invoice.id}`}
                          aria-label={`Delete invoice ${invoice.id}`}
                          onClick={() => void deleteInvoice(invoice)}
                        >
                          <Trash2 size={17} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <EmptyTableRow columns={9} message="No invoices found." />
              )}
            </tbody>
          </table>
        </div>
      </section>

      {payingInvoice ? (
        <div className="modal-backdrop profit-dialog-backdrop" role="presentation">
          <form
            className="modal-card card profit-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="profit-dialog-title"
            onSubmit={(event) => void confirmPaidInvoice(event)}
          >
            <header className="modal-card__header">
              <div>
                <h2 id="profit-dialog-title">Complete payment</h2>
                <p>{payingInvoice.id} · {payingInvoice.companyName}</p>
              </div>
            </header>
            <div className="profit-dialog-summary">
              <span>Invoice income</span>
              <strong>{money(payingInvoice.amount)}</strong>
            </div>
            <label className="field">
              <span>Profit earned (SAR)</span>
              <input
                autoFocus
                inputMode="decimal"
                value={profitInput}
                onChange={(event) => setProfitInput(event.target.value.replace(/[^0-9.]/g, ""))}
                placeholder="0.00"
                required
              />
            </label>
            {paymentError ? <div className="form-message form-message--error">{paymentError}</div> : null}
            <div className="form-actions">
              <button className="button" type="button" disabled={savingPayment} onClick={() => setPayingInvoice(null)}>Cancel</button>
              <button className="button button--primary" type="submit" disabled={savingPayment}>
                {savingPayment ? "Saving..." : "Mark paid & save profit"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
