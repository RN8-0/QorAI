const fs = require("fs");
const path = "lib/presentation/models/filter_models.dart";
let t = fs.readFileSync(path, "utf-8");

t = t.replace(/final isMatch =[\s\S]*?tokenOverlap >= overlapThreshold;/g,
`// Stricter matching to avoid false positives like "ilte" containing "lte"
        final isMatch =
            normalizedEntryKey == normalizedKey ||
            compactEntryKey == compactKey ||
            (normalizedKey.length > 4 && normalizedEntryKey.contains(normalizedKey)) ||
            (normalizedEntryKey.length > 4 && normalizedKey.contains(normalizedEntryKey)) ||
            (keyTokenCount > 1 && tokenOverlap >= overlapThreshold) ||
            (keyTokenCount == 1 && tokenOverlap == 1);`);

fs.writeFileSync(path, t);
