import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:qor_ai/core/pb_client.dart' as pb_client;
import 'package:qor_ai/core/spec_word_dictionary.dart' as spec_dict;

String _normalizeSpecText(String text) {
  return text.replaceAll('\u00A0', ' ').replaceAll(RegExp(r'\s+'), ' ').trim();
}

String _scrubTurkishLeaks(String text, {required bool isValue}) {
  var out = _normalizeSpecText(text)
      .replaceAll(
        RegExp(r'\bÖne Çıkanlar\b', caseSensitive: false),
        'Highlights',
      )
      .replaceAll(RegExp(r'\bGenel\b', caseSensitive: false), 'General')
      .replaceAll(
        RegExp(r'\bÖzellikler\b', caseSensitive: false),
        'Specifications',
      )
      .replaceAll(
        RegExp(r'Çözünürlüğü|Çözünürlük', caseSensitive: false),
        'Resolution',
      )
      .replaceAll(
        RegExp(r'Frekansı|Frekans', caseSensitive: false),
        'Frequency',
      )
      .replaceAll(RegExp(r'Çekirdeği|Çekirdek', caseSensitive: false), 'Core')
      .replaceAll(RegExp(r'Desteği|Destek', caseSensitive: false), 'Support')
      .replaceAll(RegExp(r'Sayısı|Sayı', caseSensitive: false), 'Count')
      .replaceAll(RegExp(r'Hızlı|Hizli', caseSensitive: false), 'Fast')
      .replaceAll(RegExp(r'Şarj|Sarj', caseSensitive: false), 'Charging')
      .replaceAll(RegExp(r'Kablosuz', caseSensitive: false), 'Wireless')
      .replaceAll(RegExp(r'Kamera', caseSensitive: false), 'Camera')
      .replaceAll(RegExp(r'Ses', caseSensitive: false), 'Audio')
      .replaceAll(RegExp(r'Çıkışı|Çıkış', caseSensitive: false), 'Output')
      .replaceAll(
        RegExp(r'Suya Dayanıklılık|Suya Dayanıklı', caseSensitive: false),
        'Water Resistance',
      )
      .replaceAll(RegExp(r'Gövde|Govde', caseSensitive: false), 'Body')
      .replaceAll(RegExp(r'Oranı|Oran', caseSensitive: false), 'Ratio')
      .replaceAll(RegExp(r'Hat', caseSensitive: false), 'SIM')
      .replaceAll(RegExp(r'Ekran', caseSensitive: false), 'Display')
      .replaceAll(RegExp(r'\bVar\b', caseSensitive: false), 'Yes')
      .replaceAll(RegExp(r'\bEvet\b', caseSensitive: false), 'Yes')
      .replaceAll(RegExp(r'\bYok\b', caseSensitive: false), 'No')
      .replaceAll(RegExp(r'\bHayır\b|\bHayir\b', caseSensitive: false), 'No')
      .replaceAll(RegExp(r'Siyah', caseSensitive: false), 'Black')
      .replaceAll(RegExp(r'Beyaz', caseSensitive: false), 'White')
      .replaceAll(RegExp(r'Kırmızı|Kirmizi', caseSensitive: false), 'Red')
      .replaceAll(RegExp(r'Mavi', caseSensitive: false), 'Blue')
      .replaceAll(RegExp(r'Yeşil|Yesil', caseSensitive: false), 'Green')
      .replaceAll(RegExp(r'Gri', caseSensitive: false), 'Gray')
      .replaceAll(RegExp(r'Altın|Altin', caseSensitive: false), 'Gold')
      .replaceAll(RegExp(r'Gümüş|Gumus', caseSensitive: false), 'Silver');
  out = _normalizeSpecText(out);
  // Eskiden çevrilemeyen Türkçe metin boşaltılıyordu (value → '' → özellik
  // listeden tamamen düşüyordu) veya label "Specification" yapılıyordu.
  // Kullanıcı PB'deki TÜM özelliklerin eksiksiz görünmesini istiyor; bu yüzden
  // çeviri bulunamasa bile temizlenmiş metni olduğu gibi koruyoruz — veri
  // asla kaybolmaz, jenerik placeholder gösterilmez.
  return out;
}

