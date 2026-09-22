const test = require("node:test");
const assert = require("node:assert/strict");

const {
  assertUniqueRecordId,
  prepareRecordForSave,
} = require("../.test-build/application/services/business-records.js");
const {
  matchesRecordQuery,
} = require("../.test-build/application/services/record-query.js");
const {
  createNextProjectId,
} = require("../.test-build/lib/record-ids.js");

const company = {
  businessName: "3 Star",
  legalCompanyName: "3 Star Legal",
  vatNumber: "VAT",
  crNumber: "CR",
  city: "Khamis Mushait",
  country: "Saudi Arabia",
  phone: "0500000000",
  email: "admin@example.com",
  currency: "SAR",
  vatRate: 15,
};

const emptyData = () => ({
  company,
  clients: [],
  projects: [],
  quotations: [],
  invoices: [],
  complaints: [],
  trash: [],
});

// Financial totals are derived at the business boundary, not trusted from UI.
test("quotation totals are recalculated from line items", () => {
  const quotation = prepareRecordForSave("quotations", {
    id: " q-10 ",
    issueDate: "2026-07-14",
    validityDate: "2026-08-14",
    companyName: "Client A",
    store: "Branch",
    scopeOfWork: "Door repair",
    amount: 1,
    status: "draft",
    currency: "SAR",
    vatRate: 15,
    lineItems: [
      {
        serialNo: 9,
        description: "Motor",
        quantity: 2,
        unitPrice: 100,
        amount: 1,
        vatRate: 15,
        vatAmount: 1,
      },
    ],
  });

  assert.equal(quotation.id, "Q-10");
  assert.equal(quotation.subTotal, 200);
  assert.equal(quotation.vatAmount, 30);
  assert.equal(quotation.amount, 230);
  assert.match(quotation.serialNumber, /^QSN-/);
});

test("pending PO is accepted as a quotation workflow status", () => {
  const quotation = prepareRecordForSave("quotations", {
    id: "Q-PO-1",
    issueDate: "2026-07-14",
    validityDate: "",
    companyName: "Client A",
    scopeOfWork: "Awaiting customer PO",
    amount: 115,
    status: "pending-po",
    currency: "SAR",
    subTotal: 100,
    vatRate: 15,
    vatAmount: 15,
  });

  assert.equal(quotation.status, "pending-po");
});

test("additional fields persist on existing quotations and invoices", () => {
  const customFields = [
    { id: " field-1 ", label: " Site Contact ", value: " Ahmed " },
    { id: "empty", label: "", value: "Ignored" },
  ];
  const quotation = prepareRecordForSave("quotations", {
    id: "Q-EXISTING",
    issueDate: "2026-07-14",
    validityDate: "",
    companyName: "Client A",
    scopeOfWork: "Door repair",
    amount: 115,
    status: "approved",
    currency: "SAR",
    subTotal: 100,
    vatRate: 15,
    vatAmount: 15,
    customFields,
  });
  const invoice = prepareRecordForSave("invoices", {
    id: "INV-EXISTING",
    companyName: "Client A",
    project: "Door repair",
    invoiceDate: "2026-07-14",
    amount: 115,
    received: 0,
    status: "pending",
    currency: "SAR",
    subTotal: 100,
    vatAmount: 15,
    customFields,
  });

  assert.deepEqual(quotation.customFields, [
    { id: "field-1", label: "Site Contact", value: "Ahmed" },
  ]);
  assert.deepEqual(invoice.customFields, [
    { id: "field-1", label: "Site Contact", value: "Ahmed" },
  ]);
});

test("complaints are normalized and validate workflow status", () => {
  const complaint = prepareRecordForSave("complaints", {
    id: " 3584 ",
    business: " PE ",
    stationName: " 2104 (Sharurah II) ",
    area: " South ",
    city: " Sharurah ",
    description: " signage damage need to fix ",
    complaintType: " Signage ",
    loggedBy: " jose@example.com ",
    contactPerson: " 050 779 4722 ",
    status: "pending",
    createdAt: "2026-09-22T12:00:00.000Z",
    updatedAt: "2026-09-22T12:00:00.000Z",
  });

  assert.equal(complaint.id, "3584");
  assert.equal(complaint.city, "Sharurah");
  assert.throws(
    () => prepareRecordForSave("complaints", { ...complaint, status: "closed" }),
    /status is invalid/i,
  );
});

// Payment state follows money received and rejects impossible overpayments.
test("invoice payment status is derived and overpayment is rejected", () => {
  const base = {
    id: "inv-90",
    companyName: "Client A",
    project: "Door repair",
    invoiceDate: "2026-07-14",
    amount: 115,
    received: 40,
    status: "pending",
    currency: "SAR",
    subTotal: 100,
    vatAmount: 15,
  };

  assert.equal(prepareRecordForSave("invoices", base).status, "partial");
  assert.equal(
    prepareRecordForSave("invoices", { ...base, received: 115 }).status,
    "paid",
  );
  assert.throws(
    () => prepareRecordForSave("invoices", { ...base, received: 116 }),
    /cannot exceed the invoice total/i,
  );
});

test("profit allocations must balance employee, company, and expense shares", () => {
  const base = {
    id: "INV-91",
    companyName: "Client A",
    project: "Door repair",
    invoiceDate: "2026-07-14",
    amount: 115,
    received: 115,
    profitAmount: 30,
    status: "paid",
    currency: "SAR",
    subTotal: 100,
    vatAmount: 15,
  };
  const allocation = {
    employeePayments: [{ id: "employee-1", employeeName: "Employee A", amount: 10 }],
    companyProfit: 15,
    companyExpenses: 5,
    updatedAt: "2026-07-14T12:00:00.000Z",
  };

  assert.deepEqual(
    prepareRecordForSave("invoices", { ...base, profitAllocation: allocation }).profitAllocation,
    allocation,
  );
  assert.throws(
    () => prepareRecordForSave("invoices", {
      ...base,
      profitAllocation: { ...allocation, companyProfit: 14 },
    }),
    /must equal the invoice profit amount/i,
  );
});

// Normalized financial IDs cannot be duplicated by casing or whitespace.
test("duplicate invoice IDs are case-insensitive", () => {
  const data = emptyData();
  data.invoices.push({
    id: "INV-000090",
    companyName: "Client A",
    project: "",
    invoiceDate: "2026-07-14",
    amount: 100,
    received: 0,
    status: "pending",
    currency: "SAR",
  });

  assert.throws(
    () => assertUniqueRecordId(data, "invoices", " inv-000090 "),
    /already used/i,
  );
});

// IDs advance from the highest suffix and do not depend on current count.
test("project IDs do not collide after deletion gaps", () => {
  assert.equal(
    createNextProjectId(["PROJ-00001", "PROJ-00003"]),
    "PROJ-00004",
  );
});

// Date filters are inclusive at both ends and company matching is normalized.
test("shared record query applies search, company, and inclusive dates", () => {
  const filters = {
    query: "inv-9",
    company: " client a ",
    dateFrom: "2026-07-01",
    dateTo: "2026-07-31",
  };

  assert.equal(
    matchesRecordQuery(
      ["INV-90", "Door repair"],
      "Client   A",
      "2026-07-31",
      filters,
    ),
    true,
  );
  assert.equal(
    matchesRecordQuery(
      ["INV-90", "Door repair"],
      "Client A",
      "2026-08-01",
      filters,
    ),
    false,
  );
});
