/// pb_hooks/typesense_sync.pb.js
/// PocketBase server-side hook: keeps Typesense `products` index in sync
/// with PocketBase `products` collection.
///
/// Fires on every create / update / delete — even when the change is made
/// directly in PocketBase's built-in admin UI (/_/), not just via the
/// Qor AI admin web panel.

const TS_URL        = 'https://lg9nuw99z1qojgv21dlemdrb.46.225.95.201.sslip.io';
const TS_KEY        = '9l6gsRj1V9NuXAagocxHJbhmaMgQex9GP7NRFqtT';
const TS_COLLECTION = 'products';

// ─── helpers ────────────────────────────────────────────────────────────────

function _tsHeaders() {
  return {
    'X-TYPESENSE-API-KEY': TS_KEY,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };
}

function _flattenKeySpecs(ks) {
  if (!ks) return '';
  if (Array.isArray(ks)) {
    return ks
      .map(function(x) { return typeof x === 'object' ? Object.values(x).join(' ') : String(x); })
      .join(' ');
  }
  if (typeof ks === 'object') return Object.values(ks).join(' ');
  return String(ks);
}

// Returns null if the field value can't be JSON-parsed — returns raw string.
function _parseJson(raw) {
  if (raw == null) return null;
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch (_) { return raw; }
}

/// Build a Typesense document from a PocketBase record.
/// Must match the shape produced by admin/js/ts_client.js :: tsBuildDoc().
function buildTsDoc(record) {
  var keySpecs = _parseJson(record.get('keySpecs'));
  var tags     = _parseJson(record.get('tags'));
  if (!Array.isArray(tags)) tags = [];

  var techScore  = parseFloat(record.get('techScore'))  || 0;
  var trendScore = parseFloat(record.get('trendScore')) || 0;
  var specsCount = parseInt(record.get('specsCount'), 10) || 0;

  // Parse the full spec/price fields so _raw contains everything the Flutter
  // app needs for local filtering (FilterApplier checks specs + specSections).
  var specs        = _parseJson(record.get('specs'))        || {};
  var specSections = _parseJson(record.get('specSections')) || {};
  var prices       = _parseJson(record.get('prices'))       || {};
  var affiliateLinks = _parseJson(record.get('affiliateLinks')) || {};

  // Full _raw snapshot — matches the shape stored by admin/js/ts_client.js
  // and migration/ts_index.js so FilterApplier has specs/specSections to work with.
  var pbData = {
    id:            record.id,
    slug:          record.get('slug')         || '',
    name:          record.get('name')         || '',
    brand:         record.get('brand')        || '',
    category:      record.get('category')     || '',
    subcategory:   record.get('subcategory')  || '',
    source:        record.get('source')       || '',
    imageUrl:      record.get('imageUrl') || record.get('imageURL') || '',
    imageURL:      record.get('imageURL') || record.get('imageUrl') || '',
    techScore:     techScore,
    trendScore:    trendScore,
    price_segment: record.get('price_segment') || '',
    specsCount:    specsCount,
    keySpecs:      keySpecs,
    tags:          tags,
    specs:         specs,
    specSections:  specSections,
    prices:        prices,
    affiliateLinks: affiliateLinks,
    description:   record.get('description') || '',
    variantGroup:  record.get('variantGroup') || '',
    isActive:      record.get('isActive') !== false,
    // PocketBase uses 'created'/'updated'; ProductModel.fromMap reads
    // 'createdAt'/'lastUpdated' so add both so date fields work correctly.
    created:       record.get('created') || '',
    updated:       record.get('updated') || '',
    createdAt:     record.get('created') || '',
    lastUpdated:   record.get('updated') || '',
  };

  var browseFilters = _extractBrowseFilters(pbData);

  return {
    id:            record.id,
    slug:          pbData.slug,
    name:          pbData.name,
    brand:         pbData.brand,
    category:      pbData.category,
    subcategory:   pbData.subcategory,
    source:        pbData.source,
    imageUrl:      pbData.imageUrl,
    techScore:     techScore,
    trendScore:    trendScore,
    price_segment: pbData.price_segment,
    specsCount:    specsCount,
    keySpecsText:  _flattenKeySpecs(keySpecs),
    tags:          tags,
    filterTokens:  browseFilters.tokens,
    screenSizeValue: browseFilters.screenSizeValue,
    batteryCapacityValue: browseFilters.batteryCapacityValue,
    weightValueKg: browseFilters.weightValueKg,
    _raw:          JSON.stringify(pbData),
  };
}

