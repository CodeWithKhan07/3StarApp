import { Suspense } from "react";
import { ClientEditScreen } from "@/presentation/features/records/edit-record-screens";
import { LoadingState } from "@/presentation/components/ui";
export default function Page(){return <Suspense fallback={<LoadingState/>}><ClientEditScreen/></Suspense>;}
