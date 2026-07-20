"use client";

import { exportQuotationPdf } from "@/application/services/document-export";
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
import { useBusinessData } from "@/presentation/providers/business-data-provider";
import {
    collectCompanyNames,
    normalizeCompanyKey,
} from "@/presentation/utils/company-filters";
import {
    Check,
    Download,
    Edit3,
    FileUp,
    LoaderCircle,
    Plus,
    Printer,
    Search,
    SlidersHorizontal,
    Trash2,
    X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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

function emptyLineItem(serialNo: number): QuotationLineItemDraft {
  return {
    serialNo,
    description: "",
    quantity: "",
    sqm: "",
    unitPrice: "",
    amount: 0,
    vatRate: "",
    vatAmount: 0,
  };
}

function lineItemToDraft(
  item: Partial<QuotationLineItem>,
  serialNo: number,
  fallbackVatRate = 0,
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
  fallback = "",
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
  fallback = 0,
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
      readFirstString(record, ["serialNumber"], ""),
    ),
    issueDate: readFirstString(record, ["issueDate"], ""),
    companyName: readFirstString(
      record,
      ["companyName", "company"],
      "Unnamed Company",
    ),
    store: readFirstString(record, ["store", "branch", "storeBranch"], ""),
    scopeOfWork: readFirstString(record, ["scopeOfWork", "description"], ""),
    amount: readFirstNumber(record, ["amount"], 0),
    status: readFirstString(record, ["status"], "draft") as QuotationStatus,
    followUpDate: readFirstString(record, ["followUpDate"], ""),
    remarks: readFirstString(record, ["remarks", "notes"], ""),
  };
}

function createPatchedQuotation(
  quotation: Quotation,
  patch: Partial<ReturnType<typeof normalizeQuotation>>,
): Quotation {
  return {
    ...quotation,
    issueDate: patch.issueDate ?? quotation.issueDate,
    // Inline edits only change visible fields; hidden document metadata must
    // survive the save unchanged.
    validityDate: quotation.validityDate,
    companyName: patch.companyName ?? quotation.companyName,
    store: patch.store ?? quotation.store,
    scopeOfWork: patch.scopeOfWork ?? quotation.scopeOfWork,
    amount: patch.amount ?? quotation.amount,
    status: patch.status ?? quotation.status,
    followUpDate: quotation.followUpDate,
    remarks: patch.remarks ?? quotation.remarks,
  };
}

