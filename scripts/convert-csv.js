const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

const CSV_FILE = path.join(__dirname, 'output', 'mobile_products_2025.csv');
const OUTPUT_FILE = path.join(__dirname, 'output', 'mobile-products.json');

const BRAND_IMAGES = {
  'Apple': 'https://placehold.co/600x800/png?text=Apple',
  'Samsung': 'https://placehold.co/600x800/png?text=Samsung',
  'Xiaomi': 'https://placehold.co/600x800/png?text=Xiaomi',
  'OnePlus': 'https://placehold.co/600x800/png?text=OnePlus',
  'Google': 'https://placehold.co/600x800/png?text=Google',
  'default': 'https://placehold.co/600x800/png?text=Smartphone',
};

// Generic placeholder if specific brand not found
const GENERIC_IMAGE = 'https://placehold.co/600x800/png?text=Smartphone';

function parsePrice(priceStr) {
  if (!priceStr) return null;
  // Remove currency symbols and commas
  const clean = priceStr.replace(/[^0-9.]/g, '');
  return parseFloat(clean) || null;
}

function generateId(name) {
  return name.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

function convertCsvToJson() {
  const results = [];

  fs.createReadStream(CSV_FILE)
    .pipe(csv())
    .on('data', (data) => {
      // Map CSV fields to ProductModel
      // CSV: Company Name,Model Name,Mobile Weight,RAM,Front Camera,Back Camera,Processor,Battery Capacity,Screen Size,Launched Price (Pakistan),Launched Price (India),Launched Price (China),Launched Price (USA),Launched Price (Dubai),Launched Year
      
      const brand = data['Company Name'] || '';
      const name = data['Model Name'] || '';
      if (!name) return;

      const id = generateId(name);
      
      // Basic specs mapping
      const specs = {
        display: {
          size: data['Screen Size'] || '',
          resolution: '', // Not in CSV
          type: '', // Not in CSV
        },
        performance: {
          processor: data['Processor'] || '',
          cpu: '', 
          gpu: '',
        },
        memory: {
          ram: data['RAM'] || '',
          storage: name.match(/(\d+GB|\d+TB)/i)?.[0] || '', // Extract from name
        },
        camera: {
          main: data['Back Camera'] || '',
          selfie: data['Front Camera'] || '',
        },
        battery: {
          capacity: data['Battery Capacity'] || '',
        },
        physical: {
          weight: data['Mobile Weight'] || '',
        }
      };

      // Prices
      const prices = {};
      const priceUS = parsePrice(data['Launched Price (USA)']);
      const priceIN = parsePrice(data['Launched Price (India)']);
      const pricePK = parsePrice(data['Launched Price (Pakistan)']);
      const priceCN = parsePrice(data['Launched Price (China)']);
      const priceAE = parsePrice(data['Launched Price (Dubai)']);

      if (priceUS) prices['US'] = priceUS;
      if (priceIN) prices['IN'] = priceIN;
      if (pricePK) prices['PK'] = pricePK; // Maybe map to nearest supported currency
      if (priceCN) prices['CN'] = priceCN;
      if (priceAE) prices['AE'] = priceAE;

      // Image - use placeholder based on brand
      let imageUrl = GENERIC_IMAGE;
      if (BRAND_IMAGES[brand]) imageUrl = BRAND_IMAGES[brand];
      else imageUrl = `https://placehold.co/600x800/png?text=${encodeURIComponent(brand)}+${encodeURIComponent(name)}`;

      // Generate Amazon Affiliate Links (Search Queries)
      const amazonQuery = encodeURIComponent(`${brand} ${name}`);
      const affiliateLinks = {
        'amazon_us': `https://www.amazon.com/s?k=${amazonQuery}&tag=qorai-20`,
        'amazon_uk': `https://www.amazon.co.uk/s?k=${amazonQuery}&tag=qorai-21`,
        'amazon_de': `https://www.amazon.de/s?k=${amazonQuery}&tag=qorai-21`,
        'amazon_tr': `https://www.amazon.com.tr/s?k=${amazonQuery}&tag=qorai-21`,
        'amazon_in': `https://www.amazon.in/s?k=${amazonQuery}&tag=qorai-21`
      };

      const product = {
        id: `csv-${id}`, // Prefix to avoid collisions
        name: name,
        brand: brand,
        category: 'tech',
        subcategory: 'smartphones',
        description: `${brand} ${name} released in ${data['Launched Year'] || '2024'}. Features ${specs.display.size} screen, ${specs.camera.main} camera, and ${specs.battery.capacity} battery.`,
        imageURL: imageUrl,
        prices: prices,
        affiliateLinks: affiliateLinks,
        specs: specs,
        ratings: {
          expert: 0,
          community: 0,
          count: 0
        },
        pros: [],
        cons: [],
        tags: [brand.toLowerCase(), 'smartphone', '2025', 'new'],
        trendScore: Math.floor(Math.random() * 50), // Random low score, boost manually later
        lastUpdated: new Date().toISOString(),
        isActive: true,
        releaseDate: data['Launched Year'] || '2024'
      };

      results.push(product);
    })
    .on('end', () => {
      const output = {
        metadata: {
          source: 'mobile_products_2025.csv',
          count: results.length,
          generatedAt: new Date().toISOString()
        },
        products: results
      };
      
      fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
      console.log(`✅ Converted ${results.length} products to JSON: ${OUTPUT_FILE}`);
    });
}

// Check if CSV exists, if not download it
if (!fs.existsSync(CSV_FILE)) {
  console.log('⬇️  Downloading CSV dataset...');
  const { execSync } = require('child_process');
  try {
    // Ensure directory exists
    if (!fs.existsSync(path.dirname(CSV_FILE))) {
      fs.mkdirSync(path.dirname(CSV_FILE), { recursive: true });
    }
    execSync(`curl -s -L "https://raw.githubusercontent.com/DevJuggernaut/mobile-price-prediction/main/Mobiles%20Dataset%20(2025).csv" -o "${CSV_FILE}"`);
    console.log('✅ Download complete.');
    convertCsvToJson();
  } catch (e) {
    console.error('❌ Failed to download CSV:', e.message);
  }
} else {
  convertCsvToJson();
}
