"use client";

import { exportInvoicePdf } from "@/application/services/document-export";
import {
  parseInvoiceDocument,
  type InvoiceImportDraft,
} from "@/application/services/invoice-import";
import type { Invoice, Quotation } from "@/domain/entities/business";
import {
  downloadLocalInvoiceAttachment,
  saveLocalInvoiceAttachment,
} from "@/infrastructure/local/invoice-attachment";
import { createNextInvoiceId } from "@/lib/record-ids";
import { routes } from "@/lib/routes";
import { PageHeader, StatusBadge } from "@/presentation/components/ui";
import { money } from "@/presentation/data/sample-data";
import { useBusinessData } from "@/presentation/providers/business-data-provider";
import {
  ArrowLeft,
  Download,
  ExternalLink,
  FilePlus2,
  FileUp,
  LoaderCircle,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useRef, useState, type FormEvent } from "react";

const formValue = (form: FormData, key: string) =>
  String(form.get(key) || "").trim();

const formNumber = (form: FormData, key: string) =>
  Number(form.get(key) || 0) || 0;

const today = () => new Date().toISOString().slice(0, 10);

type InvoiceLineItem = NonNullable<Invoice["lineItems"]>[number];
type Mode = "manual" | "upload";

function safeNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function safeString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function createManualLineItems(
  quotation: Quotation,
  vatRate: number,
): InvoiceLineItem[] {
  if (quotation.lineItems?.length) {
    return quotation.lineItems.map((item, index) => {
      const itemRecord = item as unknown as Record<string, unknown>;
      const quantity = safeNumber(item.quantity, 0);
      const unitPrice = safeNumber(item.unitPrice, 0);
      const amount = safeNumber(item.amount, quantity * unitPrice);
      const appliedVatRate = safeNumber(item.vatRate, vatRate);
      const unitCode = safeString(
        itemRecord.unitCode,
        safeString(itemRecord.unit, ""),
      );
      const vatAmount = safeNumber(
        itemRecord.vatAmount,
        amount * (appliedVatRate / 100),
      );

      return {
        id: String(index + 1),
        description: item.description || quotation.scopeOfWork || "",
        quantity,
        unitCode,
        unitPrice,
        amount,
        vatRate: appliedVatRate,
        vatAmount,
      };
    });
  }

  const subTotal = safeNumber(
    quotation.subTotal,
    safeNumber(quotation.amount, 0),
  );
  const appliedVatRate = safeNumber(quotation.vatRate, vatRate);
  const vatAmount = safeNumber(
    quotation.vatAmount,
    subTotal * (appliedVatRate / 100),
  );

  return [
    {
      id: "1",
      description: quotation.scopeOfWork || "",
      quantity: subTotal > 0 ? 1 : 0,
      unitCode: "",
      unitPrice: subTotal,
      amount: subTotal,
      vatRate: appliedVatRate,
      vatAmount,
    },
  ];
}

function createImportedLineItems(
  draft: InvoiceImportDraft,
  fallbackVatRate: number,
): InvoiceLineItem[] {
  if (draft.lineItems?.length) {
    return draft.lineItems.map((item, index) => {
      const itemRecord = item as unknown as Record<string, unknown>;
      const quantity = safeNumber(item.quantity, 0);
      const unitPrice = safeNumber(item.unitPrice, 0);
      const amount = safeNumber(item.amount, quantity * unitPrice);
      const appliedVatRate = safeNumber(
        item.vatRate,
        safeNumber(draft.vatRate, fallbackVatRate),
      );
      const unitCode = safeString(
        itemRecord.unitCode,
        safeString(itemRecord.unit, ""),
      );
      const vatAmount = safeNumber(
        itemRecord.vatAmount,
        amount * (appliedVatRate / 100),
      );

      return {
        id: item.id || String(index + 1),
        description: item.description || "",
        quantity,
        unitCode,
        unitPrice,
        amount,
        vatRate: appliedVatRate,
        vatAmount,
      };
    });
  }

  const subTotal = safeNumber(draft.subTotal, safeNumber(draft.amount, 0));
  const appliedVatRate = safeNumber(draft.vatRate, fallbackVatRate);

  return [
    {
      id: "1",
      description: draft.project || "",
      quantity: subTotal > 0 ? 1 : 0,
      unitCode: "",
      unitPrice: subTotal,
      amount: subTotal,
      vatRate: appliedVatRate,
      vatAmount: safeNumber(draft.vatAmount, subTotal * (appliedVatRate / 100)),
    },
  ];
}