function _normalizeBrowseText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9+]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function _flattenBrowseSpecs(pbData) {
  var flat = {};
  var specs = pbData.specs || {};
  Object.keys(specs).forEach(function(key) {
    var value = specs[key];
    if (value !== null && value !== undefined) flat[String(key)] = String(value);
  });

  var keySpecs = pbData.keySpecs || {};
  Object.keys(keySpecs).forEach(function(key) {
    var value = keySpecs[key];
    if (value !== null && value !== undefined && String(value).trim()) {
      flat[String(key)] = String(value);
    }
  });

  var specSections = pbData.specSections || {};
  Object.keys(specSections).forEach(function(sectionKey) {
    var section = specSections[sectionKey];
    if (!section || typeof section !== 'object') return;
    Object.keys(section).forEach(function(key) {
      var value = section[key];
      if (value !== null && value !== undefined) flat[String(key)] = String(value);
    });
  });

  return flat;
}

function _findBrowseSpecValues(keys, flatSpecs) {
  var matches = [];
  var seen = {};
  keys.forEach(function(key) {
    if (flatSpecs[key] && !seen[flatSpecs[key]]) {
      seen[flatSpecs[key]] = true;
      matches.push(flatSpecs[key]);
    }
    var normalizedKey = _normalizeBrowseText(key);
    var compactKey = normalizedKey.replace(/\s+/g, '');
    Object.keys(flatSpecs).forEach(function(specKey) {
      var normalizedSpecKey = _normalizeBrowseText(specKey);
      var compactSpecKey = normalizedSpecKey.replace(/\s+/g, '');
      if (
        normalizedSpecKey === normalizedKey ||
        normalizedSpecKey.indexOf(normalizedKey) !== -1 ||
        normalizedKey.indexOf(normalizedSpecKey) !== -1 ||
        compactSpecKey === compactKey ||
        compactSpecKey.indexOf(compactKey) !== -1 ||
        compactKey.indexOf(compactSpecKey) !== -1
      ) {
        var value = flatSpecs[specKey];
        if (value && !seen[value]) {
          seen[value] = true;
          matches.push(value);
        }
      }
    });
  });
  return matches;
}

function _extractFirstBrowseNumber(value) {
  var match = String(value || '').match(/(\d+(?:[.,]\d+)?)/);
  if (!match) return null;
  return parseFloat(match[1].replace(',', '.'));
}

function _extractBooleanBrowseValue(value) {
  var normalized = _normalizeBrowseText(value);
  if (!normalized) return null;
  if (
    normalized === 'no' ||
    normalized === 'false' ||
    normalized === 'hayir' ||
    normalized === 'yok' ||
    normalized === 'n a' ||
    normalized === '-'
  ) {
    return false;
  }
  return true;
}

function _extractStorageToken(value) {
  var normalized = _normalizeBrowseText(value);
  if (!normalized) return null;
  if (normalized.indexOf('2 tb') !== -1 || normalized.indexOf('2tb') !== -1) {
    return '2_tb';
  }
  if (normalized.indexOf('1 tb') !== -1 || normalized.indexOf('1tb') !== -1) {
    return '1_tb';
  }
  var number = _extractFirstBrowseNumber(value);
  if (number === null) return null;
  return Math.round(number) + '_gb';
}

