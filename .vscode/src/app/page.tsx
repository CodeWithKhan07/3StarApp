"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { routes } from "@/lib/routes";
import { LoadingScreen } from "@/presentation/components/loading-screen";
import { useAuth } from "@/presentation/providers/auth-provider";

export default function SplashPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const timer = window.setTimeout(() => {
      if (!user) {
        router.replace(routes.login);
        return;
      }
      router.replace(routes.dashboard);
    }, 1100);
    return () => window.clearTimeout(timer);
  }, [loading, router, user]);

  return <LoadingScreen />;
}
