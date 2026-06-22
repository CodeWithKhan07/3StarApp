"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { routes } from "@/lib/routes";
import { LoadingScreen } from "@/presentation/components/loading-screen";
import { useAuth } from "@/presentation/providers/auth-provider";

export function AuthGuard({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace(`${routes.login}?next=${encodeURIComponent(pathname)}`);
  }, [loading, pathname, router, user]);

  if (loading || !user) return <LoadingScreen label="VERIFYING SECURE SESSION..." />;
  return children;
}
