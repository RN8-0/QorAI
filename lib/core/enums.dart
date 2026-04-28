/// Qor AI - Enums
library;

/// User ecosystem - Section 5.2 Question 1
enum Ecosystem {
  apple,
  android,
  mixed;

  String get displayName {
    switch (this) {
      case Ecosystem.apple:
        return 'Apple';
      case Ecosystem.android:
        return 'Android';
      case Ecosystem.mixed:
        return 'Mixed';
    }
  }
}

/// Budget range - Section 5.2 Question 2
enum BudgetRange {
  low,
  mid,
  high,
  premium;

  String get displayName {
    switch (this) {
      case BudgetRange.low:
        return 'Affordable';
      case BudgetRange.mid:
        return 'Mid-Range';
      case BudgetRange.high:
        return 'Premium';
      case BudgetRange.premium:
        return 'No Preference';
    }
  }
}

/// User priorities - Section 5.2 Question 3
enum UserPriority {
  price,
  quality,
  design,
  ecosystem,
  performance;

  String get displayName {
    switch (this) {
      case UserPriority.price:
        return 'Price';
      case UserPriority.quality:
        return 'Quality';
      case UserPriority.design:
        return 'Design';
      case UserPriority.ecosystem:
        return 'Ecosystem Match';
      case UserPriority.performance:
        return 'Performance';
    }
  }
}

/// Main category - Section 18
enum ProductCategory {
  tech,
  subscription,
  gaming,
  travel;

  String get displayName {
    switch (this) {
      case ProductCategory.tech:
        return 'Technology';
      case ProductCategory.subscription:
        return 'Digital Subscriptions';
      case ProductCategory.gaming:
        return 'Games';
      case ProductCategory.travel:
        return 'Travel';
    }
  }

  String get icon {
    switch (this) {
      case ProductCategory.tech:
        return '💻';
      case ProductCategory.subscription:
        return '📱';
      case ProductCategory.gaming:
        return '🎮';
      case ProductCategory.travel:
        return '✈️';
    }
  }
}

/// Usage intent - Section 5.2 Question 8
enum UsageIntent {
  research,
  quickDecision,
  priceTracking,
  all;

  String get displayName {
    switch (this) {
      case UsageIntent.research:
        return 'Research';
      case UsageIntent.quickDecision:
        return 'Quick Decision';
      case UsageIntent.priceTracking:
        return 'Price Tracking';
      case UsageIntent.all:
        return 'All';
    }
  }
}

/// Affiliate click status
enum AffiliateConversionStatus {
  clicked,
  converted,
  expired,
}

/// Profile action types - Section 10.1
enum ProfileActionType {
  comparison,
  productChoice,
  affiliateClick,
  purchaseConfirm,
  searchQuery,
  linkPaste,
  review,
  screenTime;

  /// Action weight coefficient - Section 10.1
  double get weight {
    switch (this) {
      case ProfileActionType.comparison:
        return 0.8; // High
      case ProfileActionType.productChoice:
        return 1.0; // Very high
      case ProfileActionType.affiliateClick:
        return 0.8; // High
      case ProfileActionType.purchaseConfirm:
        return 1.0; // Very high
      case ProfileActionType.searchQuery:
        return 0.5; // Medium
      case ProfileActionType.linkPaste:
        return 0.8; // High
      case ProfileActionType.review:
        return 0.5; // Medium
      case ProfileActionType.screenTime:
        return 0.3; // Low
    }
  }
}