/// Merges the sharded TR→multi dictionary payloads into a normalized map.
/// Runs in a background isolate (via compute) so the 78k-entry build never
/// blocks the UI thread.
Map<String, Map<String, String>> _parseTrDictShards(
  List<Map<String, dynamic>> shardTerms,
) {
  final loaded = <String, Map<String, String>>{};
  for (final terms in shardTerms) {
    for (final entry in terms.entries) {
      final source = _normalizeSpecText(entry.key).toLowerCase();
      final rawTranslations = entry.value;
      if (source.isEmpty || rawTranslations is! Map) continue;
      final translations = <String, String>{};
      for (final langEntry in rawTranslations.entries) {
        final lang = langEntry.key.toString().toLowerCase().trim();
        final text = langEntry.value?.toString().trim() ?? '';
        if (lang.isNotEmpty && text.isNotEmpty) translations[lang] = text;
      }
      if (translations.isNotEmpty) loaded[source] = translations;
    }
  }
  return loaded;
}

Map<String, Map<String, String>> _buildSpecTranslationMaps(String rawJson) {
  final decoded = Map<String, String>.from(json.decode(rawJson) as Map);
  final reverse = <String, String>{};
  for (final entry in decoded.entries) {
    reverse[_normalizeSpecText(entry.value).toLowerCase()] = entry.key;
  }
  return {'enTr': decoded, 'trEn': reverse};
}

/// Loads the EN→TR spec dictionary from assets and provides bidirectional translation.
/// Uses the scraper's 7,300+ entry dictionary for comprehensive coverage.
class SpecTranslationService {
  SpecTranslationService._();
  static final instance = SpecTranslationService._();

  Map<String, String>? _enTr;
  Map<String, String>? _trEn; // Reverse lookup: TR→EN
  Map<String, Map<String, String>> _trLocale = {};
  bool _loading = false;
  final Map<String, String> _canonicalCache = {};
  final Map<String, String> _labelLocaleCache = {};
  final Map<String, String> _valueLocaleCache = {};

  static final RegExp _segmentDelimiterPattern = RegExp(
    r'(\r?\n+|•\s*|·\s*|;\s*|\s+\|\s+)',
  );

  String normalize(String text) => _normalizeSpecText(text);

  Future<void> init() async {
    if (_enTr != null || _loading) return;
    _loading = true;
    try {
      final raw = await rootBundle.loadString('assets/en_tr_specs.json');
      final decoded = await compute(_buildSpecTranslationMaps, raw);
      _enTr = decoded['enTr'] ?? <String, String>{};
      _trEn = decoded['trEn'] ?? <String, String>{};
    } catch (_) {
      _enTr = {};
      _trEn = {};
    } finally {
      await _loadLiveTurkishDictionary();
      _loading = false;
    }
  }

  Future<void> _loadLiveTurkishDictionary() async {
    try {
      const manifestKey = 'tr_translation_dict_manifest';
      const shardPrefix = 'tr_translation_dict__part_';
      final manifest = await pb_client.pb
          .collection('public_config')
          .getFirstListItem('key = "$manifestKey"', fields: 'value');
      final manifestValue = manifest.data['value'];
      if (manifestValue is! Map) return;
      final batchId = manifestValue['batchId']?.toString();
      final totalShards = (manifestValue['totalShards'] as num?)?.toInt() ?? 0;
      if (batchId == null || batchId.isEmpty || totalShards <= 0) return;

      // Fetch shards on the event loop, but keep the heavy 78k-entry parse OFF
      // the main thread — building this map inline used to freeze the UI for a
      // beat right after launch. We collect the raw `terms` payloads and merge
      // them in a background isolate via compute().
      final rawShards = <Map<String, dynamic>>[];
      for (var i = 0; i < totalShards; i++) {
        final key = '$shardPrefix${i.toString().padLeft(4, '0')}';
        final shard = await pb_client.pb
            .collection('public_config')
            .getFirstListItem('key = "$key"', fields: 'value');
        final value = shard.data['value'];
        if (value is! Map || value['batchId']?.toString() != batchId) continue;
        final terms = value['terms'];
        if (terms is Map) rawShards.add(Map<String, dynamic>.from(terms));
      }
      final loaded = await compute(_parseTrDictShards, rawShards);
      if (loaded.isNotEmpty) {
        _trLocale = loaded;
        debugPrint(
          '=== QOR AI: Live TR spec dictionary loaded (${_trLocale.length} terms) ===',
        );
      }
    } catch (e) {
      debugPrint('=== QOR AI: Live TR spec dictionary unavailable: $e ===');
    }
  }

