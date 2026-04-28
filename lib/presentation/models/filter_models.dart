/// Filter state models and product filter applier.
library;

import 'package:flutter/material.dart';
import 'package:qor_ai/domain/entities/product_entity.dart';
import 'package:qor_ai/config/filter_config.dart';

// ---------------------------------------------------------------------------
// FilterState
// ---------------------------------------------------------------------------

class FilterState {
  final Map<String, Set<String>> multiSelect;
  final Map<String, RangeValues> ranges;
  final Map<String, bool?> toggles;

  const FilterState({
    this.multiSelect = const {},
    this.ranges = const {},
    this.toggles = const {},
  });

  bool get isActive =>
      multiSelect.values.any((s) => s.isNotEmpty) ||
      ranges.isNotEmpty ||
      toggles.values.any((v) => v != null);

  int get activeCount =>
      multiSelect.values.where((s) => s.isNotEmpty).length +
      ranges.length +
      toggles.values.where((v) => v != null).length;

  FilterState copyWith({
    Map<String, Set<String>>? multiSelect,
    Map<String, RangeValues>? ranges,
    Map<String, bool?>? toggles,
  }) {
    return FilterState(
      multiSelect: multiSelect ?? this.multiSelect,
      ranges: ranges ?? this.ranges,
      toggles: toggles ?? this.toggles,
    );
  }

  FilterState reset() => const FilterState();
}

// ---------------------------------------------------------------------------
// FilterApplier
// ---------------------------------------------------------------------------

class FilterApplier {
  FilterApplier._();

