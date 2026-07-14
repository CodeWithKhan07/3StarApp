"use client";

import { routes } from "@/lib/routes";
import { EmptyTableRow, StatusBadge } from "@/presentation/components/ui";
import { money } from "@/presentation/data/sample-data";
import { useBusinessData } from "@/presentation/providers/business-data-provider";
import {
  ArrowUpRight,
  BriefcaseBusiness,
  Building2,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  FileText,
  ReceiptText,
  Plus,
  FileSpreadsheet,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function DashboardPage() {
  const router = useRouter();
  const { data, syncState } = useBusinessData();
  const { clients, invoices, projects } = data;

  const pending = invoices.filter((invoice) =>
    ["pending", "partial", "overdue"].includes(invoice.status),
  );
  const invoiced = invoices.reduce((sum, invoice) => sum + invoice.amount, 0);
  const received = invoices.reduce((sum, invoice) => sum + invoice.received, 0);
  const receivedRate = invoiced ? Math.round((received / invoiced) * 100) : 0;

  const metrics = [
    ["Total Companies", String(clients.length), "Live", Building2],
    ["Total Projects", String(projects.length), "Live", BriefcaseBusiness],
    [
      "Completed Projects",
      String(projects.filter((project) => project.status === "completed").length),
      "Live",
      CheckCircle2,
    ],
    [
      "In Progress",
      String(projects.filter((project) => project.status === "in-progress").length),
      "Live",
      Clock3,
    ],
    [
      "Total Work Value",
      money(projects.reduce((sum, project) => sum + project.value, 0)),
      "SAR",
      CircleDollarSign,
    ],
    ["Total Invoiced", money(invoiced), "SAR", FileText],
    ["Total Received", money(received), "SAR", ReceiptText],
    ["Outstanding Balance", money(invoiced - received), "SAR", CircleDollarSign],
  ] as const;

  return (
    <>
      <section className="dashboard-hero">
        <div className="dashboard-hero__copy">
          <span className="dashboard-hero__eyebrow">Operations overview</span>
          <h1>Business command center</h1>
          <p>Projects, quotations, invoices, and collections—organized into one focused workspace.</p>
          <span className={`sync-state sync-state--${syncState}`}>Cloud {syncState}</span>
        </div>
        <div className="dashboard-hero__actions">
          <Link className="button button--primary" href={routes.newProject}><Plus size={15}/>New Project</Link>
          <Link className="button" href={routes.quotations}><FileText size={15}/>Quotations</Link>
          <Link className="button" href={routes.invoices}><ReceiptText size={15}/>Invoices</Link>
          <Link className="button" href={routes.excelExport}><FileSpreadsheet size={15}/>Import</Link>
        </div>
      </section>

      <section className="metrics">
        {metrics.map(([label, value, trend, Icon]) => (
          <article className="metric-card card" key={label}>
            <div className="metric-card__top">
              <span className="metric-card__icon">
                <Icon size={15} />
              </span>
              <span className="metric-card__trend">↗ {trend}</span>
            </div>

            <p>{label}</p>
            <strong>{value}</strong>
          </article>
        ))}
      </section>

      <section className="grid-2">
        <article className="card">
          <header className="card__header">
            <h2>Revenue Overview</h2>
            <span>⋮</span>
          </header>

          <div className="chart">
            <svg viewBox="0 0 600 180" preserveAspectRatio="none">
              <path
                d="M0 175 L70 105 L145 127 L230 42 L320 84 L405 15 L500 63 L600 18 L600 180 L0 180Z"
                fill="#d1fae5"
                opacity=".85"
              />
              <polyline
                points="0,175 70,105 145,127 230,42 320,84 405,15 500,63 600,18"
                fill="none"
                stroke="#047857"
                strokeWidth="2"
              />
            </svg>
          </div>
        </article>

        <article className="card">
          <header className="card__header">
            <h2>Payment Status</h2>
          </header>

          <div className="donut-wrap">
            <div
              className="donut"
              style={{
                background: `conic-gradient(var(--emerald) 0 ${receivedRate}%, #e2e8f0 ${receivedRate}% 100%)`,
              }}
            >
              <span>
                <strong>{receivedRate}%</strong>
                <small>Received</small>
              </span>
            </div>
          </div>
        </article>
      </section>

      <section className="grid-2">
        <article className="card">
          <header className="card__header">
            <h2>Recent Invoices</h2>
            <Link href={routes.invoices}>View All</Link>
          </header>

          <div className="table-wrap">
            <table className="data-table dashboard-invoices-table">
              <thead>
                <tr>
                  <th>Invoice ID</th>
                  <th>Client</th>
                  <th>Amount</th>
                  <th>Status</th>
                </tr>
              </thead>

              <tbody>
                {invoices.length ? (
                  invoices.slice(0, 8).map((invoice) => (
                    <tr
                      className="plain-data-row"
                      key={invoice.id}
                      // Dashboard rows open the same complete record view as feature lists.
                      onClick={() =>
                        router.push(
                          `${routes.recordDetail}?type=invoice&id=${encodeURIComponent(invoice.id)}`,
                        )
                      }
                    >
                      <td>{invoice.id}</td>
                      <td>{invoice.companyName}</td>
                      <td>{money(invoice.amount)}</td>
                      <td>
                        <StatusBadge value={invoice.status} />
                      </td>
                    </tr>
                  ))
                ) : (
                  <EmptyTableRow
                    columns={4}
                    message="No invoices imported yet. Click Import Excel to load old workbook data."
                  />
                )}
              </tbody>
            </table>
          </div>
        </article>

        <article className="card">
          <header className="card__header">
            <h2>Pending Payments</h2>
            <Link href={routes.pendingPayments}>Follow Up</Link>
          </header>

          <div className="table-wrap">
            <table className="data-table dashboard-pending-table">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Due Date</th>
                  <th>Amount</th>
                  <th>Action</th>
                </tr>
              </thead>

              <tbody>
                {pending.length ? (
                  pending.slice(0, 8).map((invoice) => (
                    <tr
                      className="plain-data-row"
                      key={invoice.id}
                      onClick={() =>
                        router.push(
                          `${routes.recordDetail}?type=invoice&id=${encodeURIComponent(invoice.id)}`,
                        )
                      }
                    >
                      <td>{invoice.companyName}</td>
                      <td>{invoice.followUpDate || "—"}</td>
                      <td>{money(invoice.amount - invoice.received)}</td>
                      <td>
                        <ArrowUpRight size={13} />
                      </td>
                    </tr>
                  ))
                ) : (
                  <EmptyTableRow columns={4} message="No pending payments found." />
                )}
              </tbody>
            </table>
          </div>
        </article>
      </section>
    </>
  );
}
