import type {
  BusinessDataSet,
  Client,
  Invoice,
  Project,
  Quotation,
} from "../../domain/entities/business";
import {
  ensureQuotationSerial,
  normalizeInvoiceId,
  normalizeQuotationId,
} from "../../lib/record-ids";

export type CollectionKey =
  | "clients"
  | "projects"
  | "quotations"
  | "invoices";

export type EntityMap = {
  clients: Client;
  projects: Project;
  quotations: Quotation;
  invoices: Invoice;
};

const projectStatuses = new Set<Project["status"]>([
  "upcoming",
  "in-progress",
  "on-hold",
  "completed",
  "cancelled",
]);
const quotationStatuses = new Set<Quotation["status"]>([
  "draft",
  "sent",
  "approved",
  "rejected",
  "expired",
]);
const invoiceStatuses = new Set<Invoice["status"]>([
  "pending",
  "partial",
  "po",
  "paid",
  "overdue",
  "cancelled",
]);
const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;
const moneyPrecision = 100;

const roundMoney = (value: number) =>
  Math.round((value + Number.EPSILON) * moneyPrecision) / moneyPrecision;

function required(value: string | undefined, label: string) {
  const normalized = value?.trim() || "";
  if (!normalized) throw new Error(`${label} is required.`);
  return normalized;
}

function finiteNumber(value: number, label: string, minimum = 0) {
  if (!Number.isFinite(value) || value < minimum) {
    throw new Error(`${label} must be a number of at least ${minimum}.`);
  }
  return value;
}

function percentage(value: number, label: string) {
  finiteNumber(value, label);
  if (value > 100) throw new Error(`${label} cannot exceed 100%.`);
  return value;
}

