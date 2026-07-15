import { Suspense } from "react";
import { LoadingState } from "@/presentation/components/ui";
import { ProfitBalanceScreen } from "@/presentation/features/analytics/profit-balance-screen";

export default function Page() {
  return <Suspense fallback={<LoadingState />}><ProfitBalanceScreen /></Suspense>;
}
