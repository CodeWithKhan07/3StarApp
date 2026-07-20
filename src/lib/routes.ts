export const routes = {
  splash: "/",
  login: "/login",

  dashboard: "/dashboard",

  clients: "/clients",
  newClient: "/clients/new",
  editClient: "/clients/edit",

  projects: "/projects",
  newProject: "/projects/new",
  editProject: "/projects/edit",

  quotations: "/quotations",
  newQuotation: "/quotations/new",
  editQuotation: "/quotations/edit",
  quotationInvoice: "/quotations/invoice",

  ongoingProjects: "/ongoing-projects",
  completedProjects: "/completed-projects",
  recordDetail: "/records/detail",

  invoices: "/invoices",
  newInvoice: "/invoices/new",
  editInvoice: "/invoices/edit",

  pendingPayments: "/pending-payments",
  pendingPo: "/pending-po",

  statements: "/statements",
  history: "/history",

  excelExport: "/excel-export",
  trash: "/trash",

  reports: "/reports",
  analytics: "/analytics",
  manageProfitBalance: "/analytics/manage-balance",
  settings: "/settings",
} as const;

export type AppRoute = (typeof routes)[keyof typeof routes];
