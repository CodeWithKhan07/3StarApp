"use client";

import type { InvoiceImportDraft } from "@/application/services/invoice-import";
import type { Invoice } from "@/domain/entities/business";
import { createNextInvoiceId } from "@/lib/record-ids";
import { useBusinessData } from "@/presentation/providers/business-data-provider";
import { Plus, Trash2, X } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";

const today = () => new Date().toISOString().slice(0, 10);
const number = (value: FormDataEntryValue | null) => {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

export function InvoiceDocumentModal({
  draft,
  onClose,
}: {
  draft: InvoiceImportDraft | null;
  onClose: () => void;
}) {
  const { data, createRecord } = useBusinessData();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [clientSource, setClientSource] = useState<"new" | "saved">("new");
  const [selectedClientId, setSelectedClientId] = useState("");
  const [companyName, setCompanyName] = useState(draft?.companyName || "");
  const [customerAddress, setCustomerAddress] = useState(draft?.customerAddress || "");
  const [customerVatNumber, setCustomerVatNumber] = useState(draft?.customerVatNumber || "");
  const [lineItems, setLineItems] = useState<NonNullable<Invoice["lineItems"]>>(
    draft?.lineItems.length
      ? draft.lineItems
      : [
          {
            id: "1",
            description: "",
            quantity: 0,
            unitCode: "",
            unitPrice: 0,
            amount: 0,
            vatRate: data.company.vatRate,
            vatAmount: 0,
          },
        ],
  );

  const totals = useMemo(() => {
    const subTotal = lineItems.reduce((sum, item) => sum + item.amount, 0);
    const vatAmount = lineItems.reduce(
      (sum, item) =>
        sum + (item.vatAmount ?? (item.amount * item.vatRate) / 100),
      0,
    );
    return { subTotal, vatAmount, amount: subTotal + vatAmount };
  }, [lineItems]);
  const nextInvoiceId = useMemo(
    () => createNextInvoiceId(data.invoices.map((invoice) => invoice.id)),
    [data.invoices],
  );
  const clientOptions = useMemo(
    () =>
      data.clients
        .map((client) => ({
          id: client.id,
          companyName: client.companyName,
          address: client.address || "",
          vatNumber: client.vatNumber || "",
          storeName: client.storeName || client.brandName || "",
        }))
        .filter((client) => client.companyName),
    [data.clients],
  );

  function applySavedClient(clientId: string) {
    setSelectedClientId(clientId);
    const client = clientOptions.find((item) => item.id === clientId);
    if (!client) return;

    setCompanyName(client.companyName);
    setCustomerAddress(client.address);
    setCustomerVatNumber(client.vatNumber);
  }

  function updateLine(
    index: number,
    patch: Partial<NonNullable<Invoice["lineItems"]>[number]>,
  ) {
    setLineItems((current) =>
      current.map((item, itemIndex) => {
        if (itemIndex !== index) return item;
        const next = { ...item, ...patch };
        next.amount = next.quantity * next.unitPrice;
        next.vatAmount = (next.amount * next.vatRate) / 100;
        return next;
      }),
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const id = String(form.get("id") || "").trim() || nextInvoiceId;
    const selectedCompanyName = companyName.trim();
    if (!selectedCompanyName) return setError("Customer/company name is required.");

    const invoice: Invoice = {
      id,
      companyName: selectedCompanyName,
      project: String(form.get("project") || "").trim(),
      quotationNo: String(form.get("quotationNo") || "").trim(),
      purchaseOrderNumber: String(form.get("purchaseOrderNumber") || "").trim(),
      invoiceDate: String(form.get("invoiceDate") || today()),
      dueDate: String(form.get("dueDate") || ""),
      paymentTerms: String(form.get("paymentTerms") || "").trim(),
      amount: totals.amount - number(form.get("discountAmount")),
      received: number(form.get("received")),
      paymentDate: String(form.get("paymentDate") || ""),
      paymentMode: String(form.get("paymentMode") || "").trim(),
      status: String(form.get("status") || "pending") as Invoice["status"],
      remarks: String(form.get("remarks") || "").trim(),
      customerAddress: customerAddress.trim(),
      customerVatNumber: customerVatNumber.trim(),
      supplierName: String(form.get("supplierName") || "").trim(),
      supplierLegalName: String(form.get("supplierLegalName") || "").trim(),
      supplierAddress: String(form.get("supplierAddress") || "").trim(),
      supplierCrNumber: String(form.get("supplierCrNumber") || "").trim(),
      supplierVatNumber: String(form.get("supplierVatNumber") || "").trim(),
      supplierPhone: String(form.get("supplierPhone") || "").trim(),
      supplierEmail: String(form.get("supplierEmail") || "").trim(),
      notes: String(form.get("notes") || "").trim(),
      currency: String(form.get("currency") || "SAR").trim(),
      subTotal: totals.subTotal,
      vatRate: lineItems[0]?.vatRate ?? data.company.vatRate,
      vatAmount: totals.vatAmount,
      discountAmount: number(form.get("discountAmount")),
      lineItems,
    };

    setSubmitting(true);
    setError("");
    try {
      await createRecord("invoices", invoice);
      onClose();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Invoice could not be saved.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-card modal-card--wide card"
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-card__header">
          <div>
            <h2>{draft ? "Review Imported Invoice" : "New Invoice"}</h2>
            <p>
              {draft
                ? "Verify the extracted Excel/PDF values before saving."
                : "Enter invoice and ZATCA details."}
            </p>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={17} />
          </button>
        </header>

        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <label className="field">
              <span>Invoice No.</span>
              <input
                name="id"
                defaultValue={draft?.id || nextInvoiceId}
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
              <span>Currency</span>
              <input name="currency" defaultValue={draft?.currency || "SAR"} />
            </label>
            <label className="field">
              <span>Client Source</span>
              <select
                value={clientSource}
                onChange={(event) => {
                  const nextSource = event.target.value as "new" | "saved";
                  setClientSource(nextSource);

                  if (nextSource === "new") {
                    setSelectedClientId("");
                    setCompanyName(draft?.companyName || "");
                    setCustomerAddress(draft?.customerAddress || "");
                    setCustomerVatNumber(draft?.customerVatNumber || "");
                    return;
                  }

                  if (clientOptions[0]) applySavedClient(clientOptions[0].id);
                }}
              >
                <option value="new">Brand New Client</option>
                <option value="saved" disabled={!clientOptions.length}>Saved Client</option>
              </select>
            </label>
            {clientSource === "saved" ? (
              <label className="field">
                <span>Saved Client</span>
                <select value={selectedClientId} onChange={(event) => applySavedClient(event.target.value)} required>
                  {clientOptions.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.companyName}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className="field">
              <span>Customer / Company *</span>
              <input
                name="companyName"
                value={companyName}
                onChange={(event) => setCompanyName(event.target.value)}
                readOnly={clientSource === "saved"}
              />
            </label>
            <label className="field">
              <span>VAT No.</span>
              <input
                name="customerVatNumber"
                value={customerVatNumber}
                onChange={(event) => setCustomerVatNumber(event.target.value)}
                readOnly={clientSource === "saved"}
              />
            </label>
            <label className="field field--full">
              <span>Customer Address</span>
              <input
                name="customerAddress"
                value={customerAddress}
                onChange={(event) => setCustomerAddress(event.target.value)}
                readOnly={clientSource === "saved"}
              />
            </label>
            <label className="field">
              <span>Project</span>
              <input name="project" defaultValue={draft?.project} />
            </label>
            <label className="field">
              <span>Quotation No.</span>
              <input name="quotationNo" defaultValue={draft?.quotationNo} />
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
              <input name="dueDate" type="date" defaultValue={draft?.dueDate} />
            </label>
            <label className="field">
              <span>P.O.#</span>
              <input
                name="purchaseOrderNumber"
                defaultValue={draft?.purchaseOrderNumber}
              />
            </label>
            <label className="field">
              <span>Supplier Name</span>
              <input
                name="supplierName"
                defaultValue={draft?.supplierName || data.company.businessName}
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
              <span>Supplier CR Number</span>
              <input
                name="supplierCrNumber"
                defaultValue={draft?.supplierCrNumber || data.company.crNumber}
              />
            </label>
            <label className="field">
              <span>Supplier VAT Number</span>
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
                defaultValue={draft?.supplierAddress}
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
                step="0.01"
                defaultValue={draft?.discountAmount}
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
            <label className="field">
              <span>Amount Received</span>
              <input
                name="received"
                type="number"
                step="0.01"
                defaultValue={draft?.received || 0}
              />
            </label>
            <label className="field">
              <span>Payment Date</span>
              <input
                name="paymentDate"
                type="date"
                defaultValue={draft?.paymentDate}
              />
            </label>
            <label className="field">
              <span>Payment Mode</span>
              <input name="paymentMode" defaultValue={draft?.paymentMode} />
            </label>
            <label className="field">
              <span>Status</span>
              <select name="status" defaultValue={draft?.status || "pending"}>
                <option value="pending">Pending</option>
                <option value="partial">Partial</option>
                <option value="paid">Paid</option>
                <option value="overdue">Overdue</option>
              </select>
            </label>
            <label className="field field--full">
              <span>Remarks</span>
              <textarea name="remarks" rows={3} defaultValue={draft?.remarks} />
            </label>
            <label className="field field--full">
              <span>Invoice Notes</span>
              <textarea name="notes" rows={3} defaultValue={draft?.notes} />
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
                  <th>Total</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {lineItems.map((item, index) => (
                  <tr key={`${item.id}-${index}`}>
                    <td>{index + 1}</td>
                    <td>
                      <textarea
                        className="inline-input inline-input--wide"
                        value={item.description}
                        onChange={(event) =>
                          updateLine(index, { description: event.target.value })
                        }
                      />
                    </td>
                    <td>
                      <input
                        className="inline-input"
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.quantity}
                        onChange={(event) =>
                          updateLine(index, {
                            quantity: number(event.target.value),
                          })
                        }
                      />
                    </td>
                    <td>
                      <input
                        className="inline-input"
                        value={item.unitCode}
                        onChange={(event) =>
                          updateLine(index, { unitCode: event.target.value })
                        }
                      />
                    </td>
                    <td>
                      <input
                        className="inline-input"
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.unitPrice}
                        onChange={(event) =>
                          updateLine(index, {
                            unitPrice: number(event.target.value),
                          })
                        }
                      />
                    </td>
                    <td>
                      <input
                        className="inline-input"
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={item.vatRate}
                        onChange={(event) =>
                          updateLine(index, {
                            vatRate: number(event.target.value),
                          })
                        }
                      />
                    </td>
                    <td>
                      {(
                        item.vatAmount ?? (item.amount * item.vatRate) / 100
                      ).toFixed(2)}
                    </td>
                    <td>
                      {(
                        item.amount +
                        (item.vatAmount ?? (item.amount * item.vatRate) / 100)
                      ).toFixed(2)}
                    </td>
                    <td>
                      <button
                        className="icon-button icon-button--danger"
                        type="button"
                        disabled={lineItems.length === 1}
                        onClick={() =>
                          setLineItems((items) =>
                            items
                              .filter((_, itemIndex) => itemIndex !== index)
                              .map((entry, itemIndex) => ({
                                ...entry,
                                id: String(itemIndex + 1),
                              })),
                          )
                        }
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="form-actions">
            <button
              className="button"
              type="button"
              onClick={() =>
                setLineItems((items) => [
                  ...items,
                  {
                    id: String(items.length + 1),
                    description: "",
                    quantity: 0,
                    unitCode: "",
                    unitPrice: 0,
                    amount: 0,
                    vatRate: data.company.vatRate,
                    vatAmount: 0,
                  },
                ])
              }
            >
              <Plus size={14} />
              Add Item
            </button>
          </div>

          {draft?.lineItems.length ? (
            <div className="import-line-summary">
              <strong>
                {draft.lineItems.length} invoice line item(s) detected
              </strong>
              {draft.lineItems.map((item) => (
                <span key={item.id}>
                  {item.id}. {item.description || "Unnamed item"} —{" "}
                  {item.quantity} × {item.unitPrice} {draft.currency}
                </span>
              ))}
            </div>
          ) : null}
          {error ? (
            <div className="form-message form-message--error">{error}</div>
          ) : null}
          <div className="form-actions">
            <button type="button" className="button" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="button button--primary"
              disabled={submitting}
            >
              {submitting ? "Saving..." : "Save Invoice"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