  static List<ProductEntity> apply(
    List<ProductEntity> products,
    FilterState state,
    List<FilterDefinition> definitions,
  ) {
    if (!state.isActive) return products;

    return products.where((product) {
      final flatSpecs = _flattenSpecs(product);

      for (final def in definitions) {
        switch (def.type) {
          case FilterType.multiSelect:
            if (!_passesMultiSelect(product, def, state, flatSpecs)) {
              return false;
            }
          case FilterType.rangeSlider:
            if (!_passesRange(def, state, flatSpecs)) return false;
          case FilterType.toggle:
            if (!_passesToggle(def, state, flatSpecs)) return false;
        }
      }
      return true;
    }).toList();
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  /// Merges specSections (nested Map) and specs (flat Map) into a single
  /// `Map<String, String>` for easy lookup. Also adds price from product.prices.
  static Map<String, String> _flattenSpecs(ProductEntity product) {
    final flat = <String, String>{};

    // Flat specs map
    for (final entry in product.specs.entries) {
      if (entry.value != null) {
        flat[entry.key] = entry.value.toString();
      }
    }

    for (final entry in product.keySpecs.entries) {
      if (entry.value.isNotEmpty) {
        flat[entry.key] = entry.value;
      }
    }

    // Nested specSections: { sectionName: { key: value, ... } }
    for (final section in product.specSections.values) {
      if (section is Map) {
        for (final entry in section.entries) {
          if (entry.value != null) {
            flat[entry.key.toString()] = entry.value.toString();
          }
        }
      }
    }

    // Add lowest available price for price range filtering
    if (product.prices.isNotEmpty) {
      final lowestPrice = product.prices.values.fold<double>(
        double.infinity,
        (m, v) => v < m ? v : m,
      );
      if (lowestPrice != double.infinity) {
        flat['price'] = lowestPrice.toStringAsFixed(0);
        flat['Price'] = lowestPrice.toStringAsFixed(0);
      }
    }

    // Add tech score for score range filtering
    flat['techScore'] = product.techScore.toStringAsFixed(0);

    return flat;
  }

  static bool _passesMultiSelect(
    ProductEntity product,
    FilterDefinition def,
    FilterState state,
    Map<String, String> flatSpecs,
  ) {
    final selected = state.multiSelect[def.id];
    if (selected == null || selected.isEmpty) return true;

    final selectedLabels = (def.options ?? [])
        .where((o) => selected.contains(o.id))
        .map((o) => o.label.toLowerCase())
        .toList();

    if (selectedLabels.isEmpty) return true;

    // Brand filter checks product.brand directly.
    if (def.id == 'brand') {
      final brandLower = _normalizeText(product.brand ?? '');
      return selectedLabels
          .map(_normalizeText)
          .any(
            (label) => brandLower.contains(label) || label.contains(brandLower),
          );
    }

    // Score range filter checks product.techScore against range buckets.
    if (def.id == 'tech_score') {
      final score = product.techScore;
      final selectedIds = selected.toList();
      return selectedIds.any((id) {
        final parts = id.split('-');
        if (parts.length != 2) return false;
        final lo = double.tryParse(parts[0]);
        final hi = double.tryParse(parts[1]);
        if (lo == null || hi == null) return false;
        return score >= lo && score <= hi;
      });
    }

    // For other filters, search spec values.
    final specValues = _findSpecValues(def.specKeys, flatSpecs);
    if (specValues.isEmpty) return false;

    final normalizedLabels = selectedLabels.map(_normalizeText).toList();
    return specValues.any((value) {
      final specLower = _normalizeText(value);
      // Also compare without spaces so "4GB" matches label "4 GB" → "4gb"=="4gb".
      final specCompact = specLower.replaceAll(' ', '');
      return normalizedLabels.any((label) {
        final labelCompact = label.replaceAll(' ', '');
        return specLower.contains(label) ||
            label.contains(specLower) ||
            specCompact.contains(labelCompact) ||
            labelCompact.contains(specCompact);
      });
    });
  }

  static bool _passesRange(
    FilterDefinition def,
    FilterState state,
    Map<String, String> flatSpecs,
  ) {
    final range = state.ranges[def.id];
    if (range == null) return true;

    final specValues = _findSpecValues(def.specKeys, flatSpecs);
    if (specValues.isEmpty) return false;
    final specValue = specValues.first;

    final number = _extractFirstNumber(specValue);
    if (number == null) return false;

    return number >= range.start && number <= range.end;
  }

  static bool _passesToggle(
    FilterDefinition def,
    FilterState state,
    Map<String, String> flatSpecs,
  ) {
    final wantTrue = state.toggles[def.id];
    if (wantTrue == null) return true;

    final specValues = _findSpecValues(def.specKeys, flatSpecs);
    if (specValues.isEmpty) return false;
    final specValue = specValues.first;
    final valueLower = _normalizeText(specValue);

    // Explicit "no" markers
    final isNegative =
        valueLower == 'no' ||
        valueLower == 'false' ||
        valueLower == 'hayir' ||
        valueLower == 'yok' ||
        valueLower.contains('✗') ||
        valueLower == 'n a' ||
        valueLower == '-';

    // Explicit "yes" markers (or simply present with non-negative value)
    final isPositive =
        !isNegative &&
        (valueLower == 'yes' ||
            valueLower == 'true' ||
            valueLower == 'evet' ||
            valueLower == 'var' ||
            valueLower.contains('✓') ||
            valueLower.isNotEmpty);

    return wantTrue ? isPositive : isNegative;
  }

  static List<String> _findSpecValues(
    List<String> keys,
    Map<String, String> flatSpecs,
  ) {
    final matches = <String>[];
    final seen = <String>{};

    for (final key in keys) {
      final normalizedKey = _normalizeText(key);
      // Exact match first
      final exact = flatSpecs[key];
      if (exact != null && seen.add(exact)) {
        matches.add(exact);
      }
      // Case-insensitive fallback
      for (final entry in flatSpecs.entries) {
        final normalizedEntryKey = _normalizeText(entry.key);
        final tokenOverlap = _tokenOverlap(normalizedKey, normalizedEntryKey);
        final isMatch =
            normalizedEntryKey == normalizedKey ||
            normalizedEntryKey.contains(normalizedKey) ||
            normalizedKey.contains(normalizedEntryKey) ||
            tokenOverlap >= 2;
        if (isMatch && seen.add(entry.value)) {
          matches.add(entry.value);
        }
      }
    }
    return matches;
  }

  /// Extracts the first numeric value from a string like "6.1 in", "128 GB", "4200 mAh".
  static double? _extractFirstNumber(String value) {
    final match = RegExp(
      r'[\d]+(?:[.,]\d+)?',
    ).firstMatch(value.replaceAll(',', '.'));
    if (match == null) return null;
    return double.tryParse(match.group(0)!.replaceAll(',', '.'));
  }

  static String _normalizeText(String value) {
    return value
        .toLowerCase()
        .replaceAll('ı', 'i')
        .replaceAll('ğ', 'g')
        .replaceAll('ü', 'u')
        .replaceAll('ş', 's')
        .replaceAll('ö', 'o')
        .replaceAll('ç', 'c')
        .replaceAll(RegExp(r'[^a-z0-9]+'), ' ')
        .replaceAll(RegExp(r'\s+'), ' ')
        .trim();
  }

  static int _tokenOverlap(String a, String b) {
    final aTokens = a.split(' ').where((e) => e.isNotEmpty).toSet();
    final bTokens = b.split(' ').where((e) => e.isNotEmpty).toSet();
    return aTokens.intersection(bTokens).length;
  }
}