export function QuotationInvoiceScreen() {
  const searchParams = useSearchParams();
  const serial = searchParams.get("serial") || "";
  const projectId = searchParams.get("projectId") || "";
  const { data, createRecord } = useBusinessData();

  const quotation = data.quotations.find(
    (item) =>
      (projectId && item.linkedProjectId === projectId) ||
      item.serialNumber === serial ||
      item.id === serial,
  );

  const inputRef = useRef<HTMLInputElement | null>(null);
  const [mode, setMode] = useState<Mode>("manual");
  const [file, setFile] = useState<File | null>(null);
  const [draft, setDraft] = useState<InvoiceImportDraft | null>(null);
  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>([]);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const manualLineItems = useMemo(() => {
    if (!quotation) return [];
    return createManualLineItems(quotation, data.company.vatRate);
  }, [data.company.vatRate, quotation]);

  const activeLineItems = lineItems.length ? lineItems : manualLineItems;

  const totals = useMemo(() => {
    const subTotal = activeLineItems.reduce(
      (sum, item) => sum + item.amount,
      0,
    );
    const vatAmount = activeLineItems.reduce(
      (sum, item) =>
        sum + (item.vatAmount ?? (item.amount * item.vatRate) / 100),
      0,
    );

    return {
      subTotal,
      vatAmount,
      amount: subTotal + vatAmount - discountAmount,
    };
  }, [activeLineItems, discountAmount]);

  if (!quotation) {
    return (
      <section className="card empty-state">
        <h2>Quotation not found</h2>
        <p>The serial number is missing or no longer exists.</p>
        <Link className="button" href={routes.quotations}>
          Back to Quotations
        </Link>
      </section>
    );
  }

  const quotationId = quotation.id;
  const quotationLinkedProjectId = quotation.linkedProjectId;
  const quotationSerialNumber = quotation.serialNumber ?? quotation.id;
  const quotationCompanyName = quotation.companyName;
  const quotationStore = quotation.store ?? "";
  const quotationScopeOfWork = quotation.scopeOfWork ?? "";
  const quotationAmount = quotation.amount;
  const quotationStatus = quotation.status;
  const quotationCurrency = quotation.currency ?? data.company.currency ?? "";
  const quotationCustomerAddress = quotation.customerAddress ?? "";
  const quotationCustomerVatNumber = quotation.customerVatNumber ?? "";

  const invoice = data.invoices.find(
    (item) =>
      item.quotationSerialNumber === quotationSerialNumber ||
      (!item.quotationSerialNumber && item.quotationNo === quotationId),
  );

  function updateLine(index: number, patch: Partial<InvoiceLineItem>) {
    setLineItems((current) => {
      const source = current.length ? current : activeLineItems;
      return source.map((item, itemIndex) => {
        if (itemIndex !== index) return item;

        const next = { ...item, ...patch };
        next.amount = next.quantity * next.unitPrice;
        next.vatAmount = next.amount * (next.vatRate / 100);
        return next;
      });
    });
  }

  function addInvoiceItem() {
    setLineItems((items) => [
      ...(items.length ? items : activeLineItems),
      {
        id: String(activeLineItems.length + 1),
        description: "",
        quantity: 0,
        unitCode: "",
        unitPrice: 0,
        amount: 0,
        vatRate: data.company.vatRate,
        vatAmount: 0,
      },
    ]);
  }

  async function readFile(selected?: File) {
    if (!selected) return;

    setMode("upload");
    setReading(true);
    setError("");

    try {
      const parsed = await parseInvoiceDocument(selected);
      setDraft(parsed);
      setFile(selected);
      setLineItems(createImportedLineItems(parsed, data.company.vatRate));
      setDiscountAmount(parsed.discountAmount || 0);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Invoice could not be read.",
      );
    } finally {
      setReading(false);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (
      data.invoices.some(
        (item) =>
          item.quotationSerialNumber === quotationSerialNumber ||
          (!item.quotationSerialNumber && item.quotationNo === quotationId),
      )
    ) {
      setError(
        "This quotation already has an invoice. Refresh the page to view or edit it.",
      );
      return;
    }

    const form = new FormData(event.currentTarget);
    const invoiceId =
      formValue(form, "id") ||
      createNextInvoiceId(data.invoices.map((item) => item.id));

    const finalLineItems = activeLineItems;
    let localAttachmentKey = "";
    let attachmentPath = "";

    setSaving(true);
    setError("");

    try {
      if (mode === "upload" && file) {
        localAttachmentKey = `${quotationSerialNumber}:${invoiceId}`;
        try {
          await saveLocalInvoiceAttachment(localAttachmentKey, file);
          attachmentPath = `local:${localAttachmentKey}`;
        } catch (attachmentError) {
          console.warn(
            "Attachment save failed:",
            attachmentError instanceof Error
              ? attachmentError.message
              : "Unknown error",
          );
          setError(
            "Warning: Invoice created but attachment could not be saved. " +
              (attachmentError instanceof Error
                ? attachmentError.message
                : "Please try uploading again."),
          );
          attachmentPath = "";
        }
      }

      const record: Invoice = {
        id: invoiceId,
        linkedProjectId: quotationLinkedProjectId,
        companyName: formValue(form, "companyName") || quotationCompanyName,
        project:
          formValue(form, "project") || quotationStore || quotationScopeOfWork,
        quotationNo: quotationId,
        quotationSerialNumber: quotationSerialNumber,
        invoiceDate: formValue(form, "invoiceDate") || today(),
        dueDate: formValue(form, "dueDate"),
        paymentTerms: formValue(form, "paymentTerms") || "Due on Receipt",
        purchaseOrderNumber: formValue(form, "purchaseOrderNumber"),
        amount: totals.amount,
        received: formNumber(form, "received"),
        status: "pending",
        remarks: formValue(form, "remarks"),
        customerAddress:
          formValue(form, "customerAddress") ||
          draft?.customerAddress ||
          quotationCustomerAddress ||
          "",
        customerVatNumber:
          formValue(form, "customerVatNumber") ||
          draft?.customerVatNumber ||
          quotationCustomerVatNumber ||
          "",
        supplierName:
          formValue(form, "supplierName") || data.company.businessName,
        supplierLegalName:
          formValue(form, "supplierLegalName") || data.company.legalCompanyName,
        supplierAddress:
          formValue(form, "supplierAddress") ||
          draft?.supplierAddress ||
          `${data.company.city}, ${data.company.country}`,
        supplierCrNumber:
          formValue(form, "supplierCrNumber") || data.company.crNumber,
        supplierVatNumber:
          formValue(form, "supplierVatNumber") || data.company.vatNumber,
        supplierPhone: formValue(form, "supplierPhone") || data.company.phone,
        supplierEmail: formValue(form, "supplierEmail"),
        currency:
          formValue(form, "currency") ||
          quotationCurrency ||
          data.company.currency,
        subTotal: totals.subTotal,
        vatRate: finalLineItems[0]?.vatRate ?? data.company.vatRate,
        vatAmount: totals.vatAmount,
        discountAmount,
        lineItems: finalLineItems,
        attachmentName: file?.name,
        attachmentType: file?.type,
        attachmentSize: file?.size,
        attachmentPath: attachmentPath || undefined,
        localAttachmentKey: localAttachmentKey || undefined,
      };

      await createRecord("invoices", record);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Invoice could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function exportLinkedInvoice() {
    if (!invoice) return;

    setError("");

    try {
      await exportInvoicePdf(invoice, data.company);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Invoice export failed.",
      );
    }
  }

  return (
    <>
      <PageHeader
        title={invoice ? "Quotation Invoice" : "Create Invoice"}
        description={`${quotationCompanyName} · ${quotationId} · Serial ${quotationSerialNumber}`}
        actions={
          <>
            {!invoice ? (
              <button
                className="button button--primary"
                type="submit"
                form="quotation-invoice-form"
                disabled={saving}
              >
                <Save size={14} />
                {saving ? "Saving..." : "Save Invoice"}
              </button>
            ) : null}
            <Link className="button" href={routes.quotations}>
              <ArrowLeft size={14} />
              Back to Quotations
            </Link>
            <Link
              className="button button--primary"
              href={`${routes.recordDetail}?type=quotation&id=${encodeURIComponent(quotationId)}`}
            >
              <ExternalLink size={14} />
              Open Quotation
            </Link>
          </>
        }
      />

      <section className="card linked-record-banner">
        <div>
          <span>Quotation</span>
          <strong>{quotationCompanyName}</strong>
          <p>{quotationScopeOfWork}</p>
        </div>
        <div>
          <span>Amount</span>
          <strong>{money(quotationAmount)}</strong>
          <StatusBadge value={quotationStatus} />
        </div>
      </section>

      {invoice ? (
        <section className="card form-section">
          <header>
            <div>
              <h2>Linked Invoice</h2>
              <p>This quotation already has one linked invoice.</p>
            </div>
            <StatusBadge value={invoice.status} />
          </header>

          <div className="record-detail-grid">
            <div>
              <span>Invoice No.</span>
              <strong>{invoice.id}</strong>
            </div>
            <div>
              <span>Date</span>
              <strong>{invoice.invoiceDate || "—"}</strong>
            </div>
            <div>
              <span>Total</span>
              <strong>{money(invoice.amount)}</strong>
            </div>
            <div>
              <span>Attachment</span>
              <strong>{invoice.attachmentName || "Created in app"}</strong>
            </div>
          </div>

          <div className="form-actions">
            <button
              className="button"
              type="button"
              onClick={() => void exportLinkedInvoice()}
            >
              <Download size={14} />
              Export PDF
            </button>
            {invoice.attachmentUrl ? (
              <a
                className="button"
                href={invoice.attachmentUrl}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink size={14} />
                View Attachment
              </a>
            ) : invoice.localAttachmentKey ? (
              <button
                className="button"
                type="button"
                onClick={() =>
                  void downloadLocalInvoiceAttachment(
                    invoice.localAttachmentKey!,
                  ).catch((caught) =>
                    setError(
                      caught instanceof Error
                        ? caught.message
                        : "Attachment unavailable.",
                    ),
                  )
                }
              >
                <Download size={14} />
                Download Attachment
              </button>
            ) : null}
            <Link
              className="button button--primary"
              href={`${routes.recordDetail}?type=invoice&id=${encodeURIComponent(invoice.id)}`}
            >
              <ExternalLink size={14} />
              View Invoice Details
            </Link>
          </div>
        </section>
      ) : (
        <form id="quotation-invoice-form" className="record-form" onSubmit={save}>
          <section className="card form-section invoice-source-section">
            <header>
              <div>
                <h2>Invoice Source</h2>
                <p>
                  Choose whether to create the invoice manually in the app or
                  upload an existing invoice file.
                </p>
              </div>
            </header>

            <div className="invoice-choice-grid">
              <button
                className={`invoice-choice-card ${mode === "manual" ? "is-active" : ""}`}
                type="button"
                onClick={() => {
                  setMode("manual");
                  setDraft(null);
                  setFile(null);
                  setLineItems(manualLineItems);
                  setDiscountAmount(0);
                }}
              >
                <FilePlus2 size={22} />
                <strong>Create in App</strong>
                <span>
                  Build a clean invoice from this quotation and edit the fields
                  below.
                </span>
              </button>

              <button
                className={`invoice-choice-card ${mode === "upload" ? "is-active" : ""}`}
                type="button"
                onClick={() => {
                  setMode("upload");
                  inputRef.current?.click();
                }}
              >
                <FileUp size={22} />
                <strong>Upload Existing</strong>
                <span>
                  Upload a PDF/Excel invoice, review the parsed values, and
                  attach it.
                </span>
              </button>
            </div>

            <input
              ref={inputRef}
              className="file-input"
              type="file"
              accept=".pdf,.xlsx,.xls,.xlsm,.xlsb,.ods,.csv"
              onChange={(event) => {
                const selected = event.target.files?.[0];
                event.target.value = "";
                void readFile(selected);
              }}
            />

            {mode === "upload" ? (
              <button
                className="drop-zone"
                type="button"
                onClick={() => inputRef.current?.click()}
              >
                {reading ? (
                  <LoaderCircle className="spin" size={34} />
                ) : (
                  <FileUp size={34} />
                )}
                <strong>
                  {reading
                    ? "Reading invoice..."
                    : file?.name || "Choose invoice PDF or Excel"}
                </strong>
                <span>
                  After upload, the extracted values will appear in the form.
                </span>
              </button>
            ) : null}
          </section>

          <section className="card form-section invoice-details-section">
            <header>
              <div>
                <h2>
                  {mode === "upload" && draft
                    ? "Review Imported Invoice"
                    : "Invoice Details"}
                </h2>
                <p>
                  All fields stay editable before the invoice is linked to this
                  quotation.
                </p>
              </div>
            </header>

            <div className="form-grid">
              <label className="field">
                <span>Invoice No.</span>
                <input
                  name="id"
                  defaultValue={
                    draft?.id ||
                    createNextInvoiceId(data.invoices.map((item) => item.id))
                  }
                />
              </label>
              <label className="field">
                <span>Invoice Date</span>
                <input
                  name="invoiceDate"
                  type="date"
                  defaultValue={draft?.invoiceDate || today()}
                />
              </label>
              <label className="field">
                <span>Customer / Company</span>
                <input
                  name="companyName"
                  defaultValue={draft?.companyName || quotationCompanyName}
                />
              </label>
              <label className="field">
                <span>Job / Project</span>
                <input
                  name="project"
                  defaultValue={
                    draft?.project || quotationStore || quotationScopeOfWork
                  }
                />
              </label>
              <label className="field">
                <span>Terms</span>
                <input
                  name="paymentTerms"
                  defaultValue={draft?.paymentTerms || "Due on Receipt"}
                />
              </label>
              <label className="field">
                <span>Due Date</span>
                <input
                  name="dueDate"
                  type="date"
                  defaultValue={draft?.dueDate}
                />
              </label>
              <label className="field">
                <span>P.O.#</span>
                <input
                  name="purchaseOrderNumber"
                  defaultValue={draft?.purchaseOrderNumber}
                />
              </label>
              <label className="field">
                <span>Currency</span>
                <input
                  name="currency"
                  defaultValue={
                    draft?.currency ||
                    quotationCurrency ||
                    data.company.currency ||
                    "SAR"
                  }
                />
              </label>
              <label className="field">
                <span>Amount Received</span>
                <input
                  name="received"
                  type="number"
                  min="0"
                  step="0.01"
                  defaultValue={draft?.received || 0}
                />
              </label>
              <label className="field">
                <span>VAT No.</span>
                <input
                  name="customerVatNumber"
                  defaultValue={
                    draft?.customerVatNumber || quotationCustomerVatNumber
                  }
                />
              </label>
              <label className="field field--full">
                <span>Customer Address</span>
                <input
                  name="customerAddress"
                  defaultValue={
                    draft?.customerAddress || quotationCustomerAddress
                  }
                />
              </label>
              <label className="field">
                <span>Supplier Name</span>
                <input
                  name="supplierName"
                  defaultValue={
                    draft?.supplierName || data.company.businessName
                  }
                />
              </label>
              <label className="field">
                <span>Supplier Legal Name</span>
                <input
                  name="supplierLegalName"
                  defaultValue={
                    draft?.supplierLegalName || data.company.legalCompanyName
                  }
                />
              </label>
              <label className="field">
                <span>Supplier CR</span>
                <input
                  name="supplierCrNumber"
                  defaultValue={
                    draft?.supplierCrNumber || data.company.crNumber
                  }
                />
              </label>
              <label className="field">
                <span>Supplier VAT</span>
                <input
                  name="supplierVatNumber"
                  defaultValue={
                    draft?.supplierVatNumber || data.company.vatNumber
                  }
                />
              </label>
              <label className="field">
                <span>Supplier Phone</span>
                <input
                  name="supplierPhone"
                  defaultValue={draft?.supplierPhone || data.company.phone}
                />
              </label>
              <label className="field">
                <span>Supplier Email</span>
                <input
                  name="supplierEmail"
                  type="email"
                  defaultValue={
                    draft?.supplierEmail ||
                    data.company.email ||
                    "ksajjad324@gmail.com"
                  }
                />
              </label>
              <label className="field field--full">
                <span>Supplier Address</span>
                <input
                  name="supplierAddress"
                  defaultValue={
                    draft?.supplierAddress ||
                    `${data.company.city}, ${data.company.country}`
                  }
                />
              </label>
              <label className="field">
                <span>Subtotal</span>
                <input
                  name="subTotal"
                  type="number"
                  step="0.01"
                  value={totals.subTotal.toFixed(2)}
                  readOnly
                />
              </label>
              <label className="field">
                <span>VAT Amount</span>
                <input
                  name="vatAmount"
                  type="number"
                  step="0.01"
                  value={totals.vatAmount.toFixed(2)}
                  readOnly
                />
              </label>
              <label className="field">
                <span>Discount</span>
                <input
                  name="discountAmount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={discountAmount}
                  onChange={(event) =>
                    setDiscountAmount(Number(event.target.value) || 0)
                  }
                />
              </label>
              <label className="field">
                <span>Total Amount</span>
                <input
                  name="amount"
                  type="number"
                  step="0.01"
                  value={totals.amount.toFixed(2)}
                  readOnly
                />
              </label>
              <label className="field field--full">
                <span>Remarks</span>
                <textarea
                  name="remarks"
                  rows={3}
                  defaultValue={draft?.remarks}
                />
              </label>
            </div>
          </section>

          <section className="card form-section invoice-items-section">
            <header>
              <div>
                <h2>Invoice Items</h2>
                <p>Edit quantities and pricing in one focused list.</p>
              </div>
            </header>

            <div className="quotation-items-toolbar invoice-items-toolbar invoice-card-items-toolbar">
              <div>
                <strong>Invoice Items</strong>
                <span>
                  {activeLineItems.length} item
                  {activeLineItems.length === 1 ? "" : "s"}
                </span>
              </div>
              <button className="button" type="button" onClick={addInvoiceItem}>
                <Plus size={14} />
                Add Item
              </button>
            </div>

            <div className="invoice-item-list">
              <div className="invoice-item-list__head" aria-hidden="true">
                <span>#</span>
                <span>Description</span>
                <span>Qty</span>
                <span>Unit</span>
                <span>Unit Price</span>
                <span>VAT %</span>
                <span>Est. VAT</span>
                <span>Amount</span>
                <span />
              </div>
              {activeLineItems.map((item, index) => (
                <article
                  className="invoice-item-row"
                  key={`${item.id}-${index}`}
                >
                  <strong className="invoice-item-row__index">{index + 1}</strong>
                  <label><span>Description</span><textarea value={item.description} onChange={(event) => updateLine(index, { description: event.target.value })} /></label>
                  <label><span>Qty</span><input type="number" min="0" step="0.01" value={item.quantity} onChange={(event) => updateLine(index, { quantity: Number(event.target.value) || 0 })} /></label>
                  <label><span>Unit</span><input value={item.unitCode} onChange={(event) => updateLine(index, { unitCode: event.target.value })} /></label>
                  <label><span>Unit Price</span><input type="number" min="0" step="0.01" value={item.unitPrice} onChange={(event) => updateLine(index, { unitPrice: Number(event.target.value) || 0 })} /></label>
                  <label><span>VAT %</span><input type="number" min="0" max="100" step="0.01" value={item.vatRate} onChange={(event) => updateLine(index, { vatRate: Number(event.target.value) || 0 })} /></label>
                  <strong className="invoice-item-row__vat">{money(item.vatAmount ?? (item.amount * item.vatRate) / 100)}</strong>
                  <strong className="invoice-item-row__amount">{money(item.amount + (item.vatAmount || 0))}</strong>
                  <button
                    className="icon-button icon-button--danger"
                    type="button"
                    aria-label={`Remove invoice item ${index + 1}`}
                    disabled={activeLineItems.length === 1}
                    onClick={() => setLineItems((items) => (items.length ? items : activeLineItems).filter((_, itemIndex) => itemIndex !== index).map((entry, itemIndex) => ({ ...entry, id: String(itemIndex + 1) })))}
                  >
                    <Trash2 size={15} />
                  </button>
                </article>
              ))}
            </div>

            <div className="form-actions">
              <span>
                Subtotal: {money(totals.subTotal)} · VAT:{" "}
                {money(totals.vatAmount)} · Total: {money(totals.amount)}
              </span>
            </div>
          </section>

          {error ? (
            <div className="form-message form-message--error">{error}</div>
          ) : null}

          <div className="form-actions">
            <button className="button button--primary" disabled={saving}>
              <Save size={14} />
              {saving
                ? "Saving..."
                : mode === "upload"
                  ? "Attach & Save Invoice"
                  : "Create Invoice"}
            </button>
          </div>
        </form>
      )}

      {error && invoice ? (
        <div className="form-message form-message--error">{error}</div>
      ) : null}
    </>
  );
}
