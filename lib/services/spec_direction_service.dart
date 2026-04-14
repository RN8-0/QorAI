/// Compair — Spec Direction & Component Ranking Service
///
/// Determines which value is "better" for each spec key:
///   - Numeric specs: "higher" or "lower" (e.g. RAM higher, weight lower)
///   - Boolean specs: Yes > No (handled separately)
///   - Component names: uses pre-built ranking tables (processor, GPU)
///
/// Data sources (in priority order):
///   1. Firestore `spec_directions/base` overrides (admin-editable)
///   2. Static base dictionary (this file)
///
library;

import 'dart:convert';
import 'dart:io';
import 'package:compair/core/constants.dart';
import 'package:compair/core/pb_client.dart';

enum SpecDirection { higher, lower, neutral }

class SpecDirectionService {
  // PocketBase overrides cache
  Map<String, SpecDirection> _firestoreOverrides = {};
  bool _loaded = false;

  // ─── Comprehensive Static Spec Direction Map ───────────────────────────────
  // Keys are normalized to lowercase with spaces (matches _normalizeKey below).
  // Add new keys here as new spec types appear in scraped products.
  static const Map<String, SpecDirection> _staticDirections = {
    // ─ Processor / CPU
    'cpu frequency': SpecDirection.higher,
    'cpu core': SpecDirection.higher,
    'processor cores': SpecDirection.higher,
    'thread count': SpecDirection.higher,
    'cache': SpecDirection.higher,
    'passmark score': SpecDirection.higher,
    'cinebench': SpecDirection.higher,
    'geekbench': SpecDirection.higher,
    'antutu': SpecDirection.higher,
    'cpu manufacturing technology': SpecDirection.lower, // smaller nm = better
    'manufacturing technology': SpecDirection.lower,
    'process node': SpecDirection.lower,
    'tdp': SpecDirection.lower,

    // ─ Memory
    'memory ram': SpecDirection.higher,
    'ram': SpecDirection.higher,
    'internal storage': SpecDirection.higher,
    'storage capacity': SpecDirection.higher,
    'memory bandwidth': SpecDirection.higher,
    'memory speed': SpecDirection.higher,
    'memory clock': SpecDirection.higher,
    'cache size': SpecDirection.higher,
    'vram': SpecDirection.higher,
    'video memory': SpecDirection.higher,

    // ─ Display
    'screen size': SpecDirection.higher,
    'pixel density': SpecDirection.higher,
    'screen refresh rate': SpecDirection.higher,
    'refresh rate': SpecDirection.higher,
    'brightness': SpecDirection.higher,
    'color count': SpecDirection.higher,
    'color accuracy': SpecDirection.higher,
    'screen area': SpecDirection.higher,
    'screen to body ratio': SpecDirection.higher,
    'response time': SpecDirection.lower,
    'input lag': SpecDirection.lower,

    // ─ Battery
    'battery capacity': SpecDirection.higher,
    'battery capacity typical': SpecDirection.higher,
    'video playback': SpecDirection.higher,
    'music playback': SpecDirection.higher,
    'battery life': SpecDirection.higher,
    'fast charging power max': SpecDirection.higher,
    'charging power': SpecDirection.higher,
    'wireless charging power': SpecDirection.higher,
    'removable battery': SpecDirection.neutral,

    // ─ Camera
    'camera resolution': SpecDirection.higher,
    'second rear camera resolution': SpecDirection.higher,
    'third rear camera resolution': SpecDirection.higher,
    'front camera resolution': SpecDirection.higher,
    'aperture': SpecDirection.lower, // lower f-number = wider aperture = better
    'second rear camera aperture': SpecDirection.lower,
    'third rear camera aperture': SpecDirection.lower,
    'front camera aperture': SpecDirection.lower,
    'camera sensor size': SpecDirection.neutral,
    'video fps value': SpecDirection.higher,
    'front camera fps value': SpecDirection.higher,
    'dxomark': SpecDirection.higher,
    'optical zoom': SpecDirection.higher,
    'digital zoom': SpecDirection.higher,
    'focal length': SpecDirection.neutral,

    // ─ GPU / Graphics
    'gpu clock': SpecDirection.higher,
    'graphics clock': SpecDirection.higher,
    'shader processors': SpecDirection.higher,
    'texture units': SpecDirection.higher,
    'render outputs': SpecDirection.higher,
    'memory bus': SpecDirection.higher,
    'memory bandwidth gpu': SpecDirection.higher,
    'tflops': SpecDirection.higher,
    'shader model': SpecDirection.higher,
    'directx': SpecDirection.higher,
    'opengl': SpecDirection.higher,

    // ─ Design / Physical
    'weight': SpecDirection.lower,
    'height': SpecDirection.neutral,
    'width': SpecDirection.neutral,
    'thickness': SpecDirection.lower,
    'depth': SpecDirection.lower,

    // ─ Network / Connectivity
    '4g download': SpecDirection.higher,
    '4g upload': SpecDirection.higher,
    '5g download': SpecDirection.higher,
    '5g upload': SpecDirection.higher,
    'wifi speed': SpecDirection.higher,
    'bluetooth version': SpecDirection.higher,
    'usb version': SpecDirection.higher,
    'number of lines': SpecDirection.higher,

    // ─ Safety / SAR — LOWER IS BETTER (radiation exposure)
    'sar value': SpecDirection.lower,
    'sar value 10g head': SpecDirection.lower,
    'sar value 10g body': SpecDirection.lower,
    'sar value 1g head': SpecDirection.lower,
    'sar value 1g body': SpecDirection.lower,
    'sar': SpecDirection.lower,

    // ─ Audio
    'frequency response': SpecDirection.higher,
    'sensitivity': SpecDirection.higher,
    'driver size': SpecDirection.higher,
    'frequency response low': SpecDirection.lower,
    'frequency response high': SpecDirection.higher,
    'thd': SpecDirection.lower, // total harmonic distortion, lower = cleaner
    'noise isolation': SpecDirection.higher,
    'noise cancellation': SpecDirection.higher,

    // ─ Power / PSU
    'wattage': SpecDirection.neutral,
    'efficiency': SpecDirection.higher,
    'power consumption': SpecDirection.lower,
    'idle power': SpecDirection.lower,
    'load power': SpecDirection.lower,

    // ─ General scores
    'score': SpecDirection.higher,
    'benchmark': SpecDirection.higher,
    'rating': SpecDirection.higher,
    'release year': SpecDirection.higher,

    // ─ Price
    'price': SpecDirection.lower,
    'msrp': SpecDirection.lower,
  };

