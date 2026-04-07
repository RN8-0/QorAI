/**
 * Migration: Add empty ratings {expert:0, community:0, count:0} to products missing ratings.
 * Also ensures pros/cons/tags/description fields exist.
 * Run once: node scripts/migrate-add-ratings.js
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

    if (!data.ratings || typeof data.ratings !== 'object') {
      updates.ratings = { expert: 0, community: 0, count: 0, versusScore: 0 };
    }
    if (!Array.isArray(data.pros)) updates.pros = [];
    if (!Array.isArray(data.cons)) updates.cons = [];
    if (!Array.isArray(data.tags)) updates.tags = [data.category, data.brand?.toLowerCase()].filter(Boolean);
    if (data.description === undefined) updates.description = '';
    if (!data.lastUpdated) updates.lastUpdated = admin.firestore.FieldValue.serverTimestamp();

    if (Object.keys(updates).length === 0) {
      skipped++;
      continue;
    }

    batch.update(doc.ref, updates);
    batchCount++;
    updated++;

    if (batchCount >= batchSize) {
      await batch.commit();
      batch = db.batch();
      batchCount = 0;
      console.log(`  Committed batch, ${updated} updated so far...`);
    }
  }

  if (batchCount > 0) await batch.commit();
  console.log(`Done. Updated: ${updated}, Skipped: ${skipped}`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
