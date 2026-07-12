import { LoadingState } from "@/presentation/components/ui";
import { HistoryScreen } from "@/presentation/features/history/history-screen";
import { Suspense } from "react";

export default function HistoryPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <HistoryScreen />
    </Suspense>
  );
}
