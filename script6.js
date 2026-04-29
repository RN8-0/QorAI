const fs = require("fs");
const path = "lib/presentation/models/filter_models.dart";
let t = fs.readFileSync(path, "utf-8");
let m = t.match(/static bool _passesToggle[\s\S]*?\}\s*\}/g);
console.log(m ? m[0] : "not found");
