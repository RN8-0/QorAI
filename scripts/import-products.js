#!/usr/bin/env node

/**
 * COMPAIR - Merge & Import Products to Firebase
 * 
 * Merges all product JSON files from output/ directory
 * and imports them to Firebase Firestore.
 * 
 * Usage:
 *   node import-products.js                    # Merge and import to Firebase
 *   node import-products.js --merge-only       # Only merge JSONs, don't upload
 *   node import-products.js --stats            # Show stats about merged data
 */

const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, 'output');
const MERGED_FILE = path.join(OUTPUT_DIR, 'all-products.json');

// ═══════════════════════════════════════════════════════════
// MERGE ALL PRODUCT FILES
// ═══════════════════════════════════════════════════════════

function mergeProducts() {
  const files = fs.readdirSync(OUTPUT_DIR)
    .filter(f => f.endsWith('-products.json') || f === 'gsmarena-products.json');

  const allProducts = [];
  const seenIds = new Set();

  for (const file of files) {
    const filePath = path.join(OUTPUT_DIR, file);
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const products = data.products || [];
      
      let added = 0;
      for (const product of products) {
        if (!seenIds.has(product.id)) {
          seenIds.add(product.id);
          allProducts.push(product);
          added++;
        }
      }
      
      console.log(`  📄 ${file}: ${added} products (${products.length - added} duplicates skipped)`);
    } catch (e) {
      console.error(`  ❌ Error reading ${file}: ${e.message}`);
    }
  }

  // Also check seed_data directory
  const seedDir = path.join(__dirname, 'seed_data');
  if (fs.existsSync(seedDir)) {
    const seedFiles = fs.readdirSync(seedDir).filter(f => f.endsWith('.json'));
    for (const file of seedFiles) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(seedDir, file), 'utf8'));
        const products = data.products || [];
        
        let added = 0;
        for (const product of products) {
          // Convert old seed format to new format if needed
          const normalizedProduct = normalizeSeedProduct(product);
          if (normalizedProduct && !seenIds.has(normalizedProduct.id)) {
            seenIds.add(normalizedProduct.id);
            allProducts.push(normalizedProduct);
            added++;
          }
        }
        
        if (added > 0) {
          console.log(`  📄 seed_data/${file}: ${added} products`);
        }
      } catch (e) {
        // Skip non-product files
      }
    }
  }

  // Sort by brand then name
  allProducts.sort((a, b) => {
    if (a.brand !== b.brand) return a.brand.localeCompare(b.brand);
    return a.name.localeCompare(b.name);
  });

  // Save merged file
  const output = {
    metadata: {
      mergedAt: new Date().toISOString(),
      totalProducts: allProducts.length,
      brands: [...new Set(allProducts.map(p => p.brand))].sort(),
      categories: [...new Set(allProducts.map(p => p.subcategory))].sort(),
      sources: files.map(f => f.replace('-products.json', '')),
    },
    products: allProducts,
  };

  fs.writeFileSync(MERGED_FILE, JSON.stringify(output, null, 2));
  console.log(`\n✅ Merged ${allProducts.length} products into ${MERGED_FILE}`);
  
  return allProducts;
}

/**
 * Normalize old seed data format to new format
 */
function normalizeSeedProduct(product) {
  if (!product || !product.name) return null;
  
  // Skip non-tech products
  if (product.category && !['tech', 'smartphones', 'tablets', 'laptops'].includes(product.category)) {
    return null;
  }

  const id = product.id || generateSlug(product.name);
  const brand = product.brand || product.name.split(' ')[0];
  const amazonQuery = encodeURIComponent(product.name);

  return {
    id: id.startsWith('gsm-') ? id : `seed-${id}`,
    slug: generateSlug(product.name),
    name: product.name,
    brand,
    category: product.category || 'tech',
    subcategory: product.subcategory || 'smartphones',
    description: product.description || product.name,
    imageUrl: product.imageUrl || '',
    images: product.images || (product.imageUrl ? [product.imageUrl] : []),
    specs: normalizeSpecs(product.specs || {}),
    priceRange: product.priceRange || {
      min: Math.round((product.prices?.US || 500) * 0.85),
      max: Math.round((product.prices?.US || 500) * 1.15),
      current: product.prices?.US || 500,
      currency: 'USD',
    },
    ratings: product.ratings ? {
      community: product.ratings.community || 4.0,
      reviewCount: product.ratings.reviewCount || Math.floor(Math.random() * 5000) + 100,
      compairScore: product.ratings.compair || product.ratings.compairScore || 70,
    } : {
      community: parseFloat((3.8 + Math.random() * 1.0).toFixed(1)),
      reviewCount: Math.floor(Math.random() * 5000) + 100,
      compairScore: Math.floor(55 + Math.random() * 40),
    },
    affiliateLinks: (product.affiliateLinks && product.affiliateLinks.amazon_us) ? product.affiliateLinks : {
      amazon_us: `https://www.amazon.com/s?k=${amazonQuery}`,
      amazon_uk: `https://www.amazon.co.uk/s?k=${amazonQuery}`,
      amazon_de: `https://www.amazon.de/s?k=${amazonQuery}`,
      amazon_tr: `https://www.amazon.com.tr/s?k=${amazonQuery}`,
    },
    trendScore: product.trendScore || Math.floor(Math.random() * 100),
    source: product.source || 'seed',
    sourceUrl: product.sourceUrl || '',
    isActive: product.isActive !== false,
    releaseDate: product.releaseDate || '',
  };
}

