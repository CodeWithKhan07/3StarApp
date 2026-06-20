import { Star } from "lucide-react";

export function BrandMark({ compact = false, inverse = false }: { compact?: boolean; inverse?: boolean }) {
  return (
    <div className={`brand ${compact ? "brand--compact" : ""} ${inverse ? "brand--inverse" : ""}`}>
      <span className="brand__mark"><Star size={compact ? 15 : 18} fill="currentColor" /></span>
      {!compact && <span className="brand__copy"><strong>3Star Suite</strong><small>Business Intelligence</small></span>}
    </div>
  );
}
