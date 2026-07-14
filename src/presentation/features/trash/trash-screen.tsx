"use client";

import { matchesRecordQuery } from "@/application/services/record-query";
import { DateRangeFields, PageHeader } from "@/presentation/components/ui";
import { useBusinessData } from "@/presentation/providers/business-data-provider";
import { RotateCcw, Search, Trash2, XCircle } from "lucide-react";
import { useMemo, useState } from "react";

const dateTime = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function formatDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) return value || "-";
  return dateTime.format(parsed);
}

function collectionLabel(value: string) {
  return value.slice(0, 1).toUpperCase() + value.slice(1, -1);
}

export function TrashScreen() {
  const {
    trash,
    restoreTrashItem,
    permanentlyDeleteTrashItem,
    emptyTrash,
  } = useBusinessData();
  const [query, setQuery] = useState("");
  const [company, setCompany] = useState("all");
  const [collection, setCollection] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [error, setError] = useState("");
  const companies = useMemo(
    () =>
      [...new Set(trash.map((item) => item.companyName).filter(Boolean))].sort(
        (a, b) => a.localeCompare(b),
      ),
    [trash],
  );

  const filtered = useMemo(() => {
    return [...trash]
      .sort(
        (a, b) =>
          new Date(b.deletedAt).valueOf() - new Date(a.deletedAt).valueOf(),
      )
      .filter(
        (item) =>
          (collection === "all" || item.collection === collection) &&
          matchesRecordQuery(
            [item.label, item.companyName, item.recordId, item.collection],
            item.companyName,
            item.deletedAt.slice(0, 10),
            { query, company, dateFrom, dateTo },
          ),
      );
  }, [collection, company, dateFrom, dateTo, query, trash]);

  async function restore(id: string) {
    setError("");
    try {
      await restoreTrashItem(id);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Item could not be restored.",
      );
    }
  }

  async function removeForever(id: string, label: string) {
    if (!window.confirm(`Permanently delete "${label}"? This cannot be undone.`)) {
      return;
    }

    setError("");
    try {
      await permanentlyDeleteTrashItem(id);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Item could not be permanently deleted.",
      );
    }
  }

  async function removeAll() {
    if (!trash.length) return;
    if (!window.confirm("Permanently delete every item in Trash?")) return;

    setError("");
    try {
      await emptyTrash();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Trash could not be emptied.",
      );
    }
  }

  return (
    <>
      <PageHeader
        title="Trash"
        description="Deleted records stay here for 30 days before automatic cleanup."
        actions={
          <button
            className="button button--danger"
            type="button"
            disabled={!trash.length}
            onClick={() => void removeAll()}
          >
            <Trash2 size={14} />
            Empty Trash
          </button>
        }
      />
      <section className="card table-toolbar trash-toolbar">
        <label className="toolbar-search">
          <Search size={15} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search deleted item, company, type..."
          />
        </label>
        <select
          className="select"
          value={company}
          onChange={(event) => setCompany(event.target.value)}
        >
          <option value="all">All Companies</option>
          {companies.map((name) => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
        <select
          className="select"
          value={collection}
          onChange={(event) => setCollection(event.target.value)}
        >
          <option value="all">All Record Types</option>
          <option value="clients">Clients</option>
          <option value="projects">Projects</option>
          <option value="quotations">Quotations</option>
          <option value="invoices">Invoices</option>
        </select>
        <DateRangeFields
          from={dateFrom}
          to={dateTo}
          onFromChange={setDateFrom}
          onToChange={setDateTo}
        />
      </section>
      {error ? <div className="form-message form-message--error">{error}</div> : null}
      <section className="card trash-list-card">
        {filtered.length ? (
          <div className="trash-list">
            {filtered.map((item) => (
              <article className="trash-row" key={item.id}>
                <div>
                  <span>{collectionLabel(item.collection)}</span>
                  <strong>{item.label}</strong>
                  <small>{item.companyName || "No company"}</small>
                </div>
                <dl>
                  <div>
                    <dt>Deleted</dt>
                    <dd>{formatDate(item.deletedAt)}</dd>
                  </div>
                  <div>
                    <dt>Auto Delete</dt>
                    <dd>{formatDate(item.deleteAfter)}</dd>
                  </div>
                </dl>
                <footer>
                  <button
                    className="button button--primary"
                    type="button"
                    onClick={() => void restore(item.id)}
                  >
                    <RotateCcw size={14} />
                    Restore
                  </button>
                  <button
                    className="button button--danger"
                    type="button"
                    onClick={() => void removeForever(item.id, item.label)}
                  >
                    <XCircle size={14} />
                    Delete
                  </button>
                </footer>
              </article>
            ))}
          </div>
        ) : (
          <div className="mobile-empty-state">Trash is empty.</div>
        )}
      </section>
    </>
  );
}
