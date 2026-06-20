import fs from "node:fs";
import * as canvas from "@napi-rs/canvas";

globalThis.DOMMatrix = canvas.DOMMatrix;
globalThis.ImageData = canvas.ImageData;
globalThis.Path2D = canvas.Path2D;

const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");

for (const stem of ["invoice", "quotation"]) {
  const pdfPath = `invoice-preview/review-${stem}-changed-data.pdf`;
  const pngPath = `invoice-preview/review-${stem}-changed-data.png`;
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const document = await getDocument({ data }).promise;
  const page = await document.getPage(1);
  const viewport = page.getViewport({ scale: 2 });
  const surface = canvas.createCanvas(viewport.width, viewport.height);

  await page.render({
    canvasContext: surface.getContext("2d"),
    viewport,
  }).promise;

  fs.writeFileSync(pngPath, surface.toBuffer("image/png"));
  console.log(`${pngPath}: ${document.numPages} page(s)`);
}