function validDate(value: string | undefined, label: string, requiredDate = false) {
  const normalized = value?.trim() || "";
  if (!normalized && !requiredDate) return "";
  if (!isoDatePattern.test(normalized)) throw new Error(`${label} is invalid.`);

  const parsed = new Date(`${normalized}T00:00:00Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== normalized) {
    throw new Error(`${label} is invalid.`);
  }
  return normalized;
}

function assertDateOrder(
  start: string | undefined,
  end: string | undefined,
  message: string,
) {
  if (start && end && end < start) throw new Error(message);
}

function normalizeClient(client: Client): Client {
  const email = client.email.trim();
  if (email && !/^\S+@\S+\.\S+$/.test(email)) {
    throw new Error("Client email address is invalid.");
  }

  return {
    ...client,
    id: required(client.id, "Client ID"),
    companyName: required(client.companyName, "Company name"),
    brandName: client.brandName.trim(),
    contactPerson: client.contactPerson.trim(),
    mobile: client.mobile.trim(),
    email,
    city: client.city.trim(),
    country: client.country?.trim(),
    address: client.address?.trim(),
    vatNumber: client.vatNumber?.trim(),
    crNumber: client.crNumber?.trim(),
    storeName: client.storeName?.trim(),
    storeLocation: client.storeLocation?.trim(),
    remarks: client.remarks?.trim(),
  };
}

function normalizeProject(project: Project): Project {
  const startDate = validDate(project.startDate, "Project start date");
  const expectedCompletion = validDate(
    project.expectedCompletion,
    "Expected completion date",
  );
  const actualCompletion = validDate(
    project.actualCompletion,
    "Actual completion date",
  );
  assertDateOrder(
    startDate,
    expectedCompletion,
    "Expected completion date cannot be before the project start date.",
  );
  if (project.status === "completed" && !actualCompletion) {
    throw new Error("Actual completion date is required for completed projects.");
  }
  if (!projectStatuses.has(project.status)) throw new Error("Project status is invalid.");

  return {
    ...project,
    id: required(project.id, "Project ID"),
    company: required(project.company, "Project company"),
    store: project.store.trim(),
    location: project.location?.trim(),
    workDescription: required(project.workDescription, "Work description"),
    category: required(project.category, "Project category"),
    value: roundMoney(finiteNumber(project.value, "Project value")),
    completion: percentage(project.completion, "Project completion"),
    startDate,
    expectedCompletion,
    actualCompletion,
  };
}

function normalizeQuotation(quotation: Quotation): Quotation {
  const id = normalizeQuotationId(required(quotation.id, "Quotation number"));
  const issueDate = validDate(quotation.issueDate, "Quotation date", true);
  const validityDate = validDate(quotation.validityDate, "Validity date");
  const followUpDate = validDate(quotation.followUpDate, "Follow-up date");
  assertDateOrder(
    issueDate,
    validityDate,
    "Validity date cannot be before the quotation date.",
  );
  if (!quotationStatuses.has(quotation.status)) {
    throw new Error("Quotation status is invalid.");
  }

  const vatRate = percentage(
    quotation.vatRate ?? 0,
    "Quotation VAT rate",
  );
  const lineItems = quotation.lineItems?.map((item, index) => {
    const description = required(
      item.description,
      `Quotation item ${index + 1} description`,
    );
    const quantity = finiteNumber(
      item.quantity,
      `Quotation item ${index + 1} quantity`,
      Number.EPSILON,
    );
    const unitPrice = finiteNumber(
      item.unitPrice,
      `Quotation item ${index + 1} unit price`,
    );
    const itemVatRate = percentage(
      item.vatRate ?? vatRate,
      `Quotation item ${index + 1} VAT rate`,
    );
    const amount = roundMoney(quantity * unitPrice);

    return {
      ...item,
      serialNo: index + 1,
      description,
      quantity,
      sqm:
        item.sqm === undefined
          ? undefined
          : finiteNumber(item.sqm, `Quotation item ${index + 1} SQM`),
      unitPrice,
      amount,
      vatRate: itemVatRate,
      vatAmount: roundMoney((amount * itemVatRate) / 100),
    };
  });

  if (lineItems && !lineItems.length) {
    throw new Error("Add at least one quotation item.");
  }

  const subTotal = lineItems
    ? roundMoney(lineItems.reduce((sum, item) => sum + item.amount, 0))
    : roundMoney(finiteNumber(quotation.subTotal ?? quotation.amount, "Quotation subtotal"));
  const vatAmount = lineItems
    ? roundMoney(lineItems.reduce((sum, item) => sum + item.vatAmount, 0))
    : roundMoney(finiteNumber(quotation.vatAmount ?? 0, "Quotation VAT amount"));

  return {
    ...quotation,
    id,
    serialNumber: ensureQuotationSerial(id, quotation.serialNumber),
    issueDate,
    validityDate,
    followUpDate,
    companyName: required(quotation.companyName, "Quotation company"),
    store: quotation.store?.trim(),
    scopeOfWork: required(quotation.scopeOfWork, "Quotation scope of work"),
    currency: required(quotation.currency, "Quotation currency"),
    status: quotation.status,
    lineItems,
    vatRate,
    subTotal,
    vatAmount,
    amount: roundMoney(subTotal + vatAmount),
  };
}

function normalizeInvoice(invoice: Invoice): Invoice {
  const id = normalizeInvoiceId(required(invoice.id, "Invoice number"));
  const invoiceDate = validDate(invoice.invoiceDate, "Invoice date", true);
  const dueDate = validDate(invoice.dueDate, "Invoice due date");
  const paymentDate = validDate(invoice.paymentDate, "Payment date");
  const followUpDate = validDate(invoice.followUpDate, "Follow-up date");
  assertDateOrder(
    invoiceDate,
    dueDate,
    "Invoice due date cannot be before the invoice date.",
  );
  if (!invoiceStatuses.has(invoice.status)) throw new Error("Invoice status is invalid.");

  const lineItems = invoice.lineItems?.map((item, index) => {
    const description = required(
      item.description,
      `Invoice item ${index + 1} description`,
    );
    const quantity = finiteNumber(
      item.quantity,
      `Invoice item ${index + 1} quantity`,
      Number.EPSILON,
    );
    const unitPrice = finiteNumber(
      item.unitPrice,
      `Invoice item ${index + 1} unit price`,
    );
    const vatRate = percentage(
      item.vatRate,
      `Invoice item ${index + 1} VAT rate`,
    );
    const amount = roundMoney(quantity * unitPrice);

    return {
      ...item,
      id: item.id.trim() || String(index + 1),
      description,
      quantity,
      unitCode: item.unitCode.trim(),
      unitPrice,
      amount,
      vatRate,
      vatAmount: roundMoney((amount * vatRate) / 100),
    };
  });
  if (lineItems && !lineItems.length) throw new Error("Add at least one invoice item.");

  const vatAmount = lineItems
    ? roundMoney(
        lineItems.reduce((sum, item) => sum + (item.vatAmount ?? 0), 0),
      )
    : roundMoney(finiteNumber(invoice.vatAmount ?? 0, "Invoice VAT amount"));
  const subTotal = lineItems
    ? roundMoney(lineItems.reduce((sum, item) => sum + item.amount, 0))
    : roundMoney(
        finiteNumber(
          invoice.subTotal ?? Math.max(0, invoice.amount - vatAmount),
          "Invoice subtotal",
        ),
      );
  const discountAmount = roundMoney(
    finiteNumber(invoice.discountAmount ?? 0, "Invoice discount"),
  );
  const amount = roundMoney(subTotal + vatAmount - discountAmount);
  if (amount < 0) throw new Error("Invoice discount cannot exceed its subtotal and VAT.");

  const received = roundMoney(finiteNumber(invoice.received, "Amount received"));
  if (received > amount) throw new Error("Amount received cannot exceed the invoice total.");

  // Payment status is derived unless the record is intentionally waiting for
  // a PO or cancelled, preventing paid invoices with an outstanding balance.
  let status = invoice.status;
  if (status !== "po" && status !== "cancelled") {
    status =
      amount > 0 && received >= amount
        ? "paid"
        : received > 0
          ? "partial"
          : dueDate && dueDate < new Date().toISOString().slice(0, 10)
            ? "overdue"
            : "pending";
  }

  return {
    ...invoice,
    id,
    companyName: required(invoice.companyName, "Invoice company"),
    project: invoice.project.trim(),
    invoiceDate,
    dueDate,
    paymentDate,
    followUpDate,
    currency: required(invoice.currency, "Invoice currency"),
    lineItems,
    subTotal,
    vatAmount,
    discountAmount,
    amount,
    received,
    status,
  };
}

// All create and update paths pass through one canonical validation boundary.
export function prepareRecordForSave<TKey extends CollectionKey>(
  key: TKey,
  record: EntityMap[TKey],
): EntityMap[TKey] {
  if (key === "clients") return normalizeClient(record as Client) as EntityMap[TKey];
  if (key === "projects") return normalizeProject(record as Project) as EntityMap[TKey];
  if (key === "quotations") {
    return normalizeQuotation(record as Quotation) as EntityMap[TKey];
  }
  return normalizeInvoice(record as Invoice) as EntityMap[TKey];
}

export function recordIdsEqual(
  key: CollectionKey,
  left: string,
  right: string,
) {
  if (key === "quotations") {
    return normalizeQuotationId(left) === normalizeQuotationId(right);
  }
  if (key === "invoices") {
    return normalizeInvoiceId(left) === normalizeInvoiceId(right);
  }
  return left.trim() === right.trim();
}

export function assertUniqueRecordId<TKey extends CollectionKey>(
  data: BusinessDataSet,
  key: TKey,
  id: string,
  ignoredId?: string,
) {
  const duplicate = data[key].some(
    (item) =>
      recordIdsEqual(key, item.id, id) &&
      (!ignoredId || !recordIdsEqual(key, item.id, ignoredId)),
  );
  if (duplicate) {
    const label =
      key === "quotations"
        ? "Quotation number"
        : key === "invoices"
          ? "Invoice number"
          : key === "projects"
            ? "Project ID"
            : "Client ID";
    throw new Error(`${label} ${id} is already used.`);
  }
}
