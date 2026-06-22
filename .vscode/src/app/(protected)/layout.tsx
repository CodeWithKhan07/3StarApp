import { AuthGuard } from "@/presentation/components/auth-guard";
import { AppShell } from "@/presentation/components/app-shell";
import { BusinessDataProvider } from "@/presentation/providers/business-data-provider";

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return <AuthGuard><BusinessDataProvider><AppShell>{children}</AppShell></BusinessDataProvider></AuthGuard>;
}
