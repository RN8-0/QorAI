const fs = require("fs");
const path = "lib/presentation/models/filter_models.dart";
let t = fs.readFileSync(path, "utf-8");
let m = t.match(/String _normalizeText[\s\S]*?\}\s*(?![\s\S]*\})/g);
console.log(m ? m[0] : "not found");
