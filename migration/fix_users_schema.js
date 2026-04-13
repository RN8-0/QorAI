// Compair — PocketBase users collection schema fix
// Adds all missing custom fields required by the Flutter app.
const { req } = require('./pb');

const T = (name, o = {}) => ({ name, type: 'text', max: o.max || 2000, min: o.min || 0, required: !!o.required, ...o });
const N = (name, o = {}) => ({ name, type: 'number', ...o });
const B = (name, o = {}) => ({ name, type: 'bool', ...o });
const U = (name, o = {}) => ({ name, type: 'url', ...o });
const D = (name, o = {}) => ({ name, type: 'date', ...o });
const J = (name, o = {}) => ({ name, type: 'json', maxSize: 2000000, ...o });

const REQUIRED_USER_FIELDS = [
  T('googleEmail', { max: 500 }),
  U('photoURL'),
  T('displayName', { max: 200 }),
  T('language', { max: 10 }),
  T('currency', { max: 10 }),
  T('ecosystem', { max: 50 }),
  T('budgetRange', { max: 50 }),
  J('priorities'),
  J('currentDevices'),
  J('subscriptions'),
  J('ownedProducts'),
  J('favorites'),
  B('quizCompleted'),
  B('isPremium'),
  N('affiliateClicks'),
  N('comparisonsCount'),
  T('primaryCategory', { max: 100 }),
  T('usageIntent', { max: 100 }),
  D('birthDate'),
  T('gender', { max: 50 }),
  T('ageRange', { max: 20 }),
  T('profession', { max: 100 }),
  J('interestCategories'),
  J('profileVector'),
  J('userSubscriptionDetails'),
  // Already in extendUsers but ensure they exist:
  T('fcmToken', { max: 500 }),
  T('platform', { max: 50 }),
  T('country', { max: 10 }),
  D('fcmTokenUpdatedAt'),
];

(async () => {
  console.log('=== Compair — users schema fix ===\n');

  const r = await req('GET', '/api/collections/users');
  if (r.status !== 200) {
    console.error('Failed to get users collection:', r.status, r.body);
    process.exit(1);
  }

  const col = r.body;
  const existing = new Set(col.fields.map(f => f.name));
  console.log('Existing fields:', [...existing].join(', '));

  const toAdd = REQUIRED_USER_FIELDS.filter(f => !existing.has(f.name));
  if (toAdd.length === 0) {
    console.log('\n✓ All fields already exist. Nothing to do.');
    return;
  }

  console.log('\nMissing fields to add:', toAdd.map(f => f.name).join(', '));

  const patched = { fields: [...col.fields, ...toAdd] };
  const p = await req('PATCH', `/api/collections/${col.id}`, patched);

  if (p.status === 200 || p.status === 201) {
    console.log('\n✓ users collection updated successfully!');
    console.log('Added fields:', toAdd.map(f => f.name).join(', '));
  } else {
    console.error('\n✗ Failed to update users collection:', p.status, JSON.stringify(p.body, null, 2));
    process.exit(1);
  }
})().catch(e => { console.error('Error:', e); process.exit(1); });
