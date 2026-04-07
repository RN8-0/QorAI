/**
 * Compair - Cloud Functions
 * AI Assistant & Subscription Services
 *
 * Exported functions:
 * 1. chatWithAI          - AI conversation assistant
 * 2. generateComparison  - AI-powered product comparison
 * 3. getAIInsights       - AI dashboard insights
 * 4. initializeSubscriptionServices - Setup subscription data
 * 5. compareSubscriptions - AI subscription comparison
 * 6. clearAllData        - Admin data cleanup
 * 7. calculateTechScore  - Calculate tech score for a product
 * 8. recalculateCategoryScores - Normalize scores within a category
 */

const { onRequest, onCall } = require('firebase-functions/v2/https');
const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');
const axios = require('axios');

initializeApp();
const db = getFirestore();

// DeepSeek API Configuration
const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';
const DEEPSEEK_MODEL = 'deepseek-chat';

// ============ DEEPSEEK AI FUNCTIONS ============

/**
 * Helper function to call DeepSeek API
 */
async function callDeepSeekAPI(messages, apiKey, options = {}) {
  const {
    maxTokens = 4096,
    temperature = 0.7,
  } = options;

  try {
    const response = await axios.post(
      DEEPSEEK_API_URL,
      {
        model: DEEPSEEK_MODEL,
        messages,
        max_tokens: maxTokens,
        temperature,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        timeout: 60000,
      }
    );

    return {
      success: true,
      content: response.data.choices[0]?.message?.content || '',
      usage: response.data.usage,
    };
  } catch (error) {
    console.error('DeepSeek API error:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.error?.message || error.message,
    };
  }
}

/**
 * Chat with AI Assistant - for admin panel conversations
 */
exports.chatWithAI = onCall(
  {
    region: 'europe-west1',
    timeoutSeconds: 60,
    memory: '512MiB'
  },
  async (request) => {
    if (!request.auth) {
      throw new Error('Unauthenticated');
    }

    const { message, context = [], apiKey } = request.data;

    if (!message || message.trim().length === 0) {
      throw new Error('Message is required');
    }

    if (!apiKey) {
      throw new Error('DeepSeek API key is required');
    }

    const systemPrompt = `You are Compair AI Assistant, a helpful assistant for the Compair product comparison platform.

Your capabilities:
- Help admins manage products, categories, and brands
- Provide insights about product data and trends
- Assist with scraper configuration and troubleshooting
- Answer questions about the platform features
- Suggest product comparisons and market analysis

Guidelines:
- Be concise and helpful
- Provide actionable suggestions when possible
- If asked about data you don't have, suggest how to find it
- Use markdown formatting for better readability`;

    // Build conversation history
    const messages = [
      { role: 'system', content: systemPrompt },
      ...context.slice(-10).map(msg => ({
        role: msg.isUser ? 'user' : 'assistant',
        content: msg.content
      })),
      { role: 'user', content: message }
    ];

    const result = await callDeepSeekAPI(messages, apiKey, {
      temperature: 0.7,
      maxTokens: 2048
    });

    if (!result.success) {
      throw new Error(`AI error: ${result.error}`);
    }

    // Save conversation to Firestore
    const conversationRef = db.collection('ai_conversations').doc();
    await conversationRef.set({
      userId: request.auth.uid,
      messages: [
        { role: 'user', content: message, timestamp: Timestamp.now() },
        { role: 'assistant', content: result.content, timestamp: Timestamp.now() }
      ],
      createdAt: Timestamp.now()
    });

    return {
      success: true,
      response: result.content,
      conversationId: conversationRef.id,
      usage: result.usage
    };
  }
);

/**
 * Generate Product Comparison - AI-powered comparison
 */
exports.generateComparison = onCall(
  {
    region: 'europe-west1',
    timeoutSeconds: 60,
    memory: '512MiB'
  },
  async (request) => {
    if (!request.auth) {
      throw new Error('Unauthenticated');
    }

    const { productIds, apiKey } = request.data;

    if (!productIds || !Array.isArray(productIds) || productIds.length < 2) {
      throw new Error('At least 2 product IDs are required');
    }

    if (!apiKey) {
      throw new Error('DeepSeek API key is required');
    }

    // Fetch products from Firestore
    const products = [];
    for (const id of productIds.slice(0, 4)) {
      const doc = await db.collection('products').doc(id).get();
      if (doc.exists) {
        products.push({ id: doc.id, ...doc.data() });
      }
    }

    if (products.length < 2) {
      throw new Error('Could not find enough products to compare');
    }

    const productInfo = products.map(p => `
Product: ${p.name}
Brand: ${p.brand}
Price: $${p.priceRange?.current || 'N/A'}
Specs: ${JSON.stringify(p.specs || {})}
    `).join('\n---\n');

    const systemPrompt = `You are a product comparison expert. Analyze products and provide detailed, unbiased comparisons.`;

    const userPrompt = `Compare these products and provide:
1. A brief summary of each product's strengths
2. Key differences in specifications
3. Best use cases for each product
4. Overall winner recommendation with reasoning

Products to compare:
${productInfo}

Format your response with clear sections using markdown.`;

    const result = await callDeepSeekAPI(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      apiKey,
      { temperature: 0.6, maxTokens: 2048 }
    );

    if (!result.success) {
      throw new Error(`AI error: ${result.error}`);
    }

    return {
      success: true,
      comparison: result.content,
      products: products.map(p => ({ id: p.id, name: p.name, brand: p.brand }))
    };
  }
);

