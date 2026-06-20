"use client";

import quotationLogo from "../../../assets/quotationlogo.png";
import type { Client, CompanyProfile, Invoice, Quotation } from "@/domain/entities/business";
import QRCode from "qrcode";

const escapeHtml = (value: unknown) => String(value ?? "")
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;").replaceAll("'", "&#039;");

const amount = (value: unknown) => Number(value || 0).toLocaleString("en-SA", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const displayDate = (value?: string) => {
  if (!value) return "—";
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.valueOf()) ? value : new Intl.DateTimeFormat("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
  }).format(parsed);
};

function tlvBase64(fields: Array<[number, string]>) {
  const encoder = new TextEncoder();
  const parts = fields.map(([tag, text]) => {
    const bytes = encoder.encode(text);
    if (bytes.length > 255) throw new Error(`ZATCA QR field ${tag} is longer than 255 bytes.`);
    return Uint8Array.from([tag, bytes.length, ...bytes]);
  });
  const size = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) { output.set(part, offset); offset += part.length; }
  let binary = "";
  for (const byte of output) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function createZatcaQrPayload(invoice: Invoice, company: CompanyProfile) {
  const seller = invoice.supplierLegalName || invoice.supplierName || company.legalCompanyName || company.businessName;
  const vatNumber = (invoice.supplierVatNumber || company.vatNumber || "").replace(/\s/g, "");
  if (!seller.trim()) throw new Error("Add the supplier legal name before exporting the ZATCA invoice.");
  if (!/^3\d{13}3$/.test(vatNumber)) throw new Error("A valid 15-digit Saudi supplier VAT number is required for the ZATCA QR code.");
  const timestamp = new Date(`${invoice.invoiceDate || new Date().toISOString().slice(0, 10)}T12:00:00+03:00`).toISOString();
  return tlvBase64([
    [1, seller.trim()], [2, vatNumber], [3, timestamp],
    [4, Number(invoice.amount || 0).toFixed(2)], [5, Number(invoice.vatAmount || 0).toFixed(2)],
  ]);
}

function openPrintDocument(title: string) {
  const popup = window.open("", "_blank", "width=1100,height=850");
  if (!popup) throw new Error("Allow pop-ups for this app to export PDF documents.");
  popup.document.write(`<title>${escapeHtml(title)}</title><p style="font-family:Arial;padding:32px">Preparing document…</p>`);
  return popup;
}

async function finishPrint(popup: Window, html: string) {
  popup.document.open(); popup.document.write(html); popup.document.close();
  await new Promise<void>((resolve) => {
    if (popup.document.readyState === "complete") resolve();
    else popup.addEventListener("load", () => resolve(), { once: true });
  });
  await Promise.all(Array.from(popup.document.images).map((image) => image.decode().catch(() => undefined)));
  popup.focus(); popup.print();
}

const sharedCss = `
  @page{size:A4;margin:0}*{box-sizing:border-box}body{margin:0;background:#fff;color:#242424;font-family:Arial,Helvetica,sans-serif}
  .page{width:210mm;min-height:297mm;background:#fff}.logo{object-fit:contain}.muted{color:#777}.num{text-align:right}.nowrap{white-space:nowrap}
  @media print{body{print-color-adjust:exact;-webkit-print-color-adjust:exact}.page{break-after:page}}
`;

