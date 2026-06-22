"use client";

import {
  parseQuotationDocument,
  type QuotationImportDraft,
} from "@/application/services/quotation-import";
import {
  parseInvoiceDocument,
  type InvoiceImportDraft,
} from "@/application/services/invoice-import";
import { exportQuotationPdf } from "@/application/services/document-export";
import type { BusinessDataSet } from "@/domain/entities/business";
import { routes } from "@/lib/routes";
import { createQuotationSerial, ensureQuotationSerial } from "@/lib/record-ids";
import {
  EmptyTableRow,
  PageHeader,
  StatusBadge,
} from "@/presentation/components/ui";
import { money } from "@/presentation/data/sample-data";
import { useBusinessData } from "@/presentation/providers/business-data-provider";
import { InvoiceDocumentModal } from "@/presentation/features/invoices/invoice-document-modal";
import {
  Check,
  Download,
  Edit3,
  FileUp,
  LoaderCircle,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";

type Quotation = BusinessDataSet["quotations"][number];
type QuotationLineItem = NonNullable<Quotation["lineItems"]>[number];

type QuotationStatus = "draft" | "sent" | "approved" | "rejected" | "expired";

const statusOptions: { label: string; value: QuotationStatus }[] = [
  { label: "Draft", value: "draft" },
  { label: "Sent", value: "sent" },
  { label: "Approved", value: "approved" },
  { label: "Rejected", value: "rejected" },
  { label: "Expired", value: "expired" },
];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function toNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null) {
    return value as Record<string, unknown>;
  }

  return {};
}

function readFirstString(
  record: Record<string, unknown>,
  keys: string[],
  fallback = ""
) {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }

  return fallback;
}

function readFirstNumber(
  record: Record<string, unknown>,
  keys: string[],
  fallback = 0
) {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }

  return fallback;
}

function normalizeQuotation(quotation: Quotation) {
  const record = asRecord(quotation);

  return {
    raw: quotation,
    id: readFirstString(record, ["id"], crypto.randomUUID()),
    serialNumber: ensureQuotationSerial(
      readFirstString(record, ["id"], ""),
      readFirstString(record, ["serialNumber"], "")
    ),
    issueDate: readFirstString(record, ["issueDate"], ""),
    validityDate: readFirstString(record, ["validityDate"], ""),
    companyName: readFirstString(
      record,
      ["companyName", "company"],
      "Unnamed Company"
    ),
    store: readFirstString(record, ["store", "branch", "storeBranch"], ""),
    scopeOfWork: readFirstString(
      record,
      ["scopeOfWork", "description"],
      ""
    ),
    amount: readFirstNumber(record, ["amount"], 0),
    status: readFirstString(record, ["status"], "draft") as QuotationStatus,
    followUpDate: readFirstString(record, ["followUpDate"], ""),
    remarks: readFirstString(record, ["remarks", "notes"], ""),
  };
}

function createPatchedQuotation(quotation: Quotation, patch: Partial<ReturnType<typeof normalizeQuotation>>): Quotation {
  return { ...quotation, issueDate: patch.issueDate ?? quotation.issueDate, validityDate: patch.validityDate ?? quotation.validityDate, companyName: patch.companyName ?? quotation.companyName, store: patch.store ?? quotation.store, scopeOfWork: patch.scopeOfWork ?? quotation.scopeOfWork, amount: patch.amount ?? quotation.amount, status: patch.status ?? quotation.status, followUpDate: patch.followUpDate ?? quotation.followUpDate, remarks: patch.remarks ?? quotation.remarks };
}

