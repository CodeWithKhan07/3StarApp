"use client";

import { exportQuotationPdf } from "@/application/services/document-export";
import {
  parseInvoiceDocument,
  type InvoiceImportDraft,
} from "@/application/services/invoice-import";
import {
  parseQuotationDocument,
  type QuotationImportDraft,
} from "@/application/services/quotation-import";
import type { BusinessDataSet } from "@/domain/entities/business";
import {
  createNextQuotationId,
  createQuotationSerial,
  ensureQuotationSerial,
} from "@/lib/record-ids";
import { routes } from "@/lib/routes";
import {
  EmptyTableRow,
  PageHeader,
  StatusBadge,
} from "@/presentation/components/ui";
import { money } from "@/presentation/data/sample-data";
import { InvoiceDocumentModal } from "@/presentation/features/invoices/invoice-document-modal";
import { useBusinessData } from "@/presentation/providers/business-data-provider";
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
import Link from "next/link";
import { useMemo, useRef, useState, type FormEvent } from "react";

type Quotation = BusinessDataSet["quotations"][number];
type QuotationLineItem = NonNullable<Quotation["lineItems"]>[number];
type QuotationLineItemDraft = Omit<
  QuotationLineItem,
  "quantity" | "sqm" | "unitPrice" | "vatRate"
> & {
  quantity: string;
  sqm?: string;
  unitPrice: string;
  vatRate: string;
};

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

function toNumber(value: string | number | null | undefined) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  const text = String(value ?? "").trim();
  if (!text || text === ".") return 0;

  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeDecimalInput(value: string) {
  const normalized = value.replace(/,/g, ".").replace(/[^0-9.]/g, "");
  const [integerPart = "", ...decimalParts] = normalized.split(".");
  const decimalPart = decimalParts.join("");
  const integerWithoutLeadingZero = integerPart.replace(/^0+(?=\d)/, "");

  if (decimalParts.length > 0) {
    return `${integerWithoutLeadingZero || "0"}.${decimalPart}`;
  }

  return integerWithoutLeadingZero;
}

function numberToInputText(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed !== 0 ? String(value) : "";
}

function moneyOrEmpty(value: number) {
  return value > 0 ? money(value) : "";
}

function emptyLineItem(
  serialNo: number,
  defaultVatRate = 15
): QuotationLineItemDraft {
  return {
    serialNo,
    description: "",
    quantity: "",
    sqm: "",
    unitPrice: "",
    amount: 0,
    vatRate: numberToInputText(defaultVatRate),
    vatAmount: 0,
  };
}

