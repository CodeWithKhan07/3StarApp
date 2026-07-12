"use client";

import { exportBusinessWorkbook } from "@/application/services/workbook-export";
import { PageHeader } from "@/presentation/components/ui";
import { useBusinessData } from "@/presentation/providers/business-data-provider";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  LoaderCircle,
  Search,
  UploadCloud,
} from "lucide-react";
import { useMemo, useRef, useState, type DragEvent } from "react";

const exportOptions = [
  {
    key: "full",
    name: "Full Workbook",
    type: "all",
    description: "Export all live clients, projects, quotations, and invoices.",
  },
  {
    key: "clients",
    name: "Company Master",
    type: "clients",
    description: "Export client/company master records only.",
  },
  {
    key: "projects",
    name: "Project Register",
    type: "projects",
    description: "Export filtered project register records.",
  },
  {
    key: "quotations",
    name: "Quotation Tracking",
    type: "quotations",
    description: "Export filtered quotation pipeline records.",
  },
  {
    key: "invoices",
    name: "Invoice & Payment",
    type: "invoices",
    description: "Export filtered invoice and payment records.",
  },
  {
    key: "pending",
    name: "Pending Payments",
    type: "pending",
    description: "Export pending, partial, and overdue payment records.",
  },
] as const;

type ExportType = (typeof exportOptions)[number]["type"];

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

function searchableText(value: unknown) {
  const record = asRecord(value);

  return Object.values(record)
    .filter((item) => typeof item === "string" || typeof item === "number")
    .join(" ")
    .toLowerCase();
}

function getStatus(value: unknown) {
  const record = asRecord(value);

  return readFirstString(
    record,
    ["status", "paymentStatus", "projectStatus", "quotationStatus"],
    ""
  ).toLowerCase();
}

function isPendingInvoice(value: unknown) {
  const status = getStatus(value);

  return ["pending", "partial", "overdue"].includes(status);
}

function createExportFileName(name: string) {
  const date = new Date().toISOString().slice(0, 10);
  return `${name.replaceAll(" ", "_")}_${date}.xlsx`;
}

