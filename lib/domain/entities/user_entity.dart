/// Qor AI - User Entity (Domain Layer - Pure Dart)
/// Blueprint Section 4.1
///
/// Extended user model for Profile Algorithm
/// Age, interests, and profile vector added

import 'package:equatable/equatable.dart';

/// Age groups - Critical for profile algorithm
enum AgeRange {
  teen('13-17', 'Gen Alpha/Z (13-17)'),
  youngAdult('18-24', 'Gen Z (18-24)'),
  adult('25-34', 'Millennial (25-34)'),
  midAdult('35-44', 'Xennial (35-44)'),
  mature('45-54', 'Gen X (45-54)'),
  senior('55+', '55 and over');

  final String value;
  final String label;
  const AgeRange(this.value, this.label);

  static AgeRange? fromValue(String? value) {
    if (value == null) return null;
    return AgeRange.values.firstWhere(
      (e) => e.value == value,
      orElse: () => AgeRange.adult,
    );
  }
}

class UserEntity extends Equatable {
  final String uid;
  final String email;
  final String displayName;
  final String? photoURL;
  final String country;
  final String language;
  final String currency;
  final String ecosystem; // apple / android / mixed
  final String budgetRange; // low / mid / high / premium
  final List<String> priorities; // [price, quality, ecosystem, design]
  final List<String> currentDevices;
  final List<String> subscriptions;
  final List<String> ownedProducts;
  final List<String> favorites; // Favorite product IDs
  final bool quizCompleted;
  final bool isPremium;
  final DateTime createdAt;
  final DateTime updatedAt;
  final int affiliateClicks;
  final int comparisonsCount;
  final String? primaryCategory;
  final String? usageIntent;

  // ─── NEW: Age and Profile Algorithm Fields ───
  final DateTime? birthDate; // Can be obtained from Google (optional)
  final String? gender; // male / female / other
  final String? ageRange; // From Quiz: '13-17', '18-24', '25-34', '35-44', '45-54', '55+'
  final String? profession; // student / engineer / designer / manager / healthcare / teacher / finance / other
  final List<String> interestCategories; // Multiple interest areas
  final Map<String, double> profileVector; // Profile vector for algorithm
  final Map<String, Map<String, dynamic>> userSubscriptionDetails; // Tracked subscription metadata

  const UserEntity({
    required this.uid,
    required this.email,
    required this.displayName,
    this.photoURL,
    this.country = 'US',
    this.language = 'en',
    this.currency = 'USD',
    this.ecosystem = 'mixed',
    this.budgetRange = 'mid',
    this.priorities = const [],
    this.currentDevices = const [],
    this.subscriptions = const [],
    this.ownedProducts = const [],
    this.favorites = const [],
    this.quizCompleted = false,
    this.isPremium = false,
    required this.createdAt,
    required this.updatedAt,
    this.affiliateClicks = 0,
    this.comparisonsCount = 0,
    this.primaryCategory,
    this.usageIntent,
    // New fields
    this.birthDate,
    this.gender,
    this.ageRange,
    this.profession,
    this.interestCategories = const [],
    this.profileVector = const {},
    this.userSubscriptionDetails = const {},
  });

  @override
  List<Object?> get props => [uid, email, updatedAt];

  /// Get age group as enum
  AgeRange? get ageRangeEnum => AgeRange.fromValue(ageRange);

  /// Calculated age (if birthDate is available)
  int? get calculatedAge {
    if (birthDate == null) return null;
    final now = DateTime.now();
    int age = now.year - birthDate!.year;
    if (now.month < birthDate!.month ||
        (now.month == birthDate!.month && now.day < birthDate!.day)) {
      age--;
    }
    return age;
  }

  /// Calculate age group (from birthDate or ageRange)
  String? get effectiveAgeRange {
    if (ageRange != null) return ageRange;
    final age = calculatedAge;
    if (age == null) return null;
    if (age < 18) return '13-17';
    if (age < 25) return '18-24';
    if (age < 35) return '25-34';
    if (age < 45) return '35-44';
    if (age < 55) return '45-54';
    return '55+';
  }

  UserEntity copyWith({
    String? uid,
    String? email,
    String? displayName,
    String? photoURL,
    String? country,
    String? language,
    String? currency,
    String? ecosystem,
    String? budgetRange,
    List<String>? priorities,
    List<String>? currentDevices,
    List<String>? subscriptions,
    List<String>? ownedProducts,
    List<String>? favorites,
    bool? quizCompleted,
    bool? isPremium,
    DateTime? createdAt,
    DateTime? updatedAt,
    int? affiliateClicks,
    int? comparisonsCount,
    String? primaryCategory,
    String? usageIntent,
    DateTime? birthDate,
    String? gender,
    String? ageRange,
    String? profession,
    List<String>? interestCategories,
    Map<String, double>? profileVector,
    Map<String, Map<String, dynamic>>? userSubscriptionDetails,
  }) {
    return UserEntity(
      uid: uid ?? this.uid,
      email: email ?? this.email,
      displayName: displayName ?? this.displayName,
      photoURL: photoURL ?? this.photoURL,
      country: country ?? this.country,
      language: language ?? this.language,
      currency: currency ?? this.currency,
      ecosystem: ecosystem ?? this.ecosystem,
      budgetRange: budgetRange ?? this.budgetRange,
      priorities: priorities ?? this.priorities,
      currentDevices: currentDevices ?? this.currentDevices,
      subscriptions: subscriptions ?? this.subscriptions,
      ownedProducts: ownedProducts ?? this.ownedProducts,
      favorites: favorites ?? this.favorites,
      quizCompleted: quizCompleted ?? this.quizCompleted,
      isPremium: isPremium ?? this.isPremium,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
      affiliateClicks: affiliateClicks ?? this.affiliateClicks,
      comparisonsCount: comparisonsCount ?? this.comparisonsCount,
      primaryCategory: primaryCategory ?? this.primaryCategory,
      usageIntent: usageIntent ?? this.usageIntent,
      birthDate: birthDate ?? this.birthDate,
      gender: gender ?? this.gender,
      ageRange: ageRange ?? this.ageRange,
      profession: profession ?? this.profession,
      interestCategories: interestCategories ?? this.interestCategories,
      profileVector: profileVector ?? this.profileVector,
      userSubscriptionDetails: userSubscriptionDetails ?? this.userSubscriptionDetails,
    );
  }
}
