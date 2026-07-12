import { LoadingState } from "@/presentation/components/ui";
import { RecordDetailScreen } from "@/presentation/features/records/record-detail-screen";
import { Suspense } from "react";

export default function RecordDetailPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <RecordDetailScreen />
    </Suspense>
  );
}
