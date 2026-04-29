const fs = require("fs");
const path = "migration/ts_index.js";
let t = fs.readFileSync(path, "utf-8");

t = t.replace(/if \([\s\S]*?compactSpecKey === compactKey \|\|/g, 
`if (
          normalizedSpecKey === normalizedKey ||
          compactSpecKey === compactKey ||`);

        t = t.replace(/\n\s*\(normalizedKey\.length(?:[\s\S]*?)\]\);\n\s*\}\n\s*\}/, 
`
          (normalizedKey.length > 4 && normalizedSpecKey.includes(normalizedKey)) ||
          (normalizedSpecKey.length > 4 && normalizedKey.includes(normalizedSpecKey))
        ) {
          if (value && !seen.has(value)) {
            seen.add(value);
            matches.push(value);
          }
        }`);
fs.writeFileSync(path, t);
