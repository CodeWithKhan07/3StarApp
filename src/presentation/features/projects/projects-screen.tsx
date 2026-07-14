"use client";

import type { BusinessDataSet } from "@/domain/entities/business";
import { matchesRecordQuery } from "@/application/services/record-query";
import { routes } from "@/lib/routes";
import { DateRangeFields, PageHeader, StatusBadge } from "@/presentation/components/ui";
import { money } from "@/presentation/data/sample-data";
import { useBusinessData } from "@/presentation/providers/business-data-provider";
import { collectCompanyNames, normalizeCompanyKey } from "@/presentation/utils/company-filters";
import { Plus, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

type Project = BusinessDataSet["projects"][number];
type ProjectStatus = Project["status"];

const statuses: Array<{ label: string; value: ProjectStatus }> = [
  { label: "Upcoming", value: "upcoming" },
  { label: "In Progress", value: "in-progress" },
  { label: "On Hold", value: "on-hold" },
  { label: "Completed", value: "completed" },
  { label: "Cancelled", value: "cancelled" },
];

const categories = [
  "Automatic Door",
  "Rolling Shutter",
  "Glass Work",
  "Aluminium Work",
  "Maintenance",
  "Installation",
  "Other",
];

const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
const record = (value: unknown) =>
  typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};

function firstString(value: Record<string, unknown>, keys: string[], fallback = "") {
  for (const key of keys) {
    const item = value[key];
    if (typeof item === "string" && item.trim()) return item;
  }
  return fallback;
}

function firstNumber(value: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const item = Number(value[key]);
    if (Number.isFinite(item)) return item;
  }
  return 0;
}

function normalize(project: Project) {
  const value = record(project);
  return {
    raw: project,
    id: firstString(value, ["id", "projectId"]),
    company: firstString(value, ["company", "companyName", "clientName"], "Unnamed Company"),
    store: firstString(value, ["store", "storeBranch", "branch"]),
    location: firstString(value, ["location", "site"]),
    description: firstString(value, ["workDescription", "description", "scope"]),
    category: firstString(value, ["category"], "Other"),
    quotationNo: firstString(value, ["quotationNo", "quotationNumber"]),
    woNo: firstString(value, ["woNo", "workOrderNo"]),
    amount: firstNumber(value, ["value", "projectValue", "amount"]),
    startDate: firstString(value, ["startDate"]),
    expected: firstString(value, ["expectedCompletion", "expectedCompletionDate"]),
    status: firstString(value, ["status"], "upcoming") as ProjectStatus,
    completion: firstNumber(value, ["completion", "completionPercentage"]),
    remarks: firstString(value, ["remarks", "notes"]),
  };
}

type NormalizedProject = ReturnType<typeof normalize>;

function dateValue(item: NormalizedProject) {
  const parsed = new Date(`${item.startDate || "1900-01-01"}T00:00:00`);
  const value = parsed.valueOf();
  return Number.isNaN(value) ? 0 : value;
}

export function ProjectsScreen() {
  const router = useRouter();
  const { data, syncState } = useBusinessData();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [category, setCategory] = useState("all");
  const [company, setCompany] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const projects = useMemo(
    () =>
      data.projects
        .map(normalize)
        .sort((a, b) => dateValue(b) - dateValue(a) || collator.compare(b.id, a.id)),
    [data.projects],
  );
  const availableCategories = useMemo(
    () => Array.from(new Set(projects.map((item) => item.category).filter(Boolean))),
    [projects],
  );
  const companies = useMemo(() => collectCompanyNames(data), [data]);
  const filtered = useMemo(() => {
    return projects.filter(
      (item) =>
        matchesRecordQuery(
          [
            item.id,
            item.company,
            item.store,
            item.location,
            item.description,
            item.category,
            item.quotationNo,
            item.woNo,
            item.remarks,
          ],
          item.company,
          item.startDate,
          { query, company, dateFrom, dateTo },
        ) &&
        (status === "all" || item.status === status) &&
        (category === "all" || item.category === category),
    );
  }, [category, company, dateFrom, dateTo, projects, query, status]);

  return (
    <>
      <PageHeader
        title="Projects"
        description={`Plain project list with quick details. Cloud: ${syncState}.`}
        actions={
          <>
            <Link className="button" href={routes.trash}>
              <Trash2 size={14} />
              Trash
            </Link>
            <Link className="button button--primary" href={routes.newProject}>
              <Plus size={14} />
              New Project
            </Link>
          </>
        }
      />

      <section className="card table-toolbar project-date-toolbar">
        <label className="toolbar-search">
          <Search size={15} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search project, company, location, quotation, WO..."
          />
        </label>
        <select className="select" value={company} onChange={(event) => setCompany(event.target.value)}>
          <option value="all">All Companies</option>
          {companies.map((item) => (
            <option key={item} value={normalizeCompanyKey(item)}>
              {item}
            </option>
          ))}
        </select>
        <DateRangeFields
          from={dateFrom}
          to={dateTo}
          onFromChange={setDateFrom}
          onToChange={setDateTo}
        />
        <select className="select" value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="all">All Status</option>
          {statuses.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
        <select className="select" value={category} onChange={(event) => setCategory(event.target.value)}>
          <option value="all">All Categories</option>
          {[...availableCategories, ...categories.filter((item) => !availableCategories.includes(item))].map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
      </section>

      <section className="card plain-data-card">
        <div className="table-wrap plain-list-wrap">
          <table className="data-table statement-table project-history-table plain-data-table">
            <thead>
              <tr>
                <th>Start Date</th>
                <th>Project</th>
                <th>Company</th>
                <th>Store / Location</th>
                <th>Value</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr
                  className="plain-data-row"
                  key={item.id}
                  onClick={() => router.push(`${routes.recordDetail}?type=project&id=${encodeURIComponent(item.id)}`)}
                >
                  <td>{item.startDate || "-"}</td>
                  <td className="strong-cell">{item.id}</td>
                  <td>{item.company}</td>
                  <td>{item.store || "-"}<br /><small>{item.location || "No location"}</small></td>
                  <td className="money-cell">{money(item.amount)}</td>
                  <td><StatusBadge value={item.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!filtered.length ? (
          <section className="card empty-state">
            <h2>No projects found</h2>
            <p>Try clearing the company, date, status, category, or search filters.</p>
          </section>
        ) : null}
      </section>
    </>
  );
}
