const fs = require("fs");
const path = "migration/ts_index.js";
let t = fs.readFileSync(path, "utf-8");

t = t.replace(/if \([\s\S]*?compactKey\.includes\(compactSpecKey\)[\s\S]*?\)/, 
`if (
          normalizedSpecKey === normalizedKey ||
          compactSpecKey === compactKey ||
          (normalizedKey.length > 4 && normalizedSpecKey.includes(normalizedKey)) ||
          (normalizedSpecKey.length > 4 && normalizedKey.includes(normalizedSpecKey))
        )`);

fs.writeFileSync(path, t);
