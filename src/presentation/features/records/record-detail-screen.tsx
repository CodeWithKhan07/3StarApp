"use client";

import {
  exportInvoicePdf,
  exportQuotationPdf,
} from "@/application/services/document-export";
import type {
  Client,
  Invoice,
  Project,
  Quotation,
} from "@/domain/entities/business";
import { routes } from "@/lib/routes";
import { PageHeader, StatusBadge } from "@/presentation/components/ui";
import { money } from "@/presentation/data/sample-data";
import { useBusinessData } from "@/presentation/providers/business-data-provider";
import { ArrowLeft, Download, Edit3, Printer, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

type RecordType = "client" | "project" | "invoice" | "quotation";
type RawRecord = Client | Project | Invoice | Quotation;

interface DetailField {
  label: string;
  value: string;
}

interface DetailSection {
  title: string;
  fields: DetailField[];
}

interface DetailTable {
  title: string;
  headers: string[];
  rows: string[][];
}

interface RecordDetail {
  recordId: string;
  title: string;
  subtitle: string;
  status: string;
  sections: DetailSection[];
  table?: DetailTable;
  raw: RawRecord;
}

const display = (value: unknown) => {
  if (value === undefined || value === null || value === "") return "-";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
};

const field = (label: string, value: unknown): DetailField => ({
  label,
  value: display(value),
});

const amount = (value: number | undefined) => money(value ?? 0);

function backRoute(type: RecordType) {
  if (type === "client") return routes.clients;
  if (type === "project") return routes.projects;
  if (type === "invoice") return routes.invoices;
  return routes.quotations;
}

function editRoute(type: RecordType, id: string) {
  if (type === "client") {
    return `${routes.editClient}?id=${encodeURIComponent(id)}`;
  }
  if (type === "project") {
    return `${routes.editProject}?id=${encodeURIComponent(id)}`;
  }
  if (type === "invoice") {
    return `${routes.editInvoice}?id=${encodeURIComponent(id)}`;
  }
  return `${routes.editQuotation}?id=${encodeURIComponent(id)}`;
}

// Detail builders keep the screen render-only while exposing every persisted
// field in readable sections instead of a shortened summary.
function clientDetail(record: Client): RecordDetail {
  return {
    recordId: record.id,
    title: record.companyName,
    subtitle: record.brandName || record.city || "Client",
    status: record.contractStatus,
    raw: record,
    sections: [
      {
        title: "Client identity",
        fields: [
          field("Client ID", record.id),
          field("Company name", record.companyName),
          field("Brand name", record.brandName),
          field("Contract status", record.contractStatus),
        ],
      },
      {
        title: "Contact and address",
        fields: [
          field("Contact person", record.contactPerson),
          field("Mobile / WhatsApp", record.mobile),
          field("Email", record.email),
          field("Address", record.address),
          field("City", record.city),
          field("Country", record.country),
        ],
      },
      {
        title: "Business details",
        fields: [
          field("VAT number", record.vatNumber),
          field("CR number", record.crNumber),
          field("Default store / branch", record.storeName),
          field("Store location", record.storeLocation),
          field("Remarks", record.remarks),
        ],
      },
    ],
  };
}

function projectDetail(record: Project): RecordDetail {
  return {
    recordId: record.id,
    title: record.id,
    subtitle: `${record.company} - ${record.startDate || "No date"}`,
    status: record.status,
    raw: record,
    sections: [
      {
        title: "Project overview",
        fields: [
          field("Project ID", record.id),
          field("Company", record.company),
          field("Store / branch", record.store),
          field("Location", record.location),
          field("Category", record.category),
          field("Priority", record.priority),
          field("Status", record.status),
          field("Completion", `${record.completion}%`),
          field("Work description", record.workDescription),
        ],
      },
      {
        title: "Dates and references",
        fields: [
          field("Start date", record.startDate),
          field("Expected completion", record.expectedCompletion),
          field("Actual completion", record.actualCompletion),
          field("Quotation number", record.quotationNo),
          field("Quotation date", record.quotationDate),
          field("Validity date", record.validityDate),
          field("Work order number", record.woNo),
        ],
      },
      {
        title: "Financial details",
        fields: [
          field("Currency", record.currency),
          field("Project value", amount(record.value)),
          field("Subtotal", amount(record.subTotal)),
          field("VAT rate", record.vatRate === undefined ? "-" : `${record.vatRate}%`),
          field("VAT amount", amount(record.vatAmount)),
          field("Total amount", amount(record.totalAmount)),
        ],
      },
      {
        title: "Supplier and notes",
        fields: [
          field("Supplier business name", record.supplierBusinessName),
          field("Supplier legal name", record.supplierLegalName),
          field("Supplier city", record.supplierCity),
          field("Supplier country", record.supplierCountry),
          field("Supplier phone", record.supplierPhone),
          field("Supplier email", record.supplierEmail),
          field("Supplier website", record.supplierWebsite),
          field("CR number", record.crNumber),
          field("VAT number", record.vatNumber),
          field("Terms and conditions", record.termsAndConditions),
          field("Remarks", record.remarks),
        ],
      },
    ],
    table: record.lineItems?.length
      ? {
          title: "Project line items",
          headers: ["#", "Description", "Quantity", "Unit price", "Amount", "VAT %", "VAT"],
          rows: record.lineItems.map((item) => [
            display(item.serialNo),
            display(item.description),
            display(item.quantity),
            amount(item.unitPrice),
            amount(item.amount),
            display(item.vatRate),
            amount(item.vatAmount),
          ]),
        }
      : undefined,
  };
}

function quotationDetail(record: Quotation): RecordDetail {
  return {
    recordId: record.id,
    title: record.serialNumber || record.id,
    subtitle: `${record.companyName} - ${record.issueDate || "No date"}`,
    status: record.status,
    raw: record,
    sections: [
      {
        title: "Quotation overview",
        fields: [
          field("Quotation number", record.id),
          field("Unique serial number", record.serialNumber),
          field("Company", record.companyName),
          field("Store / branch", record.store),
          field("Store location", record.storeLocation),
          field("Status", record.status),
          field("Issue date", record.issueDate),
          field("Validity date", record.validityDate),
          field("Follow-up date", record.followUpDate),
          field("Linked project ID", record.linkedProjectId),
          field("Scope of work", record.scopeOfWork),
        ],
      },
      {
        title: "Customer details",
        fields: [
          field("Customer address", record.customerAddress),
          field("Customer city", record.customerCity),
          field("Customer country", record.customerCountry),
          field("Customer VAT number", record.customerVatNumber),
          field("Customer CR number", record.customerCrNumber),
        ],
      },
      {
        title: "Financial details",
        fields: [
          field("Currency", record.currency),
          field("Subtotal", amount(record.subTotal)),
          field("VAT rate", record.vatRate === undefined ? "-" : `${record.vatRate}%`),
          field("VAT amount", amount(record.vatAmount)),
          field("Total amount", amount(record.amount)),
          field("Show SQM", record.showSqm),
        ],
      },
      {
        title: "Supplier and notes",
        fields: [
          field("Supplier business name", record.supplierBusinessName),
          field("Supplier legal name", record.supplierLegalName),
          field("Supplier CR number", record.supplierCrNumber),
          field("Supplier VAT number", record.supplierVatNumber),
          field("Supplier city", record.supplierCity),
          field("Supplier country", record.supplierCountry),
          field("Supplier phone", record.supplierPhone),
          field("Supplier email", record.supplierEmail),
          field("Supplier website", record.supplierWebsite),
          field("Terms and conditions", record.termsAndConditions),
          field("Remarks", record.remarks),
        ],
      },
    ],
    table: record.lineItems?.length
      ? {
          title: "Quotation line items",
          headers: ["#", "Description", "Quantity", "SQM", "Unit price", "Amount", "VAT %", "VAT"],
          rows: record.lineItems.map((item) => [
            display(item.serialNo),
            display(item.description),
            display(item.quantity),
            display(item.sqm),
            amount(item.unitPrice),
            amount(item.amount),
            display(item.vatRate),
            amount(item.vatAmount),
          ]),
        }
      : undefined,
  };
}

function invoiceDetail(record: Invoice): RecordDetail {
  return {
    recordId: record.id,
    title: record.id,
    subtitle: `${record.companyName} - ${record.invoiceDate || "No date"}`,
    status: record.status,
    raw: record,
    sections: [
      {
        title: "Invoice overview",
        fields: [
          field("Invoice number", record.id),
          field("UUID", record.uuid),
          field("Company", record.companyName),
          field("Project", record.project),
          field("Quotation number", record.quotationNo),
          field("Quotation serial", record.quotationSerialNumber),
          field("Purchase order number", record.purchaseOrderNumber),
          field("Status", record.status),
        ],
      },
      {
        title: "Dates and payment",
        fields: [
          field("Invoice date", record.invoiceDate),
          field("Due date", record.dueDate),
          field("Payment terms", record.paymentTerms),
          field("Payment date", record.paymentDate),
          field("Payment mode", record.paymentMode),
          field("Follow-up date", record.followUpDate),
          field("Currency", record.currency),
          field("Subtotal", amount(record.subTotal)),
          field("VAT rate", record.vatRate === undefined ? "-" : `${record.vatRate}%`),
          field("VAT amount", amount(record.vatAmount)),
          field("Discount", amount(record.discountAmount)),
          field("Total amount", amount(record.amount)),
          field("Received", amount(record.received)),
          field("Balance due", amount(record.amount - record.received)),
        ],
      },
      {
        title: "Customer and supplier",
        fields: [
          field("Customer address", record.customerAddress),
          field("Customer VAT number", record.customerVatNumber),
          field("Supplier name", record.supplierName),
          field("Supplier legal name", record.supplierLegalName),
          field("Supplier address", record.supplierAddress),
          field("Supplier CR number", record.supplierCrNumber),
          field("Supplier VAT number", record.supplierVatNumber),
          field("Supplier phone", record.supplierPhone),
          field("Supplier email", record.supplierEmail),
        ],
      },
      {
        title: "Attachment and notes",
        fields: [
          field("Attachment name", record.attachmentName),
          field("Attachment type", record.attachmentType),
          field(
            "Attachment size",
            record.attachmentSize === undefined
              ? "-"
              : `${(record.attachmentSize / 1024).toFixed(1)} KB`,
          ),
          field("Attachment path", record.attachmentPath),
          field("Attachment URL", record.attachmentUrl),
          field("Local attachment key", record.localAttachmentKey),
          field("Notes", record.notes),
          field("Remarks", record.remarks),
        ],
      },
    ],
    table: record.lineItems?.length
      ? {
          title: "Invoice line items",
          headers: ["#", "Description", "Quantity", "Unit", "Unit price", "Amount", "VAT %", "VAT"],
          rows: record.lineItems.map((item) => [
            display(item.id),
            display(item.description),
            display(item.quantity),
            display(item.unitCode),
            amount(item.unitPrice),
            amount(item.amount),
            display(item.vatRate),
            amount(item.vatAmount),
          ]),
        }
      : undefined,
  };
}

export function RecordDetailScreen() {
  const params = useSearchParams();
  const router = useRouter();
  const { data, deleteRecord } = useBusinessData();
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const type = (params.get("type") || "") as RecordType;
  const id = params.get("id") || "";

  const detail = useMemo<RecordDetail | null>(() => {
    if (type === "client") {
      const record = data.clients.find((item) => item.id === id);
      return record ? clientDetail(record) : null;
    }
    if (type === "project") {
      const record = data.projects.find((item) => item.id === id);
      return record ? projectDetail(record) : null;
    }
    if (type === "invoice") {
      const record = data.invoices.find((item) => item.id === id);
      return record ? invoiceDetail(record) : null;
    }
    if (type === "quotation") {
      const record = data.quotations.find(
        (item) => item.id === id || item.serialNumber === id,
      );
      return record ? quotationDetail(record) : null;
    }
    return null;
  }, [data.clients, data.invoices, data.projects, data.quotations, id, type]);

  async function printRecord() {
    if (!detail) return;
    setError("");
    try {
      if (type === "invoice") {
        await exportInvoicePdf(detail.raw as Invoice, data.company);
        return;
      }
      if (type === "quotation") {
        await exportQuotationPdf(detail.raw as Quotation, data.company);
        return;
      }
      window.print();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Print failed.");
    }
  }

  function removeRecord() {
    if (!detail || deleting) return;
    if (!window.confirm(`Move "${detail.title}" to Trash?`)) return;

    const collection =
      type === "client"
        ? "clients"
        : type === "project"
          ? "projects"
          : type === "invoice"
            ? "invoices"
            : "quotations";

    setDeleting(true);
    setError("");
    void deleteRecord(collection, detail.recordId)
      .then(() => router.push(backRoute(type)))
      .catch((caught) => {
        setError(
          caught instanceof Error
            ? caught.message
            : "Delete operation failed. Please try again.",
        );
        setDeleting(false);
      });
  }

  if (!detail) {
    return (
      <section className="card empty-state">
        <h2>Record not found</h2>
        <p>The item may have been deleted or the link is invalid.</p>
        <Link className="button" href={routes.dashboard}>
          Back to Dashboard
        </Link>
      </section>
    );
  }

  return (
    <>
      <PageHeader
        title={detail.title}
        description={detail.subtitle}
        actions={
          <>
            <Link className="button" href={backRoute(type)}>
              <ArrowLeft size={14} />
              Back
            </Link>
            <button className="button" type="button" onClick={() => void printRecord()}>
              {type === "invoice" || type === "quotation" ? (
                <Download size={14} />
              ) : (
                <Printer size={14} />
              )}
              {type === "invoice" || type === "quotation" ? "Download" : "Print"}
            </button>
            <Link
              className="button button--primary"
              href={editRoute(type, detail.recordId)}
            >
              <Edit3 size={14} />
              Edit
            </Link>
            <button
              className="button button--danger"
              type="button"
              disabled={deleting}
              onClick={removeRecord}
            >
              <Trash2 size={14} />
              {deleting ? "Deleting..." : "Delete"}
            </button>
          </>
        }
      />

      {error ? (
        <div className="form-message form-message--error" role="alert">
          {error}
        </div>
      ) : null}

      <section className="record-page-detail card">
        <header>
          <div>
            <span>{type} detail</span>
            <h2>{detail.title}</h2>
            <p>{detail.subtitle}</p>
          </div>
          <StatusBadge value={detail.status} />
        </header>

        {/* Full persisted record details are grouped below the top actions. */}
        <div className="record-detail-sections">
          {detail.sections.map((section) => (
            <section className="record-detail-section" key={section.title}>
              <h3>{section.title}</h3>
              <dl>
                {section.fields.map((item) => (
                  <div key={item.label}>
                    <dt>{item.label}</dt>
                    <dd>{item.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>

        {detail.table ? (
          <section className="record-detail-lines">
            <h3>{detail.table.title}</h3>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    {detail.table.headers.map((header) => (
                      <th key={header}>{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {detail.table.rows.map((row, rowIndex) => (
                    <tr key={`${detail.recordId}-line-${rowIndex}`}>
                      {row.map((cell, cellIndex) => (
                        <td key={`${rowIndex}-${cellIndex}`}>{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}
      </section>
    </>
  );
}