function _extractOsToken(value) {
  var normalized = _normalizeBrowseText(value);
  if (!normalized) return null;
  if (normalized.indexOf('chrome os') !== -1 || normalized.indexOf('chromeos') !== -1) {
    return 'chromeos';
  }
  if (normalized.indexOf('ipad os') !== -1 || normalized.indexOf('ipados') !== -1) {
    return 'ipados';
  }
  if (
    normalized.indexOf('mac os') !== -1 ||
    normalized.indexOf('macos') !== -1 ||
    normalized.indexOf('os x') !== -1
  ) {
    return 'macos';
  }
  if (normalized.indexOf('windows') !== -1) return 'windows';
  if (normalized.indexOf('android') !== -1) return 'android';
  if (normalized.indexOf('linux') !== -1) return 'linux';
  if (normalized.indexOf('ios') !== -1 || normalized.indexOf('iphone os') !== -1) {
    return 'ios';
  }
  return null;
}

function _extractProcessorBrandToken(value) {
  var normalized = _normalizeBrowseText(value);
  if (!normalized) return null;
  if (normalized.indexOf('intel') !== -1) return 'intel';
  if (normalized.indexOf('amd') !== -1) return 'amd';
  if (normalized.indexOf('apple') !== -1) return 'apple';
  if (
    normalized.indexOf('qualcomm') !== -1 ||
    normalized.indexOf('snapdragon') !== -1
  ) {
    return 'qualcomm';
  }
  return null;
}

function _extractGpuTypeToken(value) {
  var normalized = _normalizeBrowseText(value);
  if (!normalized) return null;
  if (
    normalized.indexOf('rtx') !== -1 ||
    normalized.indexOf('gtx') !== -1 ||
    normalized.indexOf('geforce') !== -1 ||
    normalized.indexOf('radeon') !== -1 ||
    normalized.indexOf('arc') !== -1 ||
    normalized.indexOf('dedicated') !== -1 ||
    normalized.indexOf('discrete') !== -1
  ) {
    return 'dedicated';
  }
  if (
    normalized.indexOf('integrated') !== -1 ||
    normalized.indexOf('shared') !== -1 ||
    normalized.indexOf('iris') !== -1 ||
    normalized.indexOf('uhd') !== -1 ||
    normalized.indexOf('intel hd') !== -1 ||
    normalized.indexOf('apple gpu') !== -1
  ) {
    return 'integrated';
  }
  return null;
}

function _extractConnectivityTokens(value) {
  var normalized = _normalizeBrowseText(value);
  if (!normalized) return [];
  var tokens = [];
  if (normalized.indexOf('wi fi') !== -1 || normalized.indexOf('wifi') !== -1) {
    tokens.push('wi-fi');
  }
  if (normalized.indexOf('5g') !== -1) tokens.push('5g');
  if (
    normalized.indexOf('4g') !== -1 ||
    normalized.indexOf('cellular') !== -1 ||
    normalized.indexOf('lte') !== -1
  ) {
    tokens.push('4g');
  }
  return tokens;
}

function _extractWeightKg(value) {
  var normalized = _normalizeBrowseText(value);
  var number = _extractFirstBrowseNumber(value);
  if (number === null) return null;
  if (normalized.indexOf('kg') !== -1) return number;
  if (normalized.indexOf('g') !== -1) return number / 1000;
  return number;
}

function _normalizeSocketToken(value) {
  var socket = String(value || '')
    .trim()
    .toUpperCase()
    .replace(/SOCKET/g, '')
    .replace(/FCLGA/g, 'LGA')
    .replace(/[^A-Z0-9]/g, '');
  if (/^STR\d+$/.test(socket)) socket = socket.slice(1);
  return socket;
}

function _socketAliases(socket) {
  var normalized = _normalizeSocketToken(socket);
  if (!normalized) return [];
  var aliases = [normalized];
  if (normalized === 'TRX50' || normalized === 'WRX90') aliases.push('TR5');
  if (normalized === 'TRX40' || normalized === 'WRX80') aliases.push('TR4');
  return aliases;
}

function _extractSocketTokensFromText(value) {
  var text = String(value || '').toUpperCase();
  var matches = text.match(/(?:FC)?LGA\s*\d{3,4}|AM[345]|TRX\d+|STR\d+|TR\d+|WRX\d+|STRP\d+/g) || [];
  var tokens = [];
  matches.forEach(function(match) {
    _socketAliases(match).forEach(function(alias) { tokens.push(alias); });
  });
  return tokens;
}

