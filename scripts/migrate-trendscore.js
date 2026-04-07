/**
 * Migration: Add trendScore=0 and imageURL to products missing these fields.
 * Run once: node scripts/migrate-trendscore.js
 */
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const serviceAccountPaths = [
  path.join(__dirname, '..', 'compair-admin', 'compair-99b6e-firebase-adminsdk-fbsvc-d0cf85329c.json'),
  path.join(__dirname, '..', 'functions', 'service-account.json'),
  path.join(__dirname, 'service-account.json'),
];

let serviceAccount;
for (const p of serviceAccountPaths) {
  if (fs.existsSync(p)) { serviceAccount = require(p); break; }
}
if (!serviceAccount) { console.error('Service account not found'); process.exit(1); }

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function main() {
  const snap = await db.collection('products').get();
  console.log(`Total products: ${snap.size}`);

  let updated = 0, skipped = 0;
  const batchSize = 400;
  let batch = db.batch();
  let batchCount = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    const updates = {};

    if (data.trendScore === undefined || data.trendScore === null) {
      updates.trendScore = 0;
    }
    // Fix imageURL field name (scraper saved as imageUrl, app needs imageURL)
    if (!data.imageURL && data.imageUrl) {
      updates.imageURL = data.imageUrl;
    }

    if (Object.keys(updates).length > 0) {
      batch.update(doc.ref, updates);
      batchCount++;
      updated++;

      if (batchCount >= batchSize) {
        await batch.commit();
        batch = db.batch();
        batchCount = 0;
        console.log(`  Committed batch, ${updated} updated so far...`);
      }
    } else {
      skipped++;
    }
  }

  if (batchCount > 0) await batch.commit();

  console.log(`\n✅ Done: ${updated} updated, ${skipped} already had fields`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