  /// Translate a spec value/name from English → Turkish.
  /// Returns original if no translation found.
  /// Specs no longer use this for display fallback; canonical English is the
  /// safe source of truth so Turkish source text never leaks to users.
  String translate(String text) {
    if (_enTr == null || _enTr!.isEmpty) return text;
    final key = normalize(text).toLowerCase();
    return _enTr![key] ?? text;
  }

  /// Translate a spec value/name from Turkish → English.
  /// Returns original if no translation found.
  String translateToEn(String text) {
    if (_trEn == null || _trEn!.isEmpty) return text;
    final key = normalize(text).toLowerCase();
    return _trEn![key] ?? text;
  }

  /// Auto-detect direction: if app language is Turkish, translate EN→TR.
  /// If app language is English or other, translate TR→EN.
  String autoTranslate(String text, String appLanguage) {
    if (appLanguage == 'tr') {
      return translate(text); // EN→TR
    } else {
      return translateToEn(text); // TR→EN
    }
  }

  /// Translate word-by-word using sliding window (3→2→1 words).
  /// Handles parenthetical suffixes: "Print Speed (Color)" → "Baskı Hızı (Renkli)"
  String translateWords(String text) {
    if (_enTr == null || _enTr!.isEmpty) return text;
    text = normalize(text);

    // Handle parenthetical content separately
    final parenMatch = RegExp(r'^(.*?)\s*\(([^)]+)\)\s*$').firstMatch(text);
    if (parenMatch != null) {
      final mainPart = parenMatch.group(1)!.trim();
      final parenContent = parenMatch.group(2)!.trim();
      if (mainPart.isNotEmpty) {
        final translatedMain = _translateWordInner(mainPart);
        final translatedParen = translate(parenContent.toLowerCase());
        final parenFinal = translatedParen != parenContent.toLowerCase()
            ? translatedParen
            : _translateWordInner(parenContent);
        return '$translatedMain ($parenFinal)';
      }
    }

    return _translateWordInner(text);
  }

  String _translateWordInner(String text) {
    if (_enTr == null || _enTr!.isEmpty) return text;
    final words = normalize(text).split(RegExp(r'\s+'));
    if (words.length <= 1) return translate(text);

    final result = <String>[];
    int i = 0;
    while (i < words.length) {
      bool found = false;
      // Try 3-word window
      if (i + 2 < words.length) {
        final tri = '${words[i]} ${words[i + 1]} ${words[i + 2]}'.toLowerCase();
        final t = _enTr![tri];
        if (t != null) {
          result.add(t);
          i += 3;
          found = true;
        }
      }
      // Try 2-word window
      if (!found && i + 1 < words.length) {
        final bi = '${words[i]} ${words[i + 1]}'.toLowerCase();
        final t = _enTr![bi];
        if (t != null) {
          result.add(t);
          i += 2;
          found = true;
        }
      }
      // Try single word
      if (!found) {
        final single = words[i].toLowerCase();
        final t = _enTr![single];
        result.add(t ?? words[i]);
        i++;
      }
    }
    return result.join(' ');
  }