  // ─── Component Ranking Tables ──────────────────────────────────────────────
  // Score 0-100. Higher score = better component.
  // Used when comparing string spec values like "Apple A17 Bionic" vs "Apple A14 Bionic"

  static const Map<String, int> processorRankings = {
    // ── Apple A-series (iOS/iPadOS) ──
    'a8': 20, 'a8x': 22,
    'a9': 25, 'a9x': 27,
    'a10 fusion': 30, 'a10x fusion': 32,
    'a11 bionic': 38,
    'a12 bionic': 44, 'a12x bionic': 46, 'a12z bionic': 47,
    'a13 bionic': 52,
    'a14 bionic': 60,
    'a15 bionic': 70,
    'a16 bionic': 80,
    'a17 pro': 90, 'a17 bionic': 90,
    'a18': 95, 'a18 pro': 97,
    'apple m1': 78, 'apple m2': 85, 'apple m3': 92, 'apple m4': 96,
    // ── Qualcomm Snapdragon (Android flagship) ──
    'snapdragon 660': 30,
    'snapdragon 670': 32,
    'snapdragon 710': 34,
    'snapdragon 720g': 36,
    'snapdragon 730': 35,
    'snapdragon 730g': 37,
    'snapdragon 732g': 38,
    'snapdragon 765g': 42,
    'snapdragon 778g': 50,
    'snapdragon 780g': 52,
    'snapdragon 855': 55,
    'snapdragon 855+': 57,
    'snapdragon 860': 56,
    'snapdragon 865': 62,
    'snapdragon 865+': 64,
    'snapdragon 870': 65,
    'snapdragon 888': 72,
    'snapdragon 888+': 74,
    'snapdragon 8 gen 1': 78,
    'snapdragon 8+ gen 1': 80,
    'snapdragon 8 gen 2': 88,
    'snapdragon 8 gen 3': 94,
    'snapdragon 8 elite': 98,
    // ── Qualcomm mid-range ──
    'snapdragon 4 gen 1': 28,
    'snapdragon 4 gen 2': 32,
    'snapdragon 6 gen 1': 40,
    'snapdragon 6s gen 3': 38,
    // ── MediaTek Dimensity ──
    'dimensity 700': 28,
    'dimensity 810': 33,
    'dimensity 900': 40,
    'dimensity 1000': 55,
    'dimensity 1080': 52,
    'dimensity 1100': 58,
    'dimensity 1200': 62,
    'dimensity 1300': 64,
    'dimensity 2000': 75,
    'dimensity 8020': 58,
    'dimensity 8100': 68,
    'dimensity 8200': 72,
    'dimensity 8300': 78,
    'dimensity 9000': 82,
    'dimensity 9200': 88,
    'dimensity 9300': 93,
    'dimensity 9400': 97,
    // ── Samsung Exynos ──
    'exynos 990': 60,
    'exynos 2100': 70,
    'exynos 2200': 75,
    'exynos 2300': 78,
    'exynos 2400': 88,
    // ── Intel Core (laptop/desktop) ──
    'core i3': 35,
    'core i5': 55,
    'core i7': 75,
    'core i9': 90,
    'core ultra 5': 70,
    'core ultra 7': 82,
    'core ultra 9': 92,
    // ── AMD Ryzen ──
    'ryzen 3': 38,
    'ryzen 5': 58,
    'ryzen 7': 78,
    'ryzen 9': 92,
    // ── AMD (general) ──
    'athlon': 20,
    'epyc': 95,
    'threadripper': 97,
    // ── Apple Mac chips ──
    'm1': 78, 'm1 pro': 83, 'm1 max': 86, 'm1 ultra': 90,
    'm2': 85, 'm2 pro': 89, 'm2 max': 92, 'm2 ultra': 95,
    'm3': 91, 'm3 pro': 94, 'm3 max': 96, 'm3 ultra': 98,
    'm4': 96, 'm4 pro': 98,
  };

