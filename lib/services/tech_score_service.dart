/// Compair - Tech Score Service
///
/// Category-based weighted technical score calculation system.
/// Defines independent score matrices for each product category.
/// Normalizes within category when a new product is added.
///
/// Score range: 0-100 (newest flagship = 100)
/// When iPhone 18 Pro Max comes out → iPhone 17 Pro Max: ~96-98
library;

import 'dart:math';

/// Category-based weight matrices
class TechScoreWeights {
  /// Smartphone weights (total = 1.0)
  static const Map<String, double> smartphones = {
    'processor': 0.25,
    'camera': 0.20,
    'display': 0.15,
    'battery': 0.15,
    'memory': 0.10,
    'build': 0.10,
    'connectivity': 0.05,
  };

  /// Laptop weights
  static const Map<String, double> laptops = {
    'processor': 0.25,
    'display': 0.20,
    'memory': 0.15,
    'battery': 0.10,
    'build': 0.10,
    'gpu': 0.10,
    'keyboard': 0.05,
    'connectivity': 0.05,
  };

  /// Tablet weights
  static const Map<String, double> tablets = {
    'processor': 0.20,
    'display': 0.25,
    'battery': 0.15,
    'camera': 0.10,
    'memory': 0.10,
    'build': 0.10,
    'stylus': 0.05,
    'connectivity': 0.05,
  };

  /// Headphone weights
  static const Map<String, double> headphones = {
    'sound_quality': 0.30,
    'anc': 0.20,
    'battery': 0.15,
    'comfort': 0.15,
    'microphone': 0.10,
    'connectivity': 0.10,
  };

  /// Smartwatch weights
  static const Map<String, double> smartwatches = {
    'health_sensors': 0.25,
    'battery': 0.20,
    'display': 0.15,
    'processor': 0.15,
    'build': 0.10,
    'connectivity': 0.10,
    'ecosystem': 0.05,
  };

  static Map<String, double> getWeightsForCategory(String category) {
    switch (category.toLowerCase()) {
      case 'smartphones':
      case 'phones':
        return smartphones;
      case 'laptops':
        return laptops;
      case 'tablets':
        return tablets;
      case 'headphones':
        return headphones;
      case 'smartwatches':
      case 'wearables':
        return smartwatches;
      default:
        return smartphones;
    }
  }
}

/// Processor benchmark reference values (AnTuTu v10 based, 2026)
class ProcessorBenchmarks {
  static const Map<String, int> scores = {
    // Apple - 2026
    'a19 pro': 2200000,
    'a19': 2000000,
    'a18 pro': 1900000,
    'a18': 1700000,
    'a17 pro': 1550000,
    'a17': 1400000,
    'a16 bionic': 1200000,
    'a15 bionic': 1050000,
    'a14 bionic': 900000,
    'm4 pro': 2500000,
    'm4': 2200000,
    'm3 pro': 2100000,
    'm3': 1900000,
    'm2': 1700000,
    'm1': 1500000,
    // Qualcomm - 2026
    'snapdragon 8 elite': 2300000,
    'snapdragon 8 gen 4': 2300000,
    'snapdragon 8 gen 3': 2050000,
    'snapdragon 8 gen 2': 1650000,
    'snapdragon 8 gen 1': 1300000,
    'snapdragon 8+ gen 1': 1400000,
    'snapdragon 888': 1050000,
    'snapdragon 7+ gen 3': 1200000,
    'snapdragon 7+ gen 2': 1100000,
    'snapdragon 7 gen 1': 850000,
    'snapdragon 6 gen 3': 750000,
    'snapdragon 6 gen 1': 600000,
    'snapdragon 4 gen 2': 500000,
    // Samsung Exynos
    'exynos 2500': 2100000,
    'exynos 2400': 1850000,
    'exynos 2200': 1200000,
    // MediaTek
    'dimensity 9400': 2250000,
    'dimensity 9300': 2000000,
    'dimensity 9200': 1600000,
    'dimensity 8300': 1150000,
    'dimensity 8200': 1050000,
    'dimensity 7300': 750000,
    'dimensity 7200': 680000,
    'dimensity 6300': 500000,
    // Google Tensor
    'tensor g5': 1600000,
    'tensor g4': 1350000,
    'tensor g3': 1150000,
    // HiSilicon (Huawei)
    'kirin 9100': 1800000,
    'kirin 9000s': 1100000,
    'kirin 9000': 950000,
    // Intel (laptops)
    'core ultra 9 285h': 2200000,
    'core ultra 7 265h': 1900000,
    'core ultra 5 235h': 1600000,
    'core i9-14900h': 2000000,
    'core i7-14700h': 1700000,
    'core i5-14500h': 1400000,
    'core i9-13900h': 1800000,
    'core i7-13700h': 1500000,
    // AMD (laptops)
    'ryzen 9 8945hs': 2100000,
    'ryzen 7 8845hs': 1800000,
    'ryzen 5 8645hs': 1500000,
    'ryzen 9 7945hx': 1900000,
    'ryzen 7 7840hs': 1600000,
  };