  /// Translate word-by-word Turkish → English using sliding window.
  String translateWordsToEn(String text) {
    if (_trEn == null || _trEn!.isEmpty) return text;
    text = normalize(text);

    final parenMatch = RegExp(r'^(.*?)\s*\(([^)]+)\)\s*$').firstMatch(text);
    if (parenMatch != null) {
      final mainPart = parenMatch.group(1)!.trim();
      final parenContent = parenMatch.group(2)!.trim();
      if (mainPart.isNotEmpty) {
        final translatedMain = _translateWordInnerReverse(mainPart);
        final translatedParen = translateToEn(parenContent.toLowerCase());
        final parenFinal = translatedParen != parenContent.toLowerCase()
            ? translatedParen
            : _translateWordInnerReverse(parenContent);
        return '$translatedMain ($parenFinal)';
      }
    }
    return _translateWordInnerReverse(text);
  }

  String _translateWordInnerReverse(String text) {
    if (_trEn == null || _trEn!.isEmpty) return text;
    final words = normalize(text).split(RegExp(r'\s+'));
    if (words.length <= 1) return translateToEn(text);

    final result = <String>[];
    int i = 0;
    while (i < words.length) {
      bool found = false;
      if (i + 2 < words.length) {
        final tri = '${words[i]} ${words[i + 1]} ${words[i + 2]}'.toLowerCase();
        final t = _trEn![tri];
        if (t != null) {
          result.add(t);
          i += 3;
          found = true;
        }
      }
      if (!found && i + 1 < words.length) {
        final bi = '${words[i]} ${words[i + 1]}'.toLowerCase();
        final t = _trEn![bi];
        if (t != null) {
          result.add(t);
          i += 2;
          found = true;
        }
      }
      if (!found) {
        final single = words[i].toLowerCase();
        final t = _trEn![single];
        result.add(t ?? words[i]);
        i++;
      }
    }
    return result.join(' ');
  }

  String canonicalizeToEnglish(String text) {
    final normalized = normalize(text);
    if (normalized.isEmpty) return normalized;
    final cached = _canonicalCache[normalized];
    if (cached != null) return cached;

    final result = _transformSegments(
      normalized,
      _canonicalizeSingleSegmentToEnglish,
    );
    _canonicalCache[normalized] = result;
    return result;
  }

  String _canonicalizeSingleSegmentToEnglish(String text) {
    final normalized = normalize(text);
    if (normalized.isEmpty) return normalized;

    final exact = normalize(translateToEn(normalized));
    if (exact.toLowerCase() != normalized.toLowerCase()) {
      return exact;
    }

    final wordLevel = normalize(translateWordsToEn(normalized));
    if (wordLevel.toLowerCase() != normalized.toLowerCase()) {
      return wordLevel;
    }

    return normalized;
  }

  String translateLabelForLocale(String text, String locale) {
    final cacheKey = '$locale|$text';
    final cached = _labelLocaleCache[cacheKey];
    if (cached != null) return cached;
    final result = _transformSegments(
      text,
      (segment) =>
          _translateSingleSegmentForLocale(segment, locale, isValue: false),
    );
    _labelLocaleCache[cacheKey] = result;
    return result;
  }

  String translateValueForLocale(String text, String locale) {
    final cacheKey = '$locale|$text';
    final cached = _valueLocaleCache[cacheKey];
    if (cached != null) return cached;
    final result = _transformSegments(
      text,
      (segment) =>
          _translateSingleSegmentForLocale(segment, locale, isValue: true),
    );
    _valueLocaleCache[cacheKey] = result;
    return result;
  }

  String translateTurkishForLocale(String text, String locale) {
    final normalizedLocale = locale.toLowerCase().trim();
    if (normalizedLocale.isEmpty || normalizedLocale == 'tr') return text;
    return _translateTurkishSegmentForLocale(text, normalizedLocale) ?? text;
  }

  String? _translateTurkishSegmentForLocale(String text, String locale) {
    final normalized = normalize(text);
    if (normalized.isEmpty) return normalized;

    final boolText = _translateBooleanForLocale(normalized, locale);
    if (boolText != null) return boolText;

    final direct = _trLocale[normalized.toLowerCase()]?[locale];
    if (direct != null && direct.trim().isNotEmpty) return direct.trim();

    if (normalized.contains('\n')) {
      var changed = false;
      final lines = text
          .split('\n')
          .map((line) {
            final trimmed = line.trim();
            final translated = _translateTurkishSegmentForLocale(
              trimmed,
              locale,
            );
            if (translated == null || translated == trimmed) return line;
            changed = true;
            return line.replaceFirst(trimmed, translated);
          })
          .toList(growable: false);
      return changed ? lines.join('\n') : null;
    }

    // Word-level fallback: phrases that aren't a single dictionary key
    // ("Değiştirilebilir Düğme") still localize by translating each TR word
    // (3→2→1 sliding window) via the live dict, instead of leaking Turkish.
    return _translateTurkishWordsForLocale(normalized, locale);
  }

