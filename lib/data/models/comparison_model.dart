/// Qor AI - Comparison Model (Data Layer - Firestore)
/// Blueprint Section 4.3
library;

import 'package:pocketbase/pocketbase.dart';
import 'package:qor_ai/domain/entities/comparison_entity.dart';

class ComparisonModel extends ComparisonEntity {
  const ComparisonModel({
    required super.id,
    required super.userId,
    required super.itemIds,
    super.scores,
    super.aiAnalysis,
    super.winnerId,
    super.userChoiceId,
    required super.category,
    required super.createdAt,
    super.isPublic,
    super.title,
    super.isFeatured = false,
    super.isPredefined = false,
    super.occurrenceCount = 1,
  });

  factory ComparisonModel.fromPb(RecordModel record) {
    final data = Map<String, dynamic>.from(record.data);
    final notes = data['notes'] is Map
        ? Map<String, dynamic>.from(data['notes'] as Map)
        : const <String, dynamic>{};
    final itemIds = List<String>.from(
      data['items'] ?? data['productIds'] ?? [],
    );

    // Scores map'i
    final scoresData = data['scores'] as Map<String, dynamic>? ?? {};
    final scores = scoresData.map((key, value) {
      final scoreData = value as Map<String, dynamic>;
      return MapEntry(
        key,
        ComparisonScore(
          totalScore: (scoreData['totalScore'] as num?)?.toDouble() ?? 0.0,
          personalFitScore:
              (scoreData['personalFitScore'] as num?)?.toDouble() ?? 0.0,
          communityScore:
              (scoreData['communityScore'] as num?)?.toDouble() ?? 0.0,
          expertScore: (scoreData['expertScore'] as num?)?.toDouble() ?? 0.0,
          valuePriceScore:
              (scoreData['valuePriceScore'] as num?)?.toDouble() ?? 0.0,
          pros: List<String>.from(scoreData['pros'] ?? []),
          cons: List<String>.from(scoreData['cons'] ?? []),
        ),
      );
    });

    return ComparisonModel(
      id: record.id,
      userId: data['userId'] ?? '',
      itemIds: itemIds,
      scores: scores,
      aiAnalysis: (data['aiAnalysis'] ?? notes['aiAnalysis'] ?? '') as String,
      winnerId: (data['winner'] ?? notes['winnerId']) as String?,
      userChoiceId: data['userChoice'] as String?,
      category: (data['category'] ?? notes['category'] ?? '') as String,
      createdAt:
          _parseDate(notes['lastComparedAt']) ??
          _parseDate(data['lastComparedAt']) ??
          _parseDate(data['updated']) ??
          _parseDate(data['created']) ??
          _parseDate(notes['createdAt']) ??
          _parseDate(data['createdAt']) ??
          DateTime.now(),
      isPublic: data['isPublic'] ?? false,
      title: data['title'],
      isFeatured: data['isFeatured'] ?? false,
      isPredefined: data['isPredefined'] ?? false,
      occurrenceCount:
          (notes['occurrenceCount'] as num?)?.toInt() ??
          (data['occurrenceCount'] as num?)?.toInt() ??
          1,
    );
  }

  static DateTime? _parseDate(dynamic v) {
    if (v == null) return null;
    if (v is String) return DateTime.tryParse(v);
    return null;
  }

  Map<String, dynamic> toMap() {
    final scoresMap = scores.map(
      (key, value) => MapEntry(key, {
        'totalScore': value.totalScore,
        'personalFitScore': value.personalFitScore,
        'communityScore': value.communityScore,
        'expertScore': value.expertScore,
        'valuePriceScore': value.valuePriceScore,
        'pros': value.pros,
        'cons': value.cons,
      }),
    );

    return {
      'userId': userId,
      'items': itemIds,
      'scores': scoresMap,
      'aiAnalysis': aiAnalysis,
      'winner': winnerId,
      'userChoice': userChoiceId,
      'category': category,
      'isPublic': isPublic,
      'title': title,
      'isFeatured': isFeatured,
      'isPredefined': isPredefined,
    };
  }

  Map<String, dynamic> toFirestore() => toMap();

  factory ComparisonModel.fromEntity(ComparisonEntity entity) {
    return ComparisonModel(
      id: entity.id,
      userId: entity.userId,
      itemIds: entity.itemIds,
      scores: entity.scores,
      aiAnalysis: entity.aiAnalysis,
      winnerId: entity.winnerId,
      userChoiceId: entity.userChoiceId,
      category: entity.category,
      createdAt: entity.createdAt,
      isPublic: entity.isPublic,
      title: entity.title,
      isFeatured: entity.isFeatured,
      isPredefined: entity.isPredefined,
      occurrenceCount: entity.occurrenceCount,
    );
  }
}
