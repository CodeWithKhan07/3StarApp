"use client";

import type { Quotation } from "@/domain/entities/business";
import { createNextInvoiceId } from "@/lib/record-ids";
import { useBusinessData } from "@/presentation/providers/business-data-provider";
import { X } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";

function today() {
  return new Date().toISOString().slice(0, 10);
}

export function InvoiceUploadModal({
  quotation,
  onClose,
}: {
  quotation: Quotation;
  onClose: () => void;
}) {
  const { data, createInvoiceFromQuotation } = useBusinessData();
  const nextInvoiceId = useMemo(
    () => createNextInvoiceId(data.invoices.map((invoice) => invoice.id)),
    [data.invoices],
  );

  const [invoiceId, setInvoiceId] = useState(nextInvoiceId);
  const [invoiceDate, setInvoiceDate] = useState(today());
  const [paymentMode, setPaymentMode] = useState("");
  const [remarks, setRemarks] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setSubmitting(true);
    setError("");

    try {
      await createInvoiceFromQuotation(quotation.id, {
        id: invoiceId.trim(),
        invoiceDate,
        paymentMode: paymentMode.trim(),
        remarks: remarks.trim(),
      });

      onClose();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Invoice could not be created."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-card card"
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-card__header">
          <div>
            <h2>Upload Invoice</h2>
            <p>
              For quotation {quotation.id} — {quotation.companyName}
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
              <span>Invoice No</span>
              <input
                value={invoiceId}
                onChange={(event) => setInvoiceId(event.target.value)}
              />
            </label>

            <label className="field">
              <span>Invoice Date</span>
              <input
                type="date"
                value={invoiceDate}
                onChange={(event) => setInvoiceDate(event.target.value)}
              />
            </label>

            <label className="field">
              <span>Amount (SAR)</span>
              {/* The invoice inherits the quotation's verified item total. */}
              <input
                type="number"
                step="0.01"
                value={quotation.amount}
                readOnly
              />
            </label>

            <label className="field">
              <span>Payment Mode</span>
              <input
                value={paymentMode}
                onChange={(event) => setPaymentMode(event.target.value)}
                placeholder="Bank transfer, cash..."
              />
            </label>

            <label className="field field--full">
              <span>Remarks</span>
              <textarea
                rows={3}
                value={remarks}
                onChange={(event) => setRemarks(event.target.value)}
                placeholder="Internal notes"
              />
            </label>
          </div>

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
              {submitting ? "Saving..." : "Create Invoice"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