export function ExportScreen() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const { data, importFile, syncState, lastError } = useBusinessData();

  const [dragging, setDragging] = useState(false);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [search, setSearch] = useState("");
  const [exportType, setExportType] = useState<ExportType>("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const normalizedSearch = search.trim().toLowerCase();

  const filteredData = useMemo(() => {
    const filterCollection = <TItem,>(items: TItem[]) => {
      return items.filter((item) => {
        const matchesSearch =
          !normalizedSearch || searchableText(item).includes(normalizedSearch);

        const matchesStatus =
          statusFilter === "all" || getStatus(item) === statusFilter;

        return matchesSearch && matchesStatus;
      });
    };

    const clients = data.clients.filter((item) => {
      if (!normalizedSearch) return true;
      return searchableText(item).includes(normalizedSearch);
    });

    const projects = filterCollection(data.projects);
    const quotations = filterCollection(data.quotations);
    const invoices = filterCollection(data.invoices);
    const pendingInvoices = invoices.filter(isPendingInvoice);

    return {
      clients,
      projects,
      quotations,
      invoices: exportType === "pending" ? pendingInvoices : invoices,
    };
  }, [
    data.clients,
    data.invoices,
    data.projects,
    data.quotations,
    exportType,
    normalizedSearch,
    statusFilter,
  ]);

  const selectedExport = useMemo(() => {
    return exportOptions.find((item) => item.type === exportType) ?? exportOptions[0];
  }, [exportType]);

  const recordCount = useMemo(() => {
    if (exportType === "clients") return filteredData.clients.length;
    if (exportType === "projects") return filteredData.projects.length;
    if (exportType === "quotations") return filteredData.quotations.length;
    if (exportType === "invoices") return filteredData.invoices.length;
    if (exportType === "pending") return filteredData.invoices.length;

    return (
      filteredData.clients.length +
      filteredData.projects.length +
      filteredData.quotations.length +
      filteredData.invoices.length
    );
  }, [exportType, filteredData]);

  const previewRows = useMemo(() => {
    if (exportType === "clients") return filteredData.clients.slice(0, 8);
    if (exportType === "projects") return filteredData.projects.slice(0, 8);
    if (exportType === "quotations") return filteredData.quotations.slice(0, 8);
    if (exportType === "invoices" || exportType === "pending") {
      return filteredData.invoices.slice(0, 8);
    }

    return [
      ...filteredData.clients.slice(0, 2),
      ...filteredData.projects.slice(0, 2),
      ...filteredData.quotations.slice(0, 2),
      ...filteredData.invoices.slice(0, 2),
    ];
  }, [exportType, filteredData]);

  function openFilePicker() {
    if (importing) return;
    fileInputRef.current?.click();
  }

  function validateExcelFile(file: File) {
    const lowerName = file.name.toLowerCase();

    return [".xlsx", ".xls", ".xlsm", ".xlsb", ".ods", ".csv"].some((extension) =>
      lowerName.endsWith(extension)
    );
  }

  async function handleImport(file?: File) {
    if (!file || importing) return;

    setError("");
    setSuccess("");

    if (!validateExcelFile(file)) {
      setError("Invalid file. Upload .xlsx, .xls, .xlsm, .xlsb, .ods, or .csv.");
      return;
    }

    setImporting(true);

    try {
      const result = await importFile(file);

      const sheetMatches = result.sheetMatches.length
        ? result.sheetMatches
            .map((sheet) => `${sheet.sheet}: ${sheet.records}`)
            .join(" | ")
        : "No mapped sheets found.";

      const warningText = result.warnings.length
        ? ` Warnings: ${result.warnings.join(" ")}`
        : "";

      setSuccess(
        `Imported successfully. Clients: ${result.clients.length}, Projects: ${result.projects.length}, Quotations: ${result.quotations.length}, Invoices: ${result.invoices.length}. ${sheetMatches}.${warningText}`
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Excel import failed. Please try again."
      );
    } finally {
      setImporting(false);
      setDragging(false);
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();

    if (importing) return;

    const file = event.dataTransfer.files?.[0];

    if (!file) {
      setDragging(false);
      setError("No Excel file detected.");
      return;
    }

    void handleImport(file);
  }

  async function handleExport() {
    if (exporting) return;

    setError("");
    setSuccess("");

    if (recordCount === 0) {
      setError("No records match your current export filters.");
      return;
    }

    setExporting(true);

    try {
      await exportBusinessWorkbook(
        {
          clients:
            exportType === "all" || exportType === "clients"
              ? filteredData.clients
              : [],
          projects:
            exportType === "all" || exportType === "projects"
              ? filteredData.projects
              : [],
          quotations:
            exportType === "all" || exportType === "quotations"
              ? filteredData.quotations
              : [],
          invoices:
            exportType === "all" ||
            exportType === "invoices" ||
            exportType === "pending"
              ? filteredData.invoices
              : [],
        },
        createExportFileName(selectedExport.name)
      );

      setSuccess(
        `${selectedExport.name} exported successfully. Records exported: ${recordCount}.`
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Excel export failed. Please retry."
      );
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Excel Import / Export"
        description="Import old workbook data and export exactly what you need from one dedicated export center."
        actions={
          <button
            className="button button--primary"
            type="button"
            onClick={openFilePicker}
            disabled={importing}
          >
            {importing ? (
              <LoaderCircle className="spin" size={16} />
            ) : (
              <UploadCloud size={16} />
            )}
            Import Excel
          </button>
        }
      />

      <input
        ref={fileInputRef}
        className="file-input"
        type="file"
        accept=".xlsx,.xls,.xlsm,.xlsb,.ods,.csv"
        disabled={importing}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          void handleImport(file);
        }}
      />

      <section className="card import-panel import-panel--hero">
        <div className="import-panel__content">
          <div className="export-card__icon">
            <FileSpreadsheet size={25} />
          </div>

          <h2>Import old Excel workbook</h2>

          <p>
            Click or drag your Excel file here. The app parses your workbook,
            updates the dashboard instantly, stores data locally, and syncs with
            Firebase in the background.
          </p>

          <div className={`sync-state sync-state--${syncState}`}>
            Cloud sync: {syncState}
            {lastError ? ` — ${lastError}` : ""}
          </div>
        </div>

        <div
          className={[
            "drop-zone",
            dragging ? "drop-zone--active" : "",
            importing ? "drop-zone--busy" : "",
          ].join(" ")}
          role="button"
          tabIndex={0}
          aria-label="Click or drop Excel workbook"
          onClick={openFilePicker}
          onKeyDown={(event) => {
            if ((event.key === "Enter" || event.key === " ") && !importing) {
              event.preventDefault();
              openFilePicker();
            }
          }}
          onDragEnter={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setDragging(true);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            event.stopPropagation();
            event.dataTransfer.dropEffect = "copy";
            setDragging(true);
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            event.stopPropagation();

            const relatedTarget = event.relatedTarget as Node | null;

            if (!relatedTarget || !event.currentTarget.contains(relatedTarget)) {
              setDragging(false);
            }
          }}
          onDrop={handleDrop}
        >
          {importing ? (
            <LoaderCircle className="spin" size={44} />
          ) : (
            <UploadCloud size={44} />
          )}

          <strong>
            {importing
              ? "Parsing workbook..."
              : dragging
                ? "Drop Excel file here"
                : "Click or drag Excel file here"}
          </strong>

          <span>Supports .xlsx, .xls, .xlsm, .xlsb, .ods, and .csv.</span>
        </div>
      </section>

      <section className="card export-control-panel">
        <div className="export-control-panel__header">
          <div>
            <h2>Export Center</h2>
            <p>
              Select a workbook section, search records, filter status, preview
              the matched records, then export.
            </p>
          </div>

          <button
            className="button button--primary"
            type="button"
            onClick={handleExport}
            disabled={exporting}
          >
            {exporting ? (
              <LoaderCircle className="spin" size={16} />
            ) : (
              <Download size={16} />
            )}
            {exporting ? "Exporting..." : "Export Selected"}
          </button>
        </div>

        <div className="export-filters">
          <label className="toolbar-search">
            <Search size={17} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search company, project, invoice, quotation..."
            />
          </label>

          <select
            className="select"
            value={exportType}
            onChange={(event) => setExportType(event.target.value as ExportType)}
          >
            {exportOptions.map((item) => (
              <option key={item.key} value={item.type}>
                {item.name}
              </option>
            ))}
          </select>

          <select
            className="select"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="all">All Status</option>

            <option value="upcoming">Upcoming</option>
            <option value="in-progress">In Progress</option>
            <option value="on-hold">On Hold</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>

            <option value="draft">Draft</option>
            <option value="sent">Sent</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="expired">Expired</option>

            <option value="pending">Pending</option>
            <option value="partial">Partial</option>
            <option value="po">Pending PO</option>
            <option value="overdue">Overdue</option>
            <option value="paid">Paid</option>
          </select>
        </div>

        <div className="export-summary-grid">
          <div>
            <span>Clients</span>
            <strong>{filteredData.clients.length}</strong>
          </div>

          <div>
            <span>Projects</span>
            <strong>{filteredData.projects.length}</strong>
          </div>

          <div>
            <span>Quotations</span>
            <strong>{filteredData.quotations.length}</strong>
          </div>

          <div>
            <span>Invoices</span>
            <strong>{filteredData.invoices.length}</strong>
          </div>

          <div>
            <span>Export Records</span>
            <strong>{recordCount}</strong>
          </div>
        </div>

        <div className="export-preview">
          <div className="export-preview__header">
            <div>
              <h3>{selectedExport.name}</h3>
              <p>{selectedExport.description}</p>
            </div>

            <span>{recordCount} records matched</span>
          </div>

          <div className="table-wrap">
            <table className="data-table export-preview-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Primary</th>
                  <th>Secondary</th>
                  <th>Status</th>
                </tr>
              </thead>

              <tbody>
                {previewRows.length ? (
                  previewRows.map((row, index) => {
                    const record = asRecord(row);

                    const id = readFirstString(
                      record,
                      ["id", "projectId", "invoiceNo", "quotationNo"],
                      `ROW-${index + 1}`
                    );

                    const primary = readFirstString(
                      record,
                      [
                        "companyName",
                        "company",
                        "clientName",
                        "customerName",
                        "name",
                      ],
                      "Unnamed Record"
                    );

                    const secondary = readFirstString(
                      record,
                      [
                        "id",
                        "projectId",
                        "invoiceNo",
                        "quotationNo",
                        "location",
                        "city",
                        "category",
                      ],
                      id
                    );

                    const status = getStatus(row) || "—";

                    return (
                      <tr key={`${id}-${index}`}>
                        <td>{selectedExport.name}</td>
                        <td>{primary}</td>
                        <td>{secondary}</td>
                        <td>{status}</td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={4}>
                      No records match your current filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {error ? (
        <div className="form-message form-message--error" role="alert">
          <AlertCircle size={16} />
          {error}
        </div>
      ) : null}

      {success ? (
        <div className="form-message form-message--success" role="status">
          <CheckCircle2 size={16} />
          {success}
        </div>
      ) : null}
    </>
  );
}