  static const Map<String, int> gpuRankings = {
    // ── NVIDIA GeForce (consumer) ──
    'rtx 2060': 55,
    'rtx 2070': 62,
    'rtx 2080': 70,
    'rtx 3060': 65,
    'rtx 3070': 75,
    'rtx 3080': 85,
    'rtx 3090': 91,
    'rtx 4060': 72,
    'rtx 4070': 82,
    'rtx 4080': 92,
    'rtx 4090': 99,
    'rtx 5070': 87,
    'rtx 5080': 95,
    'rtx 5090': 100,
    'gtx 1060': 35,
    'gtx 1070': 42,
    'gtx 1080': 50,
    'gtx 1650': 28,
    'gtx 1660': 38,
    // ── AMD Radeon ──
    'rx 6600': 60,
    'rx 6700': 70,
    'rx 6800': 80,
    'rx 6900': 88,
    'rx 7600': 68,
    'rx 7700': 75,
    'rx 7800': 82,
    'rx 7900': 92,
    // ── Mobile/Integrated ──
    'adreno 730': 55,
    'adreno 740': 65,
    'adreno 750': 75,
    'adreno 830': 85,
    'mali-g710': 52,
    'mali-g715': 62,
    'mali-g720': 72,
    'immortalis-g715': 65,
    'immortalis-g720': 75,
    'apple gpu': 70, // generic
    'intel iris xe': 45,
    'intel arc': 60,
  };

  // ─── Load Firestore Overrides ──────────────────────────────────────────────

