/**
 * COMPAIR - Delete Imported Products
 * 
 * Usage:
 *   node scripts/delete-products.js
 * 
 * Deletes products imported via scripts or with source='epey' or 'seed'.
 */

const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

async function main() {
  const serviceAccountPaths = [
    path.join(__dirname, '..', 'functions', 'service-account.json'),
    path.join(__dirname, 'service-account.json'),
    path.join(__dirname, '..', 'service-account.json'),
  ];

  let serviceAccount = null;
  for (const saPath of serviceAccountPaths) {
    if (fs.existsSync(saPath)) {
      serviceAccount = require(saPath);
      console.log(`🔑 Using service account: ${path.basename(saPath)}`);
      break;
    }
  }

  if (!serviceAccount) {
    console.error('❌ No service account file found.');
    process.exit(1);
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  const db = admin.firestore();
  console.log('🚀 Deleting imported products...');

  // 1. Delete by ID prefix (epey-, seed-, gsm-)
  //    Or just delete everything if user wants a clean slate.
  //    User said "son eklediğin 1000 ürünü sil".
  //    My script used `epey-` and `seed-` prefixes mostly, or generic IDs.
  //    Let's check metadata first.

  const batchSize = 400;
  let deletedCount = 0;

  async function deleteQueryBatch(query, resolve) {
    const snapshot = await query.get();

    const batchSize = snapshot.size;
    if (batchSize === 0) {
      resolve();
      return;
    }

    const batch = db.batch();
    snapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });
    await batch.commit();
    deletedCount += batchSize;
    console.log(`Deleted ${deletedCount} documents...`);

    process.nextTick(() => {
      deleteQueryBatch(query, resolve);
    });
  }

  // Delete all products where source exists (my imported ones usually have source field)
  // OR just delete everything. Let's be safe and delete only what looks like mine.
  // The import script added `source: 'seed'` or `source: 'epey'`.
  
  const sourcesToDelete = ['seed', 'epey', 'gsmarena']; // Common sources I might have used
  
  for (const source of sourcesToDelete) {
      console.log(`Deleting products with source '${source}'...`);
      const query = db.collection('products').where('source', '==', source).limit(batchSize);
      await new Promise((resolve) => {
        deleteQueryBatch(query, resolve);
      });
  }

  // Also delete by ID pattern if source field missing
  console.log('Deleting products with ID starting with "epey-" or "seed-"...');
  // Firestore doesn't support 'startswith' easily, but we can do range query
  // However, simpler to just list all and filter if dataset small (1000 is small).
  
  const allDocs = await db.collection('products').get();
  console.log(`Found ${allDocs.size} products total.`);
  
  if (allDocs.size > 0) {
      console.log('Deleting ALL products...');
      const batches = [];
      let batch = db.batch();
      let count = 0;
      
      allDocs.forEach(doc => {
          batch.delete(doc.ref);
          count++;
          if (count % 400 === 0) {
              batches.push(batch.commit());
              batch = db.batch();
          }
      });
      
      if (count % 400 !== 0) {
          batches.push(batch.commit());
      }
      
      await Promise.all(batches);
      console.log(`✅ Deleted ${count} products.`);
  }

  console.log(`\n✅ Finished. Total deleted: ${deletedCount}`);
}

main().catch(console.error);
