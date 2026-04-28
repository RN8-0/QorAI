// Fix review_replies collection:
// 1. Add likedBy and dislikedBy JSON fields if missing
// 2. Update updateRule to allow any authenticated user to update
//    (needed so users can like/dislike replies they don't own)

const { req } = require('./pb');

async function run() {
  // Find the review_replies collection
  const collections = await req('GET', '/api/collections?perPage=200');
  const col = collections.items.find((c) => c.name === 'review_replies');
  if (!col) {
    console.error('review_replies collection not found');
    process.exit(1);
  }

  console.log('Found review_replies collection:', col.id);
  console.log('Current updateRule:', col.updateRule);

  // Check for likedBy / dislikedBy fields
  const fieldNames = (col.fields || col.schema || []).map((f) => f.name);
  console.log('Existing fields:', fieldNames.join(', '));

  const newFields = [...(col.fields || col.schema || [])];

  if (!fieldNames.includes('likedBy')) {
    newFields.push({ name: 'likedBy', type: 'json', maxSize: 2000000 });
    console.log('Adding likedBy field');
  }
  if (!fieldNames.includes('dislikedBy')) {
    newFields.push({ name: 'dislikedBy', type: 'json', maxSize: 2000000 });
    console.log('Adding dislikedBy field');
  }

  // Allow any authenticated user to update (for likedBy/dislikedBy)
  const newUpdateRule = "@request.auth.id != ''";

  const payload = {
    ...col,
    updateRule: newUpdateRule,
  };

  // Use 'fields' or 'schema' depending on PocketBase version
  if (col.fields !== undefined) {
    payload.fields = newFields;
  } else {
    payload.schema = newFields;
  }

  await req('PATCH', `/api/collections/${col.id}`, payload);
  console.log('✅ review_replies collection updated:');
  console.log('   - updateRule:', newUpdateRule);
  console.log('   - likedBy/dislikedBy fields ensured');
}

run().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
