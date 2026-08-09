/// Qor AI - AI Request/Response Entities
/// Blueprint Section 7.2, 7.3, 9.1
library;

import 'package:equatable/equatable.dart';

/// AI comparison request
class CompareRequest extends Equatable {
  final List<String> productIds;
  final Map<String, dynamic> userProfile;
  final String country;
  final String category;

  const CompareRequest({
    required this.productIds,
    required this.userProfile,
    required this.country,
    required this.category,
  });

  @override
  List<Object?> get props => [productIds, country];
}

/// AI comparison result
class ComparisonResult extends Equatable {
  final Map<String, ProductScore> scores;
  final String analysis;
  final String? winnerId;
  final DateTime generatedAt;

  const ComparisonResult({
    required this.scores,
    required this.analysis,
    this.winnerId,
    required this.generatedAt,
  });

  @override
  List<Object?> get props => [scores, generatedAt];
}

class ProductScore extends Equatable {
  final String productId;
  final double totalScore;
  final double personalFit;
  final double community;
  final double expert;
  final double valuePrice;
  final List<String> pros;
  final List<String> cons;

  const ProductScore({
    required this.productId,
    required this.totalScore,
    required this.personalFit,
    required this.community,
    required this.expert,
    required this.valuePrice,
    this.pros = const [],
    this.cons = const [],
  });

  @override
  List<Object?> get props => [productId, totalScore];
}

/// AI recommendation request
class RecommendRequest extends Equatable {
  final Map<String, dynamic> userProfile;
  final String category;
  final String country;
  final int limit;

  const RecommendRequest({
    required this.userProfile,
    required this.category,
    required this.country,
    this.limit = 10,
  });

  @override
  List<Object?> get props => [category, country];
}

/// AI recommendation result
class RecommendationResult extends Equatable {
  final List<RecommendedProduct> recommendations;
  final DateTime generatedAt;

  const RecommendationResult({
    required this.recommendations,
    required this.generatedAt,
  });

  @override
  List<Object?> get props => [recommendations, generatedAt];
}

class RecommendedProduct extends Equatable {
  final String productId;
  final double score;
  final String reason;

  const RecommendedProduct({
    required this.productId,
    required this.score,
    required this.reason,
  });

  @override
  List<Object?> get props => [productId, score];
}

/// Link analysis request - Section 9.1
class LinkAnalysisRequest extends Equatable {
  final String url;
  final Map<String, dynamic> userProfile;
  final String country;

  const LinkAnalysisRequest({
    required this.url,
    required this.userProfile,
    required this.country,
  });

  @override
  List<Object?> get props => [url];
}

/// Link analysis result - Section 9.1
class LinkAnalysisResult extends Equatable {
  final String url;
  final OgMetadata metadata;
  final double aiScore;
  final String aiAnalysis;
  final String? category;
  final DateTime analyzedAt;
  /// false when AI determines the URL is not a product page
  final bool isProduct;

  const LinkAnalysisResult({
    required this.url,
    required this.metadata,
    required this.aiScore,
    required this.aiAnalysis,
    this.category,
    required this.analyzedAt,
    this.isProduct = true,
  });

  Map<String, dynamic> toJson() => {
    'url': url,
    'metadata': metadata.toJson(),
    'aiScore': aiScore,
    'aiAnalysis': aiAnalysis,
    'category': category,
    'analyzedAt': analyzedAt.toIso8601String(),
    'isProduct': isProduct,
  };

  factory LinkAnalysisResult.fromJson(Map<String, dynamic> j) => LinkAnalysisResult(
    url: j['url'] as String,
    metadata: OgMetadata.fromJson(j['metadata'] as Map<String, dynamic>),
    aiScore: (j['aiScore'] as num).toDouble(),
    aiAnalysis: j['aiAnalysis'] as String,
    category: j['category'] as String?,
    analyzedAt: DateTime.parse(j['analyzedAt'] as String),
    isProduct: j['isProduct'] as bool? ?? true,
  );

  @override
  List<Object?> get props => [url, aiScore];
}

/// Open Graph Metadata - Section 9.2
class OgMetadata extends Equatable {
  final String? title;
  final String? description;
  final String? image;
  final String? price;
  final String? siteName;

  const OgMetadata({
    this.title,
    this.description,
    this.image,
    this.price,
    this.siteName,
  });

  Map<String, dynamic> toJson() => {
    'title': title,
    'description': description,
    'image': image,
    'price': price,
    'siteName': siteName,
  };

  factory OgMetadata.fromJson(Map<String, dynamic> j) => OgMetadata(
    title: j['title'] as String?,
    description: j['description'] as String?,
    image: j['image'] as String?,
    price: j['price'] as String?,
    siteName: j['siteName'] as String?,
  );

  @override
  List<Object?> get props => [title, description];
}

/// Product Quiz — AI-generated questions to gauge user-product compatibility.
/// Quizzes are cached per category in Firestore so they can be reused.
class ProductQuiz extends Equatable {
  final String id;
  final String category;
  final String productTitle;
  final List<QuizQuestion> questions;
  final DateTime createdAt;

  const ProductQuiz({
    required this.id,
    required this.category,
    required this.productTitle,
    required this.questions,
    required this.createdAt,
  });

  @override
  List<Object?> get props => [id, category];
}

class QuizQuestion extends Equatable {
  final String id;
  final String text;
  final List<String> options;
  final String? selectedOption;

  const QuizQuestion({
    required this.id,
    required this.text,
    required this.options,
    this.selectedOption,
  });

