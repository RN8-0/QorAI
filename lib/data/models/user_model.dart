/// Qor AI - User Model (Data Layer - Firestore)
/// Blueprint Section 4.1
///
/// Extended model for Profile Algorithm
/// Age, interests, and profile vector support
library;

import 'package:pocketbase/pocketbase.dart';
import 'package:qor_ai/domain/entities/user_entity.dart';

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
    super.emailVerified,
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
  factory UserModel.fromPb(RecordModel record) {
    final data = record.data;
    return UserModel(
      uid: record.id,
      email: _resolveEmail(record),
      displayName: data['displayName'] ?? data['name'] ?? '',
      photoURL: (data['photoURL'] is String && (data['photoURL'] as String).isNotEmpty)
          ? data['photoURL'] as String
          : null,
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
      emailVerified: _resolveVerified(record),
      createdAt: _parseDate(data['created']) ?? _parseDate(data['createdAt']) ?? DateTime.now(),
      updatedAt: _parseDate(data['updated']) ?? _parseDate(data['updatedAt']) ?? DateTime.now(),
      affiliateClicks: data['affiliateClicks'] ?? 0,
      comparisonsCount: data['comparisonsCount'] ?? 0,
      primaryCategory: data['primaryCategory'],
      usageIntent: data['usageIntent'],
      // New fields
      birthDate: _parseDate(data['birthDate']),
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

  /// PB auth collection'larında `verified` bool'u root JSON'da bulunur.
  static bool _resolveVerified(RecordModel record) {
    final data = record.data;
    final dataVerified = data['verified'];
    if (dataVerified is bool) return dataVerified;
    final json = record.toJson();
    final jsonVerified = json['verified'];
    if (jsonVerified is bool) return jsonVerified;
    return false;
  }

  /// E-posta: Google oturum > data.email > toJson().email (PB auth fields)
  static String _resolveEmail(RecordModel record) {
    final data = record.data;
    final googleEmail = (data['googleEmail'] as String? ?? '').trim();
    if (googleEmail.isNotEmpty) return googleEmail;
    final dataEmail = (data['email'] as String? ?? '').trim();
    if (dataEmail.isNotEmpty) return dataEmail;
    // PB auth collection'larında email bazen sadece root JSON'da bulunur
    final jsonEmail = (record.toJson()['email'] as String? ?? '').trim();
    return jsonEmail;
  }

  static Map<String, Map<String, dynamic>> _parseSubscriptionDetails(dynamic raw) {
    if (raw == null || raw is! Map) return {};
    final result = <String, Map<String, dynamic>>{};
    for (final entry in raw.entries) {
      if (entry.value is Map) {
        result[entry.key.toString()] = Map<String, dynamic>.from(entry.value as Map);
      }
    }
    return result;
  }

  static DateTime? _parseDate(dynamic v) {
    if (v == null) return null;
    if (v is String) return DateTime.tryParse(v);
    return null;
  }

  /// Write to Map (PocketBase / cache)
  Map<String, dynamic> toMap() {
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
      'affiliateClicks': affiliateClicks,
      'comparisonsCount': comparisonsCount,
      'primaryCategory': primaryCategory,
      'usageIntent': usageIntent,
      if (birthDate != null) 'birthDate': birthDate!.toIso8601String(),
      'gender': gender,
      'ageRange': ageRange,
      'profession': profession,
      'interestCategories': interestCategories,
      'profileVector': profileVector,
      'userSubscriptionDetails': userSubscriptionDetails,
    };
  }

  Map<String, dynamic> toFirestore() => toMap();

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
      emailVerified: entity.emailVerified,
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