/**
 * Get AI Insights for Dashboard
 */
exports.getAIInsights = onCall(
  {
    region: 'europe-west1',
    timeoutSeconds: 30,
    memory: '256MiB'
  },
  async (request) => {
    if (!request.auth) {
      throw new Error('Unauthenticated');
    }

    const { apiKey } = request.data;

    if (!apiKey) {
      throw new Error('DeepSeek API key is required');
    }

    // Get stats from Firestore
    const productsCount = (await db.collection('products').count().get()).data().count;
    const categoriesSnap = await db.collection('category_templates').limit(100).get();
    const stats = {
      totalProducts: productsCount,
      categories: categoriesSnap.docs.map(d => d.id),
    };

    const systemPrompt = `You are a data analyst assistant. Provide brief, actionable insights based on platform statistics.`;

    const userPrompt = `Based on these platform statistics, provide 3-4 brief insights and suggestions:

Total Products: ${stats.totalProducts}
Categories: ${stats.categories.join(', ')}
Categories: ${stats.categories.join(', ')}

Keep each insight to 1-2 sentences. Focus on actionable recommendations.`;

    const result = await callDeepSeekAPI(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      apiKey,
      { temperature: 0.7, maxTokens: 500 }
    );

    if (!result.success) {
      throw new Error(`AI error: ${result.error}`);
    }

    return {
      success: true,
      insights: result.content,
      stats
    };
  }
);

// ============ SUBSCRIPTION SERVICE FUNCTIONS ============

// Default subscription services data
const DEFAULT_SUBSCRIPTION_SERVICES = [
  {
    id: 'spotify',
    name: 'Spotify',
    category: 'music',
    logoUrl: 'https://storage.googleapis.com/pr-newsroom-wp/1/2018/11/Spotify_Logo_RGB_Green.png',
    websiteUrl: 'https://spotify.com',
    pricing: {
      individual: { monthly: 10.99, yearly: 109.99 },
      family: { monthly: 16.99 },
      student: { monthly: 5.99 },
      duo: { monthly: 14.99 },
    },
    features: {
      adFree: true,
      offlineListening: true,
      unlimitedSkips: true,
      highQualityAudio: true,
      lyrics: true,
      podcasts: true,
      musicVideos: false,
      spatialAudio: false,
      losslessAudio: false,
      library: '100M+ songs',
    },
    platforms: ['ios', 'android', 'web', 'desktop', 'smart_tv', 'gaming', 'car'],
  },
  {
    id: 'apple_music',
    name: 'Apple Music',
    category: 'music',
    websiteUrl: 'https://music.apple.com',
    pricing: {
      individual: { monthly: 10.99 },
      family: { monthly: 16.99 },
      student: { monthly: 5.99 },
    },
    features: {
      adFree: true,
      offlineListening: true,
      unlimitedSkips: true,
      highQualityAudio: true,
      lyrics: true,
      podcasts: false,
      musicVideos: true,
      spatialAudio: true,
      losslessAudio: true,
      library: '100M+ songs',
    },
    platforms: ['ios', 'android', 'web', 'desktop', 'smart_tv', 'car'],
  },
  {
    id: 'youtube_music',
    name: 'YouTube Music',
    category: 'music',
    websiteUrl: 'https://music.youtube.com',
    pricing: {
      individual: { monthly: 10.99 },
      family: { monthly: 16.99 },
      student: { monthly: 5.49 },
    },
    features: {
      adFree: true,
      offlineListening: true,
      unlimitedSkips: true,
      highQualityAudio: true,
      lyrics: true,
      podcasts: false,
      musicVideos: true,
      spatialAudio: false,
      losslessAudio: false,
      youtubeIntegration: true,
      library: '100M+ songs',
    },
    platforms: ['ios', 'android', 'web'],
  },
  {
    id: 'netflix',
    name: 'Netflix',
    category: 'video',
    websiteUrl: 'https://netflix.com',
    pricing: {
      standard_ads: { monthly: 6.99 },
      standard: { monthly: 15.49 },
      premium: { monthly: 22.99 },
    },
    features: {
      adFree: true,
      uhd4k: true,
      hdr: true,
      dolbyAtmos: true,
      downloads: true,
      profiles: 5,
      simultaneousStreams: 4,
      library: '15000+ titles',
    },
    platforms: ['ios', 'android', 'web', 'smart_tv', 'gaming'],
  },
  {
    id: 'disney_plus',
    name: 'Disney+',
    category: 'video',
    websiteUrl: 'https://disneyplus.com',
    pricing: {
      basic: { monthly: 7.99 },
      premium: { monthly: 13.99 },
      bundle: { monthly: 19.99 },
    },
    features: {
      adFree: true,
      uhd4k: true,
      hdr: true,
      dolbyAtmos: true,
      downloads: true,
      profiles: 7,
      simultaneousStreams: 4,
      library: '500+ movies, 15000+ episodes',
    },
    platforms: ['ios', 'android', 'web', 'smart_tv', 'gaming'],
  },
  {
    id: 'hbo_max',
    name: 'Max (HBO)',
    category: 'video',
    websiteUrl: 'https://max.com',
    pricing: {
      with_ads: { monthly: 9.99 },
      ad_free: { monthly: 15.99 },
      ultimate: { monthly: 19.99 },
    },
    features: {
      adFree: true,
      uhd4k: true,
      hdr: true,
      dolbyAtmos: true,
      downloads: true,
      profiles: 5,
      simultaneousStreams: 3,
    },
    platforms: ['ios', 'android', 'web', 'smart_tv', 'gaming'],
  },
  {
    id: 'google_one',
    name: 'Google One',
    category: 'cloud',
    websiteUrl: 'https://one.google.com',
    pricing: {
      basic_100gb: { monthly: 1.99, yearly: 19.99 },
      standard_200gb: { monthly: 2.99, yearly: 29.99 },
      premium_2tb: { monthly: 9.99, yearly: 99.99 },
    },
    features: {
      storage: true,
      sharedWithFamily: true,
      googlePhotosEditing: true,
      vpn: true,
      darkWebMonitoring: true,
    },
    platforms: ['ios', 'android', 'web'],
  },
  {
    id: 'icloud_plus',
    name: 'iCloud+',
    category: 'cloud',
    websiteUrl: 'https://apple.com/icloud',
    pricing: {
      '50gb': { monthly: 0.99 },
      '200gb': { monthly: 2.99 },
      '2tb': { monthly: 9.99 },
      '6tb': { monthly: 29.99 },
      '12tb': { monthly: 59.99 },
    },
    features: {
      storage: true,
      sharedWithFamily: true,
      privateRelay: true,
      hideMyEmail: true,
      customDomain: true,
    },
    platforms: ['ios', 'macos', 'web', 'windows'],
  },
];