  Future<void> loadFirestoreOverrides() async {
    if (_loaded) return;
    try {
      final record = await pb
          .collection('spec_directions')
          .getFirstListItem('key = "base"')
          .timeout(const Duration(seconds: 5));
      final data = record.data;
      for (final entry in data.entries) {
        if (entry.key == 'key') continue;
        final dir = _parseDirection(entry.value?.toString());
        if (dir != null) {
          _firestoreOverrides[entry.key] = dir;
        }
      }
      _loaded = true;
    } catch (_) {
      _loaded = true;
    }
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  /// Returns the direction for a given spec key.
  SpecDirection getDirection(String specKey) {
    final normalized = _normalizeKey(specKey);

    // 1. PocketBase override
    if (_firestoreOverrides.containsKey(normalized)) {
      return _firestoreOverrides[normalized]!;
    }

    // 2. Exact match in static map
    if (_staticDirections.containsKey(normalized)) {
      return _staticDirections[normalized]!;
    }

    // 3. Partial match (spec key contains known keyword)
    for (final entry in _staticDirections.entries) {
      if (normalized.contains(entry.key) || entry.key.contains(normalized)) {
        return entry.value;
      }
    }

    // 4. Keyword heuristics
    if (_matchesLowerBetter(normalized)) return SpecDirection.lower;
    if (_matchesHigherBetter(normalized)) return SpecDirection.higher;

    return SpecDirection.neutral;
  }

  /// Given a spec key and list of string values, returns the index of the
  /// "better" value, or -1 if undecidable.
  int findBetterIndex(String specKey, List<String> values) {
    if (values.length < 2) return -1;
    if (values.any((v) => v == '—')) return -1;

    // 1. Boolean check
    final lowers = values.map((v) => v.toLowerCase()).toList();
    final allBool = lowers.every(
      (v) =>
          v == 'yes' ||
          v == 'no' ||
          v == '✓ yes' ||
          v == '✗ no' ||
          v.startsWith('✓') ||
          v.startsWith('✗'),
    );
    if (allBool) {
      final yesIdx = lowers.indexWhere(
        (v) => v.contains('yes') || v.startsWith('✓'),
      );
      final hasNo = lowers.any((v) => v.contains('no') || v.startsWith('✗'));
      if (yesIdx >= 0 && hasNo) return yesIdx;
      return -1;
    }

    // 2. Try component ranking (processor/GPU names)
    final componentResult = _compareByComponentRanking(specKey, values);
    if (componentResult >= 0) return componentResult;

    // 3. Extract numeric values for numeric comparison
    final nums = values.map(_extractNumber).toList();
    if (nums.every((n) => n != null)) {
      final doubles = nums.cast<double>();
      final maxVal = doubles.reduce((a, b) => a > b ? a : b);
      final minVal = doubles.reduce((a, b) => a < b ? a : b);
      if (maxVal == minVal) return -1;

      final direction = getDirection(specKey);
      switch (direction) {
        case SpecDirection.higher:
          return doubles.indexWhere((n) => n == maxVal);
        case SpecDirection.lower:
          return doubles.indexWhere((n) => n == minVal);
        case SpecDirection.neutral:
          return -1;
      }
    }

    return -1;
  }

  // ─── Component Ranking ────────────────────────────────────────────────────

  int _compareByComponentRanking(String specKey, List<String> values) {
    final key = _normalizeKey(specKey);
    final isProcessor =
        key.contains('processor') ||
        key.contains('chipset') ||
        key.contains('cpu') ||
        key.contains('chip') ||
        key.contains('soc');
    final isGpu = key.contains('gpu') || key.contains('graphics');

    Map<String, int>? rankingTable;
    if (isProcessor) rankingTable = processorRankings;
    if (isGpu) rankingTable = gpuRankings;
    if (rankingTable == null) return -1;

    final scores = values.map((v) => _lookupRanking(rankingTable!, v)).toList();
    if (scores.every((s) => s == 0)) return -1;
    if (scores.every((s) => s == scores.first)) return -1;

    final maxScore = scores.reduce((a, b) => a > b ? a : b);
    return scores.indexWhere((s) => s == maxScore);
  }

  int _lookupRanking(Map<String, int> table, String value) {
    final v = value.toLowerCase().trim();
    // Exact match
    if (table.containsKey(v)) return table[v]!;
    // Partial match
    for (final entry in table.entries) {
      if (v.contains(entry.key) || entry.key.contains(v)) {
        return entry.value;
      }
    }
    return 0;
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  static String _normalizeKey(String key) {
    return key
        .toLowerCase()
        .replaceAll(RegExp(r'[_\-\/]'), ' ')
        .replaceAll(RegExp(r'\s+'), ' ')
        .trim();
  }

  static double? _extractNumber(String value) {
    final cleaned = value
        .replaceAll(',', '.')
        .replaceAll(RegExp(r'[^0-9.]'), ' ')
        .trim();
    // Take first number in the string
    final match = RegExp(r'\d+\.?\d*').firstMatch(cleaned);
    if (match == null) return null;
    return double.tryParse(match.group(0)!);
  }

  static bool _matchesLowerBetter(String key) {
    const lowerKeywords = [
      'weight',
      'thickness',
      'price',
      'watt',
      'tdp',
      'noise',
      'latency',
      'response time',
      'heat',
      'temperature',
      'lag',
      'power consumption',
      'idle',
      'nm',
      'sar',
      'radiation',
      'thd',
      'distortion',
      'delay',
    ];
    return lowerKeywords.any((kw) => key.contains(kw));
  }

  static bool _matchesHigherBetter(String key) {
    const higherKeywords = [
      'score',
      'speed',
      'capacity',
      'resolution',
      'frequency',
      'rate',
      'bandwidth',
      'core',
      'thread',
      'cache',
      'memory',
      'storage',
      'battery',
      'playback',
      'camera',
      'zoom',
      'fps',
      'benchmark',
      'ratio',
      'density',
    ];
    return higherKeywords.any((kw) => key.contains(kw));
  }

  static SpecDirection? _parseDirection(String? value) {
    switch (value?.toLowerCase()) {
      case 'higher':
        return SpecDirection.higher;
      case 'lower':
        return SpecDirection.lower;
      case 'neutral':
        return SpecDirection.neutral;
      default:
        return null;
    }
  }

  // ─── Gemini Batch Analysis (called from admin panel or on first run) ────────

  /// Analyzes a list of unknown spec keys via Gemini (through the PB proxy)
  /// and writes results to the spec_directions collection.
  /// Called once from admin panel → results cached forever.
  Future<void> analyzeAndCacheViaGemini(
    List<String> specKeys, [
    String? _legacyKey,
  ]) async {
    if (specKeys.isEmpty) return;

    const endpoint = '$kPbBaseUrl/api/ai/gemini';

    final keyList = specKeys.take(100).join('\n');
    final prompt =
        '''You are a tech spec analyzer. For each spec below, determine if a HIGHER value is better ("higher"), a LOWER value is better ("lower"), or it is not comparable ("neutral").

Spec keys:
$keyList

Return ONLY valid JSON object like:
{"spec_key_1": "higher", "spec_key_2": "lower", "spec_key_3": "neutral"}

Use the exact spec key names as provided. No explanation, only JSON.''';

    try {
      final body = {
        'model': AppConstants.geminiLiteModel,
        'contents': [
          {
            'parts': [
              {'text': prompt},
            ],
          },
        ],
        'generationConfig': {'temperature': 0.1, 'maxOutputTokens': 2048},
      };

      // Load existing overrides from PocketBase
      Map<String, dynamic> existing = {};
      String? recordId;
      try {
        final record = await pb
            .collection('spec_directions')
            .getFirstListItem('key = "base"');
        existing = Map<String, dynamic>.from(record.data);
        recordId = record.id;
      } catch (_) {}

      // Call Gemini via PB proxy
      final response = await _postJson(endpoint, body);
      if (response == null) return;

      // Parse JSON response
      final text =
          response['candidates']?[0]?['content']?['parts']?[0]?['text']
              as String? ??
          '{}';
      final jsonMatch = RegExp(r'\{[^}]+\}', dotAll: true).firstMatch(text);
      if (jsonMatch == null) return;

      final updates = <String, dynamic>{...existing};
      final jsonStr = jsonMatch.group(0)!;
      // Simple JSON parse for key:value pairs
      final pairs = RegExp(r'"([^"]+)"\s*:\s*"([^"]+)"').allMatches(jsonStr);
      for (final match in pairs) {
        final k = match.group(1)!.toLowerCase().trim();
        final v = match.group(2)!.toLowerCase().trim();
        if (v == 'higher' || v == 'lower' || v == 'neutral') {
          updates[k] = v;
        }
      }

      // Save back to PocketBase
      if (recordId != null) {
        await pb.collection('spec_directions').update(recordId, body: updates);
      } else {
        await pb
            .collection('spec_directions')
            .create(body: {...updates, 'key': 'base'});
      }
      // Refresh local cache
      _firestoreOverrides = {};
      _loaded = false;
      await loadFirestoreOverrides();
    } catch (_) {}
  }

  Future<Map<String, dynamic>?> _postJson(String url, Map body) async {
    try {
      final request = await HttpClient().postUrl(Uri.parse(url));
      request.headers.contentType = ContentType.json;
      final token = currentPbAuthToken();
      if (token != null) {
        request.headers.set(HttpHeaders.authorizationHeader, token);
      }
      request.write(jsonEncode(body));
      final response = await request.close();
      final responseBody = await response.transform(utf8.decoder).join();
      return jsonDecode(responseBody) as Map<String, dynamic>;
    } catch (_) {
      return null;
    }
  }
}
