"use client";

import { parseInvoiceDocument, type InvoiceImportDraft } from "@/application/services/invoice-import";
import { exportInvoicePdf } from "@/application/services/document-export";
import type { Invoice } from "@/domain/entities/business";
import { downloadLocalInvoiceAttachment, saveLocalInvoiceAttachment } from "@/infrastructure/local/invoice-attachment";
import { routes } from "@/lib/routes";
import { PageHeader, StatusBadge } from "@/presentation/components/ui";
import { money } from "@/presentation/data/sample-data";
import { useBusinessData } from "@/presentation/providers/business-data-provider";
import { ArrowLeft, Download, Edit3, ExternalLink, FileUp, LoaderCircle, Save } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";

const value = (form: FormData, key: string) => String(form.get(key) || "").trim();
const number = (form: FormData, key: string) => Number(form.get(key) || 0) || 0;

export function QuotationInvoiceScreen() {
  const serial = useSearchParams().get("serial") || "";
  const { data, createRecord } = useBusinessData();
  const quotation = data.quotations.find((item) => item.serialNumber === serial || item.id === serial);
  const invoice = quotation ? data.invoices.find((item) =>
    item.quotationSerialNumber === quotation.serialNumber ||
    (!item.quotationSerialNumber && item.quotationNo === quotation.id)
  ) : undefined;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [draft, setDraft] = useState<InvoiceImportDraft | null>(null);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  if (!quotation) return <section className="card empty-state"><h2>Quotation not found</h2><p>The serial number is missing or no longer exists.</p><Link className="button" href={routes.quotations}>Back to Quotations</Link></section>;

  async function readFile(selected?: File) {
    if (!selected) return;
    setReading(true); setError("");
    try { setDraft(await parseInvoiceDocument(selected)); setFile(selected); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Invoice could not be read."); }
    finally { setReading(false); }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || !draft) return setError("Upload and review an invoice file before saving.");
    if (data.invoices.some((item) =>
      item.quotationSerialNumber === quotation!.serialNumber ||
      (!item.quotationSerialNumber && item.quotationNo === quotation!.id)
    )) return setError("This quotation already has an invoice. Refresh the page to view or edit it.");
    const form = new FormData(event.currentTarget);
    setSaving(true); setError("");
    try {
      const invoiceId = value(form,"id") || `INV-${String(data.invoices.length + 1).padStart(5,"0")}`;
      const localAttachmentKey = `${quotation!.serialNumber}:${invoiceId}`;
      await saveLocalInvoiceAttachment(localAttachmentKey, file);
      const record: Invoice = {
        id: invoiceId,
        companyName: value(form,"companyName") || quotation!.companyName,
        project: value(form,"project") || quotation!.store || quotation!.companyName,
        quotationNo: quotation!.id,
        quotationSerialNumber: quotation!.serialNumber,
        invoiceDate: value(form,"invoiceDate"), amount:number(form,"amount"), received:number(form,"received"),
        status:"pending", remarks:value(form,"remarks"), uuid:value(form,"uuid"), customerAddress:draft.customerAddress,
        customerVatNumber:value(form,"customerVatNumber"), supplierName:draft.supplierName, supplierLegalName:draft.supplierLegalName,
        supplierAddress:draft.supplierAddress, supplierCrNumber:value(form,"supplierCrNumber"), supplierVatNumber:value(form,"supplierVatNumber"),
        currency:value(form,"currency")||"SAR", subTotal:number(form,"subTotal"), vatRate:number(form,"vatRate"), vatAmount:number(form,"vatAmount"),
        discountAmount:draft.discountAmount, lineItems:draft.lineItems, attachmentName:file.name, attachmentType:file.type,
        attachmentSize:file.size, attachmentPath:`local:${localAttachmentKey}`, localAttachmentKey,
      };
      await createRecord("invoices", record);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Invoice attachment could not be saved."); }
    finally { setSaving(false); }
  }

  async function exportLinkedInvoice() {
    if (!invoice) return;
    setError("");
    try { await exportInvoicePdf(invoice, data.company); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Invoice export failed."); }
  }

  return <><PageHeader title={invoice ? "Quotation Invoice" : "Add Invoice to Quotation"} description={`${quotation.id} · Serial ${quotation.serialNumber}`} actions={<Link className="button" href={routes.quotations}><ArrowLeft size={14}/>Back to Quotations</Link>}/>
    <section className="card linked-record-banner"><div><span>Quotation</span><strong>{quotation.companyName}</strong><p>{quotation.scopeOfWork}</p></div><div><span>Amount</span><strong>{money(quotation.amount)}</strong><StatusBadge value={quotation.status}/></div></section>
    {invoice ? <section className="card form-section"><header><div><h2>Attached Invoice</h2><p>This quotation already has one linked invoice.</p></div><StatusBadge value={invoice.status}/></header><div className="record-detail-grid"><div><span>Invoice No.</span><strong>{invoice.id}</strong></div><div><span>Date</span><strong>{invoice.invoiceDate||"—"}</strong></div><div><span>Total</span><strong>{money(invoice.amount)}</strong></div><div><span>Attachment</span><strong>{invoice.attachmentName||"Imported invoice"}</strong></div></div><div className="form-actions"><button className="button" type="button" onClick={()=>void exportLinkedInvoice()}><Download size={14}/>Export ZATCA PDF</button>{invoice.attachmentUrl?<a className="button" href={invoice.attachmentUrl} target="_blank" rel="noreferrer"><ExternalLink size={14}/>View Attachment</a>:invoice.localAttachmentKey?<button className="button" type="button" onClick={()=>void downloadLocalInvoiceAttachment(invoice.localAttachmentKey!).catch(caught=>setError(caught instanceof Error?caught.message:"Attachment unavailable."))}><Download size={14}/>Download Attachment</button>:null}<Link className="button button--primary" href={`${routes.editInvoice}?id=${encodeURIComponent(invoice.id)}`}><Edit3 size={14}/>Edit Invoice</Link></div></section>:
    <><section className="card import-panel import-panel--hero"><div className="import-panel__content"><h2>Upload relative invoice</h2><p>Upload the PDF or Excel invoice belonging to quotation {quotation.id}. It will be parsed, reviewed, attached, and linked by serial number.</p></div><button className="drop-zone" type="button" onClick={()=>inputRef.current?.click()}>{reading?<LoaderCircle className="spin" size={36}/>:<FileUp size={36}/>}<strong>{reading?"Reading invoice...":file?.name||"Choose invoice PDF or Excel"}</strong></button></section><input ref={inputRef} className="file-input" type="file" accept=".pdf,.xlsx,.xls,.xlsm,.xlsb,.ods,.csv" onChange={event=>{const selected=event.target.files?.[0];event.target.value="";void readFile(selected);}}/>
      {draft?<form className="record-form" onSubmit={save}><section className="card form-section"><header><h2>Review Invoice Details</h2><p>Confirm the parsed values before attaching the invoice.</p></header><div className="form-grid"><label className="field"><span>Invoice No.</span><input name="id" defaultValue={draft.id}/></label><label className="field"><span>Invoice Date</span><input name="invoiceDate" type="date" defaultValue={draft.invoiceDate}/></label><label className="field"><span>Customer</span><input name="companyName" defaultValue={draft.companyName||quotation.companyName}/></label><label className="field"><span>Project</span><input name="project" defaultValue={draft.project||quotation.store}/></label><label className="field"><span>ZATCA UUID</span><input name="uuid" defaultValue={draft.uuid}/></label><label className="field"><span>Customer VAT</span><input name="customerVatNumber" defaultValue={draft.customerVatNumber}/></label><label className="field"><span>Supplier CR</span><input name="supplierCrNumber" defaultValue={draft.supplierCrNumber||data.company.crNumber}/></label><label className="field"><span>Supplier VAT</span><input name="supplierVatNumber" defaultValue={draft.supplierVatNumber||data.company.vatNumber}/></label><label className="field"><span>Currency</span><input name="currency" defaultValue={draft.currency||"SAR"}/></label><label className="field"><span>Subtotal</span><input name="subTotal" type="number" step="0.01" defaultValue={draft.subTotal}/></label><label className="field"><span>VAT Rate %</span><input name="vatRate" type="number" step="0.01" defaultValue={draft.vatRate}/></label><label className="field"><span>VAT Amount</span><input name="vatAmount" type="number" step="0.01" defaultValue={draft.vatAmount}/></label><label className="field"><span>Total Amount</span><input name="amount" type="number" step="0.01" defaultValue={draft.amount}/></label><label className="field"><span>Amount Received</span><input name="received" type="number" step="0.01" defaultValue={0}/></label><label className="field field--full"><span>Remarks</span><textarea name="remarks" defaultValue={draft.remarks}/></label></div></section><div className="form-actions"><button className="button button--primary" disabled={saving}><Save size={14}/>{saving?"Uploading...":"Attach & Save Invoice"}</button></div></form>:null}</>}
    {error?<div className="form-message form-message--error">{error}</div>:null}
  </>;
}
