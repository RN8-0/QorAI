const fs = require("fs");
const path = "lib/presentation/screens/browse/category_browse_screen.dart";
let t = fs.readFileSync(path, "utf-8");
let m = t.match(/String\? _buildServerSideFilterBy[\s\S]*?return null;\s*\}/g);
console.log(m ? m[0].substring(0, 1500) : "not found");