  static int getScore(String chipset) {
    final normalized = chipset.toLowerCase().trim();
    // Exact match
    if (scores.containsKey(normalized)) return scores[normalized]!;
    // Partial match
    for (final entry in scores.entries) {
      if (normalized.contains(entry.key) || entry.key.contains(normalized)) {
        return entry.value;
      }
    }
    return 0;
  }

  /// Convert AnTuTu score to 0-100 normalized score
  static double normalizeScore(int antutuScore, {int maxReference = 2300000}) {
    if (antutuScore <= 0) return 0;
    return (antutuScore / maxReference * 100).clamp(0, 100);
  }
}

/// Camera benchmark reference values (DxOMark-like, 0-160 range)
class CameraBenchmarks {
  static double scoreFromSpecs(Map<String, dynamic> cameraSpecs) {
    double score = 0;

    // Main camera megapixels
    final mainMp = _extractMegapixel(cameraSpecs['main']?.toString() ?? '');
    if (mainMp >= 200) {
      score += 35;
    } else if (mainMp >= 108) {
      score += 30;
    } else if (mainMp >= 50) {
      score += 25;
    } else if (mainMp >= 48) {
      score += 22;
    } else if (mainMp >= 12) {
      score += 18;
    } else {
      score += mainMp * 0.3;
    }

    // Ultrawide
    final uwMp = _extractMegapixel(cameraSpecs['ultrawide']?.toString() ?? '');
    if (uwMp >= 48) {
      score += 12;
    } else if (uwMp >= 12) {
      score += 8;
    } else if (uwMp > 0) {
      score += 5;
    }

    // Telephoto
    final teleStr = cameraSpecs['telephoto']?.toString() ?? '';
    if (teleStr.contains('5x') || teleStr.contains('10x')) {
      score += 18;
    } else if (teleStr.contains('3x')) {
      score += 14;
    } else if (teleStr.contains('2x')) {
      score += 10;
    } else if (teleStr.isNotEmpty && teleStr != 'null') {
      score += 7;
    }

    // Video capability
    final video = cameraSpecs['video']?.toString() ?? '';
    if (video.contains('8K')) {
      score += 15;
    } else if (video.contains('4K') && video.contains('120')) {
      score += 14;
    } else if (video.contains('4K') && video.contains('60')) {
      score += 12;
    } else if (video.contains('4K')) {
      score += 10;
    } else if (video.contains('1080')) {
      score += 6;
    }

    // Front camera
    final frontMp = _extractMegapixel(cameraSpecs['front']?.toString() ?? '');
    if (frontMp >= 32) {
      score += 8;
    } else if (frontMp >= 12) {
      score += 6;
    } else if (frontMp > 0) {
      score += 3;
    }

    // Aperture bonus
    final mainStr = cameraSpecs['main']?.toString() ?? '';
    if (mainStr.contains('f/1.2') || mainStr.contains('f/1.3')) {
      score += 6;
    } else if (mainStr.contains('f/1.5') || mainStr.contains('f/1.6') || mainStr.contains('f/1.7')) {
      score += 4;
    } else if (mainStr.contains('f/1.8') || mainStr.contains('f/1.9')) {
      score += 2;
    }

    // OIS bonus
    if (mainStr.toLowerCase().contains('ois')) score += 4;

    return (score / 100 * 100).clamp(0, 100);
  }