export function QuotationsScreen() {
  const {
    data,
    syncState,
    createQuotation,
    updateRecord,
    updateQuotationStatus,
    deleteRecord,
  } = useBusinessData();

  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");

  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importDraft, setImportDraft] = useState<QuotationImportDraft | null>(null);
  const [lineItems, setLineItems] = useState<QuotationLineItem[]>([
    { serialNo: 1, description: "", quantity: 1, unitPrice: 0, amount: 0, vatRate: data.company.vatRate, vatAmount: 0 },
  ]);
  const [invoiceImportDraft, setInvoiceImportDraft] = useState<InvoiceImportDraft | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [editingId, setEditingId] = useState("");
  const [draft, setDraft] = useState<ReturnType<typeof normalizeQuotation> | null>(null);

  const quotationTotals = useMemo(() => {
    const subTotal = lineItems.reduce((sum, item) => sum + item.amount, 0);
    const vatAmount = lineItems.reduce((sum, item) => sum + item.vatAmount, 0);
    return { subTotal, vatAmount, total: subTotal + vatAmount };
  }, [lineItems]);

  function updateLineItem(index: number, patch: Partial<QuotationLineItem>) {
    setLineItems((current) => current.map((item, itemIndex) => {
      if (itemIndex !== index) return item;
      const next = { ...item, ...patch };
      next.amount = next.quantity * next.unitPrice;
      next.vatAmount = next.amount * next.vatRate / 100;
      return next;
    }));
  }

  const quotations = useMemo(() => {
    return data.quotations.map(normalizeQuotation);
  }, [data.quotations]);

  const clientOptions = useMemo(() => {
    return data.clients
      .map((client) => readFirstString(asRecord(client), ["companyName", "company", "name"], ""))
      .filter(Boolean);
  }, [data.clients]);

  const filteredQuotations = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return quotations.filter((quotation) => {
      const target = [
        quotation.id,
        quotation.companyName,
        quotation.store,
        quotation.scopeOfWork,
        quotation.status,
        quotation.remarks,
      ]
        .join(" ")
        .toLowerCase();

      const matchesQuery = !normalizedQuery || target.includes(normalizedQuery);
      const matchesStatus = status === "all" || quotation.status === status;

      return matchesQuery && matchesStatus;
    });
  }, [quotations, query, status]);

  const stats = useMemo(() => {
    const totalValue = quotations.reduce((sum, item) => sum + item.amount, 0);
    const pending = quotations.filter((item) =>
      ["draft", "sent"].includes(item.status)
    ).length;
    const approved = quotations.filter(
      (item) => item.status === "approved"
    ).length;

    return [
      { label: "Total Quotations", value: quotations.length.toString() },
      { label: "Pending Approval", value: pending.toString() },
      { label: "Approved", value: approved.toString() },
      { label: "Total Quote Value", value: money(totalValue) },
    ];
  }, [quotations]);

  const groupedQuotations = useMemo(() => {
    return Array.from(
      filteredQuotations
        .reduce((map, item) => {
          const company = item.companyName?.trim() || "Unnamed Company";
          const list = map.get(company) || [];
          list.push(item);
          map.set(company, list);
          return map;
        }, new Map<string, typeof filteredQuotations>())
        .entries()
    ).map(([company, items]) => ({
      company,
      items,
      total: items.reduce((sum, item) => sum + item.amount, 0),
      approved: items.filter((item) => item.status === "approved").length,
    }));
  }, [filteredQuotations]);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = new FormData(event.currentTarget);
    const companyName = String(form.get("companyName") || "").trim();
    const scopeOfWork = String(form.get("scopeOfWork") || "").trim();
    const amount = quotationTotals.total;

    if (!companyName) {
      setFormError("Company name is required.");
      return;
    }

    if (!scopeOfWork) {
      setFormError("Scope of work is required.");
      return;
    }

    setSubmitting(true);
    setFormError("");

    const quotation: Quotation = {
      id:
        String(form.get("id") || "").trim() ||
        `QT-${String(data.quotations.length + 1).padStart(5, "0")}`,
      serialNumber: createQuotationSerial(),
      issueDate: String(form.get("issueDate") || today()),
      validityDate: String(form.get("validityDate") || ""),
      companyName,
      store: String(form.get("store") || "").trim(),
      scopeOfWork,
      amount,
      currency: String(form.get("currency") || data.company.currency || "SAR").trim(),
      customerVatNumber: String(form.get("customerVatNumber") || "").trim(),
      customerAddress: String(form.get("customerAddress") || "").trim(),
      subTotal: quotationTotals.subTotal,
      vatRate: lineItems[0]?.vatRate ?? data.company.vatRate,
      vatAmount: quotationTotals.vatAmount,
      lineItems,
      termsAndConditions: String(form.get("termsAndConditions") || "").trim(),
      status: "draft",
      followUpDate: String(form.get("followUpDate") || ""),
      remarks: String(form.get("remarks") || "").trim(),
    };

    try {
      await createQuotation(quotation);
      setShowForm(false);
      setImportDraft(null);
      event.currentTarget.reset();
    } catch (caughtError) {
      setFormError(
        caughtError instanceof Error
          ? caughtError.message
          : "Quotation could not be saved."
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDocumentImport(file?: File) {
    if (!file || importing) return;
    setImporting(true);
    setFormError("");

    try {
      const parsed = await parseQuotationDocument(file);
      const importedLines = (parsed.lineItems.length ? parsed.lineItems : [{ serialNo: 1, description: parsed.scopeOfWork, quantity: 1, unitPrice: parsed.subTotal, amount: parsed.subTotal }]).map((item, index) => ({
        ...item,
        serialNo: index + 1,
        vatRate: parsed.vatRate,
        vatAmount: item.amount * parsed.vatRate / 100,
      }));
      setLineItems(importedLines);
      setImportDraft(parsed);
      setShowForm(true);
    } catch (quotationError) {
      try {
        const invoice = await parseInvoiceDocument(file);
        setShowForm(false);
        setImportDraft(null);
        setInvoiceImportDraft(invoice);
      } catch {
        setFormError(
          quotationError instanceof Error
            ? quotationError.message
            : "The document could not be imported."
        );
        setShowForm(true);
      }
    } finally {
      setImporting(false);
    }
  }

  function cancelEdit() { setEditingId(""); setDraft(null); }
  async function saveEdit() { if (!draft) return; const original=data.quotations.find(item=>normalizeQuotation(item).id===draft.id); if(!original)return; await updateRecord("quotations",createPatchedQuotation(original,draft)); cancelEdit(); }
  function updateDraft<TKey extends keyof ReturnType<typeof normalizeQuotation>>(key:TKey,value:ReturnType<typeof normalizeQuotation>[TKey]) { setDraft(current=>current?{...current,[key]:value}:current); }

  async function handleStatusChange(
    quotation: ReturnType<typeof normalizeQuotation>,
    nextStatus: string
  ) {
    await updateQuotationStatus(quotation.id, nextStatus as QuotationStatus);
  }

  async function handleDelete(quotation: ReturnType<typeof normalizeQuotation>) {
    const confirmed = window.confirm(
      `Delete quotation "${quotation.id}" for "${quotation.companyName}"?`
    );

    if (!confirmed) return;

    await deleteRecord("quotations", quotation.id);
  }

  async function handleExport(quotation: ReturnType<typeof normalizeQuotation>) {
    setFormError("");
    try {
      await exportQuotationPdf(quotation.raw, data.company);
    } catch (caughtError) {
      setFormError(caughtError instanceof Error ? caughtError.message : "Quotation export failed.");
    }
  }

  return (
    <>
      <PageHeader
        title="Quotations"
        description={`Track quotations from submission to approval, then push them straight to invoicing. Cloud: ${syncState}.`}
        actions={
          <>
            <button
              className="button"
              type="button"
              disabled={importing}
              onClick={() => fileInputRef.current?.click()}
            >
              {importing ? <LoaderCircle className="spin" size={14} /> : <FileUp size={14} />}
              {importing ? "Reading..." : "Import Excel / PDF"}
            </button>
            <button
              className="button button--primary"
              type="button"
              onClick={() => {
                setImportDraft(null);
                setLineItems([{ serialNo: 1, description: "", quantity: 1, unitPrice: 0, amount: 0, vatRate: data.company.vatRate, vatAmount: 0 }]);
                setFormError("");
                setShowForm((value) => !value);
              }}
            >
              <Plus size={14} />
              New Quotation
            </button>
          </>
        }
      />

      <input
        ref={fileInputRef}
        className="file-input"
        type="file"
        accept=".pdf,.xlsx,.xls,.xlsm,.xlsb,.ods,.csv"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          void handleDocumentImport(file);
        }}
      />

      {formError && !showForm ? <div className="form-message form-message--error">{formError}</div> : null}

      {showForm ? (
        <form key={importDraft?.remarks || "manual"} className="card form-card" onSubmit={handleCreate}>
          {importDraft ? (
            <div className="form-message form-message--success">
              Document read successfully. Review the extracted fields before saving.
            </div>
          ) : null}
          <div className="form-grid">
            <label className="field">
              <span>Quotation No.</span>
              <input name="id" defaultValue={importDraft?.id} placeholder="Generated automatically" />
            </label>

            <label className="field">
              <span>Company Name *</span>
              <input
                name="companyName"
                list="quotation-clients-list"
                placeholder="Company / client name"
                defaultValue={importDraft?.companyName}
              />
              <datalist id="quotation-clients-list">
                {clientOptions.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </label>

            <label className="field">
              <span>Store / Branch</span>
              <input name="store" placeholder="Store or branch" defaultValue={importDraft?.store} />
            </label>

            <label className="field">
              <span>Issue Date</span>
              <input name="issueDate" type="date" defaultValue={importDraft?.issueDate || today()} />
            </label>

            <label className="field">
              <span>Validity Date</span>
              <input name="validityDate" type="date" defaultValue={importDraft?.validityDate} />
            </label>

            <label className="field">
              <span>Amount (SAR)</span>
              <input name="amount" type="number" min="0" step="0.01" value={quotationTotals.total.toFixed(2)} readOnly />
            </label>

            <label className="field"><span>Customer VAT Number</span><input name="customerVatNumber" inputMode="numeric" /></label>
            <label className="field"><span>Currency</span><input name="currency" defaultValue={importDraft?.currency || data.company.currency || "SAR"} /></label>
            <label className="field field--full"><span>Customer Address</span><input name="customerAddress" /></label>

            <label className="field">
              <span>Follow-up Date</span>
              <input name="followUpDate" type="date" defaultValue={importDraft?.followUpDate} />
            </label>

            <label className="field field--full">
              <span>Scope of Work *</span>
              <textarea name="scopeOfWork" rows={3} placeholder="Describe the quotation scope" defaultValue={importDraft?.scopeOfWork} />
            </label>

            <label className="field field--full">
              <span>Remarks</span>
              <textarea name="remarks" rows={2} placeholder="Internal notes" defaultValue={importDraft?.remarks} />
            </label>

            <label className="field field--full"><span>Terms & Conditions</span><textarea name="termsAndConditions" rows={3} defaultValue={importDraft?.termsAndConditions} /></label>
          </div>

          <div className="table-wrap">
            <table className="data-table project-line-items">
              <thead><tr><th>#</th><th>Description</th><th>Qty</th><th>Unit Price</th><th>VAT %</th><th>VAT</th><th>Line Total</th><th /></tr></thead>
              <tbody>{lineItems.map((item, index) => <tr key={index}>
                <td>{index + 1}</td>
                <td><textarea className="inline-input inline-input--wide" value={item.description} onChange={(event) => updateLineItem(index, { description: event.target.value })} /></td>
                <td><input className="inline-input" type="number" min="0" step="0.01" value={item.quantity} onChange={(event) => updateLineItem(index, { quantity: toNumber(event.target.value) })} /></td>
                <td><input className="inline-input" type="number" min="0" step="0.01" value={item.unitPrice} onChange={(event) => updateLineItem(index, { unitPrice: toNumber(event.target.value) })} /></td>
                <td><input className="inline-input" type="number" min="0" max="100" step="0.01" value={item.vatRate} onChange={(event) => updateLineItem(index, { vatRate: toNumber(event.target.value) })} /></td>
                <td>{money(item.vatAmount)}</td><td>{money(item.amount + item.vatAmount)}</td>
                <td><button className="icon-button icon-button--danger" type="button" disabled={lineItems.length === 1} onClick={() => setLineItems((items) => items.filter((_, itemIndex) => itemIndex !== index).map((entry, itemIndex) => ({ ...entry, serialNo: itemIndex + 1 })))}><Trash2 size={15} /></button></td>
              </tr>)}</tbody>
            </table>
          </div>
          <div className="form-actions"><span>Subtotal: {money(quotationTotals.subTotal)} · VAT: {money(quotationTotals.vatAmount)}</span><button className="button" type="button" onClick={() => setLineItems((items) => [...items, { serialNo: items.length + 1, description: "", quantity: 1, unitPrice: 0, amount: 0, vatRate: data.company.vatRate, vatAmount: 0 }])}><Plus size={14} />Add Item</button></div>

          {formError ? (
            <div className="form-message form-message--error">{formError}</div>
          ) : null}

          <div className="form-actions">
            <button type="button" className="button" onClick={() => { setShowForm(false); setImportDraft(null); setFormError(""); }}>
              Cancel
            </button>

            <button className="button button--primary" type="submit" disabled={submitting}>
              {submitting ? "Saving..." : "Save Quotation"}
            </button>
          </div>
        </form>
      ) : null}

      <section className="projects-overview-grid">
        {stats.map((item) => (
          <article className="project-stat-card card" key={item.label}>
            <div>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </div>
          </article>
        ))}
      </section>

      <section className="card table-toolbar projects-toolbar">
        <label className="toolbar-search">
          <Search size={17} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search quotation, company, scope..."
          />
        </label>

        <select
          className="select"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option value="all">All Status</option>
          {statusOptions.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </section>

      <section className="card projects-table-card">
        <div className="projects-table-header">
          <div>
            <h2>Quotation Tracker</h2>
            <p>
              Showing {filteredQuotations.length} of {quotations.length} quotations.
            </p>
          </div>
        </div>

        <div className="table-wrap projects-table-wrap">
          <table className="data-table projects-table quotations-table">
            <thead>
              <tr>
                <th>Quotation No</th>
                <th>Serial No</th>
                <th>Issue Date</th>
                <th>Company</th>
                <th>Store / Branch</th>
                <th>Scope of Work</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Follow-up</th>
                <th>Remarks</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {filteredQuotations.length ? (
                filteredQuotations.map((quotation) => {
                  const isEditing = editingId === quotation.id && draft;

                  return (
                    <tr key={quotation.id}>
                      <td className="strong-cell">{quotation.id}</td>
                      <td className="strong-cell">{quotation.serialNumber}</td>

                      <td>
                        {isEditing ? (
                          <input
                            className="inline-input"
                            type="date"
                            value={draft.issueDate}
                            onChange={(event) =>
                              updateDraft("issueDate", event.target.value)
                            }
                          />
                        ) : (
                          quotation.issueDate || "—"
                        )}
                      </td>

                      <td>
                        {isEditing ? (
                          <input
                            className="inline-input"
                            value={draft.companyName}
                            onChange={(event) =>
                              updateDraft("companyName", event.target.value)
                            }
                          />
                        ) : (
                          <strong>{quotation.companyName}</strong>
                        )}
                      </td>

                      <td>
                        {isEditing ? (
                          <input
                            className="inline-input"
                            value={draft.store}
                            onChange={(event) => updateDraft("store", event.target.value)}
                          />
                        ) : (
                          quotation.store || "—"
                        )}
                      </td>

                      <td>
                        {isEditing ? (
                          <input
                            className="inline-input inline-input--wide"
                            value={draft.scopeOfWork}
                            onChange={(event) =>
                              updateDraft("scopeOfWork", event.target.value)
                            }
                          />
                        ) : (
                          <span className="description-cell">
                            {quotation.scopeOfWork || "—"}
                          </span>
                        )}
                      </td>

                      <td className="money-cell">
                        {isEditing ? (
                          <input
                            className="inline-input"
                            type="number"
                            value={draft.amount}
                            onChange={(event) =>
                              updateDraft("amount", Number(event.target.value || 0))
                            }
                          />
                        ) : (
                          money(quotation.amount)
                        )}
                      </td>

                      <td>
                        <select
                          className="inline-select status-inline-select"
                          value={isEditing ? draft.status : quotation.status}
                          onChange={(event) => {
                            if (isEditing) {
                              updateDraft(
                                "status",
                                event.target.value as QuotationStatus
                              );
                              return;
                            }

                            void handleStatusChange(quotation, event.target.value);
                          }}
                        >
                          {statusOptions.map((item) => (
                            <option key={item.value} value={item.value}>
                              {item.label}
                            </option>
                          ))}
                        </select>

                        {!isEditing ? (
                          <div className="status-under-select">
                            <StatusBadge value={quotation.status} />
                          </div>
                        ) : null}
                      </td>

                      <td>
                        {isEditing ? (
                          <input
                            className="inline-input"
                            type="date"
                            value={draft.followUpDate}
                            onChange={(event) =>
                              updateDraft("followUpDate", event.target.value)
                            }
                          />
                        ) : (
                          quotation.followUpDate || "—"
                        )}
                      </td>

                      <td>
                        {isEditing ? (
                          <input
                            className="inline-input inline-input--wide"
                            value={draft.remarks}
                            onChange={(event) => updateDraft("remarks", event.target.value)}
                          />
                        ) : (
                          quotation.remarks || "—"
                        )}
                      </td>

                      <td>
                        <div className="row-actions">
                          {isEditing ? (
                            <>
                              <button
                                className="icon-button icon-button--success"
                                type="button"
                                onClick={() => void saveEdit()}
                                title="Save"
                              >
                                <Check size={17} />
                              </button>

                              <button
                                className="icon-button"
                                type="button"
                                onClick={cancelEdit}
                                title="Cancel"
                              >
                                <X size={17} />
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                className="icon-button"
                                type="button"
                                onClick={() => void handleExport(quotation)}
                                title="Export quotation PDF"
                              >
                                <Download size={17} />
                              </button>

                              <Link
                                className="icon-button"
                                href={`${routes.quotationInvoice}?serial=${encodeURIComponent(quotation.serialNumber)}`}
                                title={data.invoices.some((invoice) => invoice.quotationSerialNumber === quotation.serialNumber || (!invoice.quotationSerialNumber && invoice.quotationNo === quotation.id)) ? "View or edit invoice" : "Add invoice"}
                              >
                                <FileUp size={17} />
                              </Link>

                              <Link
                                className="icon-button"
                                href={`${routes.editQuotation}?id=${encodeURIComponent(quotation.id)}`}
                                title="Edit full quotation"
                              >
                                <Edit3 size={17} />
                              </Link>

                              <button
                                className="icon-button icon-button--danger"
                                type="button"
                                onClick={() => void handleDelete(quotation)}
                                title="Delete"
                              >
                                <Trash2 size={17} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <EmptyTableRow
                  columns={11}
                  message="No quotations found. Click New Quotation or import your old Excel workbook."
                />
              )}
            </tbody>
          </table>
        </div>

        <div className="mobile-card-list mobile-company-list">
          {groupedQuotations.length ? (
            groupedQuotations.map((group) => (
              <section className="mobile-company-card" key={group.company}>
                <header>
                  <span>Company History</span>
                  <h3>{group.company}</h3>
                  <small>
                    {group.items.length} quotation(s) · {group.approved} approved · Total {money(group.total)}
                  </small>
                </header>

                <div className="mobile-company-card__records">
                  {group.items.map((quotation) => {
                    const hasInvoice = data.invoices.some(
                      (invoice) =>
                        invoice.quotationSerialNumber === quotation.serialNumber ||
                        (!invoice.quotationSerialNumber && invoice.quotationNo === quotation.id)
                    );

                    return (
                      <article className="mobile-record-card" key={quotation.id}>
                        <header>
                          <div>
                            <span>Quotation</span>
                            <strong>{quotation.serialNumber}</strong>
                            <small>{quotation.issueDate || "No date"} · {quotation.store || "No branch"}</small>
                          </div>
                          <StatusBadge value={quotation.status} />
                        </header>

                        <dl>
                          <div className="mobile-field-wide">
                            <dt>Job / Scope</dt>
                            <dd>{quotation.scopeOfWork || "—"}</dd>
                          </div>
                          <div>
                            <dt>Quotation No</dt>
                            <dd>{quotation.id}</dd>
                          </div>
                          <div>
                            <dt>Amount</dt>
                            <dd>{money(quotation.amount)}</dd>
                          </div>
                          <div>
                            <dt>Follow-up</dt>
                            <dd>{quotation.followUpDate || "—"}</dd>
                          </div>
                          <div>
                            <dt>Invoice</dt>
                            <dd>{hasInvoice ? "Created" : "Not created"}</dd>
                          </div>
                        </dl>

                        <div className="mobile-card-status">
                          <span>Status</span>
                          <select
                            className="inline-select mobile-status-select"
                            value={quotation.status}
                            onChange={(event) => void handleStatusChange(quotation, event.target.value)}
                          >
                            {statusOptions.map((item) => (
                              <option key={item.value} value={item.value}>{item.label}</option>
                            ))}
                          </select>
                        </div>

                        <footer>
                          <Link
                            className="button"
                            href={`${routes.quotationInvoice}?serial=${encodeURIComponent(quotation.serialNumber)}`}
                          >
                            <FileUp size={14} />
                            {hasInvoice ? "Invoice" : "Create Invoice"}
                          </Link>
                          <Link
                            className="button button--primary"
                            href={`${routes.editQuotation}?id=${encodeURIComponent(quotation.id)}`}
                          >
                            <Edit3 size={14} />
                            Edit
                          </Link>
                        </footer>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))
          ) : (
            <div className="mobile-empty-state">No quotations found.</div>
          )}
        </div>
      </section>

      {invoiceImportDraft ? (
        <InvoiceDocumentModal
          draft={invoiceImportDraft}
          onClose={() => setInvoiceImportDraft(null)}
        />
      ) : null}
    </>
  );
}