  QuizQuestion copyWith({String? selectedOption}) => QuizQuestion(
        id: id,
        text: text,
        options: options,
        selectedOption: selectedOption ?? this.selectedOption,
      );

  @override
  List<Object?> get props => [id, text, selectedOption];
}

/// Extended link analysis result with quiz-enhanced compatibility data.
class EnhancedAnalysisResult extends Equatable {
  final LinkAnalysisResult baseResult;
  final double enhancedScore;
  final List<CompatibilityFactor> factors;
  final String detailedVerdict;
  final List<String> prosForUser;
  final List<String> consForUser;
  final List<String> alternatives;
  final double? communityScore;
  final String? communityAnalysis;
  final double? personaScore;
  final String? personaAnalysis;
  final String? overallVerdict;

  /// Community sentiment split for the donut chart —
  /// keys: `positive`, `neutral`, `negative` (ints, roughly summing to 100).
  /// Nullable: older saved analyses derive a fallback from the scores.
  final Map<String, int>? sentimentBreakdown;

  /// AI'ın DÖNDÜRDÜĞÜ HAM JSON. Tek rapor şablonu (`AiReportView`) ürün
  /// raporuyla AYNI bölümleri ister — criticalPoints, quizInsights,
  /// communityThemes, featureMatches, sources, verificationNotes,
  /// priceOutlook, bestFor/notFor, decision/confidence... Bunların her birini
  /// ayrı alan yapmak yerine ham yanıt taşınır; `linkResultToUnified()`
  /// bunu `product_full_report` şekline çevirir. Eski kayıtlarda boş olur ve
  /// şablon o bölümleri sessizce atlar.
  final Map<String, dynamic> raw;

  const EnhancedAnalysisResult({
    required this.baseResult,
    required this.enhancedScore,
    required this.factors,
    required this.detailedVerdict,
    this.prosForUser = const [],
    this.consForUser = const [],
    this.alternatives = const [],
    this.communityScore,
    this.communityAnalysis,
    this.personaScore,
    this.personaAnalysis,
    this.overallVerdict,
    this.sentimentBreakdown,
    this.raw = const {},
  });

  Map<String, dynamic> toJson() => {
    'baseResult': baseResult.toJson(),
    'enhancedScore': enhancedScore,
    'factors': factors.map((f) => f.toJson()).toList(),
    'detailedVerdict': detailedVerdict,
    'prosForUser': prosForUser,
    'consForUser': consForUser,
    'alternatives': alternatives,
    if (communityScore != null) 'communityScore': communityScore,
    if (communityAnalysis != null) 'communityAnalysis': communityAnalysis,
    if (personaScore != null) 'personaScore': personaScore,
    if (personaAnalysis != null) 'personaAnalysis': personaAnalysis,
    if (overallVerdict != null) 'overallVerdict': overallVerdict,
    if (sentimentBreakdown != null) 'sentimentBreakdown': sentimentBreakdown,
    if (raw.isNotEmpty) 'raw': raw,
  };

  factory EnhancedAnalysisResult.fromJson(Map<String, dynamic> j) => EnhancedAnalysisResult(
    baseResult: LinkAnalysisResult.fromJson(j['baseResult'] as Map<String, dynamic>),
    enhancedScore: (j['enhancedScore'] as num).toDouble(),
    factors: (j['factors'] as List<dynamic>? ?? [])
        .map((f) => CompatibilityFactor.fromJson(f as Map<String, dynamic>))
        .toList(),
    detailedVerdict: j['detailedVerdict'] as String,
    prosForUser: (j['prosForUser'] as List<dynamic>? ?? []).cast<String>(),
    consForUser: (j['consForUser'] as List<dynamic>? ?? []).cast<String>(),
    alternatives: (j['alternatives'] as List<dynamic>? ?? []).cast<String>(),
    communityScore: (j['communityScore'] as num?)?.toDouble(),
    communityAnalysis: j['communityAnalysis'] as String?,
    personaScore: (j['personaScore'] as num?)?.toDouble(),
    personaAnalysis: j['personaAnalysis'] as String?,
    overallVerdict: j['overallVerdict'] as String?,
    sentimentBreakdown: j['sentimentBreakdown'] is Map
        ? (j['sentimentBreakdown'] as Map).map(
            (k, v) => MapEntry(k.toString(), (v as num?)?.round() ?? 0),
          )
        : null,
    raw: j['raw'] is Map ? Map<String, dynamic>.from(j['raw'] as Map) : const {},
  );

  @override
  List<Object?> get props => [baseResult, enhancedScore];
}

class CompatibilityFactor extends Equatable {
  final String label;
  final double score;
  final String emoji;

  const CompatibilityFactor({
    required this.label,
    required this.score,
    required this.emoji,
  });

  Map<String, dynamic> toJson() => {'label': label, 'score': score, 'emoji': emoji};

  factory CompatibilityFactor.fromJson(Map<String, dynamic> j) => CompatibilityFactor(
    label: j['label'] as String,
    score: (j['score'] as num).toDouble(),
    emoji: j['emoji'] as String,
  );

  @override
  List<Object?> get props => [label, score];
}

/// Score calculation request - Section 8.1
class ScoreRequest extends Equatable {
  final String productId;
  final Map<String, dynamic> userProfile;
  final Map<String, dynamic> productData;
  final String country;

  const ScoreRequest({
    required this.productId,
    required this.userProfile,
    required this.productData,
    required this.country,
  });

  @override
  List<Object?> get props => [productId, country];
}