  static int _extractMegapixel(String text) {
    final regex = RegExp(r'(\d+)\s*MP', caseSensitive: false);
    final match = regex.firstMatch(text);
    if (match != null) return int.tryParse(match.group(1)!) ?? 0;
    // Try just numbers at start
    final numRegex = RegExp(r'^(\d+)');
    final numMatch = numRegex.firstMatch(text);
    if (numMatch != null) return int.tryParse(numMatch.group(1)!) ?? 0;
    return 0;
  }
}

/// Display quality scoring
class DisplayScore {
  static double calculate(Map<String, dynamic> displaySpecs) {
    double score = 0;

    // Resolution
    final resolution = displaySpecs['resolution']?.toString() ?? '';
    if (resolution.contains('3120') || resolution.contains('3088') || resolution.contains('2796')) {
      score += 25; // QHD+ / ProMotion
    } else if (resolution.contains('2560') || resolution.contains('2340') || resolution.contains('2400')) {
      score += 20; // FHD+
    } else if (resolution.contains('1920') || resolution.contains('2532')) {
      score += 15; // FHD
    } else if (resolution.contains('1080')) {
      score += 12;
    } else {
      score += 8;
    }

    // Panel type
    final type = (displaySpecs['type'] ?? displaySpecs['technology'] ?? '').toString().toLowerCase();
    if (type.contains('ltpo') || type.contains('dynamic amoled')) {
      score += 20;
    } else if (type.contains('oled') || type.contains('amoled') || type.contains('super retina')) {
      score += 18;
    } else if (type.contains('ips') || type.contains('lcd')) {
      score += 10;
    } else {
      score += 12;
    }

    // Refresh rate
    final refreshStr = (displaySpecs['refreshRate'] ?? displaySpecs['refresh_rate'] ?? '').toString();
    final refreshRate = _extractNumber(refreshStr);
    if (refreshRate >= 144) {
      score += 20;
    } else if (refreshRate >= 120) {
      score += 18;
    } else if (refreshRate >= 90) {
      score += 14;
    } else if (refreshRate >= 60) {
      score += 10;
    }

    // Brightness
    final brightness = (displaySpecs['brightness'] ?? displaySpecs['peak_brightness'] ?? '').toString();
    final nits = _extractNumber(brightness);
    if (nits >= 2500) {
      score += 20;
    } else if (nits >= 2000) {
      score += 18;
    } else if (nits >= 1500) {
      score += 15;
    } else if (nits >= 1000) {
      score += 12;
    } else if (nits >= 500) {
      score += 8;
    }

    // HDR support
    final features = (displaySpecs['features'] ?? displaySpecs['hdr'] ?? '').toString().toLowerCase();
    if (features.contains('hdr10+') || features.contains('dolby vision')) {
      score += 10;
    } else if (features.contains('hdr10') || features.contains('hdr')) {
      score += 6;
    }

    // Size bonus (large screen bonus)
    final sizeStr = (displaySpecs['size'] ?? '').toString();
    final size = _extractDouble(sizeStr);
    if (size >= 6.7) {
      score += 5;
    } else if (size >= 6.1) {
      score += 4;
    } else if (size >= 5.5) {
      score += 3;
    }

    return (score / 100 * 100).clamp(0, 100);
  }

  static int _extractNumber(String text) {
    final regex = RegExp(r'(\d+)');
    final match = regex.firstMatch(text);
    return match != null ? int.tryParse(match.group(1)!) ?? 0 : 0;
  }

  static double _extractDouble(String text) {
    final regex = RegExp(r'(\d+\.?\d*)');
    final match = regex.firstMatch(text);
    return match != null ? double.tryParse(match.group(1)!) ?? 0.0 : 0.0;
  }
}

