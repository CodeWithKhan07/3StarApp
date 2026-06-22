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

  invoices: "/invoices",
  newInvoice: "/invoices/new",
  editInvoice: "/invoices/edit",

  pendingPayments: "/pending-payments",

  statements: "/statements",

  excelExport: "/excel-export",

  reports: "/reports",
  settings: "/settings",
} as const;

export type AppRoute = (typeof routes)[keyof typeof routes];