export async function exportInvoicePdf(invoice: Invoice, company: CompanyProfile) {
  const popup = openPrintDocument(`Invoice ${invoice.id}`);
  try {
    const payload = createZatcaQrPayload(invoice, company);
    const qr = await QRCode.toDataURL(payload, { errorCorrectionLevel: "M", margin: 1, width: 260 });
    const currency = invoice.currency || company.currency || "SAR";
    const subtotal = invoice.subTotal ?? invoice.lineItems?.reduce((sum, item) => sum + item.amount, 0) ?? 0;
    const vat = invoice.vatAmount ?? invoice.lineItems?.reduce((sum, item) => sum + (item.vatAmount ?? item.amount * item.vatRate / 100), 0) ?? 0;
    const lines = invoice.lineItems?.length ? invoice.lineItems : [{ id: "1", description: invoice.project || "Professional services", quantity: 1, unitCode: "EA", unitPrice: subtotal, amount: subtotal, vatRate: invoice.vatRate ?? company.vatRate, vatAmount: vat }];
    const rows = lines.map((item, index) => `<tr><td>${index + 1}</td><td><strong>${escapeHtml(item.description)}</strong></td><td class="num">${amount(item.quantity)}</td><td class="num">${amount(item.unitPrice)}</td><td class="num">${amount(item.amount)}</td><td class="num">${amount(item.vatRate)}%</td><td class="num">${amount(item.vatAmount ?? item.amount * item.vatRate / 100)}</td><td class="num">${amount(item.amount + (item.vatAmount ?? item.amount * item.vatRate / 100))}</td></tr>`).join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Invoice ${escapeHtml(invoice.id)}</title><style>${sharedCss}
      .invoice{padding:17mm 16mm 13mm;font-size:10.5pt}.top{display:flex;justify-content:space-between;min-height:43mm}.logo{width:25mm;height:25mm}.title{text-align:right}.title h1{font-size:30pt;font-weight:400;letter-spacing:1px;margin:0 0 7mm}.title strong{font-size:16pt}.seller{font-size:10pt;line-height:1.55;margin-bottom:14mm}.seller b{font-size:12pt}.parties{display:grid;grid-template-columns:1.15fr .85fr;gap:18mm;margin-bottom:10mm}.bill{line-height:1.5}.bill h3{font-weight:400;margin:0 0 4mm}.meta{display:grid;grid-template-columns:1fr 1.1fr;gap:2mm 5mm;align-content:start}.meta span:nth-child(odd){text-align:right;color:#777}.subject{margin:9mm 0 4mm}.subject b{display:block;margin-top:3mm}table{width:100%;border-collapse:collapse;font-size:8.6pt}thead{background:#292d30;color:white}th{font-weight:400;text-align:left;padding:4mm 2mm}td{padding:4mm 2mm;border-bottom:1px solid #ddd;vertical-align:top}.summary{display:grid;grid-template-columns:1fr 1fr;gap:18mm;margin-top:6mm}.qrrow{display:flex;align-items:flex-start;gap:4mm;color:#777;font-size:8.5pt}.qr{width:31mm;height:31mm;image-rendering:pixelated}.totals div{display:flex;justify-content:space-between;padding:3mm 4mm}.totals .grand{background:#eee;font-size:14pt;font-weight:700;padding:5mm 4mm;margin-top:2mm}.notes{margin-top:13mm;line-height:1.45}.powered{margin-top:2mm;color:#777;font-size:8pt}.powered b{color:#c69216}</style></head><body><main class="page invoice">
      <section class="top"><img class="logo" src="${quotationLogo.src}" alt="3 Stars"><div class="title"><h1>TAX INVOICE</h1><b>#${escapeHtml(invoice.id)}</b><p>Balance Due</p><strong>${escapeHtml(currency)} ${amount(invoice.amount - invoice.received)}</strong></div></section>
      <section class="seller"><b>${escapeHtml(invoice.supplierLegalName || company.legalCompanyName || company.businessName)}</b><br>${escapeHtml(invoice.supplierAddress || `${company.city}, ${company.country}`)}<br>CR ${escapeHtml(invoice.supplierCrNumber || company.crNumber)} &nbsp; VAT ${escapeHtml(invoice.supplierVatNumber || company.vatNumber)}</section>
      <section class="parties"><div class="bill"><h3>Bill To</h3><b>${escapeHtml(invoice.companyName)}</b><br><span class="muted">${escapeHtml(invoice.customerAddress)}<br>VAT ${escapeHtml(invoice.customerVatNumber || "—")}</span></div><div class="meta"><span>Invoice Date :</span><b>${displayDate(invoice.invoiceDate)}</b><span>Terms :</span><b>Due on Receipt</b><span>Quotation :</span><b>${escapeHtml(invoice.quotationNo || "—")}</b><span>UUID :</span><b>${escapeHtml(invoice.uuid || "—")}</b></div></section>
      <div class="subject">Subject :<b>${escapeHtml(invoice.project || invoice.companyName)}</b></div>
      <table><thead><tr><th>#</th><th>Item & Description</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Taxable</th><th class="num">VAT %</th><th class="num">VAT</th><th class="num">Total</th></tr></thead><tbody>${rows}</tbody></table>
      <section class="summary"><div class="qrrow"><img class="qr" src="${qr}" alt="ZATCA QR"><p>Scan with a ZATCA-compatible application.<br><br>TLV invoice data: seller, VAT number, timestamp, total and VAT.</p></div><div class="totals"><div><span>Sub Total</span><b>${amount(subtotal)}</b></div><div><span>VAT</span><b>${amount(vat)}</b></div><div class="grand"><span>Total</span><span>${escapeHtml(currency)} ${amount(invoice.amount)}</span></div></div></section>
      <section class="notes"><span class="muted">Notes</span><p>${escapeHtml(invoice.remarks || "Thanks for your business.")}</p><div class="powered">POWERED BY <b>3Star Suite</b></div></section>
    </main></body></html>`;
    await finishPrint(popup, html);
  } catch (error) { popup.close(); throw error; }
}

export async function exportQuotationPdf(quotation: Quotation, company: CompanyProfile) {
  const popup = openPrintDocument(`Quotation ${quotation.id}`);
  try {
    const currency = quotation.currency || company.currency || "SAR";
    const baseRate = quotation.vatRate ?? company.vatRate;
    const subtotal = quotation.subTotal ?? quotation.lineItems?.reduce((sum, item) => sum + item.amount, 0) ?? quotation.amount / (1 + baseRate / 100);
    const vat = quotation.vatAmount ?? quotation.lineItems?.reduce((sum, item) => sum + (item.vatAmount ?? item.amount * item.vatRate / 100), 0) ?? quotation.amount - subtotal;
    const lines = quotation.lineItems?.length ? quotation.lineItems : [{ serialNo: 1, description: quotation.scopeOfWork, quantity: 1, unitPrice: subtotal, amount: subtotal, vatRate: baseRate, vatAmount: vat }];
    const rows = lines.map((item, index) => { const itemVat = item.vatAmount ?? item.amount * item.vatRate / 100; return `<tr><td>${index + 1}</td><td>${escapeHtml(item.description)}</td><td class="num">${amount(item.quantity)}</td><td class="num">${amount(item.unitPrice)}</td><td class="num">${amount(item.vatRate)}%</td><td class="num">${amount(itemVat)}</td><td class="num">${amount(item.amount + itemVat)}</td></tr>`; }).join("");
    const infoQr = await QRCode.toDataURL(`Quotation ${quotation.id}\n${company.businessName}\n${company.phone}\n${quotation.companyName}\n${currency} ${amount(quotation.amount)}`, { margin: 1, width: 220 });
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Quotation ${escapeHtml(quotation.id)}</title><style>${sharedCss}
      .quote-position{padding:18mm 0 0 18mm}.quote{width:115mm;border-top:2mm solid #c59819;font-size:6.5pt}.head{height:24mm;display:grid;place-items:center;background:linear-gradient(90deg,#eee 14%,#fff 14% 84%,#eee 84%)}.logo{width:25mm;height:22mm}.black{background:#1e1e1e;color:#fff;text-align:center}.company{font-size:8pt;font-weight:700;padding:3mm}.goldline{border-bottom:1.2mm solid #c59819}.contact{display:grid;grid-template-columns:1fr 1fr;background:#fbf8ef}.contact div{padding:1.6mm;border-right:1px solid #999}.banner{padding:4mm;color:#d1a51d;font-size:15pt;font-weight:700;letter-spacing:5px}.details-title{padding:1.2mm}.details{display:grid;grid-template-columns:63% 37%;border-bottom:1mm solid #c59819}.details table td{padding:1.6mm;border:1px solid #aaa}.details table td:first-child{width:28%;background:#4a4a4a;color:#fff;text-align:center;font-weight:700}.details .qrbox{display:grid;place-items:center}.qr{width:24mm;height:24mm}.items{font-size:6.2pt}.items th{padding:2mm 1mm;color:#d1a51d}.items td{padding:2mm 1mm}.items tbody tr:nth-child(even){background:#f7f2e7}.totals{margin-left:auto;width:58%;font-size:7pt}.totals div{display:flex;justify-content:space-between;padding:1.4mm}.grand{background:#1e1e1e;color:#d1a51d;font-weight:700;font-size:8pt}.grand b{background:#d1a51d;color:#111;margin:-1.4mm;padding:1.4mm 2mm}.terms{margin-top:1mm}.terms h3{margin:0;padding:2mm;text-align:left;color:#d1a51d}.terms p{font-size:5pt;line-height:1.5;padding:0 3mm}.footer{padding:3mm 2mm;margin-top:2mm;font-size:5pt}</style></head><body><main class="page quote-position"><section class="quote">
      <div class="head"><img class="logo" src="${quotationLogo.src}" alt="3 Stars"></div><div class="black company">${escapeHtml(company.businessName || company.legalCompanyName)}</div><div class="black goldline">Automatic Door & Maintenance Works</div>
      <div class="contact goldline"><div><b>CR No.:</b> ${escapeHtml(company.crNumber)}</div><div><b>VAT No.:</b> ${escapeHtml(company.vatNumber)}</div><div><b>City:</b> ${escapeHtml(company.city)}, ${escapeHtml(company.country)}</div><div><b>WhatsApp:</b> ${escapeHtml(company.phone)}</div></div>
      <div class="black banner goldline">◆ QUOTATION ◆</div><div class="black details-title">QUOTATION DETAILS</div><div class="details"><table><tbody><tr><td>Date</td><td>${displayDate(quotation.issueDate)}</td></tr><tr><td>Quotation No.</td><td>${escapeHtml(quotation.id)}</td></tr><tr><td>Client Name</td><td>${escapeHtml(quotation.companyName)}</td></tr><tr><td>Client VAT</td><td>${escapeHtml(quotation.customerVatNumber || "—")}</td></tr><tr><td>Store Name</td><td>${escapeHtml(quotation.store || "—")}</td></tr></tbody></table><div class="qrbox"><img class="qr" src="${infoQr}" alt="Quotation QR"></div></div>
      <table class="items"><thead class="black"><tr><th>#</th><th>Description of Work / Item</th><th>Qty</th><th>Unit Price</th><th>VAT %</th><th>VAT</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="totals"><div><b>Sub-Total:</b><span>${amount(subtotal)} ${escapeHtml(currency)}</span></div><div><b>VAT:</b><span>${amount(vat)} ${escapeHtml(currency)}</span></div><div class="grand"><span>★ TOTAL AMOUNT (Including VAT)</span><b>${amount(quotation.amount)} ${escapeHtml(currency)}</b></div></div>
      <div class="terms"><h3 class="black">▣ TERMS & CONDITIONS</h3><p>${escapeHtml(quotation.termsAndConditions || "This quotation is valid until the stated validity date. Prices include VAT where shown. Work will commence upon receipt of written purchase order.").replaceAll("\n", "<br>")}</p></div><div class="black footer">${escapeHtml(company.businessName)} — ${escapeHtml(company.city)}, ${escapeHtml(company.country)} &nbsp; | &nbsp; ${escapeHtml(company.phone)}</div>
    </section></main></body></html>`;
    await finishPrint(popup, html);
  } catch (error) { popup.close(); throw error; }
}

export async function exportStatementPdf({
  customerName,
  client,
  invoices,
  company,
  startDate,
  endDate,
}: {
  customerName: string;
  client?: Client;
  invoices: Invoice[];
  company: CompanyProfile;
  startDate?: string;
  endDate?: string;
}) {
  const popup = openPrintDocument(`Statement - ${customerName}`);
  try {
    const chronological = [...invoices].sort((a, b) => a.invoiceDate.localeCompare(b.invoiceDate) || a.id.localeCompare(b.id));
    let runningBalance = 0;
    const lines = chronological.map((invoice) => {
      const taxable = invoice.subTotal ?? Math.max(0, invoice.amount - (invoice.vatAmount ?? 0));
      const tax = invoice.vatAmount ?? Math.max(0, invoice.amount - taxable);
      runningBalance += invoice.amount - invoice.received;
      const vatRate = invoice.vatRate ?? (taxable > 0 ? tax / taxable * 100 : 0);
      return { invoice, taxable, tax, vatRate, balance: runningBalance };
    });
    const totalTaxable = lines.reduce((sum, line) => sum + line.taxable, 0);
    const totalVat = lines.reduce((sum, line) => sum + line.tax, 0);
    const effectiveVatRate = totalTaxable > 0 ? totalVat / totalTaxable * 100 : 0;
    const totalAfterVat = totalTaxable + totalVat;
    const totalPayments = invoices.reduce((sum, invoice) => sum + invoice.received, 0);
    const currency = invoices[0]?.currency || company.currency || "SAR";
    const period = `${startDate ? displayDate(startDate) : "Beginning"} - ${endDate ? displayDate(endDate) : "Present"}`;
    const rows = lines.map(({ invoice, taxable, tax, vatRate, balance }, index) => `<tr><td>${index + 1}</td><td>${displayDate(invoice.invoiceDate)}</td><td>${escapeHtml(invoice.quotationNo || "—")}</td><td>${escapeHtml(invoice.id)}</td><td>${escapeHtml(invoice.project || "Services")}</td><td>${displayDate(invoice.followUpDate || invoice.paymentDate || invoice.invoiceDate)}</td><td class="num">${amount(taxable)}</td><td class="num">${amount(vatRate)}%</td><td class="num">${amount(tax)}</td><td class="num">${amount(invoice.amount)}</td><td class="num">${amount(invoice.received)}</td><td class="num balance">${amount(balance)}</td></tr>`).join("");
    const emptyRows = Array.from({ length: Math.max(0, 10 - lines.length) }, (_, index) => `<tr class="empty"><td>${lines.length + index + 1}</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td class="num balance">${amount(runningBalance)}</td></tr>`).join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Statement - ${escapeHtml(customerName)}</title><style>${sharedCss}
      .statement{padding:10mm 9mm;font-size:7pt;color:#061b31}.brand{background:#0a3562;color:#fff;text-align:center;padding:2.5mm;font-size:15pt;font-weight:800}.brand-sub{background:#2e6e9f;color:#fff;text-align:center;padding:1.2mm}.heading{background:#2e6e9f;color:#fff;text-align:center;border-bottom:2mm solid #e0bd42;font-size:13pt;font-weight:800;letter-spacing:4px;padding:1.5mm}.info{display:grid;grid-template-columns:1fr 1fr;background:#edf5fb;border-bottom:1px solid #0a3562}.info>div{padding:3mm}.info h3{color:#0a3562;margin:0 0 1mm;font-size:8pt;letter-spacing:.5px}.info p{margin:.6mm 0}.details{display:grid;grid-template-columns:35mm 1fr;gap:.7mm 2mm}.details b{color:#0a3562}table{width:100%;border-collapse:collapse;table-layout:fixed}th{background:#0a3562;color:#fff;padding:1.5mm .5mm;border:1px solid #fff;font-size:5.7pt}td{height:6.5mm;padding:.8mm .5mm;border:1px solid #1c2d3d;vertical-align:middle;font-size:5.8pt}th:nth-child(1){width:4%}th:nth-child(2){width:8%}th:nth-child(3){width:9%}th:nth-child(4){width:9%}th:nth-child(5){width:15%}th:nth-child(6){width:8%}th:nth-child(7){width:9%}th:nth-child(8){width:6%}th:nth-child(9){width:8%}th:nth-child(10){width:9%}th:nth-child(11){width:7%}th:nth-child(12){width:8%}.empty td{color:#a8b2bc}.balance{background:#e9f3f9;color:#07548b;font-weight:700}.opening td{height:5mm;background:#e9f3f9}.totals td{background:#0a3562;color:#fff;font-weight:700;height:5mm}.totals td:last-child{background:#e0bd42;color:#111}.lower{display:grid;grid-template-columns:1.08fr .92fr;gap:5mm;margin-top:5mm}.payment h3,.summary h3{margin:0;background:#0a3562;color:#fff;text-align:center;padding:1.5mm;letter-spacing:.5px}.payment{line-height:1.55}.summary{border:1px solid #0a3562}.summary div{display:flex;justify-content:space-between;padding:1.2mm 2mm;border-bottom:1px solid #87a9c4}.summary .outstanding{background:#2e6e9f;color:#fff;font-weight:800}.terms{margin-top:3mm;background:#e0bd42;padding:1.5mm;font-style:italic}.footer{margin-top:3mm;background:#0a3562;color:#fff;text-align:center;padding:2mm;font-style:italic}</style></head><body><main class="page statement">
      <div class="brand">${escapeHtml(company.businessName || company.legalCompanyName)}</div><div class="brand-sub">Automatic Door Solutions & Maintenance Services · ${escapeHtml(company.country)}</div><div class="heading">ACCOUNT STATEMENT</div>
      <section class="info"><div><h3>STATEMENT TO</h3><p><b>${escapeHtml(customerName)}</b></p><p>${escapeHtml(invoices[0]?.customerAddress || client?.city || "")}</p><p>Account No: ${escapeHtml(client?.id || customerName.replace(/\W+/g, "-").toUpperCase())}</p></div><div><h3>STATEMENT DETAILS</h3><div class="details"><b>Statement Date:</b><span>${displayDate(new Date().toISOString().slice(0, 10))}</span><b>Statement Period:</b><span>${period}</span><b>Currency:</b><span>${escapeHtml(currency)} - Saudi Riyal</span></div></div></section>
      <table><thead><tr><th>#</th><th>Date</th><th>PO Number</th><th>Invoice No.</th><th>Description</th><th>Due Date</th><th>Before VAT</th><th>VAT %</th><th>Total VAT</th><th>Total After VAT</th><th>Credit</th><th>Balance</th></tr></thead><tbody><tr class="opening"><td></td><td colspan="5"><b>Opening Balance (Brought Forward)</b></td><td class="num">—</td><td class="num">—</td><td class="num">—</td><td class="num">—</td><td class="num">—</td><td class="num balance">0.00</td></tr>${rows}${emptyRows}<tr class="totals"><td colspan="6" class="num">TOTALS</td><td class="num">${amount(totalTaxable)}</td><td class="num">${amount(effectiveVatRate)}%</td><td class="num">${amount(totalVat)}</td><td class="num">${amount(totalAfterVat)}</td><td class="num">${amount(totalPayments)}</td><td class="num">${amount(runningBalance)}</td></tr></tbody></table>
      <section class="lower"><div class="payment"><h3>Payment Instructions</h3><p><b>Payable to:</b> ${escapeHtml(company.legalCompanyName || company.businessName)}<br><b>Contact:</b> ${escapeHtml(company.phone)}<br><b>CR No.:</b> ${escapeHtml(company.crNumber)}<br><b>VAT No.:</b> ${escapeHtml(company.vatNumber)}</p></div><div class="summary"><h3>ACCOUNT SUMMARY</h3><div><span>Total Before VAT:</span><b>${amount(totalTaxable)}</b></div><div><span>VAT Percentage:</span><b>${amount(effectiveVatRate)}%</b></div><div><span>Total VAT:</span><b>${amount(totalVat)}</b></div><div><span>Total After VAT:</span><b>${amount(totalAfterVat)}</b></div><div><span>Total Payments Received:</span><b>${amount(totalPayments)}</b></div><div class="outstanding"><span>Outstanding Balance:</span><b>${amount(runningBalance)}</b></div></div></section>
      <div class="terms">PAYMENT TERMS: Payment is due within the agreed invoice terms. Please reference the invoice number on all remittances.</div><div class="footer">This is a computer-generated statement. · ${escapeHtml(company.phone)} · ${escapeHtml(company.city)}, ${escapeHtml(company.country)}</div>
    </main></body></html>`;
    await finishPrint(popup, html);
  } catch (error) { popup.close(); throw error; }
}