/// Battery scoring
class BatteryScore {
  static double calculate(Map<String, dynamic> batterySpecs) {
    double score = 0;

    // Capacity (mAh)
    final capacityStr = (batterySpecs['capacity'] ?? '').toString();
    final capacity = _extractNumber(capacityStr);
    if (capacity >= 6000) {
      score += 35;
    } else if (capacity >= 5500) {
      score += 32;
    } else if (capacity >= 5000) {
      score += 28;
    } else if (capacity >= 4500) {
      score += 24;
    } else if (capacity >= 4000) {
      score += 20;
    } else if (capacity >= 3500) {
      score += 16;
    } else if (capacity >= 3000) {
      score += 12;
    } else {
      score += 8;
    }

    // Charging speed
    final chargingStr = (batterySpecs['charging'] ?? batterySpecs['fast_charging'] ?? '').toString();
    final wattage = _extractNumber(chargingStr);
    if (wattage >= 120) {
      score += 30;
    } else if (wattage >= 67) {
      score += 25;
    } else if (wattage >= 45) {
      score += 20;
    } else if (wattage >= 30) {
      score += 15;
    } else if (wattage >= 20) {
      score += 12;
    } else if (wattage > 0) {
      score += 8;
    }

    // Wireless charging
    final wireless = chargingStr.toLowerCase();
    if (wireless.contains('wireless') || wireless.contains('qi')) {
      final wirelessWatt = _extractWirelessWattage(wireless);
      if (wirelessWatt >= 50) {
        score += 18;
      } else if (wirelessWatt >= 15) {
        score += 14;
      } else {
        score += 10;
      }
    }

    // Reverse wireless charging
    if (wireless.contains('reverse') || wireless.contains('powershare')) {
      score += 7;
    }

    return (score / 90 * 100).clamp(0, 100);
  }

  static int _extractNumber(String text) {
    final regex = RegExp(r'(\d+)');
    final match = regex.firstMatch(text);
    return match != null ? int.tryParse(match.group(1)!) ?? 0 : 0;
  }

  static int _extractWirelessWattage(String text) {
    final regex = RegExp(r'(\d+)\s*[wW]\s*wireless', caseSensitive: false);
    final match = regex.firstMatch(text);
    return match != null ? int.tryParse(match.group(1)!) ?? 0 : 0;
  }
}

/// RAM/Storage scoring
class MemoryScore {
  static double calculate(Map<String, dynamic> memorySpecs) {
    double score = 0;

    // RAM
    final ramStr = (memorySpecs['ram'] ?? '').toString();
    final ramGB = _extractMaxGB(ramStr);
    if (ramGB >= 16) {
      score += 40;
    } else if (ramGB >= 12) {
      score += 35;
    } else if (ramGB >= 8) {
      score += 28;
    } else if (ramGB >= 6) {
      score += 20;
    } else if (ramGB >= 4) {
      score += 12;
    } else {
      score += 5;
    }

    // Storage
    final storageStr = (memorySpecs['storage'] ?? '').toString();
    final storageGB = _extractMaxGB(storageStr);
    if (storageGB >= 1024) {
      score += 35;
    } else if (storageGB >= 512) {
      score += 30;
    } else if (storageGB >= 256) {
      score += 25;
    } else if (storageGB >= 128) {
      score += 18;
    } else if (storageGB >= 64) {
      score += 10;
    } else {
      score += 5;
    }

    // Expandable storage bonus
    final expandable = memorySpecs['expandable'];
    if (expandable == true || expandable == 'true') {
      score += 8;
    }

    // Storage type
    final type = (memorySpecs['storageType'] ?? memorySpecs['type'] ?? '').toString().toLowerCase();
    if (type.contains('ufs 4')) {
      score += 12;
    } else if (type.contains('ufs 3')) {
      score += 8;
    } else if (type.contains('nvme')) {
      score += 12;
    } else if (type.contains('ssd')) {
      score += 10;
    }

    return (score / 95 * 100).clamp(0, 100);
  }

  static int _extractMaxGB(String text) {
    // "1TB" -> 1024, "512GB" -> 512, "[8GB, 12GB]" -> 12
    final tbRegex = RegExp(r'(\d+)\s*TB', caseSensitive: false);
    final tbMatch = tbRegex.firstMatch(text);
    if (tbMatch != null) return (int.tryParse(tbMatch.group(1)!) ?? 0) * 1024;

    final regex = RegExp(r'(\d+)\s*GB', caseSensitive: false);
    final matches = regex.allMatches(text);
    int maxGB = 0;
    for (final m in matches) {
      final gb = int.tryParse(m.group(1)!) ?? 0;
      if (gb > maxGB) maxGB = gb;
    }
    return maxGB;
  }
}

