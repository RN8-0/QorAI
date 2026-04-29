const fs = require("fs");
const path = "lib/presentation/screens/browse/category_browse_screen.dart";
let t = fs.readFileSync(path, "utf-8");
let m = t.match(/for \(final entry in state\.toggles\.entries\)[\s\S]*?\}\s*\}/g);
console.log(m ? m[0] : "not found");
