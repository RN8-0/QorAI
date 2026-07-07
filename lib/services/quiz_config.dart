/// Qor AI — Deterministic quiz question-count rules.
///
/// WEB PARİTESİ (ANALYSIS_REDESIGN_SPEC §1): quiz soru sayısı artık sabit 5
/// değil; ürün/aboneliğin kompleksliğine göre 5 veya 6 olarak DETERMİNİSTİK
/// hesaplanır. Prompt'a "EXACTLY {count}" yazılır VE parse cap'i
/// `.take(count)` olur — böylece sayaç ("x/count") ve gerçek soru sayısı
/// garanti tutar. Web karşılığı: web/src/lib/linkAnalysis.js.
library;

/// Categories considered "complex" — these get a 6-question quiz because a
/// single wrong trade-off (thermals, sensor size, panel type…) flips the
/// buying decision. Lowercase snake_case, matched flexibly.
const Set<String> kComplexQuizCategories = {
  'laptops',
  'smartphones',
  'tablets',
  'cameras',
  'camera_lenses',
  'monitors',
  'headphones',
  'gaming',
  'gaming_consoles',
  'tvs',
  'desktops',
  'smartwatches',
  'drones',
  'av_receivers',
  'cpus',
  'gpus',
};

/// Flexible category match: normalizes separators/case and accepts partial
/// containment in either direction ("smartphone" ↔ "smartphones",
/// "gaming_consoles" ↔ "gaming").
bool isComplexQuizCategory(String? category) {
  if (category == null) return false;
  final c = category
      .trim()
      .toLowerCase()
      .replaceAll(RegExp(r'[\s\-]+'), '_')
      .replaceAll(RegExp(r'_+'), '_');
  if (c.isEmpty) return false;
  return kComplexQuizCategories.any(
    (k) => c == k || c.contains(k) || k.contains(c),
  );
}

/// Question count for product quizzes (single or compare).
/// - Single product: complex category → 6, otherwise 5.
/// - Compare: 3+ products OR any complex category → 6, otherwise 5.
int productQuizQuestionCount({
  required String? category,
  List<String?> allCategories = const [],
  int productCount = 1,
}) {
  if (productCount >= 2) {
    if (productCount >= 3) return 6;
    final cats = <String?>[category, ...allCategories];
    return cats.any(isComplexQuizCategory) ? 6 : 5;
  }
  return isComplexQuizCategory(category) ? 6 : 5;
}

/// Question count for subscription quizzes.
/// Single service → 5; comparison (2+ services) → 6.
int subscriptionQuizQuestionCount(int serviceCount) =>
    serviceCount >= 2 ? 6 : 5;