/// Build quality scoring
class BuildScore {
  static double calculate(Map<String, dynamic> physicalSpecs) {
    double score = 0;

    // IP durability rating
    final ipRating = (physicalSpecs['ipRating'] ?? physicalSpecs['ip_rating'] ?? '').toString().toLowerCase();
    if (ipRating.contains('ip69') || ipRating.contains('ip68')) {
      score += 30;
    } else if (ipRating.contains('ip67')) {
      score += 25;
    } else if (ipRating.contains('ip65') || ipRating.contains('ip54')) {
      score += 18;
    } else if (ipRating.contains('ip53') || ipRating.contains('ip52')) {
      score += 12;
    }

    // Material
    final build = (physicalSpecs['build'] ?? physicalSpecs['material'] ?? '').toString().toLowerCase();
    if (build.contains('titanium')) {
      score += 30;
    } else if (build.contains('ceramic')) {
      score += 28;
    } else if (build.contains('aluminum') || build.contains('aluminium')) {
      score += 22;
    } else if (build.contains('stainless')) {
      score += 25;
    } else if (build.contains('glass')) {
      score += 18;
    } else if (build.contains('plastic') || build.contains('polycarbonate')) {
      score += 10;
    } else {
      score += 12;
    }

    // Screen protection
    if (build.contains('gorilla armor') || build.contains('ceramic shield')) {
      score += 20;
    } else if (build.contains('gorilla victus 2') || build.contains('victus 2')) {
      score += 18;
    } else if (build.contains('gorilla victus') || build.contains('victus')) {
      score += 15;
    } else if (build.contains('gorilla glass') || build.contains('gorilla')) {
      score += 12;
    }

    // Weight (lightness bonus)
    final weightStr = (physicalSpecs['weight'] ?? '').toString();
    final weight = _extractWeight(weightStr);
    if (weight > 0) {
      if (weight <= 170) {
        score += 15;
      } else if (weight <= 190) {
        score += 12;
      } else if (weight <= 210) {
        score += 10;
      } else if (weight <= 240) {
        score += 7;
      } else {
        score += 4;
      }
    }

    return (score / 95 * 100).clamp(0, 100);
  }

  static double _extractWeight(String text) {
    final regex = RegExp(r'(\d+\.?\d*)\s*g', caseSensitive: false);
    final match = regex.firstMatch(text);
    return match != null ? double.tryParse(match.group(1)!) ?? 0.0 : 0.0;
  }
}

/// Connectivity scoring
class ConnectivityScore {
  static double calculate(Map<String, dynamic> connectivitySpecs) {
    double score = 0;

    // 5G support
    final network = (connectivitySpecs['network'] ?? '').toString().toLowerCase();
    if (network.contains('5g')) {
      score += 25;
    } else if (network.contains('4g') || network.contains('lte')) {
      score += 15;
    }

    // WiFi
    final wifi = (connectivitySpecs['wifi'] ?? '').toString().toLowerCase();
    if (wifi.contains('wi-fi 7') || wifi.contains('wifi 7') || wifi.contains('802.11be')) {
      score += 25;
    } else if (wifi.contains('wi-fi 6e') || wifi.contains('wifi 6e')) {
      score += 22;
    } else if (wifi.contains('wi-fi 6') || wifi.contains('wifi 6') || wifi.contains('802.11ax')) {
      score += 18;
    } else if (wifi.contains('802.11ac') || wifi.contains('wifi 5')) {
      score += 12;
    }

    // Bluetooth
    final bt = (connectivitySpecs['bluetooth'] ?? '').toString();
    final btVersion = _extractDouble(bt);
    if (btVersion >= 5.4) {
      score += 15;
    } else if (btVersion >= 5.3) {
      score += 13;
    } else if (btVersion >= 5.2) {
      score += 11;
    } else if (btVersion >= 5.0) {
      score += 8;
    }

    // NFC
    final nfc = connectivitySpecs['nfc'];
    if (nfc == true || nfc == 'true' || nfc.toString().toLowerCase() == 'yes') {
      score += 10;
    }

    // USB
    final usb = (connectivitySpecs['usb'] ?? connectivitySpecs['port'] ?? '').toString().toLowerCase();
    if (usb.contains('thunderbolt') || usb.contains('usb 4')) {
      score += 15;
    } else if (usb.contains('3.2') || usb.contains('3.1')) {
      score += 12;
    } else if (usb.contains('type-c') || usb.contains('usb-c')) {
      score += 10;
    } else if (usb.contains('lightning')) {
      score += 8;
    } else if (usb.contains('micro')) {
      score += 4;
    }

    // Satellite/UWB bonus
    final extras = connectivitySpecs.toString().toLowerCase();
    if (extras.contains('satellite') || extras.contains('sos')) score += 5;
    if (extras.contains('uwb') || extras.contains('ultra-wideband')) score += 5;

    return (score / 95 * 100).clamp(0, 100);
  }

