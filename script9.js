const fs = require("fs");
const path = "migration/ts_index.js";
let t = fs.readFileSync(path, "utf-8");
let m = t.match(/function findBrowseSpecValues[\s\S]*?\}\s*(?![\s\S]*\})/g);
console.log(m ? m[0] : "not found");
