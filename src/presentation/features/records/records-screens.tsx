"use client";

import { exportInvoicePdf } from "@/application/services/document-export";
import { parseInvoiceDocument, type InvoiceImportDraft } from "@/application/services/invoice-import";
import type { Invoice, Project } from "@/domain/entities/business";
import { routes } from "@/lib/routes";
import { EmptyTableRow, PageHeader, StatusBadge } from "@/presentation/components/ui";
import { money } from "@/presentation/data/sample-data";
import { InvoiceDocumentModal } from "@/presentation/features/invoices/invoice-document-modal";
import { useBusinessData } from "@/presentation/providers/business-data-provider";
import { Download, Edit3, FileUp, LoaderCircle, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useRef, useState, type ReactNode } from "react";

function Toolbar({query,onQuery,placeholder,children}:{query:string;onQuery:(value:string)=>void;placeholder:string;children?:ReactNode}){return <div className="toolbar"><label className="search-field"><Search size={14}/><input value={query} onChange={event=>onQuery(event.target.value)} placeholder={placeholder}/></label>{children}</div>;}

export function ClientsScreen() {
  const { data, createRecord } = useBusinessData();
  const [query, setQuery] = useState("");
  const [city, setCity] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const filtered = data.clients.filter((client) => {
    const target = [
      client.companyName,
      client.brandName,
      client.contactPerson,
      client.mobile,
      client.email,
      client.address,
      client.vatNumber,
      client.crNumber,
      client.storeName,
      client.storeLocation,
    ]
      .join(" ")
      .toLowerCase();

    return target.includes(query.toLowerCase()) && (city === "all" || client.city === city);
  });

  async function addClient(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const value = (key: string) => String(form.get(key) || "").trim();
    await createRecord("clients", {
      id: crypto.randomUUID(),
      companyName: value("companyName"),
      brandName: value("brandName"),
      contactPerson: value("contactPerson"),
      mobile: value("mobile"),
      email: value("email"),
      address: value("address"),
      city: value("city"),
      country: value("country"),
      vatNumber: value("vatNumber"),
      crNumber: value("crNumber"),
      storeName: value("storeName"),
      storeLocation: value("storeLocation"),
      contractStatus: "active",
      remarks: value("remarks"),
    });
    setShowForm(false);
  }

  return (
    <>
      <PageHeader
        title="Clients"
        description="Manage company master records used for quotations and invoices."
        actions={
          <button className="button button--primary" onClick={() => setShowForm((value) => !value)}>
            <Plus size={14} />
            New Client
          </button>
        }
      />

      {showForm ? (
        <form className="card form-card" onSubmit={(event) => void addClient(event)}>
          <div className="form-grid">
            {[
              ["companyName", "Company Name *"],
              ["brandName", "Brand Name"],
              ["contactPerson", "Contact Person"],
              ["mobile", "Mobile / WhatsApp"],
              ["email", "Email"],
              ["vatNumber", "VAT Number"],
              ["crNumber", "CR Number"],
              ["city", "City"],
              ["country", "Country"],
              ["storeName", "Default Store / Branch"],
              ["storeLocation", "Default Store Location"],
            ].map(([name, label]) => (
              <label className="field" key={name}>
                <span>{label}</span>
                <input name={name} type={name === "email" ? "email" : "text"} required={name === "companyName"} />
              </label>
            ))}
            <label className="field field--full">
              <span>Address</span>
              <input name="address" />
            </label>
            <label className="field field--full">
              <span>Remarks</span>
              <textarea name="remarks" rows={3} />
            </label>
          </div>
          <div className="form-actions">
            <button type="button" className="button" onClick={() => setShowForm(false)}>
              Cancel
            </button>
            <button className="button button--primary">Save Client</button>
          </div>
        </form>
      ) : null}

      <section className="card">
        <Toolbar query={query} onQuery={setQuery} placeholder="Search company, brand, VAT, or address...">
          <select className="select" value={city} onChange={(event) => setCity(event.target.value)}>
            <option value="all">All Cities</option>
            {[...new Set(data.clients.map((item) => item.city).filter(Boolean))].map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </Toolbar>
        <div className="table-wrap desktop-data-table">
          <table className="data-table clients-table">
            <thead>
              <tr>
                <th>Company</th>
                <th>Brand / Store</th>
                <th>Contact</th>
                <th>Tax Details</th>
                <th>Location</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length ? (
                filtered.map((client) => (
                  <tr key={client.id}>
                    <td>{client.companyName}<br /><small>{client.address || "-"}</small></td>
                    <td>{client.brandName || client.storeName || "-"}<br /><small>{client.storeLocation || ""}</small></td>
                    <td>{client.contactPerson || "-"}<br /><small>{client.mobile || client.email || "-"}</small></td>
                    <td>VAT: {client.vatNumber || "-"}<br /><small>CR: {client.crNumber || "-"}</small></td>
                    <td>{client.city || "-"}{client.country ? `, ${client.country}` : ""}</td>
                    <td><StatusBadge value={client.contractStatus} /></td>
                    <td>
                      <Link className="icon-button" href={`${routes.editClient}?id=${encodeURIComponent(client.id)}`} title="Edit full client">
                        <Edit3 size={15} />
                      </Link>
                    </td>
                  </tr>
                ))
              ) : (
                <EmptyTableRow columns={7} />
              )}
            </tbody>
          </table>
        </div>
        <div className="mobile-card-list">
          {filtered.length ? (
            filtered.map((client) => (
              <article className="mobile-record-card" key={client.id}>
                <header>
                  <div>
                    <span>Client</span>
                    <strong>{client.companyName}</strong>
                    <small>{client.brandName || client.city || "No brand"}</small>
                  </div>
                  <StatusBadge value={client.contractStatus} />
                </header>
                <dl>
                  <div><dt>Contact</dt><dd>{client.contactPerson || "-"}</dd></div>
                  <div><dt>Mobile</dt><dd>{client.mobile || "-"}</dd></div>
                  <div><dt>VAT</dt><dd>{client.vatNumber || "-"}</dd></div>
                  <div><dt>City</dt><dd>{client.city || "-"}</dd></div>
                  <div className="mobile-field-wide"><dt>Address</dt><dd>{client.address || "-"}</dd></div>
                </dl>
                <footer>
                  <Link className="button" href={`${routes.editClient}?id=${encodeURIComponent(client.id)}`}>
                    <Edit3 size={14} />
                    Edit Client
                  </Link>
                </footer>
              </article>
            ))
          ) : (
            <div className="mobile-empty-state">No clients found.</div>
          )}
        </div>
      </section>
    </>
  );
}
export function ProjectsScreen({status}:{status?:Project["status"]}){const {data}=useBusinessData();const [query,setQuery]=useState("");const source=status?data.projects.filter(item=>item.status===status):data.projects;const filtered=source.filter(item=>`${item.id} ${item.company} ${item.workDescription}`.toLowerCase().includes(query.toLowerCase()));const groupedProjects=Array.from(filtered.reduce((map,item)=>{const company=item.company?.trim()||"Unnamed Company";const list=map.get(company)||[];list.push(item);map.set(company,list);return map;},new Map<string,Project[]>()).entries()).map(([company,items])=>({company,items,total:items.reduce((sum,item)=>sum+item.value,0),completed:items.filter(item=>item.status==="completed").length}));const title=status==="in-progress"?"Ongoing Projects":status==="completed"?"Completed Projects":"Projects";return <><PageHeader title={title} description="Monitor projects; use the edit action for complete record changes."/><section className="card"><Toolbar query={query} onQuery={setQuery} placeholder="Search projects..."/><div className="table-wrap desktop-data-table"><table className="data-table mobile-projects-table"><thead><tr><th>ID</th><th>Company</th><th>Store</th><th>Description</th><th>Value</th><th>Completion</th><th>Status</th><th>Actions</th></tr></thead><tbody>{filtered.length?filtered.map(project=><tr key={project.id}><td>{project.id}</td><td>{project.company}</td><td>{project.store}</td><td>{project.workDescription}</td><td>{money(project.value)}</td><td>{project.completion}%</td><td><StatusBadge value={project.status}/></td><td><Link className="icon-button" href={`${routes.editProject}?id=${encodeURIComponent(project.id)}`}><Edit3 size={15}/></Link></td></tr>):<EmptyTableRow columns={8}/>}</tbody></table></div><div className="mobile-card-list mobile-company-list">{groupedProjects.length?groupedProjects.map(group=><section className="mobile-company-card" key={group.company}><header><span>Company History</span><h3>{group.company}</h3><small>{group.items.length} job(s) · {group.completed} completed · Total {money(group.total)}</small></header><div className="mobile-company-card__records">{group.items.map(project=><article className="mobile-record-card" key={project.id}><header><div><span>Project</span><strong>{project.id}</strong><small>{project.startDate||"No date"} · {project.store||"No branch"}</small></div><StatusBadge value={project.status}/></header><dl><div><dt>Store</dt><dd>{project.store||"—"}</dd></div><div className="mobile-field-wide"><dt>Job / Description</dt><dd>{project.workDescription||"—"}</dd></div><div><dt>Value</dt><dd>{money(project.value)}</dd></div><div><dt>Completion</dt><dd>{project.completion}%</dd></div></dl><footer><Link className="button button--primary" href={`${routes.editProject}?id=${encodeURIComponent(project.id)}`}><Edit3 size={14}/>Edit Project</Link></footer></article>)}</div></section>):<div className="mobile-empty-state">No projects found.</div>}</div></section></>;}

