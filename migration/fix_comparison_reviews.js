// Fixes comparison_reviews collection:
// 1. Adds createRule / updateRule / deleteRule for authenticated users  (fixes 403)
// 2. Adds missing fields: rating (number), likedBy (json), dislikedBy (json)
//
// Usage: node fix_comparison_reviews.js
const { req, auth } = require('./pb');

async function main() {
  await auth();
  console.log('✔ Authenticated');

  // List all collections
  const colsResp = await req('GET', '/api/collections?perPage=500');
  if (colsResp.status !== 200) {
    throw new Error('Failed to list collections: ' + JSON.stringify(colsResp.body));
  }

  const col = colsResp.body.items.find(c => c.name === 'comparison_reviews');
  if (!col) throw new Error('comparison_reviews collection not found');
  console.log(`Found: ${col.name} (id: ${col.id})`);
  console.log(`  Current rules  — create:${col.createRule ?? 'null'} update:${col.updateRule ?? 'null'} delete:${col.deleteRule ?? 'null'}`);
  console.log(`  Current fields — ${col.fields.map(f => f.name).join(', ')}`);

  // Build updated fields list (add rating / likedBy / dislikedBy if missing)
  const existingNames = col.fields.map(f => f.name);
  const newFields = [...col.fields];

  if (!existingNames.includes('rating')) {
    newFields.push({ name: 'rating', type: 'number', min: 0, max: 5 });
    console.log('  + Adding field: rating');
  }
  if (!existingNames.includes('likedBy')) {
    newFields.push({ name: 'likedBy', type: 'json', maxSize: 2000000 });
    console.log('  + Adding field: likedBy');
  }
  if (!existingNames.includes('dislikedBy')) {
    newFields.push({ name: 'dislikedBy', type: 'json', maxSize: 2000000 });
    console.log('  + Adding field: dislikedBy');
  }

  const body = {
    ...col,
    fields: newFields,
    createRule: "@request.auth.id != ''",
    updateRule: "@request.auth.id != '' && userId = @request.auth.id",
    deleteRule: "@request.auth.id != '' && userId = @request.auth.id",
  };

  const result = await req('PATCH', `/api/collections/${col.id}`, body);
  if (result.status === 200) {
    const r = result.body;
    console.log('✅ comparison_reviews updated!');
    console.log(`  createRule: ${r.createRule}`);
    console.log(`  updateRule: ${r.updateRule}`);
    console.log(`  deleteRule: ${r.deleteRule}`);
    console.log(`  Fields: ${r.fields.map(f => f.name).join(', ')}`);
  } else {
    console.error('❌ Update failed:', JSON.stringify(result.body, null, 2));
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Error:', err.message || err);
  process.exit(1);
});
