"use client";

import {
  parseQuotationDocument,
  type QuotationLineItem,
} from "@/application/services/quotation-import";
import type { BusinessDataSet } from "@/domain/entities/business";
import { createNextProjectId } from "@/lib/record-ids";
import { routes } from "@/lib/routes";
import { PageHeader } from "@/presentation/components/ui";
import { useBusinessData } from "@/presentation/providers/business-data-provider";
import { ArrowLeft, FileUp, LoaderCircle, Plus, Save, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, type FormEvent } from "react";

type Project = BusinessDataSet["projects"][number];

type Client = BusinessDataSet["clients"][number];

type ProjectStatus =
  | "upcoming"
  | "in-progress"
  | "on-hold"
  | "completed"
  | "cancelled";

const statusOptions: { label: string; value: ProjectStatus }[] = [
  { label: "Upcoming", value: "upcoming" },
  { label: "In Progress", value: "in-progress" },
  { label: "On Hold", value: "on-hold" },
  { label: "Completed", value: "completed" },
  { label: "Cancelled", value: "cancelled" },
];

const categoryOptions = [
  "Automatic Door",
  "Rolling Shutter",
  "Glass Work",
  "Aluminium Work",
  "Maintenance",
  "Installation",
  "Other",
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

function readString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
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

function getClientCompanyName(client: Client) {
  const record = asRecord(client);

  return readFirstString(
    record,
    ["companyName", "company", "name", "clientName", "customerName"],
    ""
  );
}

export function NewProjectScreen() {
  const router = useRouter();
  const { data, createProject, syncState } = useBusinessData();

  const [companyName, setCompanyName] = useState("");
  const [storeBranch, setStoreBranch] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState(categoryOptions[0]);
  const [quotationNo, setQuotationNo] = useState("");
  const [quotationDate, setQuotationDate] = useState(today());
  const [validityDate, setValidityDate] = useState("");
  const [woNo, setWoNo] = useState("");
  const [value, setValue] = useState("");
  const [startDate, setStartDate] = useState(today());
  const [expectedCompletion, setExpectedCompletion] = useState("");
  const [actualCompletion, setActualCompletion] = useState("");
  const [status, setStatus] = useState<ProjectStatus>("upcoming");
  const [completion, setCompletion] = useState("0");
  const [remarks, setRemarks] = useState("");
  const [crNumber, setCrNumber] = useState(data.company.crNumber || "");
  const [vatNumber, setVatNumber] = useState(data.company.vatNumber || "");
  const [supplierBusinessName, setSupplierBusinessName] = useState(data.company.businessName || "");
  const [supplierLegalName, setSupplierLegalName] = useState(data.company.legalCompanyName || "");
  const [supplierCity, setSupplierCity] = useState(data.company.city || "");
  const [supplierCountry, setSupplierCountry] = useState(data.company.country || "Saudi Arabia");
  const [supplierPhone, setSupplierPhone] = useState(data.company.phone || "");
  const [supplierEmail, setSupplierEmail] = useState("");
  const [supplierWebsite, setSupplierWebsite] = useState("");
  const [currency, setCurrency] = useState(data.company.currency || "SAR");
  const [lineItems, setLineItems] = useState<QuotationLineItem[]>([
    { serialNo: 1, description: "", quantity: 1, unitPrice: 0, amount: 0 },
  ]);
  const [subTotal, setSubTotal] = useState("0");
  const [vatRate, setVatRate] = useState(String(data.company.vatRate ?? 15));
  const [vatAmount, setVatAmount] = useState("0");
  const [totalAmount, setTotalAmount] = useState("0");
  const [termsAndConditions, setTermsAndConditions] = useState("");
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const nextProjectId = useMemo(() => {
    // IDs use the highest existing suffix, avoiding collisions after deletes.
    return createNextProjectId(data.projects.map((project) => project.id));
  }, [data.projects]);

  const clientOptions = useMemo(() => {
    return data.clients
      .map((client) => ({
        id: readString(asRecord(client).id, crypto.randomUUID()),
        companyName: getClientCompanyName(client),
      }))
      .filter((client) => client.companyName.trim());
  }, [data.clients]);

  function validate() {
    if (!companyName.trim()) return "Company name is required.";
    if (!location.trim()) return "Location is required.";
    if (!description.trim()) return "Work description is required.";

    const projectValue = toNumber(value);
    const progress = toNumber(completion);

    if (projectValue < 0) return "Project value cannot be negative.";
    if (toNumber(vatRate) < 0 || toNumber(vatRate) > 100) {
      return "VAT rate must be between 0 and 100.";
    }

    if (progress < 0 || progress > 100) {
      return "Completion must be between 0 and 100.";
    }

    if (status === "completed" && !actualCompletion) {
      return "Actual completion date is required for completed projects.";
    }

    return "";
  }

  function applyTotals(items: QuotationLineItem[], nextVatRate = toNumber(vatRate)) {
    const subtotal = items.reduce((sum, item) => sum + item.amount, 0);
    const tax = subtotal * (nextVatRate / 100);
    const total = subtotal + tax;
    setSubTotal(subtotal.toFixed(2));
    setVatAmount(tax.toFixed(2));
    setTotalAmount(total.toFixed(2));
    setValue(total.toFixed(2));
  }

  function updateLineItem(index: number, patch: Partial<QuotationLineItem>) {
    const next = lineItems.map((item, itemIndex) => {
      if (itemIndex !== index) return item;
      const updated = { ...item, ...patch };
      if ("quantity" in patch || "unitPrice" in patch) {
        updated.amount = updated.quantity * updated.unitPrice;
      }
      return updated;
    });
    setLineItems(next);
    applyTotals(next);
    setDescription(next.map((item) => item.description).filter(Boolean).join("\n"));
  }

  async function handleQuotationImport(file?: File) {
    if (!file || importing) return;
    setImporting(true);
    setError("");
    try {
      const parsed = await parseQuotationDocument(file);
      setCompanyName(parsed.companyName);
      const [store, importedLocation = ""] = parsed.store.split(" — ");
      setStoreBranch(store);
      setLocation(importedLocation);
      setQuotationNo(parsed.id);
      setQuotationDate(parsed.issueDate || today());
      setStartDate(parsed.issueDate || today());
      setValidityDate(parsed.validityDate);
      setDescription(
        parsed.lineItems.length
          ? parsed.lineItems.map((item) => item.description).join("\n")
          : parsed.scopeOfWork
      );
      setCrNumber(parsed.crNumber);
      setVatNumber(parsed.vatNumber);
      setSupplierBusinessName(parsed.supplierBusinessName || data.company.businessName);
      setSupplierLegalName(parsed.supplierLegalName || data.company.legalCompanyName);
      setSupplierCity(parsed.supplierCity || data.company.city);
      setSupplierCountry(parsed.supplierCountry || data.company.country);
      setSupplierPhone(parsed.supplierPhone || data.company.phone);
      setSupplierEmail(parsed.supplierEmail);
      setSupplierWebsite(parsed.supplierWebsite);
      setCurrency(parsed.currency);
      setLineItems(parsed.lineItems.length ? parsed.lineItems : [{ serialNo: 1, description: parsed.scopeOfWork, quantity: 1, unitPrice: parsed.subTotal, amount: parsed.subTotal }]);
      setSubTotal(String(parsed.subTotal));
      setVatRate(String(parsed.vatRate));
      setVatAmount(String(parsed.vatAmount));
      setTotalAmount(String(parsed.totalAmount));
      setValue(String(parsed.totalAmount));
      setTermsAndConditions(parsed.termsAndConditions);
      setRemarks(parsed.remarks);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Quotation import failed.");
    } finally {
      setImporting(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const validationError = validate();

    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);
    setError("");

    const project = {
      id: nextProjectId,

      companyName: companyName.trim(),
      company: companyName.trim(),
      clientName: companyName.trim(),

      storeBranch: storeBranch.trim(),
      branch: storeBranch.trim(),

      location: location.trim(),
      site: location.trim(),

      description: description.trim(),
      workDescription: description.trim(),
      scope: description.trim(),

      category,

      quotationNo: quotationNo.trim(),
      quotationNumber: quotationNo.trim(),
      quotationDate,
      validityDate,

      woNo: woNo.trim(),
      workOrderNo: woNo.trim(),

      value: toNumber(value),
      projectValue: toNumber(value),

      startDate,
      expectedCompletion,
      expectedCompletionDate: expectedCompletion,
      actualCompletion,
      actualCompletionDate: actualCompletion,

      status,
      priority: "medium",
      completion: toNumber(completion),
      completionPercentage: toNumber(completion),

      remarks: remarks.trim(),
      crNumber: crNumber.trim(),
      vatNumber: vatNumber.trim(),
      supplierBusinessName: supplierBusinessName.trim(),
      supplierLegalName: supplierLegalName.trim(),
      supplierCity: supplierCity.trim(),
      supplierCountry: supplierCountry.trim(),
      supplierPhone: supplierPhone.trim(),
      supplierEmail: supplierEmail.trim(),
      supplierWebsite: supplierWebsite.trim(),
      currency: currency.trim() || "SAR",
      lineItems,
      subTotal: toNumber(subTotal),
      vatRate: toNumber(vatRate),
      vatAmount: toNumber(vatAmount),
      totalAmount: toNumber(totalAmount),
      termsAndConditions: termsAndConditions.trim(),
    } as unknown as Project;

    try {
      await createProject(project);
      router.replace(routes.projects);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Project could not be saved."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <PageHeader
        title="New Project"
        description={`Create a project manually. UI updates instantly. Cloud status: ${syncState}.`}
        actions={
          <>
            <button className="button button--primary" type="button" disabled={importing} onClick={() => fileInputRef.current?.click()}>
              {importing ? <LoaderCircle className="spin" size={14} /> : <FileUp size={14} />}
              {importing ? "Reading..." : "Import Quotation"}
            </button>
            <Link className="button" href={routes.projects}>
              <ArrowLeft size={14} />
              Back to Projects
            </Link>
          </>
        }
      />

      <input ref={fileInputRef} className="file-input" type="file" accept=".pdf,.xlsx,.xls,.xlsm,.xlsb,.ods,.csv" onChange={(event) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        void handleQuotationImport(file);
      }} />

      <form className="record-form" onSubmit={handleSubmit}>
        <section className="card form-section">
          <header>
            <h2>Client & Work Details</h2>
            <p>Basic company, branch, location, and work information.</p>
          </header>

          <div className="form-grid">
            <label className="field">
              <span>Company Name *</span>
              <input
                list="clients-list"
                value={companyName}
                onChange={(event) => setCompanyName(event.target.value)}
                placeholder="Company / client name"
              />

              <datalist id="clients-list">
                {clientOptions.map((client) => (
                  <option key={client.id} value={client.companyName} />
                ))}
              </datalist>
            </label>

            <label className="field">
              <span>Store / Branch</span>
              <input
                value={storeBranch}
                onChange={(event) => setStoreBranch(event.target.value)}
                placeholder="Store or branch"
              />
            </label>

            <label className="field">
              <span>Location *</span>
              <input
                value={location}
                onChange={(event) => setLocation(event.target.value)}
                placeholder="Project location"
              />
            </label>

            <label className="field">
              <span>Category</span>
              <select
                value={category}
                onChange={(event) => setCategory(event.target.value)}
              >
                {categoryOptions.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>

            <label className="field field--full">
              <span>Work Description *</span>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Describe the project work"
                rows={4}
              />
            </label>
          </div>
        </section>

        <section className="card form-section">
          <header>
            <h2>Registration & Supplier Details</h2>
            <p>Commercial registration, VAT, and contact details shown on the quotation.</p>
          </header>

          <div className="form-grid">
            <label className="field"><span>Business Name</span><input value={supplierBusinessName} onChange={(event) => setSupplierBusinessName(event.target.value)} /></label>
            <label className="field"><span>Legal Company Name</span><input value={supplierLegalName} onChange={(event) => setSupplierLegalName(event.target.value)} /></label>
            <label className="field"><span>CR Number</span><input value={crNumber} onChange={(event) => setCrNumber(event.target.value)} inputMode="numeric" /></label>
            <label className="field"><span>VAT Number</span><input value={vatNumber} onChange={(event) => setVatNumber(event.target.value)} inputMode="numeric" /></label>
            <label className="field"><span>City</span><input value={supplierCity} onChange={(event) => setSupplierCity(event.target.value)} /></label>
            <label className="field"><span>Country</span><input value={supplierCountry} onChange={(event) => setSupplierCountry(event.target.value)} /></label>
            <label className="field"><span>Phone / WhatsApp</span><input value={supplierPhone} onChange={(event) => setSupplierPhone(event.target.value)} /></label>
            <label className="field"><span>Email</span><input type="email" value={supplierEmail} onChange={(event) => setSupplierEmail(event.target.value)} /></label>
            <label className="field field--full"><span>Website</span><input type="url" value={supplierWebsite} onChange={(event) => setSupplierWebsite(event.target.value)} /></label>
          </div>
        </section>

        <section className="card form-section">
          <header>
            <h2>Commercial Details</h2>
            <p>Quotation, work order, value, and dates.</p>
          </header>

          <div className="form-grid">
            <label className="field">
              <span>Project ID</span>
              <input value={nextProjectId} disabled />
            </label>

            <label className="field">
              <span>Quotation No</span>
              <input
                value={quotationNo}
                onChange={(event) => setQuotationNo(event.target.value)}
                placeholder="Quotation number"
              />
            </label>

            <label className="field"><span>Quotation Date</span><input type="date" value={quotationDate} onChange={(event) => setQuotationDate(event.target.value)} /></label>
            <label className="field"><span>Validity Date</span><input type="date" value={validityDate} onChange={(event) => setValidityDate(event.target.value)} /></label>

            <label className="field">
              <span>WO No</span>
              <input
                value={woNo}
                onChange={(event) => setWoNo(event.target.value)}
                placeholder="Work order number"
              />
            </label>

            <label className="field">
              <span>Project Value</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={value}
                onChange={(event) => setValue(event.target.value)}
                placeholder="0.00"
              />
            </label>

            <label className="field">
              <span>Start Date</span>
              <input
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </label>

            <label className="field">
              <span>Expected Completion</span>
              <input
                type="date"
                value={expectedCompletion}
                onChange={(event) => setExpectedCompletion(event.target.value)}
              />
            </label>

            <label className="field">
              <span>Actual Completion</span>
              <input
                type="date"
                value={actualCompletion}
                onChange={(event) => setActualCompletion(event.target.value)}
              />
            </label>
          </div>
        </section>

        <section className="card form-section">
          <header className="line-items-header">
            <div><h2>Quotation Items</h2><p>Description, quantity, unit price, and amount from the quotation.</p></div>
            <button className="button" type="button" onClick={() => setLineItems((items) => [...items, { serialNo: items.length + 1, description: "", quantity: 1, unitPrice: 0, amount: 0 }])}><Plus size={14} /> Add Item</button>
          </header>

          <div className="table-wrap">
            <table className="data-table project-line-items">
              <thead><tr><th>#</th><th>Description</th><th>Qty</th><th>Unit Price</th><th>Amount</th><th /></tr></thead>
              <tbody>{lineItems.map((item, index) => (
                <tr key={index}>
                  <td>{index + 1}</td>
                  <td><textarea className="inline-input inline-input--wide" value={item.description} onChange={(event) => updateLineItem(index, { description: event.target.value })} /></td>
                  <td><input className="inline-input" type="number" min="0" step="0.01" value={item.quantity} onChange={(event) => updateLineItem(index, { quantity: toNumber(event.target.value) })} /></td>
                  <td><input className="inline-input" type="number" min="0" step="0.01" value={item.unitPrice} onChange={(event) => updateLineItem(index, { unitPrice: toNumber(event.target.value) })} /></td>
                  <td><input className="inline-input" type="number" min="0" step="0.01" value={item.amount} onChange={(event) => updateLineItem(index, { amount: toNumber(event.target.value) })} /></td>
                  <td><button className="icon-button icon-button--danger" type="button" title="Remove item" disabled={lineItems.length === 1} onClick={() => { const next = lineItems.filter((_, itemIndex) => itemIndex !== index).map((entry, itemIndex) => ({ ...entry, serialNo: itemIndex + 1 })); setLineItems(next); applyTotals(next); }}><Trash2 size={15} /></button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>

          <div className="quotation-totals form-grid">
            <label className="field"><span>Currency</span><input value={currency} onChange={(event) => setCurrency(event.target.value)} /></label>
            <label className="field"><span>Sub-Total</span><input type="number" value={subTotal} onChange={(event) => setSubTotal(event.target.value)} /></label>
            <label className="field"><span>VAT Rate %</span><input type="number" min="0" max="100" value={vatRate} onChange={(event) => { const nextRate = toNumber(event.target.value); setVatRate(event.target.value); applyTotals(lineItems, nextRate); }} /></label>
            <label className="field"><span>VAT Amount</span><input type="number" value={vatAmount} onChange={(event) => setVatAmount(event.target.value)} /></label>
            <label className="field"><span>Total Including VAT</span><input type="number" value={totalAmount} onChange={(event) => { setTotalAmount(event.target.value); setValue(event.target.value); }} /></label>
            <label className="field field--full"><span>Terms & Conditions</span><textarea rows={5} value={termsAndConditions} onChange={(event) => setTermsAndConditions(event.target.value)} /></label>
          </div>
        </section>

        <section className="card form-section">
          <header>
            <h2>Status & Notes</h2>
            <p>Status controls where this project appears in the app.</p>
          </header>

          <div className="form-grid">
            <label className="field">
              <span>Status</span>
              <select
                value={status}
                onChange={(event) =>
                  setStatus(event.target.value as ProjectStatus)
                }
              >
                {statusOptions.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Completion %</span>
              <input
                type="number"
                min="0"
                max="100"
                value={completion}
                onChange={(event) => setCompletion(event.target.value)}
              />
            </label>

            <label className="field field--full">
              <span>Remarks</span>
              <textarea
                value={remarks}
                onChange={(event) => setRemarks(event.target.value)}
                placeholder="Remarks / internal notes"
                rows={4}
              />
            </label>
          </div>
        </section>

        {error ? (
          <div className="form-message form-message--error">{error}</div>
        ) : null}

        <div className="form-actions">
          <Link className="button" href={routes.projects}>
            Cancel
          </Link>

          <button
            className="button button--primary"
            type="submit"
            disabled={submitting}
          >
            <Save size={14} />
            {submitting ? "Saving..." : "Save Project"}
          </button>
        </div>
      </form>
    </>
  );
}
