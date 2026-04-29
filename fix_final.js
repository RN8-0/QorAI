const fs = require('fs');
const file = 'lib/presentation/screens/browse/category_browse_screen.dart';
let txt = fs.readFileSync(file, 'utf8');
txt = txt.replace(/if \(hasFilters\) \.\.\.\[(.*?)\],\s*const SizedBox\(width: 8\),/s, '\ SizedBox(width: 8),');
fs.writeFileSync(file, txt, 'utf8');
console.log('done');
