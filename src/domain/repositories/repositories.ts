import type {
  BusinessDataSet,
  Client,
  Invoice,
  Project,
  Quotation,
  Workspace,
} from "@/domain/entities/business";

export interface AuthSession {
  uid: string;
  email: string | null;
  displayName: string | null;
}

export interface AuthRepository {
  signIn(email: string, password: string): Promise<AuthSession>;
  sendPasswordReset(email: string): Promise<void>;
  signOut(): Promise<void>;
}

export interface WorkspaceRepository {
  findByOwner(ownerId: string): Promise<Workspace | null>;
  save(workspace: Omit<Workspace, "id">): Promise<Workspace>;
}

export interface BusinessRepository {
  listClients(): Promise<Client[]>;
  listProjects(): Promise<Project[]>;
  listQuotations(): Promise<Quotation[]>;
  listInvoices(): Promise<Invoice[]>;
  createClient(client: Omit<Client, "id">): Promise<Client>;
}

// Snapshot persistence contract keeps the application/provider independent of
// Firebase implementation details and supports a future API or local adapter.
export interface BusinessDataRepository {
  load(ownerId: string): Promise<BusinessDataSet | null>;
  replace(
    ownerId: string,
    data: BusinessDataSet,
    source: string,
  ): Promise<void>;
  reserveQuotationId(ownerId: string, quotationId: string): Promise<void>;
  releaseQuotationId(ownerId: string, quotationId: string): Promise<void>;
  pruneStaleQuotationReservations(
    ownerId: string,
    activeQuotationIds: string[],
  ): Promise<void>;
}
