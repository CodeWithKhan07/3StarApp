"use client";

import {
  parseInvoiceDocument,
  type InvoiceImportDraft,
} from "@/application/services/invoice-import";
import { routes } from "@/lib/routes";
import { PageHeader } from "@/presentation/components/ui";
import { InvoiceDocumentForm } from "@/presentation/features/invoices/invoice-document-modal";
import { useBusinessData } from "@/presentation/providers/business-data-provider";
import {
  ArrowLeft,
  Check,
  FileText,
  FileUp,
  LoaderCircle,
  ReceiptText,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

type InvoiceSource = "quotation" | "without-quotation";

export function NewInvoiceScreen() {
  const router = useRouter();
  const { data } = useBusinessData();
  const [source, setSource] = useState<InvoiceSource>("quotation");
  const [projectId, setProjectId] = useState("");
  const [importDraft, setImportDraft] = useState<InvoiceImportDraft | null>(null);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const availableProjects = data.projects.filter((project) => {
    const quotation = data.quotations.find(
      (item) => item.linkedProjectId === project.id,
    );
    if (!quotation || !project.workCompleted || project.status === "completed") return false;
    return !data.invoices.some(
      (invoice) =>
        invoice.linkedProjectId === project.id ||
        invoice.quotationSerialNumber === quotation.serialNumber ||
        (!invoice.quotationSerialNumber && invoice.quotationNo === quotation.id),
    );
  });
  const selectedProjectId = projectId || availableProjects[0]?.id || "";
  const selectedQuotation = data.quotations.find(
    (quotation) => quotation.linkedProjectId === selectedProjectId,
  );

  async function importInvoice(file?: File) {
    if (!file || importing) return;

    setImporting(true);
    setError("");
    try {
      const parsed = await parseInvoiceDocument(file);
      setImportDraft(parsed);
      setSource("without-quotation");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Invoice import failed.",
      );
    } finally {
      setImporting(false);
    }
  }

  return (
    <>
      <PageHeader
        title="New Invoice"
        description="Create an invoice from an existing quotation or without a quotation."
        actions={
          <>
            <Link className="button" href={routes.invoices}>
              <ArrowLeft size={14} />
              Back
            </Link>
            <button
              className="button"
              type="button"
              disabled={importing}
              onClick={() => fileInputRef.current?.click()}
            >
              {importing ? (
                <LoaderCircle className="spin" size={14} />
              ) : (
                <FileUp size={14} />
              )}
              {importing ? "Reading..." : "Import Invoice"}
            </button>
            {source === "without-quotation" ? (
              <button
                className="button button--primary"
                type="submit"
                form="invoice-document-form"
              >
                <Check size={15} />
                Save Invoice
              </button>
            ) : null}
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
          void importInvoice(file);
        }}
      />

      {error ? (
        <div className="form-message form-message--error">{error}</div>
      ) : null}

      <div className="invoice-source-switch" role="tablist" aria-label="Invoice source">
        <button
          className={source === "quotation" ? "is-active" : ""}
          type="button"
          role="tab"
          aria-selected={source === "quotation"}
          onClick={() => setSource("quotation")}
        >
          <FileText size={17} />
          Existing Project
        </button>
        <button
          className={source === "without-quotation" ? "is-active" : ""}
          type="button"
          role="tab"
          aria-selected={source === "without-quotation"}
          onClick={() => setSource("without-quotation")}
        >
          <ReceiptText size={17} />
          Without Quotation
        </button>
      </div>

      {source === "without-quotation" ? (
        <InvoiceDocumentForm
          key={importDraft?.id || "manual-invoice"}
          draft={importDraft}
          onClose={() => router.push(routes.invoices)}
        />
      ) : (
        <section className="invoice-quotation-source">
          <header>
            <h2>Invoice From Existing Project</h2>
            <p>Select the project. Its linked quotation ID automatically supplies the client, items, VAT, and totals.</p>
          </header>
          <label className="field invoice-quotation-select">
            <span>Project</span>
            <select
              value={selectedProjectId}
              onChange={(event) => setProjectId(event.target.value)}
              disabled={!availableProjects.length}
            >
              {availableProjects.length ? (
                availableProjects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.id} - {project.company} - {project.store || project.workDescription}
                  </option>
                ))
              ) : (
                <option value="">No uninvoiced projects available</option>
              )}
            </select>
          </label>
          {selectedProjectId && selectedQuotation ? (
            <div className="invoice-project-actions">
              <Link
                className="button"
                href={`${routes.recordDetail}?type=quotation&id=${encodeURIComponent(selectedQuotation.id)}`}
              >
                <FileText size={15} />
                Open Quotation
              </Link>
              <Link
                className="button button--primary invoice-quotation-continue"
                href={`${routes.quotationInvoice}?projectId=${encodeURIComponent(selectedProjectId)}`}
              >
                Continue With Project
              </Link>
            </div>
          ) : (
            <button
              className="button button--primary invoice-quotation-continue"
              type="button"
              disabled
            >
              Continue With Project
            </button>
          )}
        </section>
      )}
    </>
  );
}
