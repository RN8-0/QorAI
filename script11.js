const fs = require("fs");
const path = "lib/presentation/screens/browse/category_browse_screen.dart";
let t = fs.readFileSync(path, "utf-8");
t = t.replace("'water_resistance': 'water_resistance:true',", "'water_resistance': 'water_resistance:true',\n      'four_half_g': 'four_half_g:true',");
fs.writeFileSync(path, t);