  static double _extractDouble(String text) {
    final regex = RegExp(r'(\d+\.?\d*)');
    final match = regex.firstMatch(text);
    return match != null ? double.tryParse(match.group(1)!) ?? 0.0 : 0.0;
  }
}

/// Main Tech Score Service
class TechScoreService {
  /// Calculate technical score for a single product (0-100)
  TechScoreResult calculateTechScore({
    required Map<String, dynamic> specs,
    required String category,
  }) {
    final weights = TechScoreWeights.getWeightsForCategory(category);
    final subscores = <String, double>{};

    // Calculate score for each sub-category
    for (final entry in weights.entries) {
      final subScore = _calculateSubScore(entry.key, specs, category);
      subscores[entry.key] = subScore;
    }

    // Weighted total
    double totalScore = 0;
    for (final entry in weights.entries) {
      totalScore += (subscores[entry.key] ?? 0) * entry.value;
    }

    return TechScoreResult(
      totalScore: totalScore.roundToDouble(),
      subscores: subscores,
      category: category,
    );
  }

  /// Calculate score for a spec sub-category
  double _calculateSubScore(String key, Map<String, dynamic> specs, String category) {
    switch (key) {
      case 'processor':
        return _scoreProcessor(specs);
      case 'camera':
        return _scoreCamera(specs);
      case 'display':
        return _scoreDisplay(specs);
      case 'battery':
        return _scoreBattery(specs);
      case 'memory':
        return _scoreMemory(specs);
      case 'build':
        return _scoreBuild(specs);
      case 'connectivity':
        return _scoreConnectivity(specs);
      case 'gpu':
        return _scoreGPU(specs);
      case 'keyboard':
        return 50.0; // Default — manual override needed
      case 'stylus':
        return _scoreStylus(specs);
      case 'sound_quality':
        return 50.0; // Default — manual override
      case 'anc':
        return 50.0;
      case 'comfort':
        return 50.0;
      case 'microphone':
        return 50.0;
      case 'health_sensors':
        return 50.0;
      case 'ecosystem':
        return 50.0;
      default:
        return 50.0;
    }
  }

  double _scoreProcessor(Map<String, dynamic> specs) {
    // specs.processor.chipset or specs.chipset
    final processor = _getNestedMap(specs, 'processor');
    final chipset = (processor['chipset'] ?? processor['name'] ??
        specs['chipset'] ?? specs['processor'] ?? '').toString();

    if (chipset.isEmpty) return 30.0;

    final antutuScore = ProcessorBenchmarks.getScore(chipset);
    if (antutuScore > 0) {
      return ProcessorBenchmarks.normalizeScore(antutuScore);
    }

    // Fallback: keyword-based scoring
    final lower = chipset.toLowerCase();
    if (lower.contains('a19') || lower.contains('8 elite') || lower.contains('dimensity 9400')) return 95;
    if (lower.contains('a18') || lower.contains('8 gen 3') || lower.contains('dimensity 9300')) return 88;
    if (lower.contains('a17') || lower.contains('8 gen 2') || lower.contains('dimensity 9200')) return 80;
    if (lower.contains('a16') || lower.contains('8 gen 1')) return 70;
    if (lower.contains('a15') || lower.contains('888')) return 60;
    if (lower.contains('7+') || lower.contains('7 gen')) return 55;
    if (lower.contains('6 gen') || lower.contains('dimensity 7')) return 45;
    if (lower.contains('4 gen') || lower.contains('dimensity 6')) return 35;
    return 30;
  }

  double _scoreCamera(Map<String, dynamic> specs) {
    final camera = _getNestedMap(specs, 'camera');
    if (camera.isEmpty && !specs.containsKey('main_camera')) return 30;
    return CameraBenchmarks.scoreFromSpecs(camera.isNotEmpty ? camera : specs);
  }

  double _scoreDisplay(Map<String, dynamic> specs) {
    final display = _getNestedMap(specs, 'display');
    if (display.isEmpty && !specs.containsKey('resolution')) return 30;
    return DisplayScore.calculate(display.isNotEmpty ? display : specs);
  }

