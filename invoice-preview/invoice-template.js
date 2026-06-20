/*
 * Shared renderer for the TAX INVOICE design.
 * This is a faithful HTML/CSS reproduction of the PDF layout used by
 * Layla Maqbula Musa Hakami General Contracting Establishment.
 *
 * Feed it a plain data object (see the two preview HTML files) and it
 * renders the document. This same renderer is what the app would call
 * when exporting a quotation/invoice to the branded design.
 */

(function (global) {
  "use strict";

  function fmt(n) {
    return Number(n || 0).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  /* Deterministic QR-style placeholder so the layout matches the original.
     Replace with a real ZATCA TLV base64 QR when wiring into the app. */
  function qrSvg(seed) {
    var size = 25;
    var cell = 5;
    var s = 0;
    seed = String(seed || "3STAR");
    for (var i = 0; i < seed.length; i++) s = (s * 31 + seed.charCodeAt(i)) >>> 0;
    function rnd() {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      return s / 0x7fffffff;
    }
    function isFinder(x, y) {
      function box(ox, oy) {
        var dx = x - ox, dy = y - oy;
        if (dx < 0 || dy < 0 || dx > 6 || dy > 6) return null;
        var ring = dx === 0 || dy === 0 || dx === 6 || dy === 6;
        var core = dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4;
        return ring || core;
      }
      var a = box(0, 0), b = box(size - 7, 0), c = box(0, size - 7);
      if (a !== null) return a;
      if (b !== null) return b;
      if (c !== null) return c;
      return undefined;
    }
    var rects = [];
    for (var y = 0; y < size; y++) {
      for (var x = 0; x < size; x++) {
        var f = isFinder(x, y);
        var on = f === undefined ? rnd() > 0.55 : f;
        if (on) rects.push('<rect x="' + x * cell + '" y="' + y * cell + '" width="' + cell + '" height="' + cell + '"/>');
      }
    }
    var dim = size * cell;
    return (
      '<svg xmlns="http://www.w3.org/2000/svg" width="' + dim + '" height="' + dim +
      '" viewBox="0 0 ' + dim + " " + dim + '" shape-rendering="crispEdges">' +
      '<rect width="' + dim + '" height="' + dim + '" fill="#fff"/>' +
      '<g fill="#000">' + rects.join("") + "</g></svg>"
    );
  }

  /* Supplied production logo used by invoice exports. */
  function logoSvg() {
    return '<img src="../assets/invoicelogo.png" alt="3 Star" />';
  }

  function render(d) {
    var hasTaxableRow = !!d.showTotalTaxableAmount;
    var rows = (d.lineItems || [])
      .map(function (it, idx) {
        return (
          '<tr>' +
          '<td class="c-num">' + (idx + 1) + "</td>" +
          '<td class="c-desc">' + esc(it.description) + "</td>" +
          '<td class="c-r">' + fmt(it.qty) + "</td>" +
          '<td class="c-r">' + fmt(it.rate) + "</td>" +
          '<td class="c-r">' + fmt(it.taxable) + "</td>" +
          '<td class="c-r">' + fmt(it.taxRate) + "</td>" +
          '<td class="c-r">' + fmt(it.tax) + "</td>" +
          '<td class="c-r">' + fmt(it.amount) + "</td>" +
          "</tr>"
        );
      })
      .join("");

    var headerRight = d.balanceDue != null
      ? '<div class="doc-no doc-no--bold">#' + esc(d.invoiceNo) + "</div>" +
        '<div class="balance-label">Balance Due</div>' +
        '<div class="balance-amount">' + esc(d.currency) + fmt(d.balanceDue) + "</div>"
      : '<div class="doc-no"># ' + esc(d.invoiceNo) + "</div>";

    var metaRows = [
      ["Invoice Date :", d.invoiceDate],
      ["Terms :", d.terms],
      ["Due Date :", d.dueDate],
      ["P.O.# :", d.poNumber],
      ["VAT No. :", d.customerVat],
    ]
      .map(function (r) {
        return '<div class="meta-row"><span class="meta-label">' + esc(r[0]) +
          '</span><span class="meta-value">' + esc(r[1]) + "</span></div>";
      })
      .join("");

    var totals =
      '<div class="tot-row"><span>Sub Total</span><span>' + fmt(d.subTotal) + "</span></div>" +
      (hasTaxableRow
        ? '<div class="tot-row"><span>Total Taxable Amount</span><span>' + fmt(d.subTotal) + "</span></div>"
        : "") +
      '<div class="tot-row"><span>VAT (' + fmt(d.vatRate) + '%)</span><span>' + fmt(d.vatAmount) + "</span></div>" +
      '<div class="tot-row tot-row--grand"><span>Total</span><span>' + esc(d.currency) + fmt(d.total) + "</span></div>";

    var notes = d.notes
      ? '<div class="notes"><div class="notes-title">Notes</div>' +
        d.notes.map(function (l) { return "<div>" + esc(l) + "</div>"; }).join("") +
        "</div>"
      : "";

    var poweredBy = d.poweredBy
      ? '<div class="powered">POWERED BY <strong>3Star Suite</strong></div>'
      : "";

    var supplierLines = (d.supplierLines || [])
      .map(function (l) { return "<div>" + esc(l) + "</div>"; })
      .join("");
    var customerLines = (d.customerLines || [])
      .map(function (l) { return "<div>" + esc(l) + "</div>"; })
      .join("");

    return (
      '<div class="page">' +
      '<header class="top">' +
      '<div class="logo">' + logoSvg() + "</div>" +
      '<div class="title-block"><div class="title">TAX INVOICE</div>' + headerRight + "</div>" +
      "</header>" +
      '<div class="supplier"><div class="supplier-name">' + esc(d.supplierName) + "</div>" + supplierLines + "</div>" +
      '<section class="parties">' +
      '<div class="bill-to"><div class="bill-label">' + esc(d.billToLabel || "Bill To") + "</div>" +
      '<div class="cust-name">' + esc(d.customerName) + "</div>" + customerLines + "</div>" +
      '<div class="meta">' + metaRows + "</div>" +
      "</section>" +
      '<div class="subject"><span class="subject-label">Subject :</span><div class="subject-value">' + esc(d.subject) + "</div></div>" +
      '<table class="items"><thead><tr>' +
      '<th class="c-num">#</th><th class="c-desc">Item &amp; Description</th>' +
      '<th class="c-r">Qty</th><th class="c-r">Rate</th><th class="c-r">Taxable<br>Amount</th>' +
      '<th class="c-r">Tax %</th><th class="c-r">Tax</th><th class="c-r">Amount</th>' +
      "</tr></thead><tbody>" + rows + "</tbody></table>" +
      '<section class="footer">' +
      '<div class="qr-area"><div class="qr">' + qrSvg(d.invoiceNo) + "</div>" +
      '<div class="qr-caption">This QR code has been generated as per ZATCA’s regulations.</div></div>' +
      '<div class="totals">' + totals + "</div>" +
      "</section>" +
      notes + poweredBy +
      "</div>"
    );
  }

  global.InvoiceTemplate = { render: render };
})(typeof window !== "undefined" ? window : this);
