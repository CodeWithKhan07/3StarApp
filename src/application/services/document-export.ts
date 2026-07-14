"use client";

import type {
    Client,
    CompanyProfile,
    Invoice,
    Quotation,
} from "@/domain/entities/business";
import QRCode from "qrcode";
import quotationStaticQr from "../../../assets/quotation-static-qr.jpeg";
import quotationLogo from "../../../assets/quotationlogo.png";

const defaultCompanyEmail = "ksajjad324@gmail.com";
const legacyCompanyEmail = "shahzaibkhan3356@gmail.com";

function companyEmail(value?: string) {
  const email = value?.trim();
  return !email || email.toLowerCase() === legacyCompanyEmail
    ? defaultCompanyEmail
    : email;
}

const escapeHtml = (value: unknown) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const amount = (value: unknown) =>
  Number(value || 0).toLocaleString("en-SA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const displayDate = (value?: string) => {
  if (!value) return "—";
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.valueOf())
    ? value
    : new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(parsed);
};

function tlvBase64(fields: Array<[number, string]>) {
  const encoder = new TextEncoder();
  const parts = fields.map(([tag, text]) => {
    const bytes = encoder.encode(text);
    if (bytes.length > 255)
      throw new Error(`ZATCA QR field ${tag} is longer than 255 bytes.`);
    return Uint8Array.from([tag, bytes.length, ...bytes]);
  });
  const size = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  let binary = "";
  for (const byte of output) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function createZatcaQrPayload(
  invoice: Invoice,
  company: CompanyProfile,
) {
  const seller =
    invoice.supplierLegalName ||
    invoice.supplierName ||
    company.legalCompanyName ||
    company.businessName;
  const vatNumber = (
    invoice.supplierVatNumber ||
    company.vatNumber ||
    ""
  ).replace(/\s/g, "");
  if (!seller.trim())
    throw new Error(
      "Add the supplier legal name before exporting the ZATCA invoice.",
    );
  if (!/^3\d{13}3$/.test(vatNumber))
    throw new Error(
      "A valid 15-digit Saudi supplier VAT number is required for the ZATCA QR code.",
    );
  const timestamp = new Date(
    `${invoice.invoiceDate || new Date().toISOString().slice(0, 10)}T12:00:00+03:00`,
  ).toISOString();
  return tlvBase64([
    [1, seller.trim()],
    [2, vatNumber],
    [3, timestamp],
    [4, Number(invoice.amount || 0).toFixed(2)],
    [5, Number(invoice.vatAmount || 0).toFixed(2)],
  ]);
}

function openPrintDocument(title: string) {
  const popup = window.open("", "_blank", "width=1100,height=850");
  if (!popup)
    throw new Error("Allow pop-ups for this app to export PDF documents.");
  popup.document.write(
    `<title>${escapeHtml(title)}</title><p style="font-family:Arial;padding:32px">Preparing document…</p>`,
  );
  return popup;
}

async function finishPrint(popup: Window, html: string) {
  popup.document.open();
  popup.document.write(html);
  popup.document.close();
  await new Promise<void>((resolve) => {
    if (popup.document.readyState === "complete") resolve();
    else popup.addEventListener("load", () => resolve(), { once: true });
  });
  const images = Array.from(popup.document.images);
  if (images.length > 0) {
    await Promise.allSettled(
      images.map((image) =>
        image.decode().catch((error) => {
          console.warn("Image decode failed:", error);
        }),
      ),
    );
  }
  popup.focus();
  popup.print();
}

const sharedCss = `
  @page{size:A4;margin:0}*{box-sizing:border-box}body{margin:0;background:#fff;color:#242424;font-family:Arial,Helvetica,sans-serif}
  .page{width:210mm;min-height:297mm;background:#fff}.logo{object-fit:contain}.muted{color:#777}.num{text-align:right}.nowrap{white-space:nowrap}
  @media print{body{print-color-adjust:exact;-webkit-print-color-adjust:exact}.page{break-after:page}}
`;

export async function exportInvoicePdf(
  invoice: Invoice,
  company: CompanyProfile,
) {
  const popup = openPrintDocument(`Invoice ${invoice.id}`);
  try {
    const payload = createZatcaQrPayload(invoice, company);
    const qr = await QRCode.toDataURL(payload, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 260,
    });
    const currency = invoice.currency || company.currency || "SAR";
    const subtotal =
      invoice.subTotal ??
      invoice.lineItems?.reduce((sum, item) => sum + item.amount, 0) ??
      0;
    const vat =
      invoice.vatAmount ??
      invoice.lineItems?.reduce(
        (sum, item) =>
          sum + (item.vatAmount ?? (item.amount * item.vatRate) / 100),
        0,
      ) ??
      0;
    const total = invoice.amount || subtotal + vat;
    const balanceDue = Math.max(0, total - Number(invoice.received || 0));
    const effectiveVatRate =
      invoice.vatRate ??
      (subtotal > 0 ? (vat / subtotal) * 100 : company.vatRate);
    const lines = invoice.lineItems?.length
      ? invoice.lineItems
      : [
          {
            id: "1",
            description: invoice.project || "",
            quantity: subtotal ? 1 : 0,
            unitCode: "",
            unitPrice: subtotal,
            amount: subtotal,
            vatRate: effectiveVatRate,
            vatAmount: vat,
          },
        ];
    const rows = lines
      .map((item, index) => {
        const lineVatRate = item.vatRate ?? effectiveVatRate;
        const lineVat = item.vatAmount ?? (item.amount * lineVatRate) / 100;

        return `<tr><td class="c-index">${index + 1}</td><td class="c-desc">${escapeHtml(item.description)}</td><td class="c-qty">${amount(item.quantity).replace(/\.00$/, "")}${item.unitCode ? ` ${escapeHtml(item.unitCode)}` : ""}</td><td class="c-rate">${amount(item.unitPrice)}</td><td class="c-taxable">${amount(item.amount)}</td><td class="c-tax-rate">${amount(lineVatRate)}</td><td class="c-tax">${amount(lineVat)}</td><td class="c-amount">${amount(item.amount)}</td></tr>`;
      })
      .join("");
    const itemRowPadding =
      lines.length > 4 ? 1.4 : lines.length > 2 ? 2.2 : 3.2;
    const supplierLegalName =
      invoice.supplierLegalName ||
      company.legalCompanyName ||
      company.businessName;
    const supplierName = invoice.supplierName || company.businessName;
    const supplierAddress =
      invoice.supplierAddress || `${company.city}, ${company.country}`;
    const supplierCr = invoice.supplierCrNumber || company.crNumber;
    const supplierVat = invoice.supplierVatNumber || company.vatNumber;
    const supplierPhone = invoice.supplierPhone || company.phone;
    const supplierEmail = companyEmail(invoice.supplierEmail || company.email);
    const notes =
      invoice.notes || invoice.remarks || "Thanks for your business.";
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Invoice ${escapeHtml(invoice.id)}</title><style>${sharedCss}
      .invoice{position:relative;min-height:297mm;height:auto;padding:11mm 11.5mm 9mm;font-size:9pt;line-height:1.25;color:#202020;overflow:visible}.top{display:grid;grid-template-columns:1fr 62mm;min-height:48mm}.logo{width:60mm;height:45mm;object-fit:contain}.title{text-align:right}.title h1{margin:0 0 7mm;color:#333;font-size:28pt;font-weight:400;line-height:1;letter-spacing:0}.title .number{display:block;font-size:7.2pt;color:#222;margin-bottom:7.5mm}.title p{margin:0 0 1.5mm;color:#222}.title strong{display:block;font-size:12pt;font-weight:700}.seller{margin-top:-6mm;margin-bottom:13mm;max-width:95mm;font-size:9pt;line-height:1.5}.seller b{display:block;font-size:10pt;font-weight:400;line-height:1.35}.parties{display:grid;grid-template-columns:1fr 65mm;gap:18mm;margin-bottom:10mm}.bill h3{font-size:10pt;font-weight:400;margin:0 0 4mm}.bill p{margin:0;font-size:9pt;line-height:1.5}.meta{display:grid;grid-template-columns:29mm 1fr;gap:3.9mm 5mm;font-size:9pt;align-content:start}.meta span{text-align:right;color:#222;font-size:10pt}.meta b{font-size:9pt;font-weight:400;text-align:right}.subject{margin:0 0 5mm;font-size:9pt}.subject b{display:block;margin-top:5mm;font-size:9pt;font-weight:400}.items{width:100%;border-collapse:collapse;table-layout:fixed;font-size:9pt}.items thead{display:table-header-group}.items tbody{break-inside:auto}.items tr{break-inside:avoid;page-break-inside:avoid}.items th{background:#262a2d;color:#fff;border-bottom:1px solid #262a2d;font-weight:400;text-align:center;padding:3.7mm 1.2mm;line-height:1.15;overflow-wrap:anywhere}.items td{border-bottom:.25mm solid #d7d7d7;padding:${itemRowPadding}mm 1.2mm;text-align:center;vertical-align:top;overflow-wrap:anywhere}.items .c-index{width:8mm}.items .c-desc{width:58mm;text-align:left}.items .c-qty{width:15mm}.items .c-rate{width:20mm}.items .c-taxable{width:24mm}.items .c-tax-rate{width:18mm}.items .c-tax{width:19mm}.items .c-amount{width:25mm}.invoice-footer{break-inside:avoid;page-break-inside:avoid}.totals{width:70mm;margin:7mm 0 0 auto;font-size:9pt;break-inside:avoid;page-break-inside:avoid}.total-line{display:grid;grid-template-columns:1fr 28mm;gap:12mm;padding:3.3mm 0;border-bottom:.25mm solid #e3e3e3}.total-line span{text-align:right}.total-line b{text-align:right;font-weight:400}.grand{font-weight:700}.grand b{font-weight:700}.invoice-lower{display:grid;grid-template-columns:1fr 70mm;gap:18mm;align-items:start;min-height:45mm;margin-top:8mm;break-inside:avoid;page-break-inside:avoid}.notes{max-width:76mm;font-size:7pt;line-height:1.28}.notes h3{margin:0 0 2mm;font-size:10pt;font-weight:400}.notes p{margin:0 0 1.8mm}.zatca{padding:0 2mm 3mm;text-align:center;color:#333;font-size:8pt}.zatca p{margin:0;line-height:1.35;overflow-wrap:normal}.qr{width:32mm;height:32mm;image-rendering:pixelated;margin:0 auto 2.5mm;display:block}@media print{.invoice{break-after:auto;min-height:297mm;height:auto;overflow:visible}}</style></head><body><main class="page invoice">
      <section class="top"><div><img class="logo" src="${quotationLogo.src}" alt="3 Stars"></div><div class="title"><h1>TAX INVOICE</h1><span class="number">#${escapeHtml(invoice.id)}</span><p>Balance Due</p><strong>${escapeHtml(currency)}${amount(balanceDue)}</strong></div></section>
      <section class="seller"><b>${escapeHtml(supplierLegalName)}</b>${supplierName && supplierName !== supplierLegalName ? `<b>${escapeHtml(supplierName)}</b>` : ""}<br>${escapeHtml(supplierAddress)}<div style="display:grid;grid-template-columns:max-content 3mm max-content;line-height:1.5"><span>CR No.</span><span>:</span><span>TRN${escapeHtml(supplierCr)}</span><span>VAT No.</span><span>:</span><span>${escapeHtml(supplierVat)}</span></div></section>
      <section class="parties"><div class="bill"><h3>Bill To</h3><p><b>${escapeHtml(invoice.companyName)}</b><br>${escapeHtml(invoice.customerAddress || "")}${invoice.customerAddress ? "<br>" : ""}${invoice.customerVatNumber ? `TRN ${escapeHtml(invoice.customerVatNumber)}` : ""}</p></div><div class="meta"><span>Invoice Date :</span><b>${displayDate(invoice.invoiceDate)}</b><span>Terms :</span><b>${escapeHtml(invoice.paymentTerms || "Due on Receipt")}</b><span>Due Date :</span><b>${displayDate(invoice.dueDate || invoice.invoiceDate)}</b><span>P.O.# :</span><b>${escapeHtml(invoice.purchaseOrderNumber || "")}</b><span>VAT No. :</span><b>${escapeHtml(invoice.customerVatNumber || "")}</b></div></section>
      <section class="subject">Subject :<b>${escapeHtml(invoice.project || invoice.companyName)}</b></section>
      <table class="items"><thead><tr><th class="c-index">#</th><th class="c-desc">Item &amp; Description</th><th class="c-qty">Qty</th><th class="c-rate">Rate</th><th class="c-taxable">Taxable<br>Amount</th><th class="c-tax-rate">Tax %</th><th class="c-tax">Tax</th><th class="c-amount">Amount</th></tr></thead><tbody>${rows}</tbody></table>
      <section class="invoice-footer"><section class="totals"><div class="total-line"><span>Sub Total</span><b>${amount(subtotal)}</b></div><div class="total-line"><span>Total Taxable Amount</span><b>${amount(subtotal)}</b></div><div class="total-line"><span>VAT (${amount(effectiveVatRate).replace(/\.00$/, "")}%)</span><b>${amount(vat)}</b></div><div class="total-line grand"><span>Total</span><b>${escapeHtml(currency)}${amount(total)}</b></div></section>
      <section class="invoice-lower"><div class="notes"><h3>Notes</h3><p>${escapeHtml(notes)}</p>${supplierName ? `<p style="font-size:8.3pt;font-weight:600;line-height:1.4;margin-bottom:1.4mm;overflow-wrap:anywhere">${escapeHtml(supplierName)}</p>` : ""}${supplierEmail ? `<p style="font-size:8.3pt;font-weight:600;line-height:1.4;margin-bottom:1.4mm;overflow-wrap:anywhere">${escapeHtml(supplierEmail)}</p>` : ""}${supplierPhone ? `<p style="font-size:8.3pt;font-weight:600;line-height:1.4;margin-bottom:1.4mm;overflow-wrap:anywhere">${escapeHtml(supplierPhone)}</p>` : ""}</div><div class="zatca"><img class="qr" src="${qr}" alt="ZATCA QR"><p>This QR code has been generated as per ZATCA's regulations.</p></div></section>
    </section></main></body></html>`;

    await finishPrint(popup, html);
  } catch (error) {
    popup.close();
    throw error;
  }
}

export async function exportQuotationPdf(
  quotation: Quotation,
  company: CompanyProfile,
) {
  const popup = openPrintDocument(`Quotation ${quotation.id}`);
  try {
    const profile = company as CompanyProfile & {
      email?: string;
      website?: string;
    };
    const quoteDate = quotation.issueDate
      ? quotation.issueDate.split("-").reverse().join("-")
      : "";
    const currency = quotation.currency || company.currency || "SAR";
    const baseRate = quotation.vatRate ?? company.vatRate;
    const subtotal =
      quotation.subTotal ??
      quotation.lineItems?.reduce((sum, item) => sum + item.amount, 0) ??
      quotation.amount / (1 + baseRate / 100);
    const vat = (subtotal * baseRate) / 100;
    const totalAmount = subtotal + vat;
    const lines = quotation.lineItems?.length
      ? quotation.lineItems
      : [
          {
            serialNo: 1,
            description: quotation.scopeOfWork || "",
            quantity: 1,
            sqm: 0,
            unitPrice: subtotal,
            amount: subtotal,
            vatRate: baseRate,
            vatAmount: vat,
          },
        ];
    const showSqm = Boolean(quotation.showSqm);
    const rows = lines
      .map((item, index) => {
        const sqmCell = showSqm
          ? `<td class="c-sqm">${amount(item.sqm ?? 0).replace(/\.00$/, "")}</td>`
          : "";
        return `<tr><td class="c-serial">${index + 1}</td><td class="c-desc">${escapeHtml(item.description)}</td><td class="c-qty">${amount(item.quantity).replace(/\.00$/, "")}</td>${sqmCell}<td class="c-price">${amount(item.unitPrice)}</td><td class="c-amount">${amount(item.amount)}</td></tr>`;
      })
      .join("");
    const sqmHeader = showSqm ? `<th class="c-sqm">SQM</th>` : "";
    const sqmTableClass = showSqm ? " items--sqm" : "";
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Quotation ${escapeHtml(quotation.id)}</title><style>${sharedCss}
      body{background:#fff}.quote-page{position:relative;width:210mm;height:297mm;padding:12.35mm 13.75mm 10mm;font-family:Arial,Helvetica,sans-serif;color:#252525;overflow:hidden}.quote{width:171.8mm;margin:0 auto}.quote-head{height:46mm;display:flex;align-items:center;justify-content:center;background:#fff}.quote-logo{width:60mm;height:45mm;object-fit:contain}.band{background:#1d1d1d;color:#fff;text-align:center}.company-band{padding:2.7mm 2mm 1.55mm;font-size:16pt;line-height:1.05;font-weight:400}.legal-band{background:#414141;color:#caa740;padding:1.55mm 2mm 1.45mm;font-size:11.5pt;line-height:1}.contact-grid{display:grid;grid-template-columns:1fr 1fr;background:#fbf4e0;border-bottom:1.55mm solid #bd961e;color:#2b2b2b;font-size:10.4pt;line-height:1}.contact-grid div{height:5.15mm;padding:1.05mm 5mm 0;border-bottom:.25mm solid #c9c9c9}.contact-grid div:nth-child(odd){text-align:left}.contact-grid div:nth-child(even){text-align:left;padding-left:14mm;padding-right:5mm}.title-band{border-bottom:1.45mm solid #bd961e;padding:3.9mm 0 3.1mm;color:#caa740;font-size:18pt;letter-spacing:8px;font-weight:400;line-height:1}.details-title{height:7mm;padding:2.15mm 0 0;font-size:10.6pt;letter-spacing:.2px;line-height:1}.details{display:grid;grid-template-columns:111.5mm 60.3mm;border-bottom:1.5mm solid #bd961e}.detail-table{border-collapse:collapse;width:100%;table-layout:fixed;font-size:10.35pt}.detail-table td{height:6.8mm;border:.3mm solid #d0d0d0;padding:0 1.7mm;text-align:center;vertical-align:middle;line-height:1.05}.detail-table td:first-child{width:34mm;background:#505050;color:#fff;text-align:center;font-size:9.4pt;line-height:1;white-space:nowrap;overflow:visible}.qrbox{display:flex;align-items:center;justify-content:center}.qr-crop{width:28.7mm;height:28.7mm;overflow:hidden;background:#fff}.qr-crop img{display:block;width:34mm;height:34.7mm;margin:-3.1mm 0 0 -2.65mm;object-fit:cover}.items{width:100%;border-collapse:collapse;table-layout:fixed;font-size:10pt}.items th{background:#232323;color:#caa740;font-weight:400;border:.3mm solid #a7a7a7;border-top:0;padding:2mm 1.2mm;line-height:1.18}.items td{border:.3mm solid #d0d0d0;padding:2.2mm 1.2mm;text-align:center;vertical-align:middle;line-height:1.32}.items tbody tr:nth-child(even){background:#fbf8ef}.items .c-serial{width:22mm}.items .c-desc{width:87mm}.items.items--sqm .c-desc{width:71mm}.items td.c-desc{text-align:center}.items .c-qty{width:14mm}.items .c-sqm{width:16mm}.items .c-price{width:21mm}.items .c-amount{width:27.8mm}.totals{display:grid;grid-template-columns:1fr 28.1mm;background:#fbf4e0;margin-left:0;font-size:10.4pt}.total-row{display:contents}.total-label,.total-value{border:.3mm solid #d0d0d0;padding:1.8mm 2mm;text-align:right}.total-value{text-align:center;background:#fff}.grand-label{background:#1d1d1d;color:#caa740;font-size:12pt}.grand-value{background:#caa740;color:#111;font-size:12pt}.footer-main{margin-top:3.5mm;padding:2.4mm 2mm;background:#1d1d1d;color:#fff;text-align:center;font-size:10.1pt}.footer-contact{display:flex;align-items:center;justify-content:center;gap:3mm;background:#fbf4e0;padding:2mm 2mm 1.8mm;font-size:8.5pt}.footer-special{padding-top:2.3mm;text-align:center;color:#555;font-size:7.6pt}.print-foot{position:absolute;left:12mm;right:12mm;bottom:8mm;display:grid;grid-template-columns:1fr 1fr 1fr;font-size:7.5pt}.print-foot span:nth-child(2){text-align:center}.print-foot span:nth-child(3){text-align:right}@media print{.quote-page{padding:12.35mm 13.75mm 10mm}.page{break-after:auto}}</style></head><body><main class="page quote-page"><section class="quote">
      <div class="quote-head"><img class="quote-logo" src="${quotationLogo.src}" alt="3 Stars"></div>
      <div class="band company-band">${escapeHtml(company.businessName || "3 Star Automatic Door & Maintenance Works")}</div>
      <div class="legal-band band">${escapeHtml(company.legalCompanyName || "")}</div>
      <div class="contact-grid"><div>CR No.: ${escapeHtml(company.crNumber)}</div><div>VAT No.: ${escapeHtml(company.vatNumber)}</div><div>City: ${escapeHtml(company.city)}, ${escapeHtml(company.country)}</div><div>WhatsApp: ${escapeHtml(company.phone)}</div></div>
      <div class="band title-band">◆ QUOTATION ◆</div>
      <div class="band details-title">QUOTATION DETAILS</div>
      <div class="details"><table class="detail-table"><tbody><tr><td>Date</td><td>${escapeHtml(quoteDate)}</td></tr><tr><td>Quotation No.</td><td>${escapeHtml(quotation.id)}</td></tr><tr><td>Company Name</td><td>${escapeHtml(quotation.companyName)}</td></tr><tr><td>Store Name</td><td>${escapeHtml(quotation.store || "")}</td></tr></tbody></table><div class="qrbox"><div class="qr-crop"><img src="${quotationStaticQr.src}" alt="Quotation QR"></div></div></div>
      <table class="items${sqmTableClass}"><thead><tr><th class="c-serial">Sr. No.</th><th class="c-desc">Description of Work / Item</th><th class="c-qty">QTY</th>${sqmHeader}<th class="c-price">Unit Price (${escapeHtml(currency)})</th><th class="c-amount">Amount (${escapeHtml(currency)})</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="totals"><div class="total-row"><div class="total-label">Sub-Total :</div><div class="total-value">${amount(subtotal)} ${escapeHtml(currency)}</div></div><div class="total-row"><div class="total-label">VAT (${amount(baseRate).replace(/\.00$/, "")}%) :</div><div class="total-value">${amount(vat)} ${escapeHtml(currency)}</div></div><div class="total-row"><div class="total-label grand-label">★TOTAL AMOUNT (Including VAT ${amount(baseRate).replace(/\.00$/, "")}%) :</div><div class="total-value grand-value">${amount(totalAmount)} ${escapeHtml(currency)}</div></div></div>
      <div class="footer-main">${escapeHtml(company.businessName || "3 Star Automatic Door & Maintenance Works")} — ${escapeHtml(company.city)}, ${escapeHtml(company.country)}</div>
      <div class="footer-contact"><span>Mobile: ${escapeHtml(company.phone)}</span><span>|</span><span>Email: ${escapeHtml(companyEmail(profile.email))}</span><span>|</span><span>${escapeHtml(profile.website || "https://3starmaintenance.base44.app/")}</span></div>
      <div class="footer-special">Specialized in: Automatic Doors · Rolling Shutters · Glass Works · Signage · Cladding · Painting · Civil Works · AMC Services</div>
    </section><footer class="print-foot"><span>${escapeHtml(company.businessName || "3 Star Automatic Door Maintenance Works")}</span><span>CONFIDENTIAL QUOTATION</span><span>Page 1 of 1</span></footer></main></body></html>`;
    await finishPrint(popup, html);
  } catch (error) {
    popup.close();
    throw error;
  }
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
    const chronological = [...invoices].sort(
      (a, b) =>
        a.invoiceDate.localeCompare(b.invoiceDate) || a.id.localeCompare(b.id),
    );
    let runningBalance = 0;
    const lines = chronological.map((invoice) => {
      const taxable =
        invoice.subTotal ??
        Math.max(0, invoice.amount - (invoice.vatAmount ?? 0));
      const tax = invoice.vatAmount ?? Math.max(0, invoice.amount - taxable);
      runningBalance += invoice.amount - invoice.received;
      const vatRate =
        invoice.vatRate ?? (taxable > 0 ? (tax / taxable) * 100 : 0);
      return { invoice, taxable, tax, vatRate, balance: runningBalance };
    });
    const totalTaxable = lines.reduce((sum, line) => sum + line.taxable, 0);
    const totalVat = lines.reduce((sum, line) => sum + line.tax, 0);
    const effectiveVatRate =
      totalTaxable > 0 ? (totalVat / totalTaxable) * 100 : 0;
    const totalAfterVat = totalTaxable + totalVat;
    const totalPayments = invoices.reduce(
      (sum, invoice) => sum + invoice.received,
      0,
    );
    const currency = invoices[0]?.currency || company.currency || "SAR";
    const period = `${startDate ? displayDate(startDate) : "Beginning"} - ${endDate ? displayDate(endDate) : "Present"}`;
    const rows = lines
      .map(
        ({ invoice, taxable, tax, vatRate, balance }, index) =>
          `<tr><td>${index + 1}</td><td>${displayDate(invoice.invoiceDate)}</td><td>${escapeHtml(invoice.quotationNo || "—")}</td><td>${escapeHtml(invoice.id)}</td><td>${escapeHtml(invoice.project || "Services")}</td><td>${displayDate(invoice.followUpDate || invoice.paymentDate || invoice.invoiceDate)}</td><td class="num">${amount(taxable)}</td><td class="num">${amount(vatRate)}%</td><td class="num">${amount(tax)}</td><td class="num">${amount(invoice.amount)}</td><td class="num">${amount(invoice.received)}</td><td class="num balance">${amount(balance)}</td></tr>`,
      )
      .join("");
    const emptyRows = Array.from(
      { length: Math.max(0, 10 - lines.length) },
      (_, index) =>
        `<tr class="empty"><td>${lines.length + index + 1}</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td class="num balance">${amount(runningBalance)}</td></tr>`,
    ).join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Statement - ${escapeHtml(customerName)}</title><style>${sharedCss}
      .statement{padding:10mm 9mm;font-size:7pt;color:#061b31}.brand{background:#0a3562;color:#fff;text-align:center;padding:2.5mm;font-size:15pt;font-weight:800}.brand-sub{background:#2e6e9f;color:#fff;text-align:center;padding:1.2mm}.heading{background:#2e6e9f;color:#fff;text-align:center;border-bottom:2mm solid #e0bd42;font-size:13pt;font-weight:800;letter-spacing:4px;padding:1.5mm}.info{display:grid;grid-template-columns:1fr 1fr;background:#edf5fb;border-bottom:1px solid #0a3562}.info>div{padding:3mm}.info h3{color:#0a3562;margin:0 0 1mm;font-size:8pt;letter-spacing:.5px}.info p{margin:.6mm 0}.details{display:grid;grid-template-columns:35mm 1fr;gap:.7mm 2mm}.details b{color:#0a3562}table{width:100%;border-collapse:collapse;table-layout:fixed}th{background:#0a3562;color:#fff;padding:1.5mm .5mm;border:1px solid #fff;font-size:5.7pt}td{height:6.5mm;padding:.8mm .5mm;border:1px solid #1c2d3d;vertical-align:middle;font-size:5.8pt}th:nth-child(1){width:4%}th:nth-child(2){width:8%}th:nth-child(3){width:9%}th:nth-child(4){width:9%}th:nth-child(5){width:15%}th:nth-child(6){width:8%}th:nth-child(7){width:9%}th:nth-child(8){width:6%}th:nth-child(9){width:8%}th:nth-child(10){width:9%}th:nth-child(11){width:7%}th:nth-child(12){width:8%}.empty td{color:#a8b2bc}.balance{background:#e9f3f9;color:#07548b;font-weight:700}.opening td{height:5mm;background:#e9f3f9}.totals td{background:#0a3562;color:#fff;font-weight:700;height:5mm}.totals td:last-child{background:#e0bd42;color:#111}.lower{display:grid;grid-template-columns:1.08fr .92fr;gap:5mm;margin-top:5mm}.payment h3,.summary h3{margin:0;background:#0a3562;color:#fff;text-align:center;padding:1.5mm;letter-spacing:.5px}.payment{line-height:1.55}.summary{border:1px solid #0a3562}.summary div{display:flex;justify-content:space-between;padding:1.2mm 2mm;border-bottom:1px solid #87a9c4}.summary .outstanding{background:#2e6e9f;color:#fff;font-weight:800}.terms{margin-top:3mm;background:#e0bd42;padding:1.5mm;font-style:italic}.footer{margin-top:3mm;background:#0a3562;color:#fff;text-align:center;padding:2mm;font-style:italic}</style></head><body><main class="page statement">
      <div class="brand">${escapeHtml(company.businessName || company.legalCompanyName)}</div><div class="brand-sub">Automatic Door Solutions & Maintenance Services · ${escapeHtml(company.country)}</div><div class="heading">ACCOUNT STATEMENT</div>
      <section class="info"><div><h3>STATEMENT TO</h3><p><b>${escapeHtml(customerName)}</b></p><p>${escapeHtml(invoices[0]?.customerAddress || client?.city || "")}</p><p>Account No: ${escapeHtml(client?.id || customerName.replace(/\W+/g, "-").toUpperCase())}</p></div><div><h3>STATEMENT DETAILS</h3><div class="details"><b>Statement Date:</b><span>${displayDate(new Date().toISOString().slice(0, 10))}</span><b>Statement Period:</b><span>${period}</span><b>Currency:</b><span>${escapeHtml(currency)} - Saudi Riyal</span></div></div></section>
      <table><thead><tr><th>#</th><th>Date</th><th>PO Number</th><th>Invoice No.</th><th>Description</th><th>Due Date</th><th>Before VAT</th><th>VAT %</th><th>Total VAT</th><th>Total After VAT</th><th>Credit</th><th>Balance</th></tr></thead><tbody><tr class="opening"><td></td><td colspan="5"><b>Opening Balance (Brought Forward)</b></td><td class="num">—</td><td class="num">—</td><td class="num">—</td><td class="num">—</td><td class="num">—</td><td class="num balance">0.00</td></tr>${rows}${emptyRows}<tr class="totals"><td colspan="6" class="num">TOTALS</td><td class="num">${amount(totalTaxable)}</td><td class="num">${amount(effectiveVatRate)}%</td><td class="num">${amount(totalVat)}</td><td class="num">${amount(totalAfterVat)}</td><td class="num">${amount(totalPayments)}</td><td class="num">${amount(runningBalance)}</td></tr></tbody></table>
      <section class="lower"><div class="payment"><h3>Payment Instructions</h3><p><b>Payable to:</b> ${escapeHtml(company.legalCompanyName || company.businessName)}<br><b>Contact:</b> ${escapeHtml(company.phone)}<br><b>CR No.:</b> ${escapeHtml(company.crNumber)}<br><b>VAT No.:</b> ${escapeHtml(company.vatNumber)}</p></div><div class="summary"><h3>ACCOUNT SUMMARY</h3><div><span>Total Before VAT:</span><b>${amount(totalTaxable)}</b></div><div><span>VAT Percentage:</span><b>${amount(effectiveVatRate)}%</b></div><div><span>Total VAT:</span><b>${amount(totalVat)}</b></div><div><span>Total After VAT:</span><b>${amount(totalAfterVat)}</b></div><div><span>Total Payments Received:</span><b>${amount(totalPayments)}</b></div><div class="outstanding"><span>Outstanding Balance:</span><b>${amount(runningBalance)}</b></div></div></section>
      <div class="terms">PAYMENT TERMS: Payment is due within the agreed invoice terms. Please reference the invoice number on all remittances.</div><div class="footer">This is a computer-generated statement. · ${escapeHtml(company.phone)} · ${escapeHtml(company.city)}, ${escapeHtml(company.country)}</div>
    </main></body></html>`;
    await finishPrint(popup, html);
  } catch (error) {
    popup.close();
    throw error;
  }
}
