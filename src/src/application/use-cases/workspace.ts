import type { Workspace } from "@/domain/entities/business";
import type { WorkspaceRepository } from "@/domain/repositories/repositories";

export class CreateWorkspaceUseCase {
  constructor(private readonly repository: WorkspaceRepository) {}

  execute(input: Omit<Workspace, "id">) {
    if (!input.ownerId || !input.businessName.trim() || !input.legalCompanyName.trim()) {
      throw new Error("Business and legal company names are required.");
    }
    if (!input.address.trim() || !input.city.trim() || !input.country.trim()) {
      throw new Error("A complete registered address is required.");
    }
    if (!input.email.trim() || !input.phone.trim()) {
      throw new Error("Primary email and phone number are required.");
    }
    if (!Number.isFinite(input.vatRate) || input.vatRate < 0 || input.vatRate > 100) {
      throw new Error("VAT rate must be between 0 and 100.");
    }
    return this.repository.save(input);
  }
}
