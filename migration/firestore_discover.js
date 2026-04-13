const admin = require('firebase-admin');
const sa = require('./firebase-sa.json');

admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

(async () => {
  const roots = await db.listCollections();
  console.log('Root collections:', roots.length);
  for (const c of roots) {
    const snap = await c.limit(1).get();
    const total = await c.count().get().catch(() => null);
    console.log(`- ${c.id}  docs=${total ? total.data().count : '?'}  sample_fields=${snap.docs[0] ? Object.keys(snap.docs[0].data()).join(',') : '(empty)'}`);
  }
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