function _extractBrowseFilters(pbData) {

  var flatSpecs = _flattenBrowseSpecs(pbData);
  var tokens = [];
  var seen = {};

  function addToken(token) {
    if (!token || seen[token]) return;
    seen[token] = true;
    tokens.push(token);
  }

  function firstValue(keys) {
    var values = _findBrowseSpecValues(keys, flatSpecs);
    return values.length ? String(values[0]) : '';
  }

  function matchBucket(rawValue, orderedPairs) {
    var normalized = _normalizeBrowseText(rawValue);
    for (var i = 0; i < orderedPairs.length; i++) {
      if (normalized.indexOf(orderedPairs[i][0]) !== -1) {
        return orderedPairs[i][1];
      }
    }
    return null;
  }

  var ramValue = firstValue(['Memory (RAM)', 'RAM', 'memory ram']);
  var ramNumber = _extractFirstBrowseNumber(ramValue);
  if (ramNumber !== null) addToken('ram:' + Math.round(ramNumber) + '_gb');

  var storageValue = firstValue([
    'Hard Disk (SSD) Size',
    'SSD Size',
    'Internal Storage',
    'internal storage',
    'Storage Size',
    'Storage Capacity',
    'storage',
    'Storage',
    'Capacity',
  ]);
  var storageToken = _extractStorageToken(storageValue);
  if (storageToken !== null) addToken('storage:' + storageToken);

  var osValue = firstValue([
    'Operating System',
    'OPERATING SYSTEM',
    'OS',
    'Platform',
    'Device Operating System',
    'Cihaz Isletim Sistemi',
    'Isletim Sistemi',
  ]);
  var osToken = _extractOsToken(osValue);
  if (osToken !== null) addToken('os:' + osToken);

  var processorBrandToken = _extractProcessorBrandToken(
    firstValue([
      'Processor Brand',
      'processor brand',
      'Processor',
      'CPU',
      'Chip',
      'Chipset',
      'Processor Model',
      'Processor Type',
    ]),
  );
  if (processorBrandToken !== null) {
    addToken('processor_brand:' + processorBrandToken);
  }

  var socketTexts = [
    pbData.name,
    firstValue(['Socket', 'socket', 'CPU Socket', 'Processor Socket']),
    firstValue(['Compatible Sockets', 'Socket Support', 'Supported Socket']),
  ];
  Object.keys(flatSpecs).forEach(function(key) { socketTexts.push(flatSpecs[key]); });
  socketTexts.forEach(function(value) {
    _extractSocketTokensFromText(value).forEach(function(token) {
      addToken('socket:' + token.toLowerCase());
    });
  });

  var gpuTypeToken = _extractGpuTypeToken(
    firstValue([
      'GPU Model',
      'Graphics Card',
      'Graphics Card Type',
      'External Graphics Processor (GPU)',
      'Integrated Graphics Model',
      'Graphics Card Type',
      'Video Card',
    ]),
  );
  if (gpuTypeToken !== null) addToken('gpu_type:' + gpuTypeToken);

  var screenTechValue = firstValue([
    'Screen Technology',
    'screen technology',
    'Display Type',
    'display type',
    'Panel Type',
    'panel type',
    'Display Technology',
    'display technology',
    'Display',
    'Type',
  ]);
  var screenTechBucket = matchBucket(screenTechValue, [
    ['dynamic amoled', 'dynamic_amoled'],
    ['super amoled', 'super_amoled'],
    ['amoled', 'amoled'],
    ['ltpo', 'ltpo'],
    ['oled', 'oled'],
    ['ips', 'ips'],
    ['lcd', 'lcd'],
  ]);
  if (screenTechBucket) addToken('screen_tech:' + screenTechBucket);

  var refreshRateValue = firstValue([
    'Screen Refresh Rate',
    'screen refresh rate',
    'Refresh Rate',
    'refresh rate',
    'Display Refresh Rate',
    'display refresh rate',
  ]);
  var refreshRateNumber = _extractFirstBrowseNumber(refreshRateValue);
  if (refreshRateNumber !== null) {
    var hz = Math.round(refreshRateNumber);
    if ([60, 90, 120, 144, 165, 240].indexOf(hz) !== -1) {
      addToken('refresh_rate:' + hz + '_hz');
    }
  }

  _extractConnectivityTokens(
    firstValue(['Connectivity', 'Connection Type', '4G', '5G', 'Wi-Fi']),
  ).forEach(function(token) {
    addToken('connectivity:' + token);
  });

  [
    ['five_g', ['5G']],
    ['nfc', ['NFC']],
    ['wireless_charging', ['Wireless Charging']],
    ['fast_charging', ['Fast Charging']],
    ['fingerprint', ['Fingerprint Reader', 'fingerprint']],
    ['water_resistance', ['Water Resistance']],
  ].forEach(function(entry) {
    var toggleValue = firstValue(entry[1]);
    if (_extractBooleanBrowseValue(toggleValue) === true) {
      addToken(entry[0] + ':true');
    }
  });

  var screenSizeValue = firstValue(['Screen Size', 'screen size']);
  var displaySizeValue = firstValue(['Display Size', 'display size']);
  var batteryValue = firstValue([
    'Battery Capacity',
    'battery capacity',
    'Battery Capacity (Typical)',
  ]);
  var weightValue = firstValue(['Weight']);

  return {
    tokens: tokens,
    screenSizeValue:
      _extractFirstBrowseNumber(screenSizeValue) ||
      _extractFirstBrowseNumber(displaySizeValue),
    batteryCapacityValue: (function() {
      var number = _extractFirstBrowseNumber(batteryValue);
      return number === null ? undefined : Math.round(number);
    })(),
    weightValueKg: _extractWeightKg(weightValue),
  };
}

