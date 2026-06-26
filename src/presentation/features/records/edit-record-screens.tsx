"use client";

import type { Project } from "@/domain/entities/business";
import { routes } from "@/lib/routes";
import { PageHeader, StatusBadge } from "@/presentation/components/ui";
import { useBusinessData } from "@/presentation/providers/business-data-provider";
import { ArrowLeft, Save } from "lucide-react";
import { downloadLocalInvoiceAttachment } from "@/infrastructure/local/invoice-attachment";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";

const text = (form: FormData, key: string) =>
  String(form.get(key) || "").trim();
const number = (form: FormData, key: string) => {
  const parsed = Number(form.get(key) || 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

function EditShell({
  title,
  description,
  backHref,
  status,
  error,
  saving,
  onSubmit,
  children,
}: {
  title: string;
  description: string;
  backHref: string;
  status: string;
  error: string;
  saving: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  children: ReactNode;
}) {
  return (
    <>
      <PageHeader
        title={title}
        description={description}
        actions={
          <Link className="button" href={backHref}>
            <ArrowLeft size={14} /> Back
          </Link>
        }
      />
      <form className="record-form" onSubmit={onSubmit}>
        <section className="card form-section">
          <header>
            <div>
              <h2>Record Details</h2>
              <p>
                Edit the complete record here. Status remains a quick action on
                the list screen.
              </p>
            </div>
            <StatusBadge value={status} />
          </header>
          {children}
        </section>
        {error ? (
          <div className="form-message form-message--error">{error}</div>
        ) : null}
        <div className="form-actions">
          <Link className="button" href={backHref}>
            Cancel
          </Link>
          <button className="button button--primary" disabled={saving}>
            <Save size={14} />
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </form>
    </>
  );
}

function MissingRecord({ backHref }: { backHref: string }) {
  return (
    <section className="card empty-state">
      <h2>Record not found</h2>
      <p>It may have been deleted or the link is invalid.</p>
      <Link className="button" href={backHref}>
        Return to list
      </Link>
    </section>
  );
}

export function ClientEditScreen() {
  const id = useSearchParams().get("id") || "";
  const router = useRouter();
  const { data, updateRecord } = useBusinessData();
  const record = data.clients.find((item) => item.id === id);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  if (!record) return <MissingRecord backHref={routes.clients} />;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError("");
    try {
      await updateRecord("clients", {
        ...record!,
        companyName: text(form, "companyName"),
        brandName: text(form, "brandName"),
        contactPerson: text(form, "contactPerson"),
        mobile: text(form, "mobile"),
        email: text(form, "email"),
        city: text(form, "city"),
        remarks: text(form, "remarks"),
      });
      router.replace(routes.clients);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Client could not be updated.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <EditShell
      title={`Edit Client — ${record.companyName}`}
      description={record.id}
      backHref={routes.clients}
      status={record.contractStatus}
      error={error}
      saving={saving}
      onSubmit={submit}
    >
      <div className="form-grid">
        <label className="field">
          <span>Client ID</span>
          <input value={record.id} disabled />
        </label>
        <label className="field">
          <span>Company Name *</span>
          <input
            name="companyName"
            defaultValue={record.companyName}
            required
          />
        </label>
        <label className="field">
          <span>Brand Name</span>
          <input name="brandName" defaultValue={record.brandName} />
        </label>
        <label className="field">
          <span>Contact Person</span>
          <input name="contactPerson" defaultValue={record.contactPerson} />
        </label>
        <label className="field">
          <span>Mobile</span>
          <input name="mobile" defaultValue={record.mobile} />
        </label>
        <label className="field">
          <span>Email</span>
          <input name="email" type="email" defaultValue={record.email} />
        </label>
        <label className="field">
          <span>City</span>
          <input name="city" defaultValue={record.city} />
        </label>
        <label className="field field--full">
          <span>Remarks</span>
          <textarea name="remarks" defaultValue={record.remarks} />
        </label>
      </div>
    </EditShell>
  );
}

export function ProjectEditScreen() {
  const id = useSearchParams().get("id") || "";
  const router = useRouter();
  const { data, updateRecord } = useBusinessData();
  const record = data.projects.find((item) => item.id === id);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  if (!record) return <MissingRecord backHref={routes.projects} />;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    setSaving(true);
    setError("");
    try {
      const company = text(f, "company");
      const store = text(f, "store");
      const location = text(f, "location");
      const work = text(f, "workDescription");
      const value = number(f, "value");
      await updateRecord("projects", {
        ...record!,
        company,
        store,
        location,
        workDescription: work,
        category: text(f, "category"),
        quotationNo: text(f, "quotationNo"),
        woNo: text(f, "woNo"),
        value,
        startDate: text(f, "startDate"),
        expectedCompletion: text(f, "expectedCompletion"),
        actualCompletion: text(f, "actualCompletion"),
        completion: number(f, "completion"),
        remarks: text(f, "remarks"),
        quotationDate: text(f, "quotationDate"),
        validityDate: text(f, "validityDate"),
        crNumber: text(f, "crNumber"),
        vatNumber: text(f, "vatNumber"),
        currency: text(f, "currency"),
        subTotal: number(f, "subTotal"),
        vatRate: number(f, "vatRate"),
        vatAmount: number(f, "vatAmount"),
        totalAmount: number(f, "totalAmount"),
        termsAndConditions: text(f, "termsAndConditions"),
        companyName: company,
        clientName: company,
        storeBranch: store,
        branch: store,
        site: location,
        description: work,
        scope: work,
        projectValue: value,
      } as Project);
      router.replace(routes.projects);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Project could not be updated.",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <EditShell
      title={`Edit Project — ${record.id}`}
      description={record.company}
      backHref={routes.projects}
      status={record.status}
      error={error}
      saving={saving}
      onSubmit={submit}
    >
      <div className="form-grid">
        <label className="field">
          <span>Project ID</span>
          <input value={record.id} disabled />
        </label>
        <label className="field">
          <span>Company *</span>
          <input name="company" defaultValue={record.company} required />
        </label>
        <label className="field">
          <span>Store / Branch</span>
          <input name="store" defaultValue={record.store} />
        </label>
        <label className="field">
          <span>Location</span>
          <input name="location" defaultValue={record.location} />
        </label>
        <label className="field field--full">
          <span>Work Description *</span>
          <textarea
            name="workDescription"
            defaultValue={record.workDescription}
            required
          />
        </label>
        <label className="field">
          <span>Category</span>
          <input name="category" defaultValue={record.category} />
        </label>
        <label className="field">
          <span>Quotation No.</span>
          <input name="quotationNo" defaultValue={record.quotationNo} />
        </label>
        <label className="field">
          <span>Work Order No.</span>
          <input name="woNo" defaultValue={record.woNo} />
        </label>
        <label className="field">
          <span>Project Value</span>
          <input
            name="value"
            type="number"
            step="0.01"
            defaultValue={record.value}
          />
        </label>
        <label className="field">
          <span>Completion %</span>
          <input
            name="completion"
            type="number"
            min="0"
            max="100"
            defaultValue={record.completion}
          />
        </label>
        <label className="field">
          <span>Start Date</span>
          <input name="startDate" type="date" defaultValue={record.startDate} />
        </label>
        <label className="field">
          <span>Expected Completion</span>
          <input
            name="expectedCompletion"
            type="date"
            defaultValue={record.expectedCompletion}
          />
        </label>
        <label className="field">
          <span>Actual Completion</span>
          <input
            name="actualCompletion"
            type="date"
            defaultValue={record.actualCompletion}
          />
        </label>
        <label className="field">
          <span>Quotation Date</span>
          <input
            name="quotationDate"
            type="date"
            defaultValue={record.quotationDate}
          />
        </label>
        <label className="field">
          <span>Validity Date</span>
          <input
            name="validityDate"
            type="date"
            defaultValue={record.validityDate}
          />
        </label>
        <label className="field">
          <span>CR Number</span>
          <input name="crNumber" defaultValue={record.crNumber} />
        </label>
        <label className="field">
          <span>VAT Number</span>
          <input name="vatNumber" defaultValue={record.vatNumber} />
        </label>
        <label className="field">
          <span>Currency</span>
          <input name="currency" defaultValue={record.currency || "SAR"} />
        </label>
        <label className="field">
          <span>Subtotal</span>
          <input
            name="subTotal"
            type="number"
            step="0.01"
            defaultValue={record.subTotal}
          />
        </label>
        <label className="field">
          <span>VAT Rate %</span>
          <input
            name="vatRate"
            type="number"
            step="0.01"
            defaultValue={record.vatRate}
          />
        </label>
        <label className="field">
          <span>VAT Amount</span>
          <input
            name="vatAmount"
            type="number"
            step="0.01"
            defaultValue={record.vatAmount}
          />
        </label>
        <label className="field">
          <span>Total Amount</span>
          <input
            name="totalAmount"
            type="number"
            step="0.01"
            defaultValue={record.totalAmount}
          />
        </label>
        <label className="field field--full">
          <span>Terms & Conditions</span>
          <textarea
            name="termsAndConditions"
            defaultValue={record.termsAndConditions}
          />
        </label>
        <label className="field field--full">
          <span>Remarks</span>
          <textarea name="remarks" defaultValue={record.remarks} />
        </label>
      </div>
    </EditShell>
  );
}

export function QuotationEditScreen() {
  const id = useSearchParams().get("id") || "";
  const router = useRouter();
  const { data, updateRecord } = useBusinessData();
  const record = data.quotations.find((item) => item.id === id);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showSqm, setShowSqm] = useState(Boolean(record?.showSqm));
  if (!record) return <MissingRecord backHref={routes.quotations} />;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    const source = record!.lineItems?.length
      ? record!.lineItems
      : [
          {
            serialNo: 1,
            description: record!.scopeOfWork,
            quantity: 1,
            sqm: 0,
            unitPrice: record!.subTotal ?? record!.amount,
            amount: record!.subTotal ?? record!.amount,
            vatRate: record!.vatRate ?? data.company.vatRate,
            vatAmount: record!.vatAmount ?? 0,
          },
        ];
    const lineItems = source.map((item, index) => {
      const quantity = number(f, `q-quantity-${index}`);
      const unitPrice = number(f, `q-price-${index}`);
      const vatRate = number(f, `q-vat-${index}`);
      const amount = quantity * unitPrice;
      return {
        ...item,
        description: text(f, `q-description-${index}`),
        quantity,
        sqm: showSqm ? number(f, `q-sqm-${index}`) : undefined,
        unitPrice,
        amount,
        vatRate,
        vatAmount: (amount * vatRate) / 100,
      };
    });
    const subTotal = lineItems.reduce((sum, item) => sum + item.amount, 0);
    const vatAmount = lineItems.reduce((sum, item) => sum + item.vatAmount, 0);
    setSaving(true);
    setError("");
    try {
      await updateRecord("quotations", {
        ...record!,
        issueDate: text(f, "issueDate"),
        validityDate: "",
        companyName: text(f, "companyName"),
        store: text(f, "store"),
        scopeOfWork:
          lineItems.find((item) => item.description.trim())?.description.trim() ||
          "",
        amount: subTotal + vatAmount,
        followUpDate: "",
        customerAddress: undefined,
        customerVatNumber: undefined,
        remarks: undefined,
        termsAndConditions: undefined,
        currency: text(f, "currency") || data.company.currency,
        showSqm,
        lineItems,
        subTotal,
        vatAmount,
        vatRate: lineItems[0]?.vatRate ?? data.company.vatRate,
      });
      router.replace(routes.quotations);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Quotation could not be updated.",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <EditShell
      title={`Edit Quotation — ${record.id}`}
      description={record.companyName}
      backHref={routes.quotations}
      status={record.status}
      error={error}
      saving={saving}
      onSubmit={submit}
    >
      <div className="form-grid">
        <label className="field">
          <span>Quotation No.</span>
          <input value={record.id} disabled />
        </label>
        <label className="field">
          <span>Company Name *</span>
          <input
            name="companyName"
            defaultValue={record.companyName}
            required
          />
        </label>
        <label className="field field--full">
          <span>Unique Serial Number</span>
          <input
            value={record.serialNumber || "Assigned automatically"}
            disabled
          />
        </label>
        <label className="field">
          <span>Store / Branch</span>
          <input name="store" defaultValue={record.store} />
        </label>
        <label className="field">
          <span>Date</span>
          <input name="issueDate" type="date" defaultValue={record.issueDate} />
        </label>
        <label className="field">
          <span>Amount</span>
          <input
            name="amount"
            type="number"
            step="0.01"
            defaultValue={record.amount}
            disabled
          />
        </label>
        <label className="field">
          <span>Currency</span>
          <input
            name="currency"
            defaultValue={record.currency || data.company.currency}
          />
        </label>
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
          <thead>
            <tr>
              <th>#</th>
              <th>Description</th>
              <th>Qty</th>
              {showSqm ? <th>SQM</th> : null}
              <th>Unit Price</th>
              <th>VAT %</th>
              <th>VAT</th>
            </tr>
          </thead>
          <tbody>
            {(record.lineItems?.length
              ? record.lineItems
              : [
                  {
                    serialNo: 1,
                    description: record.scopeOfWork,
                    quantity: 1,
                    unitPrice: record.subTotal ?? record.amount,
                    amount: record.subTotal ?? record.amount,
                    vatRate: record.vatRate ?? data.company.vatRate,
                    vatAmount: record.vatAmount ?? 0,
                  },
                ]
            ).map((item, index) => (
              <tr key={index}>
                <td>{index + 1}</td>
                <td>
                  <textarea
                    name={`q-description-${index}`}
                    className="inline-input inline-input--wide"
                    defaultValue={item.description}
                  />
                </td>
                <td>
                  <input
                    name={`q-quantity-${index}`}
                    className="inline-input"
                    type="number"
                    min="0"
                    step="0.01"
                    defaultValue={item.quantity}
                  />
                </td>
                {showSqm ? (
                  <td>
                    <input
                      name={`q-sqm-${index}`}
                      className="inline-input"
                      type="number"
                      min="0"
                      step="0.01"
                      defaultValue={item.sqm ?? 0}
                    />
                  </td>
                ) : null}
                <td>
                  <input
                    name={`q-price-${index}`}
                    className="inline-input"
                    type="number"
                    min="0"
                    step="0.01"
                    defaultValue={item.unitPrice}
                  />
                </td>
                <td>
                  <input
                    name={`q-vat-${index}`}
                    className="inline-input"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    defaultValue={item.vatRate}
                  />
                </td>
                <td>{item.vatAmount.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </EditShell>
  );
}

export function InvoiceEditScreen() {
  const id = useSearchParams().get("id") || "";
  const router = useRouter();
  const { data, updateRecord } = useBusinessData();
  const record = data.invoices.find((item) => item.id === id);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  if (!record) return <MissingRecord backHref={routes.invoices} />;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    const source = record!.lineItems?.length
      ? record!.lineItems
      : [
          {
            id: "1",
            description: record!.project,
            quantity: record!.amount ? 1 : 0,
            unitCode: "",
            unitPrice: record!.subTotal ?? record!.amount,
            amount: record!.subTotal ?? record!.amount,
            vatRate: record!.vatRate ?? data.company.vatRate,
            vatAmount: record!.vatAmount ?? 0,
          },
        ];
    const lineItems = source.map((item, index) => {
      const quantity = number(f, `i-quantity-${index}`);
      const unitPrice = number(f, `i-price-${index}`);
      const vatRate = number(f, `i-vat-${index}`);
      const amount = quantity * unitPrice;
      return {
        ...item,
        description: text(f, `i-description-${index}`),
        unitCode: text(f, `i-unit-${index}`) || "",
        quantity,
        unitPrice,
        amount,
        vatRate,
        vatAmount: (amount * vatRate) / 100,
      };
    });
    const subTotal = lineItems.reduce((sum, item) => sum + item.amount, 0);
    const vatAmount = lineItems.reduce(
      (sum, item) => sum + (item.vatAmount ?? 0),
      0,
    );
    const discountAmount = number(f, "discountAmount");
    setSaving(true);
    setError("");
    try {
      await updateRecord("invoices", {
        ...record!,
        companyName: text(f, "companyName"),
        project: text(f, "project"),
        quotationNo: text(f, "quotationNo"),
        purchaseOrderNumber: text(f, "purchaseOrderNumber"),
        invoiceDate: text(f, "invoiceDate"),
        dueDate: text(f, "dueDate"),
        paymentTerms: text(f, "paymentTerms"),
        amount: subTotal + vatAmount - discountAmount,
        received: number(f, "received"),
        paymentDate: text(f, "paymentDate"),
        paymentMode: text(f, "paymentMode"),
        followUpDate: text(f, "followUpDate"),
        remarks: text(f, "remarks"),
        notes: text(f, "notes"),
        uuid: text(f, "uuid"),
        customerAddress: text(f, "customerAddress"),
        customerVatNumber: text(f, "customerVatNumber"),
        supplierCrNumber: text(f, "supplierCrNumber"),
        supplierVatNumber: text(f, "supplierVatNumber"),
        supplierPhone: text(f, "supplierPhone"),
        supplierEmail: text(f, "supplierEmail"),
        currency: text(f, "currency"),
        subTotal,
        vatRate: lineItems[0]?.vatRate ?? data.company.vatRate,
        vatAmount,
        discountAmount,
        lineItems,
      });
      router.replace(routes.invoices);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Invoice could not be updated.",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <EditShell
      title={`Edit Invoice — ${record.id}`}
      description={record.companyName}
      backHref={routes.invoices}
      status={record.status}
      error={error}
      saving={saving}
      onSubmit={submit}
    >
      <div className="form-grid">
        {record.attachmentUrl ? (
          <div className="field field--full">
            <span>Invoice Attachment</span>
            <a
              className="button"
              href={record.attachmentUrl}
              target="_blank"
              rel="noreferrer"
            >
              View {record.attachmentName || "attachment"}
            </a>
          </div>
        ) : record.localAttachmentKey ? (
          <div className="field field--full">
            <span>Invoice Attachment</span>
            <button
              className="button"
              type="button"
              onClick={() =>
                void downloadLocalInvoiceAttachment(
                  record.localAttachmentKey!,
                ).catch((caught) =>
                  setError(
                    caught instanceof Error
                      ? caught.message
                      : "Attachment unavailable.",
                  ),
                )
              }
            >
              Download {record.attachmentName || "attachment"}
            </button>
          </div>
        ) : null}
        <label className="field">
          <span>Invoice No.</span>
          <input value={record.id} disabled />
        </label>
        <label className="field">
          <span>ZATCA UUID</span>
          <input name="uuid" defaultValue={record.uuid} />
        </label>
        <label className="field">
          <span>Customer / Company *</span>
          <input
            name="companyName"
            defaultValue={record.companyName}
            required
          />
        </label>
        <label className="field">
          <span>Customer VAT</span>
          <input
            name="customerVatNumber"
            defaultValue={record.customerVatNumber}
          />
        </label>
        <label className="field field--full">
          <span>Customer Address</span>
          <input name="customerAddress" defaultValue={record.customerAddress} />
        </label>
        <label className="field">
          <span>Project</span>
          <input name="project" defaultValue={record.project} />
        </label>
        <label className="field">
          <span>Quotation No.</span>
          <input name="quotationNo" defaultValue={record.quotationNo} />
        </label>
        <label className="field">
          <span>P.O. Number</span>
          <input
            name="purchaseOrderNumber"
            defaultValue={record.purchaseOrderNumber}
          />
        </label>
        <label className="field">
          <span>Invoice Date</span>
          <input
            name="invoiceDate"
            type="date"
            defaultValue={record.invoiceDate}
          />
        </label>
        <label className="field">
          <span>Due Date</span>
          <input name="dueDate" type="date" defaultValue={record.dueDate} />
        </label>
        <label className="field">
          <span>Payment Terms</span>
          <input
            name="paymentTerms"
            defaultValue={record.paymentTerms || "Due on Receipt"}
          />
        </label>
        <label className="field">
          <span>Supplier CR</span>
          <input
            name="supplierCrNumber"
            defaultValue={record.supplierCrNumber}
          />
        </label>
        <label className="field">
          <span>Supplier VAT</span>
          <input
            name="supplierVatNumber"
            defaultValue={record.supplierVatNumber}
          />
        </label>
        <label className="field">
          <span>Supplier Phone</span>
          <input name="supplierPhone" defaultValue={record.supplierPhone} />
        </label>
        <label className="field">
          <span>Supplier Email</span>
          <input
            name="supplierEmail"
            type="email"
            defaultValue={record.supplierEmail}
          />
        </label>
        <label className="field">
          <span>Currency</span>
          <input name="currency" defaultValue={record.currency || "SAR"} />
        </label>
        <label className="field">
          <span>Subtotal</span>
          <input
            name="subTotal"
            type="number"
            step="0.01"
            defaultValue={record.subTotal}
          />
        </label>
        <label className="field">
          <span>VAT Rate %</span>
          <input
            name="vatRate"
            type="number"
            step="0.01"
            defaultValue={record.vatRate}
          />
        </label>
        <label className="field">
          <span>VAT Amount</span>
          <input
            name="vatAmount"
            type="number"
            step="0.01"
            defaultValue={record.vatAmount}
          />
        </label>
        <label className="field">
          <span>Discount</span>
          <input
            name="discountAmount"
            type="number"
            step="0.01"
            defaultValue={record.discountAmount}
          />
        </label>
        <label className="field">
          <span>Total Amount</span>
          <input
            name="amount"
            type="number"
            step="0.01"
            defaultValue={record.amount}
          />
        </label>
        <label className="field">
          <span>Amount Received</span>
          <input
            name="received"
            type="number"
            step="0.01"
            defaultValue={record.received}
          />
        </label>
        <label className="field">
          <span>Payment Date</span>
          <input
            name="paymentDate"
            type="date"
            defaultValue={record.paymentDate}
          />
        </label>
        <label className="field">
          <span>Payment Mode</span>
          <input name="paymentMode" defaultValue={record.paymentMode} />
        </label>
        <label className="field">
          <span>Follow-up Date</span>
          <input
            name="followUpDate"
            type="date"
            defaultValue={record.followUpDate}
          />
        </label>
        <label className="field field--full">
          <span>Invoice Notes</span>
          <textarea name="notes" defaultValue={record.notes} />
        </label>
        <label className="field field--full">
          <span>Remarks</span>
          <textarea name="remarks" defaultValue={record.remarks} />
        </label>
      </div>
      <div className="table-wrap">
        <table className="data-table project-line-items">
          <thead>
            <tr>
              <th>#</th>
              <th>Description</th>
              <th>Qty</th>
              <th>Unit</th>
              <th>Unit Price</th>
              <th>VAT %</th>
              <th>VAT</th>
            </tr>
          </thead>
          <tbody>
            {(record.lineItems?.length
              ? record.lineItems
              : [
                  {
                    id: "1",
                    description: record.project,
                    quantity: record.amount ? 1 : 0,
                    unitCode: "",
                    unitPrice: record.subTotal ?? record.amount,
                    amount: record.subTotal ?? record.amount,
                    vatRate: record.vatRate ?? data.company.vatRate,
                    vatAmount: record.vatAmount ?? 0,
                  },
                ]
            ).map((item, index) => (
              <tr key={`${item.id}-${index}`}>
                <td>{index + 1}</td>
                <td>
                  <textarea
                    name={`i-description-${index}`}
                    className="inline-input inline-input--wide"
                    defaultValue={item.description}
                  />
                </td>
                <td>
                  <input
                    name={`i-quantity-${index}`}
                    className="inline-input"
                    type="number"
                    min="0"
                    step="0.01"
                    defaultValue={item.quantity}
                  />
                </td>
                <td>
                  <input
                    name={`i-unit-${index}`}
                    className="inline-input"
                    defaultValue={item.unitCode}
                  />
                </td>
                <td>
                  <input
                    name={`i-price-${index}`}
                    className="inline-input"
                    type="number"
                    min="0"
                    step="0.01"
                    defaultValue={item.unitPrice}
                  />
                </td>
                <td>
                  <input
                    name={`i-vat-${index}`}
                    className="inline-input"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    defaultValue={item.vatRate}
                  />
                </td>
                <td>
                  {(
                    item.vatAmount ?? (item.amount * item.vatRate) / 100
                  ).toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </EditShell>
  );
}