function lineItemToDraft(
  item: Partial<QuotationLineItem>,
  serialNo: number,
  fallbackVatRate = 0
): QuotationLineItemDraft {
  const quantity = numberToInputText(item.quantity);
  const unitPrice = numberToInputText(item.unitPrice);
  const vatRate = numberToInputText(item.vatRate ?? fallbackVatRate);
  const amount = toNumber(quantity) * toNumber(unitPrice);
  const vatAmount = (amount * toNumber(vatRate)) / 100;

  return {
    serialNo,
    description: item.description ?? "",
    quantity,
    sqm: numberToInputText(item.sqm),
    unitPrice,
    amount,
    vatRate,
    vatAmount,
  };
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
  return { ...quotation, issueDate: patch.issueDate ?? quotation.issueDate, validityDate: "", companyName: patch.companyName ?? quotation.companyName, store: patch.store ?? quotation.store, scopeOfWork: patch.scopeOfWork ?? quotation.scopeOfWork, amount: patch.amount ?? quotation.amount, status: patch.status ?? quotation.status, followUpDate: "", remarks: patch.remarks ?? quotation.remarks };
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
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [sortBy, setSortBy] = useState("newest");

  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importDraft, setImportDraft] = useState<QuotationImportDraft | null>(null);
  const [showSqm, setShowSqm] = useState(false);
  const [lineItems, setLineItems] = useState<QuotationLineItemDraft[]>([
    emptyLineItem(1, data.company.vatRate),
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

  function updateLineItem(index: number, patch: Partial<QuotationLineItemDraft>) {
    setLineItems((current) =>
      current.map((item, itemIndex) => {
        if (itemIndex !== index) return item;

        const next = { ...item, ...patch };
        const quantity = toNumber(next.quantity);
        const unitPrice = toNumber(next.unitPrice);
        const vatRate = toNumber(next.vatRate);

        next.amount = quantity * unitPrice;
        next.vatAmount = (next.amount * vatRate) / 100;

        return next;
      })
    );
  }

  const quotations = useMemo(() => {
    return data.quotations.map(normalizeQuotation);
  }, [data.quotations]);

  const nextQuotationId = useMemo(() => {
    return createNextQuotationId(data.quotations.map((quotation) => quotation.id));
  }, [data.quotations]);

  const clientOptions = useMemo(() => {
    return data.clients
      .map((client) => readFirstString(asRecord(client), ["companyName", "company", "name"], ""))
      .filter(Boolean);
  }, [data.clients]);

  const filteredQuotations = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const fromTime = dateFrom ? new Date(dateFrom).getTime() : null;
    const toTime = dateTo ? new Date(dateTo).getTime() : null;
    const minValue = minAmount.trim() ? Number(minAmount) : null;
    const maxValue = maxAmount.trim() ? Number(maxAmount) : null;

    const result = quotations.filter((quotation) => {
      const issueTime = quotation.issueDate
        ? new Date(quotation.issueDate).getTime()
        : 0;
      const target = [
        quotation.id,
        quotation.serialNumber,
        quotation.companyName,
        quotation.store,
        quotation.status,
        quotation.amount,
        quotation.issueDate,
      ]
        .join(" ")
        .toLowerCase();

      const matchesQuery = !normalizedQuery || target.includes(normalizedQuery);
      const matchesStatus = status === "all" || quotation.status === status;
      const matchesFrom = !fromTime || issueTime >= fromTime;
      const matchesTo = !toTime || issueTime <= toTime;
      const matchesMin = minValue === null || quotation.amount >= minValue;
      const matchesMax = maxValue === null || quotation.amount <= maxValue;

      return (
        matchesQuery &&
        matchesStatus &&
        matchesFrom &&
        matchesTo &&
        matchesMin &&
        matchesMax
      );
    });

    return result.sort((a, b) => {
      if (sortBy === "oldest") {
        return new Date(a.issueDate || 0).getTime() - new Date(b.issueDate || 0).getTime();
      }

      if (sortBy === "price-high") {
        return b.amount - a.amount;
      }

      if (sortBy === "price-low") {
        return a.amount - b.amount;
      }

      if (sortBy === "company") {
        return a.companyName.localeCompare(b.companyName);
      }

      return new Date(b.issueDate || 0).getTime() - new Date(a.issueDate || 0).getTime();
    });
  }, [quotations, query, status, dateFrom, dateTo, minAmount, maxAmount, sortBy]);

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

    const formElement = event.currentTarget;
    const form = new FormData(event.currentTarget);
    const quotationNo = String(form.get("id") || "").trim();
    const companyName = String(form.get("companyName") || "").trim();
    const store = String(form.get("store") || "").trim();
    const issueDate = String(form.get("issueDate") || "").trim();
    const currency = String(form.get("currency") || "").trim();
    const scopeOfWork =
      lineItems.find((item) => item.description.trim())?.description.trim() ||
      "";
    const validLineItems = lineItems.filter(
      (item) =>
        item.description.trim() &&
        toNumber(item.quantity) > 0 &&
        toNumber(item.unitPrice) > 0
    );
    const savedLineItems: QuotationLineItem[] = validLineItems.map(
      (item, index) => {
        const quantity = toNumber(item.quantity);
        const unitPrice = toNumber(item.unitPrice);
        const vatRate = toNumber(item.vatRate);
        const amount = quantity * unitPrice;
        const vatAmount = (amount * vatRate) / 100;

        return {
          ...item,
          serialNo: index + 1,
          description: item.description.trim(),
          quantity,
          sqm: showSqm ? toNumber(item.sqm) : undefined,
          unitPrice,
          amount,
          vatRate,
          vatAmount,
        };
      }
    );
    const subTotal = savedLineItems.reduce((sum, item) => sum + item.amount, 0);
    const vatAmount = savedLineItems.reduce((sum, item) => sum + item.vatAmount, 0);

    if (
      !quotationNo ||
      !companyName ||
      !store ||
      !issueDate ||
      !currency
    ) {
      setFormError("Fill every quotation field before saving.");
      return;
    }

    if (!validLineItems.length) {
      setFormError("Add at least one product with description, quantity, and unit price.");
      return;
    }

    setSubmitting(true);
    setFormError("");

    const quotation: Quotation = {
      id: quotationNo,
      serialNumber: createQuotationSerial(),
      issueDate,
      validityDate: "",
      companyName,
      store,
      scopeOfWork,
      amount: subTotal + vatAmount,
      currency,
      subTotal,
      vatRate: savedLineItems[0]?.vatRate ?? data.company.vatRate,
      vatAmount,
      lineItems: savedLineItems,
      showSqm,
      status: "draft",
      followUpDate: "",
    };

    try {
      await createQuotation(quotation);
      setShowForm(false);
      setImportDraft(null);
      setLineItems([emptyLineItem(1, data.company.vatRate)]);
      formElement.reset();
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
      const sourceLines: Array<Partial<QuotationLineItem>> = (
        parsed.lineItems.length
          ? parsed.lineItems
          : [
              {
                serialNo: 1,
                description: parsed.scopeOfWork,
                quantity: 1,
                unitPrice: parsed.subTotal,
                amount: parsed.subTotal,
                vatRate: parsed.vatRate,
                vatAmount: (parsed.subTotal * parsed.vatRate) / 100,
              },
            ]
      );
      const importedLines = sourceLines.map((item, index) =>
        lineItemToDraft(
          { ...item, vatRate: item.vatRate ?? parsed.vatRate, sqm: item.sqm ?? 0 },
          index + 1,
          parsed.vatRate
        )
      );
      setLineItems(importedLines);
      setShowSqm(false);
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
                setShowSqm(false);
                setLineItems([emptyLineItem(1, data.company.vatRate)]);
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
              <input name="id" defaultValue={importDraft?.id || nextQuotationId} required />
            </label>

            <label className="field">
              <span>Company Name *</span>
              <input
                name="companyName"
                list="quotation-clients-list"
                placeholder="Company / client name"
                defaultValue={importDraft?.companyName}
                required
              />
              <datalist id="quotation-clients-list">
                {clientOptions.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </label>

            <label className="field">
              <span>Store / Branch</span>
              <input name="store" placeholder="Store or branch" defaultValue={importDraft?.store} required />
            </label>

            <label className="field">
              <span>Date</span>
              <input name="issueDate" type="date" defaultValue={importDraft?.issueDate || today()} required />
            </label>

            <label className="field">
              <span>Amount (SAR)</span>
              <input
                name="amount"
                type="text"
                inputMode="decimal"
                value={quotationTotals.total > 0 ? quotationTotals.total.toFixed(2) : ""}
                placeholder="Auto calculated"
                readOnly
              />
            </label>

            <label className="field"><span>Currency</span><input name="currency" defaultValue={importDraft?.currency || data.company.currency || "SAR"} required /></label>
            <label className="field sqm-toggle">
              <span>SQM</span>
              <input
                type="checkbox"
                checked={showSqm}
                onChange={(event) => setShowSqm(event.target.checked)}
              />
            </label>

          </div>

          <div className="table-wrap">
            <table className="data-table project-line-items">
              <thead><tr><th>#</th><th>Description</th><th>Qty</th>{showSqm ? <th>SQM</th> : null}<th>Unit Price</th><th>VAT %</th><th>VAT</th><th>Line Total</th><th /></tr></thead>
              <tbody>{lineItems.map((item, index) => <tr key={index}>
                <td>{index + 1}</td>
                <td><textarea className="inline-input inline-input--wide" value={item.description} required onChange={(event) => updateLineItem(index, { description: event.target.value })} /></td>
                <td><input className="inline-input" type="text" inputMode="decimal" value={item.quantity} placeholder="Qty" required onFocus={(event) => event.currentTarget.select()} onChange={(event) => updateLineItem(index, { quantity: normalizeDecimalInput(event.target.value) })} /></td>
                {showSqm ? <td><input className="inline-input" type="text" inputMode="decimal" value={item.sqm ?? ""} placeholder="SQM" onFocus={(event) => event.currentTarget.select()} onChange={(event) => updateLineItem(index, { sqm: normalizeDecimalInput(event.target.value) })} /></td> : null}
                <td><input className="inline-input" type="text" inputMode="decimal" value={item.unitPrice} placeholder="Unit price" required onFocus={(event) => event.currentTarget.select()} onChange={(event) => updateLineItem(index, { unitPrice: normalizeDecimalInput(event.target.value) })} /></td>
                <td><input className="inline-input" type="text" inputMode="decimal" value={item.vatRate} placeholder="VAT %" required onFocus={(event) => event.currentTarget.select()} onChange={(event) => updateLineItem(index, { vatRate: normalizeDecimalInput(event.target.value) })} /></td>
                <td>{moneyOrEmpty(item.vatAmount)}</td><td>{moneyOrEmpty(item.amount + item.vatAmount)}</td>
                <td><button className="icon-button icon-button--danger" type="button" disabled={lineItems.length === 1} onClick={() => setLineItems((items) => items.filter((_, itemIndex) => itemIndex !== index).map((entry, itemIndex) => ({ ...entry, serialNo: itemIndex + 1 })))}><Trash2 size={15} /></button></td>
              </tr>)}</tbody>
            </table>
          </div>
          <div className="form-actions"><span>Subtotal: {moneyOrEmpty(quotationTotals.subTotal) || "—"} · VAT: {moneyOrEmpty(quotationTotals.vatAmount) || "—"}</span><button className="button" type="button" onClick={() => setLineItems((items) => [...items, emptyLineItem(items.length + 1, data.company.vatRate)])}><Plus size={14} />Add Item</button></div>

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

      <section className="card quotation-filter-panel">
        <label className="toolbar-search quotation-search">
          <Search size={17} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search quotation, company, serial no, branch, amount..."
          />
        </label>

        <select
          className="select"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option value="all">All Statuses</option>
          {statusOptions.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>

        <label className="compact-filter-field">
          <span>From date</span>
          <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
        </label>

        <label className="compact-filter-field">
          <span>To date</span>
          <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
        </label>

        <label className="compact-filter-field">
          <span>Min price</span>
          <input inputMode="decimal" value={minAmount} onChange={(event) => setMinAmount(normalizeDecimalInput(event.target.value))} placeholder="Min" />
        </label>

        <label className="compact-filter-field">
          <span>Max price</span>
          <input inputMode="decimal" value={maxAmount} onChange={(event) => setMaxAmount(normalizeDecimalInput(event.target.value))} placeholder="Any" />
        </label>

        <select className="select" value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="price-high">Price high to low</option>
          <option value="price-low">Price low to high</option>
          <option value="company">Company A-Z</option>
        </select>

        <button
          className="button quotation-clear-filters"
          type="button"
          onClick={() => {
            setQuery("");
            setStatus("all");
            setDateFrom("");
            setDateTo("");
            setMinAmount("");
            setMaxAmount("");
            setSortBy("newest");
          }}
        >
          Clear filters
        </button>
      </section>

      <section className="card projects-table-card quotations-company-workspace">
        <div className="projects-table-header">
          <div>
            <h2>Quotation Tracker</h2>
            <p>
              Showing {filteredQuotations.length} of {quotations.length} quotations. Grouped by company/customer with job history and reachable actions.
            </p>
          </div>
        </div>

        <div className="table-wrap projects-table-wrap desktop-data-table">
          <table className="data-table projects-table quotations-table">
            <thead>
              <tr>
                <th>Quotation No</th>
                <th>Serial No</th>
                <th>Date</th>
                <th>Company</th>
                <th>Store / Branch</th>
                <th>Amount</th>
                <th>Status</th>
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


                      <td className="money-cell">
                        {isEditing ? (
                          <input
                            className="inline-input"
                            type="text"
                            inputMode="decimal"
                            value={numberToInputText(draft.amount)}
                            onFocus={(event) => event.currentTarget.select()}
                            onChange={(event) =>
                              updateDraft(
                                "amount",
                                toNumber(normalizeDecimalInput(event.target.value))
                              )
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
                  columns={8}
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
                  <span>Customer / Company History</span>
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
                            <span>Quotation / Job</span>
                            <strong>{quotation.serialNumber}</strong>
                            <small>{quotation.id} · {quotation.issueDate || "No date"} · {quotation.store || "No branch"}</small>
                          </div>
                          <StatusBadge value={quotation.status} />
                        </header>

                        <dl>
                          <div>
                            <dt>Quotation No</dt>
                            <dd>{quotation.id}</dd>
                          </div>
                          <div>
                            <dt>Amount</dt>
                            <dd>{money(quotation.amount)}</dd>
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
                            className="button button--primary"
                            href={`${routes.quotationInvoice}?serial=${encodeURIComponent(quotation.serialNumber)}`}
                          >
                            <FileUp size={14} />
                            {hasInvoice ? "View / Edit Invoice" : "Create / Upload Invoice"}
                          </Link>

                          <button
                            className="button"
                            type="button"
                            onClick={() => void handleExport(quotation)}
                          >
                            <Download size={14} />
                            Download Quotation
                          </button>

                          <Link
                            className="button"
                            href={`${routes.editQuotation}?id=${encodeURIComponent(quotation.id)}`}
                          >
                            <Edit3 size={14} />
                            Edit Quotation
                          </Link>

                          <button
                            className="button button--danger"
                            type="button"
                            onClick={() => void handleDelete(quotation)}
                          >
                            <Trash2 size={14} />
                            Delete Quotation
                          </button>
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
