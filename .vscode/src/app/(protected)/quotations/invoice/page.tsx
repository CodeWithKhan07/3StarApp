import { Suspense } from "react";
import { LoadingState } from "@/presentation/components/ui";
import { QuotationInvoiceScreen } from "@/presentation/features/quotations/quotation-invoice-screen";
export default function Page(){return <Suspense fallback={<LoadingState/>}><QuotationInvoiceScreen/></Suspense>;}
