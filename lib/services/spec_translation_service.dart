import 'dart:convert';
import 'package:flutter/services.dart';
import 'package:qor_ai/core/spec_word_dictionary.dart' as spec_dict;

/// Loads the EN→TR spec dictionary from assets and provides bidirectional translation.
/// Uses the scraper's 7,300+ entry dictionary for comprehensive coverage.
class SpecTranslationService {
  SpecTranslationService._();
  static final instance = SpecTranslationService._();

  Map<String, String>? _enTr;
  Map<String, String>? _trEn; // Reverse lookup: TR→EN
  bool _loading = false;
  final Map<String, String> _canonicalCache = {};
  final Map<String, String> _labelLocaleCache = {};
  final Map<String, String> _valueLocaleCache = {};

  static final RegExp _segmentDelimiterPattern = RegExp(
    r'(\r?\n+|•\s*|·\s*|;\s*|\s+\|\s+)',
  );

  String normalize(String text) =>
      text.replaceAll('\u00A0', ' ').replaceAll(RegExp(r'\s+'), ' ').trim();

  Future<void> init() async {
    if (_enTr != null || _loading) return;
    _loading = true;
    try {
      final raw = await rootBundle.loadString('assets/en_tr_specs.json');
      _enTr = Map<String, String>.from(json.decode(raw) as Map);
      // Build reverse map for TR→EN translation
      _trEn = {};
      for (final entry in _enTr!.entries) {
        _trEn![normalize(entry.value).toLowerCase()] = entry.key;
      }
    } catch (_) {
      _enTr = {};
      _trEn = {};
    }
    _loading = false;
  }

  /// Translate a spec value/name from English → Turkish.
  /// Returns original if no translation found.
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

  String _translateSingleSegmentForLocale(
    String text,
    String locale, {
    required bool isValue,
  }) {
    final canonical = canonicalizeToEnglish(text);
    if (canonical.isEmpty) return canonical;

    if (locale == 'en') return canonical;
    if (locale == 'tr') {
      final exact = normalize(translate(canonical));
      if (exact.toLowerCase() != canonical.toLowerCase()) return exact;
      final wordLevel = normalize(translateWords(canonical));
      if (wordLevel.toLowerCase() != canonical.toLowerCase()) return wordLevel;
      return canonical;
    }

    final translated = normalize(
      isValue
          ? spec_dict.translateSpecValue(canonical, locale)
          : spec_dict.translateSpec(canonical, locale),
    );
    return translated.toLowerCase() != canonical.toLowerCase()
        ? translated
        : canonical;
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

  bool get isLoaded => _enTr != null && _enTr!.isNotEmpty;
}
