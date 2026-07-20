"use client";

import { routes } from "@/lib/routes";
import { PageHeader } from "@/presentation/components/ui";
import { money } from "@/presentation/data/sample-data";
import { useBusinessData } from "@/presentation/providers/business-data-provider";
import { ArrowLeft, Plus, Save, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";

type EmployeePayment = { id: string; employeeName: string; amount: number };
const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function ProfitBalanceScreen() {
  const invoiceId = useSearchParams().get("invoiceId") || "";
  const router = useRouter();
  const { data, patchRecord } = useBusinessData();
  const invoice = data.invoices.find((item) => item.id === invoiceId);
  const allocation = invoice?.profitAllocation;
  const [employeePayments, setEmployeePayments] = useState<EmployeePayment[]>(
    allocation?.employeePayments || [],
  );
  const [companyProfit, setCompanyProfit] = useState(allocation?.companyProfit || 0);
  const [companyExpenses, setCompanyExpenses] = useState(allocation?.companyExpenses || 0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const totalProfit = invoice?.profitAmount || 0;
  const employeeTotal = useMemo(
    () => roundMoney(employeePayments.reduce((sum, payment) => sum + payment.amount, 0)),
    [employeePayments],
  );
  const allocated = roundMoney(employeeTotal + companyProfit + companyExpenses);
  const remaining = roundMoney(totalProfit - allocated);

  if (!invoice || invoice.status !== "paid") {
    return <section className="card empty-state"><h2>Paid transaction not found</h2><p>Profit balances can only be managed for paid invoices.</p><Link className="button" href={routes.analytics}>Back to Profit & Expenses</Link></section>;
  }

  function updateEmployee(id: string, patch: Partial<EmployeePayment>) {
    setEmployeePayments((current) => current.map((payment) => payment.id === id ? { ...payment, ...patch } : payment));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedEmployees = employeePayments
      .map((payment) => ({ ...payment, employeeName: payment.employeeName.trim(), amount: roundMoney(payment.amount) }))
      .filter((payment) => payment.employeeName || payment.amount);
    if (normalizedEmployees.some((payment) => !payment.employeeName)) {
      setError("Enter an employee name for every employee payment.");
      return;
    }
    if ([...normalizedEmployees.map((payment) => payment.amount), companyProfit, companyExpenses].some((value) => !Number.isFinite(value) || value < 0)) {
      setError("Balance amounts must be zero or positive numbers.");
      return;
    }
    if (remaining !== 0) {
      setError(remaining > 0 ? `Allocate the remaining ${money(remaining)}.` : `Allocations exceed profit by ${money(Math.abs(remaining))}.`);
      return;
    }

    setSaving(true);
    setError("");
    try {
      await patchRecord("invoices", invoice!.id, {
        profitAllocation: {
          employeePayments: normalizedEmployees,
          companyProfit: roundMoney(companyProfit),
          companyExpenses: roundMoney(companyExpenses),
          updatedAt: new Date().toISOString(),
        },
      });
      router.replace(routes.analytics);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Profit balance could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader title={`Manage Balance — ${invoice.id}`} description={`${invoice.companyName} · Total profit ${money(totalProfit)}`} actions={<Link className="button" href={routes.analytics}><ArrowLeft size={14} />Back</Link>} />
      <form className="record-form profit-balance-workspace" onSubmit={save}>
        <section className="metrics profit-balance-summary">
          <article className="metric-card card"><p>Total Profit</p><strong>{money(totalProfit)}</strong></article>
          <article className="metric-card card"><p>Allocated</p><strong>{money(allocated)}</strong></article>
          <article className={`metric-card card${remaining ? " profit-balance-unbalanced" : ""}`}><p>Remaining</p><strong>{money(remaining)}</strong></article>
        </section>

        <section className="card form-section">
          <header><div><h2>Employee Payments</h2><p>Add every employee receiving a share from this transaction.</p></div><button className="button" type="button" onClick={() => setEmployeePayments((current) => [...current, { id: crypto.randomUUID(), employeeName: "", amount: 0 }])}><Plus size={14} />Add Employee</button></header>
          <div className="profit-employee-list">
            {employeePayments.length ? employeePayments.map((payment, index) => (
              <div className="profit-employee-row" key={payment.id}>
                <span>{index + 1}</span>
                <label className="field"><span>Employee Name</span><input value={payment.employeeName} onChange={(event) => updateEmployee(payment.id, { employeeName: event.target.value })} placeholder="Employee name" /></label>
                <label className="field"><span>Amount</span><input type="number" min="0" step="0.01" value={payment.amount || ""} onChange={(event) => updateEmployee(payment.id, { amount: Number(event.target.value) || 0 })} /></label>
                <button className="icon-button icon-button--danger" type="button" aria-label={`Remove employee payment ${index + 1}`} onClick={() => setEmployeePayments((current) => current.filter((item) => item.id !== payment.id))}><Trash2 size={15} /></button>
              </div>
            )) : <div className="empty-state">No employee payments added.</div>}
          </div>
        </section>

        <section className="card form-section profit-company-allocation">
          <header><div><h2>Company Allocation</h2><p>Split the remaining profit between retained company profit and company expenses.</p></div></header>
          <div className="form-grid">
            <label className="field"><span>Company Profit</span><input type="number" min="0" step="0.01" value={companyProfit || ""} onChange={(event) => setCompanyProfit(Number(event.target.value) || 0)} /></label>
            <label className="field"><span>Company Expenses</span><input type="number" min="0" step="0.01" value={companyExpenses || ""} onChange={(event) => setCompanyExpenses(Number(event.target.value) || 0)} /></label>
          </div>
        </section>

        {error ? <div className="form-message form-message--error" role="alert">{error}</div> : null}
        <div className="form-actions"><button className="button button--primary" disabled={saving || remaining !== 0}><Save size={14} />{saving ? "Saving..." : "Save Balance"}</button></div>
      </form>
    </>
  );
}