  String? _translateTurkishWordsForLocale(String text, String locale) {
    final words = normalize(text).split(RegExp(r'\s+'));
    if (words.length <= 1) return null;
    var anyHit = false;
    final out = <String>[];
    var i = 0;
    while (i < words.length) {
      var matched = false;
      for (var win = 3; win >= 1 && !matched; win--) {
        if (i + win > words.length) continue;
        final phrase = words.sublist(i, i + win).join(' ').toLowerCase();
        final t = _trLocale[phrase]?[locale];
        if (t != null && t.trim().isNotEmpty) {
          out.add(t.trim());
          i += win;
          matched = true;
          anyHit = true;
        }
      }
      if (!matched) {
        out.add(words[i]);
        i++;
      }
    }
    return anyHit ? out.join(' ') : null;
  }

  String? _translateBooleanForLocale(String text, String locale) {
    final key = normalize(text).toLowerCase();
    final yes = key == 'var' || key == 'evet' || key == 'yes' || key == 'true';
    final no =
        key == 'yok' ||
        key == 'hayır' ||
        key == 'hayir' ||
        key == 'no' ||
        key == 'false';
    if (!yes && !no) return null;
    const labels = <String, List<String>>{
      'en': ['Yes', 'No'],
      'de': ['Ja', 'Nein'],
      'es': ['Sí', 'No'],
      'fr': ['Oui', 'Non'],
      'it': ['Sì', 'No'],
      'ja': ['はい', 'いいえ'],
      'nl': ['Ja', 'Nee'],
      'pl': ['Tak', 'Nie'],
      'pt': ['Sim', 'Não'],
      'sv': ['Ja', 'Nej'],
      'ar': ['نعم', 'لا'],
    };
    final pair = labels[locale] ?? labels['en']!;
    return yes ? pair[0] : pair[1];
  }

  String _translateSingleSegmentForLocale(
    String text,
    String locale, {
    required bool isValue,
  }) {
    final normalizedLocale = locale.toLowerCase().trim();
    if (normalizedLocale != 'tr') {
      final live = _translateTurkishSegmentForLocale(text, normalizedLocale);
      if (live != null && live.trim().isNotEmpty) return live;
    }

    final canonical = canonicalizeToEnglish(text);
    if (canonical.isEmpty) return canonical;

    if (normalizedLocale == 'en' || normalizedLocale == 'tr') {
      return _scrubTurkishLeaks(canonical, isValue: isValue);
    }

    final translated = normalize(
      isValue
          ? spec_dict.translateSpecValue(canonical, normalizedLocale)
          : spec_dict.translateSpec(canonical, normalizedLocale),
    );
    return _scrubTurkishLeaks(
      translated.toLowerCase() != canonical.toLowerCase()
          ? translated
          : canonical,
      isValue: isValue,
    );
  }

  String _transformSegments(
    String text,
    String Function(String segment) transformer,
  ) {
    final normalized = normalize(text);
    if (normalized.isEmpty) return normalized;

    final parts = normalized.split(_segmentDelimiterPattern);
    if (parts.length == 1) {
      return transformer(normalized);
    }

    final buffer = StringBuffer();
    for (final part in parts) {
      if (part.isEmpty) continue;
      if (_segmentDelimiterPattern.hasMatch(part)) {
        buffer.write(part);
        continue;
      }
      buffer.write(transformer(part));
    }
    return buffer.toString();
  }

  bool get isLoaded =>
      (_enTr != null && _enTr!.isNotEmpty) || _trLocale.isNotEmpty;
}
