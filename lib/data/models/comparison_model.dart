/// Compair - Comparison Model (Data Layer - Firestore)
/// Blueprint Section 4.3

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:compair/domain/entities/comparison_entity.dart';

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
  });

  factory ComparisonModel.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;

    // Scores map'i
    final scoresData = data['scores'] as Map<String, dynamic>? ?? {};
    final scores = scoresData.map(
      (key, value) {
        final scoreData = value as Map<String, dynamic>;
        return MapEntry(
          key,
          ComparisonScore(
            totalScore: (scoreData['totalScore'] as num?)?.toDouble() ?? 0.0,
            personalFitScore:
                (scoreData['personalFitScore'] as num?)?.toDouble() ?? 0.0,
            communityScore:
                (scoreData['communityScore'] as num?)?.toDouble() ?? 0.0,
            expertScore:
                (scoreData['expertScore'] as num?)?.toDouble() ?? 0.0,
            valuePriceScore:
                (scoreData['valuePriceScore'] as num?)?.toDouble() ?? 0.0,
            pros: List<String>.from(scoreData['pros'] ?? []),
            cons: List<String>.from(scoreData['cons'] ?? []),
          ),
        );
      },
    );

    return ComparisonModel(
      id: doc.id,
      userId: data['userId'] ?? '',
      itemIds: List<String>.from(data['items'] ?? []),
      scores: scores,
      aiAnalysis: data['aiAnalysis'] ?? '',
      winnerId: data['winner'],
      userChoiceId: data['userChoice'],
      category: data['category'] ?? '',
      createdAt: (data['createdAt'] as Timestamp?)?.toDate() ?? DateTime.now(),
      isPublic: data['isPublic'] ?? false,
      title: data['title'],
      isFeatured: data['isFeatured'] ?? false,
      isPredefined: data['isPredefined'] ?? false,
    );
  }

  Map<String, dynamic> toFirestore() {
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
      'createdAt': Timestamp.fromDate(createdAt),
      'isPublic': isPublic,
      'title': title,
      'isFeatured': isFeatured,
      'isPredefined': isPredefined,
    };
  }

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
    );
  }
}
