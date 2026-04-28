// Fix review_replies collection:
// 1. Add likedBy and dislikedBy JSON fields if missing
// 2. Update updateRule to allow any authenticated user to update
//    (needed so users can like/dislike replies they don't own)

const { req } = require('./pb');

(async () => {
  console.log('=== Fix review_replies likes/dislikes ===\n');

  // Directly fetch review_replies collection by name
  const r = await req('GET', '/api/collections/review_replies');
  if (r.status !== 200) {
    console.error('Failed to get review_replies collection:', r.status, r.body);
    process.exit(1);
  }

  const col = r.body;
  console.log('Found review_replies collection:', col.id);
  console.log('Current updateRule:', col.updateRule);

  // Check for likedBy / dislikedBy fields
  const existingFields = col.fields || col.schema || [];
  const fieldNames = existingFields.map((f) => f.name);
  console.log('Existing fields:', fieldNames.join(', '));

  const newFields = [...existingFields];

  if (!fieldNames.includes('likedBy')) {
    newFields.push({ name: 'likedBy', type: 'json', maxSize: 2000000 });
    console.log('  + Adding likedBy field');
  } else {
    console.log('  - likedBy already exists');
  }
  if (!fieldNames.includes('dislikedBy')) {
    newFields.push({ name: 'dislikedBy', type: 'json', maxSize: 2000000 });
    console.log('  + Adding dislikedBy field');
  } else {
    console.log('  - dislikedBy already exists');
  }

  // Allow any authenticated user to update (for likedBy/dislikedBy toggles)
  const newUpdateRule = "@request.auth.id != ''";

  const payload = { ...col, updateRule: newUpdateRule };

  if (col.fields !== undefined) {
    payload.fields = newFields;
  } else {
    payload.schema = newFields;
  }

  const p = await req('PATCH', `/api/collections/${col.id}`, payload);
  if (p.status === 200 || p.status === 201) {
    console.log('\n[OK] review_replies collection updated:');
    console.log('   - updateRule:', newUpdateRule);
    console.log('   - likedBy/dislikedBy fields ensured');
  } else {
    console.error('\n[FAIL] Failed to update:', p.status, JSON.stringify(p.body, null, 2));
    process.exit(1);
  }
})().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