/**
 * Initialize default subscription services
 */
exports.initializeSubscriptionServices = onRequest(
  {
    region: 'us-central1',
    cors: true
  },
  async (req, res) => {
    const authKey = req.query.key || req.body?.key;
    if (authKey !== 'compair2024secret') {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    try {
      const batch = db.batch();

      for (const service of DEFAULT_SUBSCRIPTION_SERVICES) {
        const ref = db.collection('subscription_services').doc(service.id);
        batch.set(ref, {
          ...service,
          updatedAt: Timestamp.now(),
        }, { merge: true });
      }

      await batch.commit();

      res.json({
        success: true,
        count: DEFAULT_SUBSCRIPTION_SERVICES.length,
        message: 'Initialized subscription services'
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

/**
 * Compare subscription services with AI
 */
exports.compareSubscriptions = onCall(
  {
    region: 'europe-west1',
    timeoutSeconds: 60,
    memory: '512MiB'
  },
  async (request) => {
    if (!request.auth) {
      throw new Error('Unauthenticated');
    }

    const { serviceIds, apiKey } = request.data;

    if (!serviceIds || !Array.isArray(serviceIds) || serviceIds.length < 2) {
      throw new Error('At least 2 service IDs are required');
    }

    if (!apiKey) {
      throw new Error('DeepSeek API key is required');
    }

    // Fetch services from Firestore
    const services = [];
    for (const id of serviceIds.slice(0, 4)) {
      const doc = await db.collection('subscription_services').doc(id).get();
      if (doc.exists) {
        services.push({ id: doc.id, ...doc.data() });
      }
    }

    if (services.length < 2) {
      throw new Error('Could not find enough services to compare');
    }

    const serviceInfo = services.map(s => `
Service: ${s.name}
Category: ${s.category}
Pricing: ${JSON.stringify(s.pricing)}
Features: ${JSON.stringify(s.features)}
Platforms: ${s.platforms?.join(', ') || 'N/A'}
    `).join('\n---\n');

    const systemPrompt = `You are a subscription service comparison expert. Provide detailed, unbiased comparisons of streaming and subscription services.`;

    const userPrompt = `Compare these subscription services and provide:
1. Price comparison (which offers best value)
2. Feature comparison (key differences)
3. Platform availability
4. Best for: (who should choose each service)
5. Overall recommendation

Services to compare:
${serviceInfo}

Format your response with clear sections using markdown. Include a summary table if helpful.`;

    const result = await callDeepSeekAPI(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      apiKey,
      { temperature: 0.6, maxTokens: 2048 }
    );

    if (!result.success) {
      throw new Error(`AI error: ${result.error}`);
    }

    return {
      success: true,
      comparison: result.content,
      services: services.map(s => ({ id: s.id, name: s.name, category: s.category }))
    };
  }
);

// ============ DATA MANAGEMENT FUNCTIONS ============

/**
 * Clear all data from Firestore - for admin use only
 * WARNING: This deletes all products and conversation data
 */
exports.clearAllData = onRequest(
  {
    region: 'us-central1',
    cors: true,
    timeoutSeconds: 300
  },
  async (req, res) => {
    const authKey = req.query.key || req.body?.key;
    if (authKey !== 'compair2024secret') {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const collectionsToDelete = [
      'products',
      'ai_conversations'
    ];

    try {
      const results = {
        deleted: {},
        errors: []
      };

      // Delete collections completely
      for (const collectionName of collectionsToDelete) {
        try {
          const snapshot = await db.collection(collectionName).get();
          const batch = db.batch();
          let count = 0;

          for (const doc of snapshot.docs) {
            batch.delete(doc.ref);
            count++;

            // Firestore batch has a limit of 500 operations
            if (count % 400 === 0) {
              await batch.commit();
            }
          }

          if (count % 400 !== 0) {
            await batch.commit();
          }

          results.deleted[collectionName] = snapshot.size;
          console.log(`Deleted ${snapshot.size} documents from ${collectionName}`);
        } catch (err) {
          console.error(`Error deleting ${collectionName}:`, err);
          results.errors.push({ collection: collectionName, error: err.message });
        }
      }

      res.json({
        success: true,
        message: 'Firestore data cleared successfully',
        results
      });
    } catch (err) {
      console.error('Clear data error:', err);
      res.status(500).json({ error: err.message });
    }
  }
);

// ============ TECH SCORE FUNCTIONS ============

// Processor benchmark reference (AnTuTu v10 based, 2026)
const PROCESSOR_BENCHMARKS = {
  'a19 pro': 2200000, 'a19': 2000000, 'a18 pro': 1900000, 'a18': 1700000,
  'a17 pro': 1550000, 'a17': 1400000, 'a16 bionic': 1200000, 'a15 bionic': 1050000,
  'm4 pro': 2500000, 'm4': 2200000, 'm3 pro': 2100000, 'm3': 1900000,
  'snapdragon 8 elite': 2300000, 'snapdragon 8 gen 4': 2300000,
  'snapdragon 8 gen 3': 2050000, 'snapdragon 8 gen 2': 1650000,
  'snapdragon 8 gen 1': 1300000, 'snapdragon 8+ gen 1': 1400000,
  'snapdragon 7+ gen 3': 1200000, 'snapdragon 7+ gen 2': 1100000,
  'snapdragon 6 gen 3': 750000, 'snapdragon 4 gen 2': 500000,
  'exynos 2500': 2100000, 'exynos 2400': 1850000, 'exynos 2200': 1200000,
  'dimensity 9400': 2250000, 'dimensity 9300': 2000000, 'dimensity 9200': 1600000,
  'dimensity 8300': 1150000, 'dimensity 8200': 1050000,
  'tensor g5': 1600000, 'tensor g4': 1350000, 'tensor g3': 1150000,
  'kirin 9100': 1800000, 'kirin 9000s': 1100000, 'kirin 9000': 950000,
};

const MAX_ANTUTU = 2300000;

function getProcessorScore(specs) {
  const processor = specs?.processor || {};
  const chipset = (processor.chipset || processor.name || specs?.chipset || '').toLowerCase().trim();
  if (!chipset) return 30;
  
  for (const [key, score] of Object.entries(PROCESSOR_BENCHMARKS)) {
    if (chipset.includes(key) || key.includes(chipset)) {
      return Math.min(100, (score / MAX_ANTUTU) * 100);
    }
  }
  return 30;
}

function extractMegapixel(text) {
  const match = (text || '').match(/(\d+)\s*MP/i);
  return match ? parseInt(match[1]) : 0;
}

function getCameraScore(specs) {
  const camera = specs?.camera || {};
  let score = 0;
  const mainMp = extractMegapixel(camera.main || '');
  if (mainMp >= 200) score += 35;
  else if (mainMp >= 108) score += 30;
  else if (mainMp >= 50) score += 25;
  else if (mainMp >= 48) score += 22;
  else if (mainMp >= 12) score += 18;
  else score += mainMp * 0.3;

  const uwMp = extractMegapixel(camera.ultrawide || '');
  if (uwMp >= 48) score += 12;
  else if (uwMp >= 12) score += 8;
  else if (uwMp > 0) score += 5;

  const teleStr = String(camera.telephoto || '');
  if (teleStr.includes('5x') || teleStr.includes('10x')) score += 18;
  else if (teleStr.includes('3x')) score += 14;
  else if (teleStr.includes('2x')) score += 10;
  else if (teleStr && teleStr !== 'null' && teleStr !== 'undefined') score += 7;

  const video = String(camera.video || '');
  if (video.includes('8K')) score += 15;
  else if (video.includes('4K') && video.includes('120')) score += 14;
  else if (video.includes('4K') && video.includes('60')) score += 12;
  else if (video.includes('4K')) score += 10;
  else if (video.includes('1080')) score += 6;

  const frontMp = extractMegapixel(camera.front || '');
  if (frontMp >= 32) score += 8;
  else if (frontMp >= 12) score += 6;
  else if (frontMp > 0) score += 3;

  return Math.min(100, score);
}

function getDisplayScore(specs) {
  const display = specs?.display || {};
  let score = 0;
  const res = String(display.resolution || '');
  if (res.match(/3[01]\d\d/)) score += 25;
  else if (res.match(/2[3-5]\d\d/)) score += 20;
  else if (res.includes('1920') || res.includes('1080')) score += 15;
  else score += 10;

  const type = String(display.type || display.technology || '').toLowerCase();
  if (type.includes('ltpo') || type.includes('dynamic amoled')) score += 20;
  else if (type.includes('oled') || type.includes('amoled') || type.includes('retina')) score += 18;
  else if (type.includes('ips') || type.includes('lcd')) score += 10;
  else score += 12;

  const rrMatch = String(display.refreshRate || display.refresh_rate || '').match(/(\d+)/);
  const rr = rrMatch ? parseInt(rrMatch[1]) : 60;
  if (rr >= 144) score += 20;
  else if (rr >= 120) score += 18;
  else if (rr >= 90) score += 14;
  else score += 10;

  const brMatch = String(display.brightness || display.peak_brightness || '').match(/(\d+)/);
  const br = brMatch ? parseInt(brMatch[1]) : 0;
  if (br >= 2500) score += 20;
  else if (br >= 2000) score += 18;
  else if (br >= 1500) score += 15;
  else if (br >= 1000) score += 12;
  else if (br >= 500) score += 8;

  return Math.min(100, score);
}

function getBatteryScore(specs) {
  const battery = specs?.battery || {};
  let score = 0;
  const capMatch = String(battery.capacity || '').match(/(\d+)/);
  const cap = capMatch ? parseInt(capMatch[1]) : 0;
  if (cap >= 6000) score += 35;
  else if (cap >= 5000) score += 28;
  else if (cap >= 4500) score += 24;
  else if (cap >= 4000) score += 20;
  else if (cap >= 3000) score += 12;
  else score += 8;

  const chgMatch = String(battery.charging || battery.fast_charging || '').match(/(\d+)/);
  const watt = chgMatch ? parseInt(chgMatch[1]) : 0;
  if (watt >= 120) score += 30;
  else if (watt >= 67) score += 25;
  else if (watt >= 45) score += 20;
  else if (watt >= 30) score += 15;
  else if (watt >= 20) score += 12;
  else if (watt > 0) score += 8;

  const chgStr = String(battery.charging || '').toLowerCase();
  if (chgStr.includes('wireless') || chgStr.includes('qi')) score += 12;

  return Math.min(100, (score / 77) * 100);
}

function getMemoryScore(specs) {
  const memory = specs?.memory || {};
  let score = 0;
  const ramStr = String(memory.ram || '');
  const ramMatches = ramStr.match(/(\d+)\s*GB/gi) || [];
  const ramGB = Math.max(...ramMatches.map(m => parseInt(m)), 0);
  if (ramGB >= 16) score += 40;
  else if (ramGB >= 12) score += 35;
  else if (ramGB >= 8) score += 28;
  else if (ramGB >= 6) score += 20;
  else score += 10;

  const stStr = String(memory.storage || '');
  let stGB = 0;
  const tbMatch = stStr.match(/(\d+)\s*TB/i);
  if (tbMatch) stGB = parseInt(tbMatch[1]) * 1024;
  else {
    const gbMatches = stStr.match(/(\d+)\s*GB/gi) || [];
    stGB = Math.max(...gbMatches.map(m => parseInt(m)), 0);
  }
  if (stGB >= 1024) score += 35;
  else if (stGB >= 512) score += 30;
  else if (stGB >= 256) score += 25;
  else if (stGB >= 128) score += 18;
  else score += 10;

  return Math.min(100, (score / 75) * 100);
}

function getBuildScore(specs) {
  const physical = specs?.physical || {};
  let score = 0;
  const ip = String(physical.ipRating || physical.ip_rating || '').toLowerCase();
  if (ip.includes('ip68')) score += 30;
  else if (ip.includes('ip67')) score += 25;
  else if (ip.includes('ip65') || ip.includes('ip54')) score += 18;

  const build = String(physical.build || physical.material || '').toLowerCase();
  if (build.includes('titanium')) score += 30;
  else if (build.includes('ceramic')) score += 28;
  else if (build.includes('aluminum')) score += 22;
  else if (build.includes('glass')) score += 18;
  else if (build.includes('plastic')) score += 10;
  else score += 12;

  if (build.includes('gorilla armor') || build.includes('ceramic shield')) score += 20;
  else if (build.includes('victus 2')) score += 18;
  else if (build.includes('victus')) score += 15;
  else if (build.includes('gorilla')) score += 12;

  return Math.min(100, (score / 80) * 100);
}

function getConnectivityScore(specs) {
  const conn = specs?.connectivity || {};
  let score = 0;
  const net = String(conn.network || '').toLowerCase();
  if (net.includes('5g')) score += 25;
  else if (net.includes('4g') || net.includes('lte')) score += 15;

  const wifi = String(conn.wifi || '').toLowerCase();
  if (wifi.includes('7') || wifi.includes('be')) score += 25;
  else if (wifi.includes('6e')) score += 22;
  else if (wifi.includes('6') || wifi.includes('ax')) score += 18;
  else score += 12;

  const btMatch = String(conn.bluetooth || '').match(/(\d+\.?\d*)/);
  const bt = btMatch ? parseFloat(btMatch[1]) : 0;
  if (bt >= 5.3) score += 15;
  else if (bt >= 5.0) score += 10;

  if (conn.nfc === true || conn.nfc === 'true') score += 10;

  const usb = String(conn.usb || conn.port || '').toLowerCase();
  if (usb.includes('thunderbolt') || usb.includes('usb 4')) score += 15;
  else if (usb.includes('3.2') || usb.includes('3.1')) score += 12;
  else if (usb.includes('type-c') || usb.includes('usb-c')) score += 10;

  return Math.min(100, (score / 90) * 100);
}

// Smartphone ağırlıkları
const SMARTPHONE_WEIGHTS = {
  processor: 0.25, camera: 0.20, display: 0.15,
  battery: 0.15, memory: 0.10, build: 0.10, connectivity: 0.05,
};

function calculateProductTechScore(specs, category) {
  const weights = SMARTPHONE_WEIGHTS; // TODO: expand for other categories
  const subscores = {
    processor: getProcessorScore(specs),
    camera: getCameraScore(specs),
    display: getDisplayScore(specs),
    battery: getBatteryScore(specs),
    memory: getMemoryScore(specs),
    build: getBuildScore(specs),
    connectivity: getConnectivityScore(specs),
  };

  let total = 0;
  for (const [key, weight] of Object.entries(weights)) {
    total += (subscores[key] || 0) * weight;
  }

  return {
    techScore: Math.round(total * 100) / 100,
    techSubscores: Object.fromEntries(
      Object.entries(subscores).map(([k, v]) => [k, Math.round(v * 100) / 100])
    ),
  };
}

/**
 * Calculate tech score for a product (callable)
 */
exports.calculateTechScore = onCall(
  { region: 'europe-west1', timeoutSeconds: 30, memory: '256MiB' },
  async (request) => {
    if (!request.auth) throw new Error('Unauthenticated');
    const { productId } = request.data;
    if (!productId) throw new Error('productId is required');

    const doc = await db.collection('products').doc(productId).get();
    if (!doc.exists) throw new Error('Product not found');

    const data = doc.data();
    const { techScore, techSubscores } = calculateProductTechScore(
      data.specs || {}, data.subcategory || data.category || 'smartphones'
    );

    await doc.ref.update({ techScore, techSubscores, lastUpdated: Timestamp.now() });

    return { success: true, techScore, techSubscores };
  }
);

/**
 * Recalculate and normalize tech scores for all products in a category
 */
exports.recalculateCategoryScores = onCall(
  { region: 'europe-west1', timeoutSeconds: 120, memory: '512MiB' },
  async (request) => {
    if (!request.auth) throw new Error('Unauthenticated');
    const { subcategory } = request.data;
    if (!subcategory) throw new Error('subcategory is required');

    const snapshot = await db.collection('products')
      .where('subcategory', '==', subcategory)
      .where('isActive', '==', true)
      .get();

    if (snapshot.empty) return { success: true, count: 0 };

    // Calculate raw scores for all products
    const rawScores = [];
    for (const doc of snapshot.docs) {
      const data = doc.data();
      const { techScore, techSubscores } = calculateProductTechScore(
        data.specs || {}, subcategory
      );
      rawScores.push({ id: doc.id, ref: doc.ref, techScore, techSubscores });
    }

    // Normalize: highest = 100, others proportional
    const maxScore = Math.max(...rawScores.map(s => s.techScore));
    if (maxScore <= 0) return { success: true, count: rawScores.length, message: 'All scores are 0' };

    const batch = db.batch();
    for (const item of rawScores) {
      const normalized = Math.round((item.techScore / maxScore) * 100 * 100) / 100;
      batch.update(item.ref, {
        techScore: normalized,
        techSubscores: item.techSubscores,
        lastUpdated: Timestamp.now(),
      });
    }
    await batch.commit();

    return { success: true, count: rawScores.length, maxRawScore: maxScore };
  }
);

/**
 * Auto-calculate tech score when a product is created
 */
exports.onProductCreated = onDocumentCreated(
  { document: 'products/{productId}', region: 'europe-west1' },
  async (event) => {
    const data = event.data?.data();
    if (!data || data.techScore > 0) return; // Already scored

    const { techScore, techSubscores } = calculateProductTechScore(
      data.specs || {}, data.subcategory || data.category || 'smartphones'
    );

    if (techScore > 0) {
      await event.data.ref.update({ techScore, techSubscores });
      console.log(`Auto-scored product ${event.params.productId}: ${techScore}`);
    }
  }
);


// ============ OTP PASSWORD RESET ============
const { Resend } = require('resend');
const { getAuth } = require('firebase-admin/auth');

/**
 * sendPasswordResetOtp
 * Generates a 6-digit OTP, stores it in Firestore for 10 minutes,
 * and sends it to the user's email via Resend.
 */
exports.sendPasswordResetOtp = onCall(
  { region: 'europe-west1', secrets: ['RESEND_API_KEY'] },
  async (request) => {
    const email = (request.data.email || '').trim().toLowerCase();
    if (!email) throw new Error('Email is required');

    // Verify the user exists in Firebase Auth
    try {
      await getAuth().getUserByEmail(email);
    } catch {
      // Silently succeed to not reveal whether the email exists
      return { success: true };
    }

    // Generate Firebase password-reset link to obtain a valid oobCode
    const resetLink = await getAuth().generatePasswordResetLink(email, {
      url: 'https://compair-99b6e.firebaseapp.com',
    });
    const oobCode = new URL(resetLink).searchParams.get('oobCode');

    // Generate 6-digit OTP and store in Firestore (expires in 10 min)
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Timestamp.fromMillis(Date.now() + 10 * 60 * 1000);

    await db.collection('_otp_reset').doc(email).set({
      code, oobCode, expiresAt, attempts: 0, email,
    });

    // Send OTP email via Resend
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: 'Compair <noreply@compair.digital>',
      to: email,
      subject: 'Your Compair Password Reset Code',
      html: `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:480px;margin:0 auto;background:#f8fafc;border-radius:16px;overflow:hidden;">
          <div style="background:#0f172a;padding:28px 32px;">
            <h1 style="color:#fff;margin:0;font-size:22px;font-weight:700;letter-spacing:-0.5px;">Compair</h1>
          </div>
          <div style="padding:32px;">
            <h2 style="color:#0f172a;margin:0 0 8px;font-size:20px;font-weight:700;">Reset Your Password</h2>
            <p style="color:#475569;margin:0 0 28px;font-size:15px;line-height:1.6;">
              Use the code below to reset your password. It expires in <strong>10 minutes</strong>.
            </p>
            <div style="background:#0f172a;border-radius:12px;padding:24px;text-align:center;margin-bottom:28px;">
              <span style="color:#fff;font-size:40px;font-weight:800;letter-spacing:16px;font-variant-numeric:tabular-nums;">${code}</span>
            </div>
            <p style="color:#94a3b8;font-size:13px;margin:0;line-height:1.6;">
              If you didn't request a password reset, you can safely ignore this email.
            </p>
          </div>
        </div>`,
    });

    return { success: true };
  }
);

/**
 * verifyResetCode
 * Validates the 6-digit OTP. On success, returns the oobCode so the
 * Flutter client can call FirebaseAuth.confirmPasswordReset directly.
 */
exports.verifyResetCode = onCall(
  { region: 'europe-west1' },
  async (request) => {
    const email = (request.data.email || '').trim().toLowerCase();
    const code = (request.data.code || '').trim();
    if (!email || !code) throw new Error('Email and code are required');

    const ref = db.collection('_otp_reset').doc(email);
    const snap = await ref.get();

    if (!snap.exists) return { valid: false, error: 'No reset request found. Please request a new code.' };

    const data = snap.data();

    if (data.expiresAt.toMillis() < Date.now()) {
      await ref.delete();
      return { valid: false, error: 'Code has expired. Please request a new one.' };
    }

    if (data.attempts >= 5) {
      return { valid: false, error: 'Too many incorrect attempts. Please request a new code.' };
    }

    if (data.code !== code) {
      await ref.update({ attempts: FieldValue.increment(1) });
      return { valid: false, error: 'Incorrect code. Please try again.' };
    }

    // Valid — clean up and return oobCode
    const oobCode = data.oobCode;
    await ref.delete();
    return { valid: true, oobCode };
  }
);

// ============ PRODUCT SEARCH (SERVER-SIDE) ============

// In-memory product cache for fast search across warm function instances
let _searchCache = null;
let _searchCacheTime = 0;
const SEARCH_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

async function _loadSearchCache() {
  const now = Date.now();
  if (_searchCache && (now - _searchCacheTime) < SEARCH_CACHE_TTL) {
    return _searchCache;
  }

  console.log('searchProducts: loading product index...');
  const snap = await db.collection('products')
    .select('name', 'brand', 'category', 'imageUrl', 'techScore', 'price_raw', 'price_segment', 'keySpecs', 'images', 'source', 'sourceUrl', 'variantGroup')
    .get();

  _searchCache = snap.docs.map(doc => {
    const d = doc.data();
    return {
      id: doc.id,
      name: d.name || '',
      brand: d.brand || '',
      category: d.category || '',
      imageUrl: d.imageUrl || '',
      techScore: d.techScore || 0,
      price_raw: d.price_raw || '',
      price_segment: d.price_segment || '',
      keySpecs: d.keySpecs || {},
      images: d.images || [],
      source: d.source || '',
      sourceUrl: d.sourceUrl || '',
      variantGroup: d.variantGroup || '',
      // Pre-computed lowercase for fast matching
      _nameLower: (d.name || '').toLowerCase(),
      _brandLower: (d.brand || '').toLowerCase(),
      _categoryLower: (d.category || '').toLowerCase(),
    };
  });
  _searchCacheTime = now;
  console.log(`searchProducts: cached ${_searchCache.length} products`);
  return _searchCache;
}

/**
 * Server-side product search — fast fuzzy matching across 37K+ products
 * Called from Flutter app via Cloud Functions callable
 */
exports.searchProducts = onCall(
  {
    region: 'europe-west1',
    timeoutSeconds: 60,
    memory: '1GiB',
  },
  async (request) => {
    const { query, limit = 60, category } = request.data || {};

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return { products: [], total: 0 };
    }

    const products = await _loadSearchCache();
    const q = query.trim().toLowerCase();
    const terms = q.split(/\s+/).filter(t => t.length > 0);

    // Score each product
    const scored = [];
    for (const p of products) {
      // Category filter
      if (category && p._categoryLower !== category.toLowerCase()) continue;

      let score = 0;
      const name = p._nameLower;
      const brand = p._brandLower;
      const cat = p._categoryLower;

      // Exact full query match in name
      if (name.includes(q)) {
        score += 100;
        // Bonus for starts-with
        if (name.startsWith(q)) score += 50;
      }

      // Brand exact match
      if (brand === q || brand.includes(q)) {
        score += 80;
      }

      // Category match
      if (cat.includes(q)) {
        score += 40;
      }

      // Individual term matching
      let allTermsMatch = true;
      for (const term of terms) {
        const inName = name.includes(term);
        const inBrand = brand.includes(term);
        const inCat = cat.includes(term);

        if (inName) score += 30;
        else if (inBrand) score += 20;
        else if (inCat) score += 10;

        if (!inName && !inBrand && !inCat) {
          allTermsMatch = false;
        }
      }

      // Bonus: all terms found somewhere
      if (allTermsMatch && terms.length > 1) score += 25;

      // TechScore tiebreaker
      if (score > 0) {
        score += (p.techScore || 0) / 1000;
        scored.push({ ...p, _score: score });
      }
    }

    // Sort by score descending, take top N
    scored.sort((a, b) => b._score - a._score);
    const results = scored.slice(0, limit).map(p => ({
      id: p.id,
      name: p.name,
      brand: p.brand,
      category: p.category,
      imageUrl: p.imageUrl,
      techScore: p.techScore,
      price_raw: p.price_raw,
      price_segment: p.price_segment,
      keySpecs: p.keySpecs,
      images: p.images,
      source: p.source,
      sourceUrl: p.sourceUrl,
      variantGroup: p.variantGroup,
    }));

    return { products: results, total: scored.length };
  }
);

// ============ ADMIN: DELETE USER ACCOUNT ============
// Deletes user from both Firebase Auth and Firestore
exports.deleteUserAccount = onCall(
  { region: 'europe-west1' },
  async (request) => {
    // Verify caller is admin
    if (!request.auth) {
      throw new Error('Authentication required');
    }
    const callerEmail = request.auth.token.email;
    const adminsDoc = await db.collection('app_config').doc('admins').get();
    if (!adminsDoc.exists || !adminsDoc.data().emails.includes(callerEmail)) {
      throw new Error('Admin access required');
    }

    const { uid } = request.data;
    if (!uid) throw new Error('User UID is required');

    // Prevent admin from deleting themselves
    if (uid === request.auth.uid) {
      throw new Error('Cannot delete your own account');
    }

    const results = { auth: false, firestore: false, subcollections: [] };

    // Delete from Firebase Auth
    try {
      await getAuth().deleteUser(uid);
      results.auth = true;
    } catch (e) {
      if (e.code !== 'auth/user-not-found') {
        console.error('Auth delete failed:', e);
      }
      results.auth = e.code === 'auth/user-not-found' ? true : false;
    }

    // Delete user subcollections
    const subcols = ['profile', 'match_cache', 'behavior', 'chat_conversations'];
    for (const sub of subcols) {
      try {
        const snap = await db.collection('users').doc(uid).collection(sub).get();
        const batch = db.batch();
        snap.docs.forEach(d => batch.delete(d.ref));
        if (snap.size > 0) await batch.commit();
        results.subcollections.push(sub);
      } catch (e) {
        console.error(`Subcollection ${sub} delete failed:`, e);
      }
    }

    // Delete Firestore user document
    try {
      await db.collection('users').doc(uid).delete();
      results.firestore = true;
    } catch (e) {
      console.error('Firestore delete failed:', e);
    }

    return results;
  }
);
