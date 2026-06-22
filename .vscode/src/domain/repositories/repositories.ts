import type { Client, Invoice, Project, Quotation, Workspace } from "@/domain/entities/business";

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
