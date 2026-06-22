export const ADMIN_EMAIL = (process.env.NEXT_PUBLIC_ADMIN_EMAIL || "ksajjad324@gmail.com").trim().toLowerCase();

export function assertAdminEmail(email: string) {
  if (email.trim().toLowerCase() !== ADMIN_EMAIL) {
    throw new Error("This account is not authorized to access the application.");
  }
}