export function InvoicesScreen({pendingOnly=false}:{pendingOnly?:boolean}){
  const {data,updateInvoiceStatus,completeInvoicePayment}=useBusinessData();const [query,setQuery]=useState("");const [status,setStatus]=useState("all");const [modal,setModal]=useState(false);const [draft,setDraft]=useState<InvoiceImportDraft|null>(null);const [importing,setImporting]=useState(false);const [error,setError]=useState("");const input=useRef<HTMLInputElement|null>(null);
  const source=pendingOnly?data.invoices.filter(item=>["pending","partial","overdue"].includes(item.status)):data.invoices;const filtered=source.filter(item=>`${item.id} ${item.companyName} ${item.project}`.toLowerCase().includes(query.toLowerCase())&&(status==="all"||item.status===status));const total=source.reduce((sum,item)=>sum+item.amount,0);const received=source.reduce((sum,item)=>sum+item.received,0);
  const groupedInvoices=Array.from(filtered.reduce((map,item)=>{const company=item.companyName?.trim()||"Unnamed Company";const list=map.get(company)||[];list.push(item);map.set(company,list);return map;},new Map<string,Invoice[]>()).entries()).map(([company,items])=>({company,items,total:items.reduce((sum,item)=>sum+item.amount,0),received:items.reduce((sum,item)=>sum+item.received,0)}));
  async function change(id:string,next:string){if(next==="paid")await completeInvoicePayment(id);else await updateInvoiceStatus(id,next as Invoice["status"]);}
  async function importFile(file?:File){if(!file)return;setImporting(true);setError("");try{setDraft(await parseInvoiceDocument(file));setModal(true);}catch(e){setError(e instanceof Error?e.message:"Invoice import failed.");}finally{setImporting(false);}}
  async function exportPdf(invoice:Invoice){setError("");try{await exportInvoicePdf(invoice,data.company);}catch(e){setError(e instanceof Error?e.message:"Invoice export failed.");}}
  return <><PageHeader title={pendingOnly?"Pending Payments":"Invoices & Payments"} description={pendingOnly?"Follow up outstanding balances.":"Create invoices and use a full page for record editing."} actions={!pendingOnly?<><button className="button" disabled={importing} onClick={()=>input.current?.click()}>{importing?<LoaderCircle className="spin" size={14}/>:<FileUp size={14}/>}Import Excel / PDF</button><button className="button button--primary" onClick={()=>{setDraft(null);setModal(true);}}><Plus size={14}/>New Invoice</button></>:undefined}/>
    <input ref={input} className="file-input" type="file" accept=".pdf,.xlsx,.xls,.xlsm,.xlsb,.ods,.csv" onChange={event=>{const file=event.target.files?.[0];event.target.value="";void importFile(file);}}/>{error?<div className="form-message form-message--error">{error}</div>:null}
    <section className="metrics"><article className="metric-card card"><p>Total Invoiced</p><strong>{money(total)}</strong></article><article className="metric-card card"><p>Total Received</p><strong>{money(received)}</strong></article><article className="metric-card card"><p>Outstanding</p><strong>{money(total-received)}</strong></article></section>
    <section className="card"><Toolbar query={query} onQuery={setQuery} placeholder="Search invoice, company, or project..."><select className="select" value={status} onChange={event=>setStatus(event.target.value)}><option value="all">All Statuses</option><option value="pending">pending</option><option value="partial">partial</option><option value="paid">paid</option><option value="overdue">overdue</option></select></Toolbar><div className="table-wrap desktop-data-table"><table className="data-table invoices-table"><thead><tr><th>Company</th><th>Project</th><th>Invoice</th><th>Date</th><th>Amount</th><th>Received</th><th>Balance</th><th>Status</th><th>Actions</th></tr></thead><tbody>{filtered.length?filtered.map(invoice=><tr key={invoice.id}><td>{invoice.companyName}</td><td>{invoice.project||"—"}</td><td>{invoice.id}</td><td>{invoice.invoiceDate}</td><td>{money(invoice.amount)}</td><td>{money(invoice.received)}</td><td>{money(invoice.amount-invoice.received)}</td><td><select className="inline-select status-inline-select" value={invoice.status} onChange={event=>void change(invoice.id,event.target.value)}><option value="pending">pending</option><option value="partial">partial</option><option value="paid">paid</option><option value="overdue">overdue</option></select></td><td><div className="row-actions"><button className="icon-button" type="button" onClick={()=>void exportPdf(invoice)} title="Export ZATCA invoice PDF"><Download size={15}/></button><Link className="icon-button" href={`${routes.editInvoice}?id=${encodeURIComponent(invoice.id)}`} title="Edit full invoice"><Edit3 size={15}/></Link></div></td></tr>):<EmptyTableRow columns={9} message="No invoices found."/>}</tbody></table></div><div className="mobile-card-list mobile-company-list">{groupedInvoices.length?groupedInvoices.map(group=><section className="mobile-company-card" key={group.company}><header><span>Company History</span><h3>{group.company}</h3><small>{group.items.length} invoice(s) · Total {money(group.total)} · Balance {money(group.total-group.received)}</small></header><div className="mobile-company-card__records">{group.items.map(invoice=><article className="mobile-record-card" key={invoice.id}><header><div><span>Invoice</span><strong>{invoice.id}</strong><small>{invoice.invoiceDate||"No date"} · {invoice.project||"No project"}</small></div><select className="inline-select mobile-status-select" value={invoice.status} onChange={event=>void change(invoice.id,event.target.value)}><option value="pending">pending</option><option value="partial">partial</option><option value="paid">paid</option><option value="overdue">overdue</option></select></header><dl><div className="mobile-field-wide"><dt>Job / Project</dt><dd>{invoice.project||"—"}</dd></div><div><dt>Date</dt><dd>{invoice.invoiceDate||"—"}</dd></div><div><dt>Amount</dt><dd>{money(invoice.amount)}</dd></div><div><dt>Received</dt><dd>{money(invoice.received)}</dd></div><div><dt>Balance</dt><dd>{money(invoice.amount-invoice.received)}</dd></div><div><dt>Quotation</dt><dd>{invoice.quotationSerialNumber||invoice.quotationNo||"—"}</dd></div></dl><footer><button className="button" type="button" onClick={()=>void exportPdf(invoice)}><Download size={14}/>PDF</button><Link className="button button--primary" href={`${routes.editInvoice}?id=${encodeURIComponent(invoice.id)}`}><Edit3 size={14}/>Edit</Link></footer></article>)}</div></section>):<div className="mobile-empty-state">No invoices found.</div>}</div></section>
    {modal?<InvoiceDocumentModal draft={draft} onClose={()=>{setModal(false);setDraft(null);}}/>:null}
  </>;
}
