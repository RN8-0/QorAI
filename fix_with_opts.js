const fs = require("fs");
const path = "lib/presentation/screens/browse/category_browse_screen.dart";
let t = fs.readFileSync(path, "utf-8");

t = t.replace(/_typesenseFacets\[facetKey\]\)/g, "_typesenseFacets[facetKey]!)");
fs.writeFileSync(path, t);
