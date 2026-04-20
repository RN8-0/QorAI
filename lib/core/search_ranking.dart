import 'package:compair/domain/entities/product_entity.dart';

class SearchRank {
  const SearchRank({
    required this.score,
    this.exactName = false,
    this.prefixName = false,
    this.containsName = false,
    this.allTokensInName = false,
    this.brandMatch = false,
  });

  final int score;
  final bool exactName;
  final bool prefixName;
  final bool containsName;
  final bool allTokensInName;
  final bool brandMatch;
}

String normalizeSearchText(String input) {
  var normalized = input.toLowerCase();
  const replacements = <String, String>{
    'ı': 'i',
    'İ': 'i',
    'ş': 's',
    'Ş': 's',
    'ğ': 'g',
    'Ğ': 'g',
    'ü': 'u',
    'Ü': 'u',
    'ö': 'o',
    'Ö': 'o',
    'ç': 'c',
    'Ç': 'c',
  };
  replacements.forEach((from, to) {
    normalized = normalized.replaceAll(from, to);
  });
  normalized = normalized.replaceAll(RegExp(r'[^a-z0-9]+'), ' ');
  normalized = normalized.replaceAll(RegExp(r'\s+'), ' ').trim();
  return normalized;
}

List<String> tokenizeSearchText(String input) {
  final normalized = normalizeSearchText(input);
  if (normalized.isEmpty) return const [];
  return normalized.split(' ').where((token) => token.isNotEmpty).toList();
}

SearchRank rankProductForQuery(ProductEntity product, String query) {
  final normalizedQuery = normalizeSearchText(query);
  if (normalizedQuery.isEmpty) {
    return const SearchRank(score: 0);
  }

  final tokens = tokenizeSearchText(normalizedQuery);
  final name = normalizeSearchText(product.name);
  final brand = normalizeSearchText(product.brand ?? '');
  final category = normalizeSearchText(product.category);
  final subcategory = normalizeSearchText(product.subcategory);
  final tagText = normalizeSearchText(product.tags.join(' '));
  final specText = normalizeSearchText(
    [
      ...product.keySpecs.keys,
      ...product.keySpecs.values,
      ...product.specs.entries.map((entry) => '${entry.key} ${entry.value}'),
    ].join(' '),
  );
  final combined = normalizeSearchText(
    '$brand $name $category $subcategory $tagText $specText',
  );

  var score = 0;
  var exactName = false;
  var prefixName = false;
  var containsName = false;
  var allTokensInName = false;
  var brandMatch = false;

  if (name == normalizedQuery) {
    score += 600;
    exactName = true;
  } else if (name.startsWith(normalizedQuery)) {
    score += 420;
    prefixName = true;
  } else if (name.contains(normalizedQuery)) {
    score += 260;
    containsName = true;
  }

  if (brand.isNotEmpty) {
    if (brand == normalizedQuery) {
      score += 90;
      brandMatch = true;
    } else if (brand.startsWith(normalizedQuery)) {
      score += 60;
      brandMatch = true;
    } else if (brand.contains(normalizedQuery)) {
      score += 35;
      brandMatch = true;
    }
  }

  final matchingNameTokens = tokens.where(name.contains).length;
  if (matchingNameTokens == tokens.length && tokens.isNotEmpty) {
    score += 180;
    allTokensInName = true;
  } else if (matchingNameTokens > 0) {
    score += matchingNameTokens * 35;
  }

  final matchingCombinedTokens = tokens.where(combined.contains).length;
  if (matchingCombinedTokens == tokens.length && tokens.isNotEmpty) {
    score += 90;
  } else if (matchingCombinedTokens > 0) {
    score += matchingCombinedTokens * 18;
  }

  if (category == normalizedQuery || subcategory == normalizedQuery) {
    score += 30;
  } else if (category.contains(normalizedQuery) ||
      subcategory.contains(normalizedQuery)) {
    score += 18;
  }

  if (tagText.contains(normalizedQuery)) {
    score += 24;
  }

  if (specText.contains(normalizedQuery)) {
    score += 18;
  }

  if (score == 0 && tokens.isNotEmpty) {
    final tokenOverlap = tokens.where(combined.contains).length;
    if (tokenOverlap > 0) {
      score += tokenOverlap * 12;
    }
  }

  if (score == 0) {
    return const SearchRank(score: 0);
  }

  score += (product.trendScore / 20).round();

  return SearchRank(
    score: score,
    exactName: exactName,
    prefixName: prefixName,
    containsName: containsName,
    allTokensInName: allTokensInName,
    brandMatch: brandMatch,
  );
}

List<T> rankProductsForQuery<T extends ProductEntity>(
  List<T> products,
  String query, {
  int? limit,
}) {
  final normalizedQuery = normalizeSearchText(query);
  if (normalizedQuery.isEmpty) {
    final copy = List<T>.from(products)
      ..sort((a, b) {
        final trendCompare = b.trendScore.compareTo(a.trendScore);
        if (trendCompare != 0) return trendCompare;
        return b.lastUpdated.compareTo(a.lastUpdated);
      });
    return limit == null ? copy : copy.take(limit).toList();
  }

  final deduped = <String, T>{};
  for (final product in products) {
    deduped[product.id] = product;
  }

  final scored = deduped.values
      .map(
        (product) => (
          product: product,
          rank: rankProductForQuery(product, normalizedQuery),
        ),
      )
      .where((entry) => entry.rank.score > 0)
      .toList();

  scored.sort((a, b) {
    final scoreCompare = b.rank.score.compareTo(a.rank.score);
    if (scoreCompare != 0) return scoreCompare;

    if (a.rank.exactName != b.rank.exactName) {
      return b.rank.exactName ? 1 : -1;
    }
    if (a.rank.prefixName != b.rank.prefixName) {
      return b.rank.prefixName ? 1 : -1;
    }
    if (a.rank.allTokensInName != b.rank.allTokensInName) {
      return b.rank.allTokensInName ? 1 : -1;
    }

    final trendCompare = b.product.trendScore.compareTo(a.product.trendScore);
    if (trendCompare != 0) return trendCompare;

    final updatedCompare = b.product.lastUpdated.compareTo(
      a.product.lastUpdated,
    );
    if (updatedCompare != 0) return updatedCompare;

    return a.product.name.compareTo(b.product.name);
  });

  final ranked = scored.map((entry) => entry.product).toList();
  return limit == null ? ranked : ranked.take(limit).toList();
}
