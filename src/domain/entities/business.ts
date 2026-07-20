export type RecordStatus = "active" | "pending" | "inactive";
export type ProjectStatus = "upcoming" | "in-progress" | "on-hold" | "completed" | "cancelled";
export type ProjectBillingStage =
  | "ongoing"
  | "pending-po"
  | "po-done"
  | "payment-pending"
  | "completed";
export type QuotationStatus = "draft" | "sent" | "approved" | "rejected" | "expired";
export type PaymentStatus = "pending" | "partial" | "po" | "paid" | "overdue" | "cancelled";

export interface Client {
  id: string;
  companyName: string;
  brandName: string;
  contactPerson: string;
  mobile: string;
  email: string;
  address?: string;
  city: string;
  country?: string;
  vatNumber?: string;
  crNumber?: string;
  storeName?: string;
  storeLocation?: string;
  contractStatus: RecordStatus;
  remarks?: string;
}

export interface Project {
  id: string;
  company: string;
  store: string;
  location?: string;
  workDescription: string;
  category: string;
  quotationNo?: string;
  woNo?: string;
  value: number;
  startDate: string;
  expectedCompletion: string;
  actualCompletion?: string;
  completion: number;
  workCompleted?: boolean;
  billingStage?: ProjectBillingStage;
  status: ProjectStatus;
  priority: "low" | "medium" | "high" | "urgent";
  remarks?: string;
  quotationDate?: string;
  validityDate?: string;
  crNumber?: string;
  vatNumber?: string;
  supplierBusinessName?: string;
  supplierLegalName?: string;
  supplierCity?: string;
  supplierCountry?: string;
  supplierPhone?: string;
  supplierEmail?: string;
  supplierWebsite?: string;
  currency?: string;
  lineItems?: Array<{
    serialNo: number;
    description: string;
    quantity: number;
    unitPrice: number;
    amount: number;
    vatRate?: number;
    vatAmount?: number;
  }>;
  subTotal?: number;
  vatRate?: number;
  vatAmount?: number;
  totalAmount?: number;
  termsAndConditions?: string;
}

export interface Quotation {
  id: string;
  serialNumber?: string;
  issueDate: string;
  validityDate: string;
  companyName: string;
  store?: string;
  scopeOfWork: string;
  amount: number;
  status: QuotationStatus;
  followUpDate?: string;
  remarks?: string;
  linkedProjectId?: string;
  customerVatNumber?: string;
  customerAddress?: string;
  customerCrNumber?: string;
  customerCity?: string;
  customerCountry?: string;
  currency?: string;
  subTotal?: number;
  vatRate?: number;
  vatAmount?: number;
  termsAndConditions?: string;
  storeLocation?: string;
  showSqm?: boolean;
  supplierBusinessName?: string;
  supplierLegalName?: string;
  supplierCrNumber?: string;
  supplierVatNumber?: string;
  supplierCity?: string;
  supplierCountry?: string;
  supplierPhone?: string;
  supplierEmail?: string;
  supplierWebsite?: string;
  lineItems?: Array<{
    serialNo: number;
    description: string;
    quantity: number;
    sqm?: number;
    unitPrice: number;
    amount: number;
    vatRate: number;
    vatAmount: number;
  }>;
}

export interface Invoice {
  id: string;
  linkedProjectId?: string;
  companyName: string;
  project: string;
  quotationNo?: string;
  purchaseOrderNumber?: string;
  invoiceDate: string;
  dueDate?: string;
  paymentTerms?: string;
  amount: number;
  received: number;
  profitAmount?: number;
  profitRecordedAt?: string;
  profitAllocation?: {
    employeePayments: Array<{
      id: string;
      employeeName: string;
      amount: number;
    }>;
    companyProfit: number;
    companyExpenses: number;
    updatedAt: string;
  };
  paymentDate?: string;
  paymentMode?: string;
  status: PaymentStatus;
  followUpDate?: string;
  remarks?: string;
  uuid?: string;
  customerAddress?: string;
  customerVatNumber?: string;
  supplierName?: string;
  supplierLegalName?: string;
  supplierAddress?: string;
  supplierCrNumber?: string;
  supplierVatNumber?: string;
  supplierPhone?: string;
  supplierEmail?: string;
  notes?: string;
  currency?: string;
  subTotal?: number;
  vatRate?: number;
  vatAmount?: number;
  discountAmount?: number;
  lineItems?: Array<{
    id: string;
    description: string;
    quantity: number;
    unitCode: string;
    unitPrice: number;
    amount: number;
    vatRate: number;
    vatAmount?: number;
  }>;
  quotationSerialNumber?: string;
  attachmentName?: string;
  attachmentType?: string;
  attachmentSize?: number;
  attachmentPath?: string;
  attachmentUrl?: string;
  localAttachmentKey?: string;
}

export interface Workspace {
  id: string;
  ownerId: string;
  businessName: string;
  legalCompanyName: string;
  vatNumber?: string;
  crNumber?: string;
  address: string;
  city: string;
  country: string;
  phone: string;
  email: string;
  currency: string;
  vatRate: number;
}

export interface CompanyProfile {
  businessName: string;
  legalCompanyName: string;
  vatNumber: string;
  crNumber: string;
  city: string;
  country: string;
  phone: string;
  email?: string;
  currency: string;
  vatRate: number;
}

export interface BusinessDataSet {
  company: CompanyProfile;
  clients: Client[];
  projects: Project[];
  quotations: Quotation[];
  invoices: Invoice[];
  trash?: TrashItem[];
}

export interface TrashItem {
  id: string;
  collection: "clients" | "projects" | "quotations" | "invoices";
  recordId: string;
  label: string;
  companyName: string;
  deletedAt: string;
  deleteAfter: string;
  record: Client | Project | Quotation | Invoice;
}
