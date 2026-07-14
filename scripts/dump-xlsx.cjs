const ExcelJS = require("exceljs");
const path = require("path");

const files = process.argv.slice(2);

(async () => {
  for (const f of files) {
    console.log("\n================================================================");
    console.log("FILE:", path.basename(f));
    console.log("================================================================");
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.readFile(f);
    } catch (e) {
      console.log("  [could not read]", e.message);
      continue;
    }
    wb.eachSheet((ws) => {
      console.log(`\n--- SHEET: "${ws.name}"  (rows=${ws.rowCount}, cols=${ws.columnCount}) ---`);
      const max = Math.min(ws.rowCount, 80);
      for (let r = 1; r <= max; r++) {
        const row = ws.getRow(r);
        const cells = [];
        row.eachCell({ includeEmpty: false }, (cell) => {
          let v = cell.value;
          if (v && typeof v === "object") {
            if (v.richText) v = v.richText.map((t) => t.text).join("");
            else if (v.result !== undefined) v = v.result;
            else if (v.text !== undefined) v = v.text;
            else v = JSON.stringify(v);
          }
          if (v !== null && v !== undefined && String(v).trim() !== "") {
            cells.push(`${cell.address}=${String(v).slice(0, 60)}`);
          }
        });
        if (cells.length) console.log(`  R${r}: ` + cells.join(" | "));
      }
    });
  }
})();
