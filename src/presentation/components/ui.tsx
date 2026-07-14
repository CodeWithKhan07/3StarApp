import type { ReactNode } from "react";
import { Inbox, LoaderCircle, RefreshCw } from "lucide-react";

export function PageHeader({ title, description, actions }: { title: string; description: string; actions?: ReactNode }) {
  return <div className="page-header"><div><h1>{title}</h1><p>{description}</p></div>{actions && <div className="page-header__actions">{actions}</div>}</div>;
}

export function StatusBadge({ value }: { value: string }) {
  const key = value.toLowerCase().replaceAll(" ", "-");
  return <span className={`status-badge status-badge--${key}`}>{value}</span>;
}

export function EmptyState({ title = "No records found", message = "Adjust your filters or add your first record." }: { title?: string; message?: string }) {
  return <div className="empty-state"><Inbox /><strong>{title}</strong><p>{message}</p></div>;
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <div className="error-state"><strong>Unable to load data</strong><p>{message}</p>{onRetry && <button className="button button--primary" onClick={onRetry}><RefreshCw size={15} /> Retry</button>}</div>;
}

export function LoadingState() {
  return <div className="loading-state"><LoaderCircle className="spin" /><span>Loading records…</span></div>;
}

export function EmptyTableRow({ columns, message = "No records are available yet." }: { columns: number; message?: string }) {
  return <tr><td colSpan={columns} style={{ padding: 32, textAlign: "center", color: "var(--muted)" }}>{message}</td></tr>;
}

// Reusable inclusive date controls keep list screens visually and
// behaviorally consistent while the filtering logic stays outside the UI.
export function DateRangeFields({
  from,
  to,
  onFromChange,
  onToChange,
}: {
  from: string;
  to: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
}) {
  return (
    <>
      <label className="compact-filter-field">
        <span>From date</span>
        <input
          type="date"
          value={from}
          max={to || undefined}
          onChange={(event) => onFromChange(event.target.value)}
        />
      </label>
      <label className="compact-filter-field">
        <span>To date</span>
        <input
          type="date"
          value={to}
          min={from || undefined}
          onChange={(event) => onToChange(event.target.value)}
        />
      </label>
    </>
  );
}
