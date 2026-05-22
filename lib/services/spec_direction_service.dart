/// Qor AI — Spec Direction & Component Ranking Service
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
import 'package:qor_ai/core/constants.dart';
import 'package:qor_ai/core/pb_client.dart';

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
    'video recording': SpecDirection.higher,
    'video recording resolution': SpecDirection.higher,
    'video resolution': SpecDirection.higher,
    'screen resolution': SpecDirection.higher,
    'display resolution': SpecDirection.higher,
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
    'bluetooth standard': SpecDirection.higher,
    'bluetooth': SpecDirection.higher,
    'wi fi standard': SpecDirection.higher,
    'wifi standard': SpecDirection.higher,
    'wireless standard': SpecDirection.higher,
    'usb version': SpecDirection.higher,
    'usb standard': SpecDirection.higher,
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

  /// Given a spec key and list of string values, returns the first index of the
  /// "better" value, or -1 if undecidable.
  int findBetterIndex(String specKey, List<String> values) {
    final winners = findBetterIndexes(specKey, values);
    return winners.isEmpty ? -1 : winners.first;
  }

  /// Returns all winning indexes. This matters for 3-4 product comparisons,
  /// where two products can share the best value.
  Set<int> findBetterIndexes(String specKey, List<String> values) {
    if (values.length < 2) return {};

    final indexed = values
        .asMap()
        .entries
        .where((entry) {
          return !_isMissingSpecValue(entry.value);
        })
        .toList(growable: false);
    if (indexed.length < 2) return {};

    final comparableValues = indexed.map((entry) => entry.value).toList();
    final normalizedSet = comparableValues
        .map((v) => v.trim().toLowerCase())
        .toSet();
    if (normalizedSet.length == 1) return {};

    // 1. Boolean check
    final boolScores = comparableValues.map(_boolScore).toList();
    if (boolScores.every((score) => score != null) &&
        boolScores.toSet().length > 1) {
      final maxScore = boolScores.whereType<int>().reduce(
        (a, b) => a > b ? a : b,
      );
      return {
        for (var i = 0; i < boolScores.length; i++)
          if (boolScores[i] == maxScore) indexed[i].key,
      };
    }

    // 2. Text-only feature quality (ANC > passive noise isolation, OLED > LCD,
    // NVMe > SATA/HDD, newer wireless standards, better audio codecs, etc.).
    final qualitativeScores = comparableValues
        .map((value) => _scoreQualitativeValue(specKey, value))
        .toList();
    if (qualitativeScores.every((score) => score != null) &&
        qualitativeScores.toSet().length > 1) {
      final maxScore = qualitativeScores.whereType<double>().reduce(
        (a, b) => a > b ? a : b,
      );
      return {
        for (var i = 0; i < qualitativeScores.length; i++)
          if (qualitativeScores[i] == maxScore) indexed[i].key,
      };
    }

    // 3. Try component ranking (processor/GPU names)
    final componentResult = _compareByComponentRanking(
      specKey,
      comparableValues,
    );
    if (componentResult >= 0) return {indexed[componentResult].key};

    // 4. Extract comparable numeric values (unit-aware + resolution-aware)
    final nums = comparableValues
        .map((value) => _extractComparableNumber(specKey, value))
        .toList();
    if (nums.every((n) => n != null)) {
      final doubles = nums.cast<double>();
      final maxVal = doubles.reduce((a, b) => a > b ? a : b);
      final minVal = doubles.reduce((a, b) => a < b ? a : b);
      if (maxVal == minVal) return {};

      final direction = getDirection(specKey);
      final target = switch (direction) {
        SpecDirection.higher => maxVal,
        SpecDirection.lower => minVal,
        SpecDirection.neutral => null,
      };
      if (target == null) return {};
      return {
        for (var i = 0; i < doubles.length; i++)
          if (doubles[i] == target) indexed[i].key,
      };
    }

    return {};
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

  static bool _isMissingSpecValue(String value) {
    final trimmed = value.trim().toLowerCase();
    return trimmed.isEmpty ||
        trimmed == '—' ||
        trimmed == '-' ||
        trimmed == '?' ||
        trimmed == 'null' ||
        trimmed == '{}' ||
        trimmed == '[]' ||
        trimmed == 'n/a' ||
        trimmed == 'na';
  }

  static int? _boolScore(String value) {
    final v = value.trim().toLowerCase();
    if (v.startsWith('✓') ||
        v == 'yes' ||
        v == 'var' ||
        v == 'evet' ||
        v == 'true' ||
        v == 'available' ||
        v == 'ja' ||
        v == 'oui' ||
        v == 'sí' ||
        v == 'si' ||
        v == 'sim' ||
        v == 'tak') {
      return 1;
    }
    if (v.startsWith('✗') ||
        v.startsWith('×') ||
        v == 'no' ||
        v == 'yok' ||
        v == 'hayır' ||
        v == 'hayir' ||
        v == 'false' ||
        v == 'not available' ||
        v == 'nein' ||
        v == 'non' ||
        v == 'não' ||
        v == 'nao' ||
        v == 'nie') {
      return 0;
    }
    return null;
  }

  static double? _scoreQualitativeValue(String specKey, String value) {
    final key = _normalizeKey(specKey);
    final v = _normalizeKey(value);
    if (v.isEmpty) return null;

    final boolScore = _boolScore(value);
    if (boolScore != null) return boolScore.toDouble();

    final isNoiseSpec =
        key.contains('noise') ||
        key.contains('gurultu') ||
        key.contains('cancellation') ||
        key.contains('engelleme') ||
        key.contains('anc');
    if (isNoiseSpec) {
      if (v.contains('adaptive') ||
          v.contains('hybrid') ||
          v.contains('active') ||
          v.contains('aktif') ||
          v.contains('anc')) {
        return 100;
      }
      if (v.contains('passive') || v.contains('pasif') || v.contains('pnc')) {
        return 45;
      }
      if (v.contains('none') || v.contains('no ') || v.contains('yok')) {
        return 0;
      }
    }

    final isDisplaySpec =
        key.contains('display') ||
        key.contains('screen') ||
        key.contains('ekran') ||
        key.contains('panel');
    if (isDisplaySpec) {
      if (v.contains('micro led')) return 98;
      if (v.contains('mini led')) return 94;
      if (v.contains('oled') || v.contains('amoled')) return 90;
      if (v.contains('ips')) return 66;
      if (v.contains('lcd') || v.contains('led')) return 50;
      if (v.contains('tn')) return 30;
    }

    final isStorageSpec =
        key.contains('storage') ||
        key.contains('depolama') ||
        key.contains('disk') ||
        key.contains('ssd') ||
        key.contains('hdd');
    if (isStorageSpec) {
      if (v.contains('nvme') || v.contains('pcie')) return 95;
      if (v.contains('ufs 4')) return 90;
      if (v.contains('ufs 3')) return 82;
      if (v.contains('ssd')) return 74;
      if (v.contains('ufs')) return 68;
      if (v.contains('emmc')) return 44;
      if (v.contains('hdd')) return 32;
    }

    final wirelessScore = _scoreWirelessStandard(key, v);
    if (wirelessScore != null) return wirelessScore;

    final codecScore = _scoreAudioCodec(key, v);
    if (codecScore != null) return codecScore;

    final listScore = _scoreListRichness(key, value);
    if (listScore != null) return listScore;

    return null;
  }

  static double? _scoreWirelessStandard(String key, String value) {
    final isWirelessSpec =
        key.contains('wifi') ||
        key.contains('wi fi') ||
        key.contains('wireless') ||
        key.contains('bluetooth') ||
        key.contains('standard') ||
        key.contains('connect') ||
        key.contains('baglanti');
    if (!isWirelessSpec) return null;

    if (value.contains('wi fi 7') || value.contains('wifi 7')) return 97;
    if (value.contains('802 11be')) return 97;
    if (value.contains('wi fi 6e') || value.contains('wifi 6e')) return 90;
    if (value.contains('wi fi 6') || value.contains('wifi 6')) return 84;
    if (value.contains('802 11ax')) return 84;
    if (value.contains('wi fi 5') || value.contains('wifi 5')) return 72;
    if (value.contains('802 11ac')) return 72;
    if (value.contains('802 11n')) return 54;
    return null;
  }

  static double? _scoreAudioCodec(String key, String value) {
    final isCodecSpec =
        key.contains('codec') ||
        key.contains('audio') ||
        key.contains('ses') ||
        key.contains('bluetooth');
    if (!isCodecSpec) return null;

    if (value.contains('ldac') || value.contains('aptx lossless')) return 96;
    if (value.contains('aptx adaptive')) return 90;
    if (value.contains('aptx hd')) return 84;
    if (value.contains('aptx')) return 76;
    if (value.contains('aac')) return 66;
    if (value.contains('sbc')) return 48;
    return null;
  }

  static double? _scoreListRichness(String key, String value) {
    final isRichListSpec =
        key.contains('feature') ||
        key.contains('ozellik') ||
        key.contains('profile') ||
        key.contains('codec') ||
        key.contains('sensor') ||
        key.contains('port') ||
        key.contains('standard');
    if (!isRichListSpec) return null;

    final parts = value
        .split(RegExp(r'[,;/|]\s*|\n+'))
        .map((part) => part.trim())
        .where((part) => part.isNotEmpty)
        .toSet();
    return parts.length > 1 ? parts.length.toDouble() : null;
  }

  static String _normalizeKey(String key) {
    return key
        .toLowerCase()
        .replaceAll('ı', 'i')
        .replaceAll('İ', 'i')
        .replaceAll('ç', 'c')
        .replaceAll('ğ', 'g')
        .replaceAll('ö', 'o')
        .replaceAll('ş', 's')
        .replaceAll('ü', 'u')
        .replaceAll(RegExp(r'[_\-\/]'), ' ')
        .replaceAll(RegExp(r'[^a-z0-9]+'), ' ')
        .replaceAll(RegExp(r'\s+'), ' ')
        .trim();
  }

  static double? _extractComparableNumber(String specKey, String value) {
    final normalizedKey = _normalizeKey(specKey);
    final normalizedValue = value.toLowerCase().trim();

    final frequencyRangeScore = _extractFrequencyRangeScore(
      normalizedKey,
      normalizedValue,
    );
    if (frequencyRangeScore != null) return frequencyRangeScore;

    final resolutionScore = _extractResolutionScore(
      normalizedKey,
      normalizedValue,
    );
    if (resolutionScore != null) return resolutionScore;

    final storageValue = _extractStorageInGb(normalizedKey, normalizedValue);
    if (storageValue != null) return storageValue;

    final weightValue = _extractWeightInGrams(normalizedKey, normalizedValue);
    if (weightValue != null) return weightValue;

    return _extractNumber(normalizedValue);
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

  static double? _extractResolutionScore(String key, String value) {
    final looksLikeResolution =
        key.contains('resolution') ||
        key.contains('cozunurluk') ||
        key.contains('video recording') ||
        key.contains('recording') ||
        key.contains('display') ||
        key.contains('ekran') ||
        key.contains('screen') ||
        RegExp(r'\d+\s*[kp]\b', caseSensitive: false).hasMatch(value) ||
        RegExp(
          r'\d{3,5}\s*[x×]\s*\d{3,5}',
          caseSensitive: false,
        ).hasMatch(value);
    if (!looksLikeResolution) return null;

    final dimensionsMatch = RegExp(
      r'(\d{3,5})\s*[x×]\s*(\d{3,5})',
      caseSensitive: false,
    ).firstMatch(value);
    if (dimensionsMatch != null) {
      final width = double.tryParse(dimensionsMatch.group(1)!);
      final height = double.tryParse(dimensionsMatch.group(2)!);
      if (width != null && height != null) {
        return width * height;
      }
    }

    for (final entry in _resolutionAliases.entries) {
      if (value.contains(entry.key)) return entry.value;
    }
    return null;
  }

  static double? _extractStorageInGb(String key, String value) {
    final looksLikeStorage =
        key.contains('storage') ||
        key.contains('depolama') ||
        key.contains('memory') ||
        key.contains('bellek') ||
        key.contains('ram') ||
        key.contains('onbellek') ||
        key.contains('cache') ||
        key.contains('vram');
    if (!looksLikeStorage) return null;

    final match = RegExp(
      r'(\d+(?:\.\d+)?)\s*(tb|gb|mb)',
      caseSensitive: false,
    ).firstMatch(value);
    if (match == null) return null;

    final amount = double.tryParse(match.group(1)!);
    final unit = match.group(2)?.toLowerCase();
    if (amount == null || unit == null) return null;
    switch (unit) {
      case 'tb':
        return amount * 1024;
      case 'gb':
        return amount;
      case 'mb':
        return amount / 1024;
      default:
        return null;
    }
  }

  static double? _extractWeightInGrams(String key, String value) {
    if (!key.contains('weight') && !key.contains('agirlik')) return null;

    final match = RegExp(
      r'(\d+(?:\.\d+)?)\s*(kg|g|lb|lbs|oz)',
      caseSensitive: false,
    ).firstMatch(value);
    if (match == null) return null;

    final amount = double.tryParse(match.group(1)!);
    final unit = match.group(2)?.toLowerCase();
    if (amount == null || unit == null) return null;
    switch (unit) {
      case 'kg':
        return amount * 1000;
      case 'g':
        return amount;
      case 'lb':
      case 'lbs':
        return amount * 453.59237;
      case 'oz':
        return amount * 28.3495;
      default:
        return null;
    }
  }

  static const Map<String, double> _resolutionAliases = {
    '8k': 7680 * 4320,
    'uhd 8k': 7680 * 4320,
    '5k': 5120 * 2880,
    '4k': 3840 * 2160,
    'uhd': 3840 * 2160,
    'ultra hd': 3840 * 2160,
    'qhd': 2560 * 1440,
    '2k': 2560 * 1440,
    'wqhd': 2560 * 1440,
    'fhd+': 2400 * 1080,
    'fhd': 1920 * 1080,
    'full hd': 1920 * 1080,
    '1080p': 1920 * 1080,
    'hd+': 1600 * 900,
    'hd': 1280 * 720,
    '720p': 1280 * 720,
  };

  static double? _extractFrequencyRangeScore(String key, String value) {
    final looksLikeFrequency =
        key.contains('frequency response') ||
        key.contains('frekans tepkisi') ||
        key.contains('frequency range') ||
        key.contains('frekans araligi');
    if (!looksLikeFrequency) return null;

    final matches = RegExp(
      r'(\d+(?:[.,]\d+)?)\s*(hz|khz)?',
      caseSensitive: false,
    ).allMatches(value).toList();
    if (matches.length < 2) return null;

    double? asHz(RegExpMatch match) {
      final amount = double.tryParse(match.group(1)!.replaceAll(',', '.'));
      if (amount == null) return null;
      final unit = match.group(2)?.toLowerCase();
      return unit == 'khz' ? amount * 1000 : amount;
    }

    final first = asHz(matches.first);
    final last = asHz(matches.last);
    if (first == null || last == null || last <= first) return null;
    return last - first;
  }

  static bool _matchesLowerBetter(String key) {
    const lowerKeywords = [
      'weight',
      'agirlik',
      'thickness',
      'kalinlik',
      'price',
      'fiyat',
      'watt',
      'tdp',
      'rms noise',
      'noise',
      'gurultu',
      'latency',
      'gecikme',
      'response time',
      'tepki',
      'heat',
      'temperature',
      'sicaklik',
      'lag',
      'power consumption',
      'guc tuketimi',
      'idle',
      'nm',
      'nanometre',
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
      'puan',
      'version',
      'versiyon',
      'standard',
      'standardi',
      'bluetooth',
      'wifi',
      'wi fi',
      'usb',
      'generation',
      'nesil',
      'speed',
      'hiz',
      'capacity',
      'kapasite',
      'resolution',
      'cozunurluk',
      'frequency',
      'frekans',
      'rate',
      'oran',
      'yenileme',
      'bandwidth',
      'bant genisligi',
      'core',
      'cekirdek',
      'thread',
      'is parcacigi',
      'izlek',
      'cache',
      'onbellek',
      'memory',
      'bellek',
      'storage',
      'depolama',
      'battery',
      'batarya',
      'pil',
      'playback',
      'camera',
      'kamera',
      'zoom',
      'fps',
      'benchmark',
      'ratio',
      'kapsam',
      'boyut',
      'boyutu',
      'density',
      'parlaklik',
      'renk',
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
  Future<void> analyzeAndCacheViaGemini(List<String> specKeys) async {
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
