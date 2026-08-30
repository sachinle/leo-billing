const fs = require("fs");
const p = "src/pages/Website.jsx";
let lines = fs.readFileSync(p, "utf8").split("\n");

// Repair the quote-stripped import from the previous attempt.
lines = lines.filter((l) => !l.includes("import DeliveryZones from ../components"));

let importDone = false, tabDone = false;

for (let i = 0; i < lines.length; i++) {
  if (!importDone && lines[i].startsWith("import ")) {
    let j = i;
    while (j + 1 < lines.length && lines[j + 1].startsWith("import ")) j++;
    lines.splice(j + 1, 0, "import DeliveryZones from '../components/DeliveryZones';");
    importDone = true;
    i = j + 1;
    continue;
  }
  if (!tabDone && lines[i].includes("tab === 'delivery'")) {
    lines[i] =
      "        {/* Map-drawn zones replace the pincode list. DeliveryTab (the\n" +
      "            pincode editor) is deliberately left in this file: the website\n" +
      "            falls back to pincodes whenever no zone is saved, so reverting\n" +
      "            is a one-line change rather than a restore. */}\n" +
      "        {tab === 'delivery' && <DeliveryZones toast={toast} />}";
    tabDone = true;
  }
}

fs.writeFileSync(p, lines.join("\n"));
console.log("import:", importDone, "| tab:", tabDone);
