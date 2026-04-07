/// Compair - User Model (Data Layer - Firestore)
/// Blueprint Section 4.1
///
/// Extended model for Profile Algorithm
/// Age, interests, and profile vector support

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:compair/domain/entities/user_entity.dart';

class UserModel extends UserEntity {
  const UserModel({
    required super.uid,
    required super.email,
    required super.displayName,
    super.photoURL,
    super.country,
    super.language,
    super.currency,
    super.ecosystem,
    super.budgetRange,
    super.priorities,
    super.currentDevices,
    super.subscriptions,
    super.ownedProducts,
    super.favorites,
    super.quizCompleted,
    super.isPremium,
    required super.createdAt,
    required super.updatedAt,
    super.affiliateClicks,
    super.comparisonsCount,
    super.primaryCategory,
    super.usageIntent,
    super.birthDate,
    super.gender,
    super.ageRange,
    super.profession,
    super.interestCategories,
    super.profileVector,
    super.userSubscriptionDetails,
  });

  /// Read from Firestore
  factory UserModel.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;
    return UserModel(
      uid: doc.id,
      email: data['email'] ?? '',
      displayName: data['displayName'] ?? '',
      photoURL: data['photoURL'],
      country: data['country'] ?? 'US',
      language: data['language'] ?? 'en',
      currency: data['currency'] ?? 'USD',
      ecosystem: data['ecosystem'] ?? 'mixed',
      budgetRange: data['budgetRange'] ?? 'mid',
      priorities: List<String>.from(data['priorities'] ?? []),
      currentDevices: List<String>.from(data['currentDevices'] ?? []),
      subscriptions: List<String>.from(data['subscriptions'] ?? []),
      ownedProducts: List<String>.from(data['ownedProducts'] ?? []),
      favorites: List<String>.from(data['favorites'] ?? []),
      quizCompleted: data['quizCompleted'] ?? false,
      isPremium: data['isPremium'] ?? false,
      createdAt: (data['createdAt'] as Timestamp?)?.toDate() ?? DateTime.now(),
      updatedAt: (data['updatedAt'] as Timestamp?)?.toDate() ?? DateTime.now(),
      affiliateClicks: data['affiliateClicks'] ?? 0,
      comparisonsCount: data['comparisonsCount'] ?? 0,
      primaryCategory: data['primaryCategory'],
      usageIntent: data['usageIntent'],
      // New fields
      birthDate: (data['birthDate'] as Timestamp?)?.toDate(),
      gender: data['gender'],
      ageRange: data['ageRange'],
      profession: data['profession'],
      interestCategories: List<String>.from(data['interestCategories'] ?? []),
      profileVector: Map<String, double>.from(
        (data['profileVector'] as Map<String, dynamic>?)?.map(
              (k, v) => MapEntry(k, (v as num).toDouble()),
            ) ??
            {},
      ),
      userSubscriptionDetails: _parseSubscriptionDetails(data['userSubscriptionDetails']),
    );
  }

  static Map<String, Map<String, dynamic>> _parseSubscriptionDetails(dynamic raw) {
    if (raw == null || raw is! Map) return {};
    final result = <String, Map<String, dynamic>>{};
    for (final entry in (raw as Map).entries) {
      if (entry.value is Map) {
        result[entry.key.toString()] = Map<String, dynamic>.from(entry.value as Map);
      }
    }
    return result;
  }

  /// Write to Firestore
  Map<String, dynamic> toFirestore() {
    return {
      'email': email,
      'displayName': displayName,
      'photoURL': photoURL,
      'country': country,
      'language': language,
      'currency': currency,
      'ecosystem': ecosystem,
      'budgetRange': budgetRange,
      'priorities': priorities,
      'currentDevices': currentDevices,
      'subscriptions': subscriptions,
      'ownedProducts': ownedProducts,
      'favorites': favorites,
      'quizCompleted': quizCompleted,
      'isPremium': isPremium,
      'createdAt': Timestamp.fromDate(createdAt),
      'updatedAt': Timestamp.fromDate(updatedAt),
      'affiliateClicks': affiliateClicks,
      'comparisonsCount': comparisonsCount,
      'primaryCategory': primaryCategory,
      'usageIntent': usageIntent,
      // New fields
      if (birthDate != null) 'birthDate': Timestamp.fromDate(birthDate!),
      'gender': gender,
      'ageRange': ageRange,
      'profession': profession,
      'interestCategories': interestCategories,
      'profileVector': profileVector,
      'userSubscriptionDetails': userSubscriptionDetails,
    };
  }

  /// Convert Entity to Model
  factory UserModel.fromEntity(UserEntity entity) {
    return UserModel(
      uid: entity.uid,
      email: entity.email,
      displayName: entity.displayName,
      photoURL: entity.photoURL,
      country: entity.country,
      language: entity.language,
      currency: entity.currency,
      ecosystem: entity.ecosystem,
      budgetRange: entity.budgetRange,
      priorities: entity.priorities,
      currentDevices: entity.currentDevices,
      subscriptions: entity.subscriptions,
      ownedProducts: entity.ownedProducts,
      favorites: entity.favorites,
      quizCompleted: entity.quizCompleted,
      isPremium: entity.isPremium,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
      affiliateClicks: entity.affiliateClicks,
      comparisonsCount: entity.comparisonsCount,
      primaryCategory: entity.primaryCategory,
      usageIntent: entity.usageIntent,
      // New fields
      birthDate: entity.birthDate,
      gender: entity.gender,
      ageRange: entity.ageRange,
      profession: entity.profession,
      interestCategories: entity.interestCategories,
      profileVector: entity.profileVector,
      userSubscriptionDetails: entity.userSubscriptionDetails,
    );
  }
}
