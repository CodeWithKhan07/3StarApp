"use client";

import {
    exportInvoicePdf,
    exportQuotationPdf,
} from "@/application/services/document-export";
import type { Invoice, Quotation } from "@/domain/entities/business";
import { routes } from "@/lib/routes";
import { PageHeader, StatusBadge } from "@/presentation/components/ui";
import { money } from "@/presentation/data/sample-data";
import { useBusinessData } from "@/presentation/providers/business-data-provider";
import { ArrowLeft, Download, Edit3, Printer, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

type RecordType = "client" | "project" | "invoice" | "quotation";

function backRoute(type: RecordType) {
  if (type === "client") return routes.clients;
  if (type === "project") return routes.projects;
  if (type === "invoice") return routes.invoices;
  return routes.quotations;
}

function editRoute(type: RecordType, id: string) {
  if (type === "client")
    return `${routes.editClient}?id=${encodeURIComponent(id)}`;
  if (type === "project")
    return `${routes.editProject}?id=${encodeURIComponent(id)}`;
  if (type === "invoice")
    return `${routes.editInvoice}?id=${encodeURIComponent(id)}`;
  return `${routes.editQuotation}?id=${encodeURIComponent(id)}`;
}

export function RecordDetailScreen() {
  const params = useSearchParams();
  const router = useRouter();
  const { data, deleteRecord } = useBusinessData();
  const [error, setError] = useState("");
  const type = (params.get("type") || "") as RecordType;
  const id = params.get("id") || "";

  const detail = useMemo(() => {
    if (type === "client") {
      const record = data.clients.find((item) => item.id === id);
      if (!record) return null;
      return {
        title: record.companyName,
        subtitle: record.brandName || record.city || "Client",
        status: record.contractStatus,
        fields: [
          ["Contact", record.contactPerson || "-"],
          [
            "Mobile / Email",
            `${record.mobile || "-"} / ${record.email || "-"}`,
          ],
          [
            "VAT / CR",
            `${record.vatNumber || "-"} / ${record.crNumber || "-"}`,
          ],
          ["Store", record.storeName || "-"],
          ["Address", record.address || "-"],
          ["Remarks", record.remarks || "-"],
        ],
        raw: record,
      };
    }
    if (type === "project") {
      const record = data.projects.find((item) => item.id === id);
      if (!record) return null;
      return {
        title: record.id,
        subtitle: `${record.company} - ${record.startDate || "No date"}`,
        status: record.status,
        fields: [
          ["Company", record.company],
          [
            "Store / Location",
            `${record.store || "-"} / ${record.location || "No location"}`,
          ],
          ["Description", record.workDescription || "-"],
          ["Category", record.category || "-"],
          ["Value", money(record.value)],
          ["Completion", `${record.completion}%`],
          ["Expected", record.expectedCompletion || "-"],
          ["Quotation", record.quotationNo || "-"],
        ],
        raw: record,
      };
    }
    if (type === "invoice") {
      const record = data.invoices.find((item) => item.id === id);
      if (!record) return null;
      return {
        title: record.id,
        subtitle: `${record.companyName} - ${record.invoiceDate || "No date"}`,
        status: record.status,
        fields: [
          ["Company", record.companyName],
          ["Project", record.project || "-"],
          [
            "PO / Quotation",
            record.purchaseOrderNumber ||
              record.quotationSerialNumber ||
              record.quotationNo ||
              "-",
          ],
          ["Amount", money(record.amount)],
          ["Received", money(record.received)],
          ["Balance", money(record.amount - record.received)],
          ["Due / Follow-up", record.dueDate || record.followUpDate || "-"],
          ["Remarks", record.remarks || "-"],
        ],
        raw: record,
      };
    }
    if (type === "quotation") {
      const record = data.quotations.find(
        (item) => item.id === id || item.serialNumber === id,
      );
      if (!record) return null;
      return {
        title: record.serialNumber || record.id,
        subtitle: `${record.companyName} - ${record.issueDate || "No date"}`,
        status: record.status,
        fields: [
          ["Quotation No", record.id],
          ["Company", record.companyName],
          ["Store", record.store || "-"],
          ["Description", record.scopeOfWork || "-"],
          ["Amount", money(record.amount)],
          ["Validity", record.validityDate || "-"],
          ["Remarks", record.remarks || "-"],
        ],
        raw: record,
      };
    }
    return null;
  }, [data.clients, data.invoices, data.projects, data.quotations, id, type]);

  async function printRecord() {
    if (!detail) {
      setError("Record not found. Please refresh the page.");
      return;
    }
    setError("");
    try {
      if (type === "invoice" && detail.raw) {
        await exportInvoicePdf(detail.raw as Invoice, data.company);
        return;
      }
      if (type === "quotation" && detail.raw) {
        await exportQuotationPdf(detail.raw as Quotation, data.company);
        return;
      }
      window.print();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Print failed.");
    }
  }

  function removeRecord() {
    if (!detail) return;
    window.setTimeout(() => {
      if (!window.confirm(`Move "${detail.title}" to Trash?`)) return;
      const collection =
        type === "client"
          ? "clients"
          : type === "project"
            ? "projects"
            : type === "invoice"
              ? "invoices"
              : "quotations";
      void deleteRecord(collection, id)
        .then(() => router.push(backRoute(type)))
        .catch((caught) => {
          setError(
            caught instanceof Error
              ? caught.message
              : "Delete operation failed. Please try again.",
          );
        });
    }, 0);
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
          <Link className="button" href={backRoute(type)}>
            <ArrowLeft size={14} />
            Back
          </Link>
        }
      />
      {error ? (
        <div className="form-message form-message--error">{error}</div>
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
        <dl>
          {detail.fields.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <footer className="record-action-bar">
          <button
            className="button"
            type="button"
            onClick={() => void printRecord()}
          >
            {type === "invoice" || type === "quotation" ? (
              <Download size={14} />
            ) : (
              <Printer size={14} />
            )}
            Print
          </button>
          <Link className="button button--primary" href={editRoute(type, id)}>
            <Edit3 size={14} />
            Edit
          </Link>
          <button
            className="button button--danger"
            type="button"
            onClick={removeRecord}
          >
            <Trash2 size={14} />
            Delete
          </button>
        </footer>
      </section>
    </>
  );
}