function normalizeSpecs(specs) {
  // If specs are already in new format (nested objects), return as-is
  if (specs.display || specs.performance || specs.camera) {
    return specs;
  }

  // Convert flat spec format to nested
  return {
    display: {
      size: specs.screen || specs.screenSize || '',
      resolution: specs.resolution || '',
      type: specs.screenType || specs.displayType || '',
      protection: specs.displayProtection || '',
      refreshRate: specs.refreshRate || '60Hz',
    },
    performance: {
      processor: specs.processor || specs.chipset || '',
      cpu: specs.cpu || '',
      gpu: specs.gpu || '',
    },
    memory: {
      ram: specs.ram || '',
      storage: specs.storage || '',
      cardSlot: specs.cardSlot || 'No',
    },
    camera: {
      main: specs.camera || specs.mainCamera || '',
      selfie: specs.selfieCamera || '',
      features: specs.cameraFeatures || '',
      video: specs.video || '',
    },
    battery: {
      capacity: specs.battery || specs.batteryCapacity || '',
      type: specs.batteryType || 'Li-Ion',
      charging: specs.charging || '',
    },
    connectivity: {
      network: specs['5g'] ? '5G' : specs.network || '',
      wifi: specs.wifi || '',
      bluetooth: specs.bluetooth || '',
      nfc: specs.nfc || '',
      usb: specs.usb || '',
      gps: specs.gps || '',
    },
    physical: {
      dimensions: specs.dimensions || '',
      weight: specs.weight || '',
      build: specs.build || '',
      sim: specs.sim || '',
      colors: specs.colors || '',
    },
    software: {
      os: specs.os || '',
    },
    sensors: specs.sensors || '',
  };
}

function generateSlug(name) {
  return name.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

// ═══════════════════════════════════════════════════════════
// FIREBASE IMPORT
// ═══════════════════════════════════════════════════════════

async function importToFirebase(products) {
  let admin;
  try {
    admin = require('firebase-admin');
  } catch (e) {
    console.error('❌ firebase-admin not installed. Run: npm install firebase-admin');
    return;
  }

  // Try to find service account
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
    console.error('❌ No service account file found. Create one at functions/service-account.json');
    console.log('   Download from: Firebase Console > Project Settings > Service Accounts > Generate New Private Key');
    return;
  }

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  }

  const db = admin.firestore();
  const FieldValue = admin.firestore.FieldValue;

  console.log('\n🚀 Importing to Firebase Firestore...');

  const BATCH_SIZE = 400;
  let imported = 0;

  for (let i = 0; i < products.length; i += BATCH_SIZE) {
    const batch = db.batch();
    const chunk = products.slice(i, i + BATCH_SIZE);

    for (const product of chunk) {
      const ref = db.collection('products').doc(product.id);
      batch.set(ref, {
        ...product,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    await batch.commit();
    imported += chunk.length;
    console.log(`  ⏳ ${imported}/${products.length} imported...`);
  }

  console.log(`\n✅ Successfully imported ${imported} products to Firebase!`);

  // Images are stored as-is (original URLs from scraper, no processing).
}

// ═══════════════════════════════════════════════════════════
// STATS
// ═══════════════════════════════════════════════════════════

function showStats(products) {
  console.log('\n═══════════════════════════════════════════════');
  console.log('  📊 PRODUCT DATABASE STATS');
  console.log('═══════════════════════════════════════════════');
  
  console.log(`\n  Total Products: ${products.length}`);
  
  // By brand
  const byBrand = {};
  products.forEach(p => {
    byBrand[p.brand] = (byBrand[p.brand] || 0) + 1;
  });
  
  console.log('\n  📱 By Brand:');
  Object.entries(byBrand)
    .sort((a, b) => b[1] - a[1])
    .forEach(([brand, count]) => {
      console.log(`    ${brand}: ${count} products`);
    });

  // By category
  const byCat = {};
  products.forEach(p => {
    byCat[p.subcategory] = (byCat[p.subcategory] || 0) + 1;
  });
  
  console.log('\n  📂 By Category:');
  Object.entries(byCat)
    .sort((a, b) => b[1] - a[1])
    .forEach(([cat, count]) => {
      console.log(`    ${cat}: ${count} products`);
    });

  // Price range
  const prices = products.map(p => p.priceRange?.current || 0).filter(p => p > 0);
  if (prices.length > 0) {
    console.log(`\n  💰 Price Range: $${Math.min(...prices)} - $${Math.max(...prices)}`);
    console.log(`     Average: $${Math.round(prices.reduce((a, b) => a + b, 0) / prices.length)}`);
  }

  // With images
  const withImages = products.filter(p => p.imageUrl).length;
  console.log(`\n  🖼️  With Images: ${withImages}/${products.length} (${Math.round(withImages/products.length*100)}%)`);
  
  // With Amazon links
  const withAmazon = products.filter(p => p.affiliateLinks?.amazon_us).length;
  console.log(`  🔗 With Amazon Links: ${withAmazon}/${products.length} (${Math.round(withAmazon/products.length*100)}%)`);

  console.log('\n═══════════════════════════════════════════════\n');
}

// ═══════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════

async function main() {
  const args = process.argv.slice(2);
  const mergeOnly = args.includes('--merge-only');
  const statsOnly = args.includes('--stats');

  console.log('🔄 Merging product files...\n');
  const products = mergeProducts();

  showStats(products);

  if (statsOnly || mergeOnly) {
    return;
  }

  // Import to Firebase
  await importToFirebase(products);
}

main().catch(err => {
  console.error('❌ Fatal:', err.message);
  process.exit(1);
});
