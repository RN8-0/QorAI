const fs = require("fs");
const path = "lib/presentation/screens/browse/category_browse_screen.dart";
let t = fs.readFileSync(path, "utf-8");
t = t.replace("facetBy: ['brand', 'os_version', 'ram', 'internal_storage'],", "facets: ['brand', 'os_version', 'ram', 'internal_storage'],");
fs.writeFileSync(path, t);
