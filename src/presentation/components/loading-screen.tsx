import { BrandMark } from "@/presentation/components/brand-mark";

export function LoadingScreen({ label = "INITIALIZING WORKSPACE..." }: { label?: string }) {
  return (
    <main className="splash">
      <div className="splash__center">
        <BrandMark compact inverse />
        <h1>3Star Business Suite</h1>
        <p>Projects, invoices, payments, and reports — connected in<br />one workflow.</p>
      </div>
      <div className="splash__progress" aria-live="polite"><span>{label}</span><i /></div>
    </main>
  );
}
