import type { AuthRepository } from "@/domain/repositories/repositories";
import { assertAdminEmail } from "@/lib/auth-config";

export class SignInUseCase {
  constructor(private readonly repository: AuthRepository) {}

  execute(email: string, password: string) {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !password) throw new Error("Email and password are required.");
    assertAdminEmail(normalizedEmail);
    return this.repository.signIn(normalizedEmail, password);
  }
}

export class ResetPasswordUseCase {
  constructor(private readonly repository: AuthRepository) {}

  execute(email: string) {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) throw new Error("Enter your email address first.");
    assertAdminEmail(normalizedEmail);
    return this.repository.sendPasswordReset(normalizedEmail);
  }
}
