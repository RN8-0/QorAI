/**
 * UPLOAD JSON TO FIRESTORE
 * 
 * Usage:
 *   node scripts/upload-json.js
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Initialize Firebase Admin
// Try to find the service account file in the current directory
const serviceAccountPath = path.join(__dirname, '../compair-99b6e-firebase-adminsdk-fbsvc-d0cf85329c.json');
const serviceAccount = require(serviceAccountPath);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const INPUT_FILE = path.join(__dirname, '../output/epey-products.json');

async function upload() {
    if (!fs.existsSync(INPUT_FILE)) {
        console.error('Input file not found:', INPUT_FILE);
        return;
    }

    const fileContent = fs.readFileSync(INPUT_FILE, 'utf8');
    const data = JSON.parse(fileContent);
    const products = Array.isArray(data) ? data : (data.products || []);

    console.log(`Starting upload of ${products.length} products...`);
    
    let batch = db.batch();
    let count = 0;
    let total = 0;
    let batchCount = 0;

    for (const p of products) {
        if (!p.id) continue;
        
        // Format for Firestore
        const docRef = db.collection('products').doc(p.id);
        
        // Structure data correctly
        const firestoreData = {
            id: p.id,
            name: p.name,
            brand: (p.brand || p.name.split(' ')[0]).toLowerCase(),
            imageUrl: p.imageUrl || '',
            images: p.imageUrl ? [p.imageUrl] : [],
            category: 'smartphones', // Default
            subcategory: 'phones',
            description: `${p.name} - ${p.specs?.processor || ''} - ${p.specs?.ram || ''}`,
            specs: {
                display: {
                    size: p.specs?.screenSize || '',
                    resolution: p.specs?.resolution || '',
                    type: p.specs?.displayType || '',
                    refreshRate: p.specs?.refreshRate || '',
                },
                performance: {
                    processor: p.specs?.processor || '',
                    cpu: p.specs?.processor || '',
                    gpu: p.specs?.gpu || '',
                },
                memory: {
                    ram: p.specs?.ram || '',
                    storage: p.specs?.storage || '',
                },
                camera: {
                    main: p.specs?.mainCamera || '',
                    selfie: p.specs?.selfieCamera || '',
                },
                battery: {
                    capacity: p.specs?.batteryCapacity || '',
                    charging: p.specs?.fastCharging || '',
                }
            },
            priceRange: {
                min: p.price || 0,
                max: p.price || 0,
                current: p.price || 0,
                currency: 'TRY'
            },
            source: 'epey',
            sourceUrl: p.sourceUrl,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            isActive: true
        };

        batch.set(docRef, firestoreData, { merge: true });
        count++;
        total++;
        batchCount++;

        if (batchCount >= 400) {
            await batch.commit();
            console.log(`   Committed batch of ${batchCount} products...`);
            batch = db.batch();
            batchCount = 0;
        }
    }

    if (batchCount > 0) {
        await batch.commit();
        console.log(`   Committed final batch of ${batchCount} products.`);
    }

    console.log(`\n🎉 Successfully uploaded ${total} products to Firestore.`);
}

upload().catch(console.error);