  double _scoreBattery(Map<String, dynamic> specs) {
    final battery = _getNestedMap(specs, 'battery');
    if (battery.isEmpty && !specs.containsKey('capacity')) return 30;
    return BatteryScore.calculate(battery.isNotEmpty ? battery : specs);
  }

  double _scoreMemory(Map<String, dynamic> specs) {
    final memory = _getNestedMap(specs, 'memory');
    if (memory.isEmpty && !specs.containsKey('ram')) return 30;
    return MemoryScore.calculate(memory.isNotEmpty ? memory : specs);
  }

  double _scoreBuild(Map<String, dynamic> specs) {
    final physical = _getNestedMap(specs, 'physical');
    if (physical.isEmpty && !specs.containsKey('build')) return 30;
    return BuildScore.calculate(physical.isNotEmpty ? physical : specs);
  }

  double _scoreConnectivity(Map<String, dynamic> specs) {
    final connectivity = _getNestedMap(specs, 'connectivity');
    if (connectivity.isEmpty && !specs.containsKey('network')) return 30;
    return ConnectivityScore.calculate(connectivity.isNotEmpty ? connectivity : specs);
  }

  double _scoreGPU(Map<String, dynamic> specs) {
    final gpu = (specs['gpu'] ?? _getNestedMap(specs, 'processor')['gpu'] ?? '').toString().toLowerCase();
    if (gpu.contains('rtx 40') || gpu.contains('rtx 4090') || gpu.contains('rtx 4080')) return 95;
    if (gpu.contains('rtx 4070') || gpu.contains('rtx 4060')) return 85;
    if (gpu.contains('rtx 30') || gpu.contains('rtx 3080')) return 78;
    if (gpu.contains('rtx 3060') || gpu.contains('rtx 3070')) return 72;
    if (gpu.contains('adreno 750') || gpu.contains('adreno 740')) return 70;
    if (gpu.contains('mali-g7') || gpu.contains('immortalis')) return 65;
    if (gpu.contains('adreno 7') || gpu.contains('mali-g6')) return 55;
    if (gpu.contains('intel') && gpu.contains('arc')) return 50;
    return 40;
  }

  double _scoreStylus(Map<String, dynamic> specs) {
    final hasStylus = specs.toString().toLowerCase();
    if (hasStylus.contains('s pen') || hasStylus.contains('apple pencil')) return 90;
    if (hasStylus.contains('stylus')) return 70;
    return 20;
  }

  Map<String, dynamic> _getNestedMap(Map<String, dynamic> specs, String key) {
    final value = specs[key];
    if (value is Map<String, dynamic>) return value;
    if (value is Map) return Map<String, dynamic>.from(value);
    return {};
  }

  /// Intra-category normalization
  /// Highest scoring product = 100, others are proportionally scaled
  List<NormalizedScore> normalizeCategory(List<RawTechScore> rawScores) {
    if (rawScores.isEmpty) return [];

    final maxScore = rawScores.map((s) => s.rawScore).reduce(max);
    if (maxScore <= 0) return rawScores.map((s) => NormalizedScore(
      productId: s.productId,
      normalizedScore: 50,
      rawScore: s.rawScore,
      subscores: s.subscores,
    )).toList();

    return rawScores.map((s) {
      final normalized = (s.rawScore / maxScore * 100).roundToDouble();
      return NormalizedScore(
        productId: s.productId,
        normalizedScore: normalized,
        rawScore: s.rawScore,
        subscores: s.subscores,
      );
    }).toList();
  }
}

/// Technical score result
class TechScoreResult {
  final double totalScore;
  final Map<String, double> subscores;
  final String category;

  const TechScoreResult({
    required this.totalScore,
    required this.subscores,
    required this.category,
  });
}

/// Raw technical score (before normalization)
class RawTechScore {
  final String productId;
  final double rawScore;
  final Map<String, double> subscores;

  const RawTechScore({
    required this.productId,
    required this.rawScore,
    required this.subscores,
  });
}

/// Normalized technical score
class NormalizedScore {
  final String productId;
  final double normalizedScore;
  final double rawScore;
  final Map<String, double> subscores;

  const NormalizedScore({
    required this.productId,
    required this.normalizedScore,
    required this.rawScore,
    required this.subscores,
  });
}
