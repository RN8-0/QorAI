const fs = require("fs");
const path = "lib/presentation/screens/browse/category_browse_screen.dart";
let t = fs.readFileSync(path, "utf-8");
let m = t.match(/List<String> _computeVisibleBrowseProductIds[\s\S]*?\}\s*\}[\s\n]*return/g);
console.log(m ? m[0] : "not found");