export function QuotationsScreen() {
  const router = useRouter();
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
  const [company, setCompany] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [sortBy, setSortBy] = useState("newest");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importDraft, setImportDraft] = useState<QuotationImportDraft | null>(
    null,
  );
  const [clientSource, setClientSource] = useState<"new" | "saved">("new");
  const [selectedClientId, setSelectedClientId] = useState("");
  const [quotationCompanyName, setQuotationCompanyName] = useState("");
  const [quotationStore, setQuotationStore] = useState("");
  const [quotationCustomerAddress, setQuotationCustomerAddress] = useState("");
  const [quotationCustomerVatNumber, setQuotationCustomerVatNumber] =
    useState("");
  const [showSqm, setShowSqm] = useState(false);
  const [vatRate, setVatRate] = useState(
    numberToInputText(data.company.vatRate) || "15",
  );
  const [lineItems, setLineItems] = useState<QuotationLineItemDraft[]>([
    emptyLineItem(1),
  ]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [editingId, setEditingId] = useState("");
  const [draft, setDraft] = useState<ReturnType<
    typeof normalizeQuotation
  > | null>(null);

  const quotationTotals = useMemo(() => {
    const subTotal = lineItems.reduce((sum, item) => sum + item.amount, 0);
    const vatAmount = (subTotal * toNumber(vatRate)) / 100;
    return { subTotal, vatAmount, total: subTotal + vatAmount };
  }, [lineItems, vatRate]);

  function updateLineItem(
    index: number,
    patch: Partial<QuotationLineItemDraft>,
  ) {
    setLineItems((current) =>
      current.map((item, itemIndex) => {
        if (itemIndex !== index) return item;

        const next = { ...item, ...patch };
        const quantity = toNumber(next.quantity);
        const unitPrice = toNumber(next.unitPrice);

        next.amount = quantity * unitPrice;
        next.vatAmount = 0;

        return next;
      }),
    );
  }

  const quotations = useMemo(() => {
    return data.quotations.map(normalizeQuotation);
  }, [data.quotations]);

  const nextQuotationId = useMemo(() => {
    return createNextQuotationId(
      data.quotations.map((quotation) => quotation.id),
    );
  }, [data.quotations]);

  const clientOptions = useMemo(() => {
    return data.clients
      .map((client) => {
        const record = asRecord(client);
        const companyName = readFirstString(
          record,
          ["companyName", "company", "name"],
          "",
        );
        return {
          id: readFirstString(record, ["id"], companyName),
          companyName,
          brandName: readFirstString(record, ["brandName"], ""),
          storeName: readFirstString(
            record,
            ["storeName", "store", "branch"],
            "",
          ),
          storeLocation: readFirstString(
            record,
            ["storeLocation", "location"],
            "",
          ),
          address: readFirstString(record, ["address", "customerAddress"], ""),
          vatNumber: readFirstString(
            record,
            ["vatNumber", "customerVatNumber"],
            "",
          ),
        };
      })
      .filter((client) => client.companyName);
  }, [data.clients]);

  const companyOptions = useMemo(() => collectCompanyNames(data), [data]);

  function applySavedClient(clientId: string) {
    setSelectedClientId(clientId);
    const client = clientOptions.find((item) => item.id === clientId);
    if (!client) return;

    setQuotationCompanyName(client.companyName);
    setQuotationStore(client.storeName || client.brandName);
    setQuotationCustomerAddress(client.address);
    setQuotationCustomerVatNumber(client.vatNumber);
  }

  function resetQuotationClientFields() {
    setClientSource("new");
    setSelectedClientId("");
    setQuotationCompanyName("");
    setQuotationStore("");
    setQuotationCustomerAddress("");
    setQuotationCustomerVatNumber("");
  }

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
      const matchesCompany =
        company === "all" ||
        normalizeCompanyKey(quotation.companyName) === company;
      const matchesFrom = !fromTime || issueTime >= fromTime;
      const matchesTo = !toTime || issueTime <= toTime;
      const matchesMin = minValue === null || quotation.amount >= minValue;
      const matchesMax = maxValue === null || quotation.amount <= maxValue;

      return (
        matchesQuery &&
        matchesStatus &&
        matchesCompany &&
        matchesFrom &&
        matchesTo &&
        matchesMin &&
        matchesMax
      );
    });

    return result.sort((a, b) => {
      if (sortBy === "oldest") {
        return (
          new Date(a.issueDate || 0).getTime() -
          new Date(b.issueDate || 0).getTime()
        );
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

      return (
        new Date(b.issueDate || 0).getTime() -
        new Date(a.issueDate || 0).getTime()
      );
    });
  }, [
    company,
    quotations,
    query,
    status,
    dateFrom,
    dateTo,
    minAmount,
    maxAmount,
    sortBy,
  ]);

  const stats = useMemo(() => {
    const totalValue = quotations.reduce((sum, item) => sum + item.amount, 0);
    const pending = quotations.filter((item) =>
      ["draft", "sent"].includes(item.status),
    ).length;
    const approved = quotations.filter(
      (item) => item.status === "approved",
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
          const companyName = item.companyName?.trim() || "Unnamed Company";
          const list = map.get(companyName) || [];
          list.push(item);
          map.set(companyName, list);
          return map;
        }, new Map<string, typeof filteredQuotations>())
        .entries(),
    ).map(([companyName, items]) => ({
      company: companyName,
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
    const companyName = quotationCompanyName.trim();
    const store = quotationStore.trim();
    const customerCrNumber = String(form.get("customerCrNumber") || "").trim();
    const customerCity = String(form.get("customerCity") || "").trim();
    const customerCountry = String(form.get("customerCountry") || "").trim();
    const issueDate = String(form.get("issueDate") || "").trim();
    const currency = String(form.get("currency") || "").trim();
    const scopeOfWork =
      lineItems.find((item) => item.description.trim())?.description.trim() ||
      "";
    const validLineItems = lineItems.filter(
      (item) =>
        item.description.trim() &&
        toNumber(item.quantity) > 0 &&
        toNumber(item.unitPrice) > 0,
    );
    const savedLineItems: QuotationLineItem[] = validLineItems.map(
      (item, index) => {
        const quantity = toNumber(item.quantity);
        const unitPrice = toNumber(item.unitPrice);
        const itemVatRate = toNumber(vatRate);
        const amount = quantity * unitPrice;
        const vatAmount = (amount * itemVatRate) / 100;

        return {
          ...item,
          serialNo: index + 1,
          description: item.description.trim(),
          quantity,
          sqm: showSqm ? toNumber(item.sqm) : undefined,
          unitPrice,
          amount,
          vatRate: itemVatRate,
          vatAmount,
        };
      },
    );
    const subTotal = savedLineItems.reduce((sum, item) => sum + item.amount, 0);
    const itemVatRate = toNumber(vatRate);
    const vatAmount = (subTotal * itemVatRate) / 100;

    if (
      !quotationNo ||
      !companyName ||
      !store ||
      !issueDate ||
      !currency ||
      !vatRate
    ) {
      setFormError("Fill every quotation field before saving.");
      return;
    }

    if (!validLineItems.length) {
      setFormError(
        "Add at least one product with description, quantity, and unit price.",
      );
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
      vatRate: itemVatRate,
      vatAmount,
      lineItems: savedLineItems,
      showSqm,
      customerAddress: quotationCustomerAddress.trim(),
      customerVatNumber: quotationCustomerVatNumber.trim(),
      customerCrNumber: clientSource === "new" ? customerCrNumber : undefined,
      customerCity: clientSource === "new" ? customerCity : undefined,
      customerCountry: clientSource === "new" ? customerCountry : undefined,
      status: "draft",
      followUpDate: "",
    };

    try {
      await createQuotation(quotation);
      setShowForm(false);
      setImportDraft(null);
      resetQuotationClientFields();
      setLineItems([emptyLineItem(1)]);
      formElement.reset();
    } catch (caughtError) {
      setFormError(
        caughtError instanceof Error
          ? caughtError.message
          : "Quotation could not be saved.",
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
      const sourceLines: Array<Partial<QuotationLineItem>> = parsed.lineItems
        .length
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
          ];
      const importedLines = sourceLines.map((item, index) =>
        lineItemToDraft(
          {
            ...item,
            vatRate: item.vatRate ?? parsed.vatRate,
            sqm: item.sqm ?? 0,
          },
          index + 1,
          parsed.vatRate,
        ),
      );
      setLineItems(importedLines);
      setShowSqm(false);
      setVatRate(
        numberToInputText(parsed.vatRate) ||
          numberToInputText(data.company.vatRate) ||
          "15",
      );
      setClientSource("new");
      setSelectedClientId("");
      setQuotationCompanyName(parsed.companyName || "");
      setQuotationStore(parsed.store || "");
      setQuotationCustomerAddress("");
      setQuotationCustomerVatNumber("");
      setImportDraft(parsed);
      setShowForm(true);
    } catch (quotationError) {
      setFormError(
        quotationError instanceof Error
          ? quotationError.message
          : "The quotation document could not be imported.",
      );
      setShowForm(true);
    } finally {
      setImporting(false);
    }
  }

  function cancelEdit() {
    setEditingId("");
    setDraft(null);
  }
  async function saveEdit() {
    if (!draft) return;
    const original = data.quotations.find(
      (item) => normalizeQuotation(item).id === draft.id,
    );
    if (!original) return;
    setFormError("");
    try {
      await updateRecord("quotations", createPatchedQuotation(original, draft));
      cancelEdit();
    } catch (caught) {
      setFormError(
        caught instanceof Error
          ? caught.message
          : "Quotation could not be saved.",
      );
    }
  }
  function updateDraft<
    TKey extends keyof ReturnType<typeof normalizeQuotation>,
  >(key: TKey, value: ReturnType<typeof normalizeQuotation>[TKey]) {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  }

  async function handleStatusChange(
    quotation: ReturnType<typeof normalizeQuotation>,
    nextStatus: string,
  ) {
    if (quotation.status === "approved") return;

    setFormError("");
    try {
      await updateQuotationStatus(quotation.id, nextStatus as QuotationStatus);
    } catch (caught) {
      setFormError(
        caught instanceof Error ? caught.message : "Status change failed.",
      );
    }
  }

  function handleDelete(quotation: ReturnType<typeof normalizeQuotation>) {
    window.setTimeout(() => {
      const confirmed = window.confirm(
        `Delete quotation "${quotation.id}" for "${quotation.companyName}"?`,
      );

      if (!confirmed) return;

      if (editingId === quotation.id) cancelEdit();
      void deleteRecord("quotations", quotation.id).catch((caughtError) => {
        setFormError(
          caughtError instanceof Error
            ? caughtError.message
            : "Quotation could not be deleted.",
        );
      });
    }, 0);
  }

  async function handleExport(
    quotation: ReturnType<typeof normalizeQuotation>,
  ) {
    setFormError("");
    try {
      await exportQuotationPdf(quotation.raw, data.company);
    } catch (caughtError) {
      setFormError(
        caughtError instanceof Error
          ? caughtError.message
          : "Quotation export failed.",
      );
    }
  }

  return (
    <>
      <div className="quotation-desktop-only">
        <PageHeader
        title="Quotations"
        description={`Track quotations from submission to approval, then push them straight to invoicing. Cloud: ${syncState}.`}
        actions={
          <>
            {showForm ? (
              <button
                className="button button--primary"
                type="submit"
                form="quotation-create-form"
                disabled={submitting}
              >
                <Check size={14} />
                {submitting ? "Saving..." : "Save Quotation"}
              </button>
            ) : null}
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
              {importing ? "Reading..." : "Import Excel / PDF"}
            </button>
            <button
              className="button button--primary"
              type="button"
              onClick={() => {
                setImportDraft(null);
                resetQuotationClientFields();
                setShowSqm(false);
                setVatRate(numberToInputText(data.company.vatRate) || "15");
                setLineItems([emptyLineItem(1)]);
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
      </div>

      <section className="quotation-mobile-only mobile-quotation-hero">
        <div className="mobile-quotation-hero__copy">
          <span className="mobile-quotation-eyebrow">Sales workspace</span>
          <h1>Quotations</h1>
          <p>{quotations.length} total · Cloud {syncState}</p>
        </div>
        <div className="mobile-quotation-hero__actions">
          {showForm ? (
            <button
              className="button button--primary"
              type="submit"
              form="quotation-create-form"
              disabled={submitting}
            >
              <Check size={18} />
              {submitting ? "Saving..." : "Save"}
            </button>
          ) : null}
          <button
            className="button"
            type="button"
            disabled={importing}
            onClick={() => fileInputRef.current?.click()}
          >
            {importing ? <LoaderCircle className="spin" size={18} /> : <FileUp size={18} />}
            Import
          </button>
          <button
            className="button button--primary"
            type="button"
            onClick={() => {
              setImportDraft(null);
              resetQuotationClientFields();
              setShowSqm(false);
              setVatRate(numberToInputText(data.company.vatRate) || "15");
              setLineItems([emptyLineItem(1)]);
              setFormError("");
              setShowForm((value) => !value);
            }}
          >
            <Plus size={18} />
            New quote
          </button>
        </div>
      </section>

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

      {formError && !showForm ? (
        <div className="form-message form-message--error">{formError}</div>
      ) : null}

      {showForm ? (
        <form
          id="quotation-create-form"
          key={importDraft?.remarks || "manual"}
          className="card form-card"
          onSubmit={handleCreate}
        >
          {importDraft ? (
            <div className="form-message form-message--success">
              Document read successfully. Review the extracted fields before
              saving.
            </div>
          ) : null}
          <div className="form-grid">
            <label className="field">
              <span>Quotation No.</span>
              <input
                name="id"
                defaultValue={importDraft?.id || nextQuotationId}
                required
              />
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
                    setQuotationCompanyName("");
                    setQuotationStore("");
                    setQuotationCustomerAddress("");
                    setQuotationCustomerVatNumber("");
                    return;
                  }

                  if (clientOptions[0]) applySavedClient(clientOptions[0].id);
                }}
              >
                <option value="new">Brand New Client</option>
                <option value="saved" disabled={!clientOptions.length}>
                  Saved Client
                </option>
              </select>
            </label>

            {clientSource === "saved" ? (
              <label className="field">
                <span>Saved Client</span>
                <select
                  value={selectedClientId}
                  onChange={(event) => applySavedClient(event.target.value)}
                  required
                >
                  {clientOptions.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.companyName}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <label className="field">
              <span>Company Name *</span>
              <input
                name="companyName"
                placeholder="Company / client name"
                value={quotationCompanyName}
                onChange={(event) =>
                  setQuotationCompanyName(event.target.value)
                }
                readOnly={clientSource === "saved"}
                required
              />
            </label>

            <label className="field">
              <span>Store / Branch</span>
              <input
                name="store"
                placeholder="Enter the store or branch for this quotation"
                value={quotationStore}
                onChange={(event) => setQuotationStore(event.target.value)}
                required
              />
              {clientSource === "saved" ? (
                <small>
                  The saved client&apos;s default is prefilled. You can replace it
                  with any store or branch for this quotation.
                </small>
              ) : null}
            </label>

            {clientSource === "new" ? (
              <>
                <label className="field">
                  <span>VAT No.</span>
                  <input
                    name="customerVatNumber"
                    value={quotationCustomerVatNumber}
                    onChange={(event) =>
                      setQuotationCustomerVatNumber(event.target.value)
                    }
                  />
                </label>
                <label className="field">
                  <span>CR No.</span>
                  <input name="customerCrNumber" />
                </label>
                <label className="field">
                  <span>City</span>
                  <input name="customerCity" />
                </label>
                <label className="field">
                  <span>Country</span>
                  <input name="customerCountry" defaultValue="Saudi Arabia" />
                </label>
                <label className="field field--full">
                  <span>Address</span>
                  <input
                    name="customerAddress"
                    value={quotationCustomerAddress}
                    onChange={(event) =>
                      setQuotationCustomerAddress(event.target.value)
                    }
                  />
                </label>
              </>
            ) : null}

            <label className="field">
              <span>Date</span>
              <input
                name="issueDate"
                type="date"
                defaultValue={importDraft?.issueDate || today()}
                required
              />
            </label>

            <label className="field">
              <span>Amount (SAR)</span>
              <input
                name="amount"
                type="text"
                inputMode="decimal"
                value={
                  quotationTotals.total > 0
                    ? quotationTotals.total.toFixed(2)
                    : ""
                }
                placeholder="Auto calculated"
                readOnly
              />
            </label>

            <label className="field">
              <span>Currency</span>
              <input
                name="currency"
                defaultValue={
                  importDraft?.currency || data.company.currency || "SAR"
                }
                required
              />
            </label>
            <label className="field">
              <span>VAT Rate %</span>
              <input
                type="text"
                inputMode="decimal"
                value={vatRate}
                placeholder="15"
                required
                onFocus={(event) => event.currentTarget.select()}
                onChange={(event) =>
                  setVatRate(normalizeDecimalInput(event.target.value))
                }
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

          <div className="quotation-items-toolbar">
            <div>
              <strong>Quotation Items</strong>
              <span>
                {lineItems.length} item{lineItems.length === 1 ? "" : "s"}
              </span>
            </div>
            <button
              className="button"
              type="button"
              onClick={() =>
                setLineItems((items) => [
                  ...items,
                  emptyLineItem(items.length + 1),
                ])
              }
            >
              <Plus size={14} />
              Add Item
            </button>
          </div>

          <div className="table-wrap quotation-items-table-wrap">
            <table className="data-table project-line-items">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Description</th>
                  <th>Qty</th>
                  {showSqm ? <th>SQM</th> : null}
                  <th>Unit Price</th>
                  <th>Amount</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {lineItems.map((item, index) => (
                  <tr key={index}>
                    <td>{index + 1}</td>
                    <td>
                      <textarea
                        className="inline-input inline-input--wide"
                        value={item.description}
                        required
                        onChange={(event) =>
                          updateLineItem(index, {
                            description: event.target.value,
                          })
                        }
                      />
                    </td>
                    <td>
                      <input
                        className="inline-input"
                        type="text"
                        inputMode="decimal"
                        value={item.quantity}
                        placeholder="Qty"
                        required
                        onFocus={(event) => event.currentTarget.select()}
                        onChange={(event) =>
                          updateLineItem(index, {
                            quantity: normalizeDecimalInput(event.target.value),
                          })
                        }
                      />
                    </td>
                    {showSqm ? (
                      <td>
                        <input
                          className="inline-input"
                          type="text"
                          inputMode="decimal"
                          value={item.sqm ?? ""}
                          placeholder="SQM"
                          onFocus={(event) => event.currentTarget.select()}
                          onChange={(event) =>
                            updateLineItem(index, {
                              sqm: normalizeDecimalInput(event.target.value),
                            })
                          }
                        />
                      </td>
                    ) : null}
                    <td>
                      <input
                        className="inline-input"
                        type="text"
                        inputMode="decimal"
                        value={item.unitPrice}
                        placeholder="Unit price"
                        required
                        onFocus={(event) => event.currentTarget.select()}
                        onChange={(event) =>
                          updateLineItem(index, {
                            unitPrice: normalizeDecimalInput(
                              event.target.value,
                            ),
                          })
                        }
                      />
                    </td>
                    <td>{moneyOrEmpty(item.amount)}</td>
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
                                serialNo: itemIndex + 1,
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
            <span>
              Subtotal: {moneyOrEmpty(quotationTotals.subTotal) || "—"} · VAT (
              {vatRate || "0"}%):{" "}
              {moneyOrEmpty(quotationTotals.vatAmount) || "—"} · Total:{" "}
              {moneyOrEmpty(quotationTotals.total) || "—"}
            </span>
          </div>

          {formError ? (
            <div className="form-message form-message--error">{formError}</div>
          ) : null}

          <div className="form-actions">
            <button
              type="button"
              className="button"
              onClick={() => {
                setShowForm(false);
                setImportDraft(null);
                resetQuotationClientFields();
                setFormError("");
              }}
            >
              Cancel
            </button>

            <button
              className="button button--primary"
              type="submit"
              disabled={submitting}
            >
              {submitting ? "Saving..." : "Save Quotation"}
            </button>
          </div>
        </form>
      ) : null}

      <section className="projects-overview-grid quotation-desktop-only">
        {stats.map((item) => (
          <article className="project-stat-card card" key={item.label}>
            <div>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </div>
          </article>
        ))}
      </section>

      <section className="card quotation-filter-panel quotation-desktop-only">
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

        <select
          className="select"
          value={company}
          onChange={(event) => setCompany(event.target.value)}
        >
          <option value="all">All Companies</option>
          {companyOptions.map((name) => (
            <option key={name} value={normalizeCompanyKey(name)}>
              {name}
            </option>
          ))}
        </select>

        <label className="compact-filter-field">
          <span>From date</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(event) => setDateFrom(event.target.value)}
          />
        </label>

        <label className="compact-filter-field">
          <span>To date</span>
          <input
            type="date"
            value={dateTo}
            onChange={(event) => setDateTo(event.target.value)}
          />
        </label>

        <label className="compact-filter-field">
          <span>Min price</span>
          <input
            inputMode="decimal"
            value={minAmount}
            onChange={(event) =>
              setMinAmount(normalizeDecimalInput(event.target.value))
            }
            placeholder="Min"
          />
        </label>

        <label className="compact-filter-field">
          <span>Max price</span>
          <input
            inputMode="decimal"
            value={maxAmount}
            onChange={(event) =>
              setMaxAmount(normalizeDecimalInput(event.target.value))
            }
            placeholder="Any"
          />
        </label>

        <select
          className="select"
          value={sortBy}
          onChange={(event) => setSortBy(event.target.value)}
        >
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
            setCompany("all");
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

      <div className="quotation-mobile-only mobile-quotation-workspace">
        <div className="mobile-quotation-stats" aria-label="Quotation summary">
          {stats.map((item) => (
            <article key={item.label}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </article>
          ))}
        </div>

        <section className="mobile-quotation-tools">
          <div className="mobile-quotation-search-row">
            <label className="mobile-quotation-search">
              <Search size={19} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search quotations"
                aria-label="Search quotations"
              />
            </label>
            <button
              className={`mobile-filter-toggle${mobileFiltersOpen ? " is-active" : ""}`}
              type="button"
              aria-expanded={mobileFiltersOpen}
              aria-controls="mobile-quotation-filters"
              onClick={() => setMobileFiltersOpen((open) => !open)}
            >
              <SlidersHorizontal size={19} />
              Filters
            </button>
          </div>

          {mobileFiltersOpen ? (
            <div className="mobile-quotation-filters" id="mobile-quotation-filters">
              <label>
                <span>Status</span>
                <select value={status} onChange={(event) => setStatus(event.target.value)}>
                  <option value="all">All statuses</option>
                  {statusOptions.map((item) => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Company</span>
                <select value={company} onChange={(event) => setCompany(event.target.value)}>
                  <option value="all">All companies</option>
                  {companyOptions.map((name) => (
                    <option key={name} value={normalizeCompanyKey(name)}>{name}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>From</span>
                <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
              </label>
              <label>
                <span>To</span>
                <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
              </label>
              <label>
                <span>Minimum</span>
                <input inputMode="decimal" value={minAmount} onChange={(event) => setMinAmount(normalizeDecimalInput(event.target.value))} placeholder="SAR 0" />
              </label>
              <label>
                <span>Maximum</span>
                <input inputMode="decimal" value={maxAmount} onChange={(event) => setMaxAmount(normalizeDecimalInput(event.target.value))} placeholder="Any" />
              </label>
              <label className="mobile-filter-wide">
                <span>Sort by</span>
                <select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                  <option value="price-high">Highest value</option>
                  <option value="price-low">Lowest value</option>
                  <option value="company">Company A-Z</option>
                </select>
              </label>
              <button
                className="button mobile-filter-wide"
                type="button"
                onClick={() => {
                  setQuery("");
                  setStatus("all");
                  setCompany("all");
                  setDateFrom("");
                  setDateTo("");
                  setMinAmount("");
                  setMaxAmount("");
                  setSortBy("newest");
                }}
              >
                Clear all filters
              </button>
            </div>
          ) : null}
        </section>

        <section className="mobile-quotation-results">
          <header>
            <div>
              <span>Quotation tracker</span>
              <h2>{filteredQuotations.length} quote{filteredQuotations.length === 1 ? "" : "s"}</h2>
            </div>
            <small>{sortBy === "newest" ? "Newest first" : "Filtered view"}</small>
          </header>

          {filteredQuotations.length ? (
            <div className="mobile-quotation-card-list">
              {filteredQuotations.map((quotation) => {
                const hasInvoice = data.invoices.some(
                  (invoice) =>
                    invoice.quotationSerialNumber === quotation.serialNumber ||
                    (!invoice.quotationSerialNumber && invoice.quotationNo === quotation.id),
                );

                return (
                  <article
                    className="mobile-quotation-card"
                    key={quotation.id}
                    onClick={(event) => {
                      if ((event.target as HTMLElement).closest("a, button, select")) return;
                      router.push(`${routes.recordDetail}?type=quotation&id=${encodeURIComponent(quotation.id)}`);
                    }}
                  >
                    <header>
                      <div>
                        <span>{quotation.id}</span>
                        <strong>{quotation.companyName || "Unnamed customer"}</strong>
                        <small>{quotation.serialNumber}</small>
                      </div>
                      <label className="mobile-quotation-status">
                        <span>Status</span>
                        <select
                          value={quotation.status}
                          disabled={quotation.status === "approved"}
                          aria-label={quotation.status === "approved"
                            ? `Approved status for quotation ${quotation.id} is read-only`
                            : `Change status for quotation ${quotation.id}`}
                          onChange={(event) => void handleStatusChange(quotation, event.target.value)}
                        >
                          {statusOptions.map((item) => (
                            <option key={item.value} value={item.value}>{item.label}</option>
                          ))}
                        </select>
                      </label>
                    </header>

                    <div className="mobile-quotation-card__value">
                      <span>Total value</span>
                      <strong>{money(quotation.amount)}</strong>
                    </div>

                    <dl>
                      <div><dt>Date</dt><dd>{quotation.issueDate || "—"}</dd></div>
                      <div><dt>Branch</dt><dd>{quotation.store || "—"}</dd></div>
                      <div><dt>Invoice</dt><dd>{hasInvoice ? "Created" : "Not created"}</dd></div>
                    </dl>

                    <footer>
                      <button type="button" onClick={() => void handleExport(quotation)}>
                        <Printer size={18} /><span>Print</span>
                      </button>
                      <Link href={`${routes.quotationInvoice}?serial=${encodeURIComponent(quotation.serialNumber)}`}>
                        <FileUp size={18} /><span>Invoice</span>
                      </Link>
                      <Link href={`${routes.editQuotation}?id=${encodeURIComponent(quotation.id)}`}>
                        <Edit3 size={18} /><span>Edit</span>
                      </Link>
                      <button className="is-danger" type="button" onClick={() => void handleDelete(quotation)}>
                        <Trash2 size={18} /><span>Delete</span>
                      </button>
                    </footer>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="mobile-quotation-empty">
              <strong>No quotations found</strong>
              <span>Adjust your filters or create a new quotation.</span>
            </div>
          )}
        </section>
      </div>

      <section className="card quotation-tracker-v2 quotation-desktop-only">
        <header className="quotation-tracker-v2__header">
          <div>
            <h2>Quotation Tracker</h2>
            <p>
              Showing {filteredQuotations.length} of {quotations.length} quotations.
            </p>
          </div>
        </header>

        {formError ? (
          <div className="form-message form-message--error">{formError}</div>
        ) : null}

        {filteredQuotations.length ? (
          <div className="quotation-record-list" role="list">
            <div className="quotation-record-list__head" aria-hidden="true">
              <span>Quotation</span>
              <span>Date</span>
              <span>Customer</span>
              <span>Store / Branch</span>
              <span>Amount</span>
              <span>Status</span>
              <span>Actions</span>
            </div>

            {filteredQuotations.map((quotation) => {
              const hasInvoice = data.invoices.some(
                (invoice) =>
                  invoice.quotationSerialNumber === quotation.serialNumber ||
                  (!invoice.quotationSerialNumber &&
                    invoice.quotationNo === quotation.id),
              );

              return (
                <article
                  className="quotation-record-row"
                  key={quotation.id}
                  role="listitem"
                  tabIndex={0}
                  onClick={(event) => {
                    if (
                      (event.target as HTMLElement).closest(
                        "a, button, input, select, textarea",
                      )
                    ) {
                      return;
                    }
                    router.push(
                      `${routes.recordDetail}?type=quotation&id=${encodeURIComponent(quotation.id)}`,
                    );
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    router.push(
                      `${routes.recordDetail}?type=quotation&id=${encodeURIComponent(quotation.id)}`,
                    );
                  }}
                >
                  <div className="quotation-record-field quotation-record-identity">
                    <span>Quotation</span>
                    <strong>{quotation.id}</strong>
                    <small>{quotation.serialNumber}</small>
                  </div>

                  <div className="quotation-record-field">
                    <span>Date</span>
                    <strong>{quotation.issueDate || "—"}</strong>
                  </div>

                  <div className="quotation-record-field">
                    <span>Customer</span>
                    <strong>{quotation.companyName || "Unnamed customer"}</strong>
                  </div>

                  <div className="quotation-record-field">
                    <span>Store / Branch</span>
                    <strong>{quotation.store || "—"}</strong>
                  </div>

                  <div className="quotation-record-field quotation-record-amount">
                    <span>Amount</span>
                    <strong>{money(quotation.amount)}</strong>
                  </div>

                  <div className="quotation-record-field quotation-record-status">
                    <span>Status</span>
                    <select
                      className="inline-select"
                      disabled={quotation.status === "approved"}
                      aria-label={quotation.status === "approved"
                        ? `Approved status for quotation ${quotation.id} is read-only`
                        : `Change status for quotation ${quotation.id}`}
                      value={quotation.status}
                      onChange={(event) =>
                        void handleStatusChange(quotation, event.target.value)
                      }
                    >
                      {statusOptions.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="quotation-record-actions">
                    <button
                      className="icon-button"
                      type="button"
                      onClick={() => void handleExport(quotation)}
                      title="Print quotation"
                      aria-label={`Print quotation ${quotation.id}`}
                    >
                      <Printer size={17} />
                    </button>
                    <Link
                      className="icon-button"
                      href={`${routes.quotationInvoice}?serial=${encodeURIComponent(quotation.serialNumber)}`}
                      title={hasInvoice ? "View or edit invoice" : "Create invoice"}
                      aria-label={hasInvoice ? `Open invoice for ${quotation.id}` : `Create invoice for ${quotation.id}`}
                    >
                      <FileUp size={17} />
                    </Link>
                    <Link
                      className="icon-button"
                      href={`${routes.editQuotation}?id=${encodeURIComponent(quotation.id)}`}
                      title="Edit quotation"
                      aria-label={`Edit quotation ${quotation.id}`}
                    >
                      <Edit3 size={17} />
                    </Link>
                    <button
                      className="icon-button icon-button--danger"
                      type="button"
                      onClick={() => void handleDelete(quotation)}
                      title="Delete quotation"
                      aria-label={`Delete quotation ${quotation.id}`}
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="quotation-record-empty">
            <strong>No quotations match the current filters.</strong>
            <span>Clear the filters or create a new quotation.</span>
          </div>
        )}
      </section>

      <section className="quotation-legacy-tracker" aria-hidden="true">
        <div className="projects-table-header">
          <div>
            <h2>Quotation Tracker</h2>
            <p>
              Showing {filteredQuotations.length} of {quotations.length}{" "}
              quotations. Tap a row to open details and actions.
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
                    <tr
                      className="plain-data-row"
                      key={quotation.id}
                      onClick={() => {
                        if (!isEditing)
                          router.push(
                            `${routes.recordDetail}?type=quotation&id=${encodeURIComponent(quotation.id)}`,
                          );
                      }}
                    >
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
                            onChange={(event) =>
                              updateDraft("store", event.target.value)
                            }
                          />
                        ) : (
                          quotation.store || "—"
                        )}
                      </td>

                      <td className="money-cell">
                        {isEditing ? (
                          /* Quotation totals are derived from the item rows. */
                          <input
                            className="inline-input"
                            type="text"
                            value={numberToInputText(draft.amount)}
                            readOnly
                            title="Edit quotation items to change the total"
                          />
                        ) : (
                          money(quotation.amount)
                        )}
                      </td>

                      <td>
                        <select
                          className="inline-select status-inline-select"
                          disabled={quotation.status === "approved"}
                          aria-label={quotation.status === "approved"
                            ? `Approved status for quotation ${quotation.id} is read-only`
                            : `Change status for quotation ${quotation.id}`}
                          value={isEditing ? draft.status : quotation.status}
                          onClick={(event) => event.stopPropagation()}
                          onChange={(event) => {
                            if (isEditing) {
                              updateDraft(
                                "status",
                                event.target.value as QuotationStatus,
                              );
                              return;
                            }

                            void handleStatusChange(
                              quotation,
                              event.target.value,
                            );
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
                        <div
                          className="row-actions"
                          onClick={(event) => event.stopPropagation()}
                        >
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
                                title={
                                  data.invoices.some(
                                    (invoice) =>
                                      invoice.quotationSerialNumber ===
                                        quotation.serialNumber ||
                                      (!invoice.quotationSerialNumber &&
                                        invoice.quotationNo === quotation.id),
                                  )
                                    ? "View or edit invoice"
                                    : "Add invoice"
                                }
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
                  <div>
                    <span>Customer / Company History</span>
                    <h3>{group.company}</h3>
                    <small>
                      {group.items.length} quotation(s) · {group.approved}{" "}
                      approved · Total {money(group.total)}
                    </small>
                  </div>
                  <Link
                    className="button"
                    href={`${routes.history}?company=${encodeURIComponent(normalizeCompanyKey(group.company))}`}
                  >
                    History
                  </Link>
                </header>

                <div className="mobile-company-card__records">
                  {group.items.map((quotation) => {
                    const hasInvoice = data.invoices.some(
                      (invoice) =>
                        invoice.quotationSerialNumber ===
                          quotation.serialNumber ||
                        (!invoice.quotationSerialNumber &&
                          invoice.quotationNo === quotation.id),
                    );

                    return (
                      <article
                        className="mobile-record-card"
                        key={quotation.id}
                        role="link"
                        tabIndex={0}
                        onClick={(event) => {
                          // Keep nested controls interactive while the rest of the card opens full details.
                          if (
                            (event.target as HTMLElement).closest(
                              "a, button, input, select, textarea",
                            )
                          ) {
                            return;
                          }
                          router.push(
                            `${routes.recordDetail}?type=quotation&id=${encodeURIComponent(quotation.id)}`,
                          );
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            router.push(
                              `${routes.recordDetail}?type=quotation&id=${encodeURIComponent(quotation.id)}`,
                            );
                          }
                        }}
                      >
                        <header>
                          <div>
                            <span>Quotation / Job</span>
                            <strong>{quotation.serialNumber}</strong>
                            <small>
                              {quotation.id} ·{" "}
                              {quotation.issueDate || "No date"} ·{" "}
                              {quotation.store || "No branch"}
                            </small>
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
                            disabled={quotation.status === "approved"}
                            aria-label={quotation.status === "approved"
                              ? `Approved status for quotation ${quotation.id} is read-only`
                              : `Change status for quotation ${quotation.id}`}
                            value={quotation.status}
                            onChange={(event) =>
                              void handleStatusChange(
                                quotation,
                                event.target.value,
                              )
                            }
                          >
                            {statusOptions.map((item) => (
                              <option key={item.value} value={item.value}>
                                {item.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        <footer>
                          <Link
                            className="button button--primary"
                            href={`${routes.quotationInvoice}?serial=${encodeURIComponent(quotation.serialNumber)}`}
                          >
                            <FileUp size={14} />
                            {hasInvoice
                              ? "View / Edit Invoice"
                              : "Create / Upload Invoice"}
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
    </>
  );
}