/// Upsert a document to Typesense.
function tsUpsert(record) {
  try {
    var doc  = buildTsDoc(record);
    var resp = $http.send({
      method:  'POST',
      url:     TS_URL + '/collections/' + TS_COLLECTION + '/documents?action=upsert',
      headers: _tsHeaders(),
      body:    JSON.stringify(doc),
      timeout: 15,
    });
    if (resp.statusCode >= 200 && resp.statusCode < 300) {
      console.log('[typesense_sync] upsert OK — id=' + record.id);
    } else {
      console.log('[typesense_sync] upsert WARN ' + resp.statusCode + ' — id=' + record.id + ' body=' + resp.raw.slice(0, 200));
    }
  } catch (err) {
    console.log('[typesense_sync] upsert ERROR — id=' + record.id + ':', err);
  }
}

/// Delete a document from Typesense.
function tsDelete(recordId) {
  try {
    var resp = $http.send({
      method:  'DELETE',
      url:     TS_URL + '/collections/' + TS_COLLECTION + '/documents/' + encodeURIComponent(recordId),
      headers: _tsHeaders(),
      timeout: 10,
    });
    if (resp.statusCode >= 200 && resp.statusCode < 300) {
      console.log('[typesense_sync] delete OK — id=' + recordId);
    } else if (resp.statusCode === 404) {
      console.log('[typesense_sync] delete SKIP (not found) — id=' + recordId);
    } else {
      console.log('[typesense_sync] delete WARN ' + resp.statusCode + ' — id=' + recordId);
    }
  } catch (err) {
    console.log('[typesense_sync] delete ERROR — id=' + recordId + ':', err);
  }
}

// ─── hooks ──────────────────────────────────────────────────────────────────

onRecordAfterCreateSuccess(function (e) {
  try { tsUpsert(e.record); } catch (err) {
    console.log('[typesense_sync] create hook error:', err);
  }
}, 'products');

onRecordAfterUpdateSuccess(function (e) {
  try { tsUpsert(e.record); } catch (err) {
    console.log('[typesense_sync] update hook error:', err);
  }
}, 'products');

onRecordAfterDeleteSuccess(function (e) {
  try { tsDelete(e.record.id); } catch (err) {
    console.log('[typesense_sync] delete hook error:', err);
  }
}, 'products');
