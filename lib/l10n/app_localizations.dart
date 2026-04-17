import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/intl.dart' as intl;

import 'app_localizations_ar.dart';
import 'app_localizations_de.dart';
import 'app_localizations_en.dart';
import 'app_localizations_es.dart';
import 'app_localizations_fr.dart';
import 'app_localizations_it.dart';
import 'app_localizations_ja.dart';
import 'app_localizations_nl.dart';
import 'app_localizations_pl.dart';
import 'app_localizations_pt.dart';
import 'app_localizations_sv.dart';
import 'app_localizations_tr.dart';

// ignore_for_file: type=lint

/// Callers can lookup localized strings with an instance of AppLocalizations
/// returned by `AppLocalizations.of(context)`.
///
/// Applications need to include `AppLocalizations.delegate()` in their app's
/// `localizationDelegates` list, and the locales they support in the app's
/// `supportedLocales` list. For example:
///
/// ```dart
/// import 'l10n/app_localizations.dart';
///
/// return MaterialApp(
///   localizationsDelegates: AppLocalizations.localizationsDelegates,
///   supportedLocales: AppLocalizations.supportedLocales,
///   home: MyApplicationHome(),
/// );
/// ```
///
/// ## Update pubspec.yaml
///
/// Please make sure to update your pubspec.yaml to include the following
/// packages:
///
/// ```yaml
/// dependencies:
///   # Internationalization support.
///   flutter_localizations:
///     sdk: flutter
///   intl: any # Use the pinned version from flutter_localizations
///
///   # Rest of dependencies
/// ```
///
/// ## iOS Applications
///
/// iOS applications define key application metadata, including supported
/// locales, in an Info.plist file that is built into the application bundle.
/// To configure the locales supported by your app, you’ll need to edit this
/// file.
///
/// First, open your project’s ios/Runner.xcworkspace Xcode workspace file.
/// Then, in the Project Navigator, open the Info.plist file under the Runner
/// project’s Runner folder.
///
/// Next, select the Information Property List item, select Add Item from the
/// Editor menu, then select Localizations from the pop-up menu.
///
/// Select and expand the newly-created Localizations item then, for each
/// locale your application supports, add a new item and select the locale
/// you wish to add from the pop-up menu in the Value field. This list should
/// be consistent with the languages listed in the AppLocalizations.supportedLocales
/// property.
abstract class AppLocalizations {
  AppLocalizations(String locale)
    : localeName = intl.Intl.canonicalizedLocale(locale.toString());

  final String localeName;

  static AppLocalizations? of(BuildContext context) {
    return Localizations.of<AppLocalizations>(context, AppLocalizations);
  }

  static const LocalizationsDelegate<AppLocalizations> delegate =
      _AppLocalizationsDelegate();

  /// A list of this localizations delegate along with the default localizations
  /// delegates.
  ///
  /// Returns a list of localizations delegates containing this delegate along with
  /// GlobalMaterialLocalizations.delegate, GlobalCupertinoLocalizations.delegate,
  /// and GlobalWidgetsLocalizations.delegate.
  ///
  /// Additional delegates can be added by appending to this list in
  /// MaterialApp. This list does not have to be used at all if a custom list
  /// of delegates is preferred or required.
  static const List<LocalizationsDelegate<dynamic>> localizationsDelegates =
      <LocalizationsDelegate<dynamic>>[
        delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
      ];

  /// A list of this localizations delegate's supported locales.
  static const List<Locale> supportedLocales = <Locale>[
    Locale('ar'),
    Locale('de'),
    Locale('en'),
    Locale('es'),
    Locale('fr'),
    Locale('it'),
    Locale('ja'),
    Locale('nl'),
    Locale('pl'),
    Locale('pt'),
    Locale('sv'),
    Locale('tr'),
  ];

  /// No description provided for @appTitle.
  ///
  /// In en, this message translates to:
  /// **'Compair'**
  String get appTitle;

  /// No description provided for @home.
  ///
  /// In en, this message translates to:
  /// **'Home'**
  String get home;

  /// No description provided for @compare.
  ///
  /// In en, this message translates to:
  /// **'Compare'**
  String get compare;

  /// No description provided for @profile.
  ///
  /// In en, this message translates to:
  /// **'Profile'**
  String get profile;

  /// No description provided for @settings.
  ///
  /// In en, this message translates to:
  /// **'Settings'**
  String get settings;

  /// No description provided for @search.
  ///
  /// In en, this message translates to:
  /// **'Search'**
  String get search;

  /// No description provided for @searchHint.
  ///
  /// In en, this message translates to:
  /// **'Search products, categories or brands...'**
  String get searchHint;

  /// No description provided for @forYou.
  ///
  /// In en, this message translates to:
  /// **'For You'**
  String get forYou;

  /// No description provided for @trending.
  ///
  /// In en, this message translates to:
  /// **'Trending'**
  String get trending;

  /// No description provided for @quickCompare.
  ///
  /// In en, this message translates to:
  /// **'Quick Compare'**
  String get quickCompare;

  /// No description provided for @categories.
  ///
  /// In en, this message translates to:
  /// **'Categories'**
  String get categories;

  /// No description provided for @communityPicks.
  ///
  /// In en, this message translates to:
  /// **'Community Picks (Reddit/Tech)'**
  String get communityPicks;

  /// No description provided for @newlyAdded.
  ///
  /// In en, this message translates to:
  /// **'Newly Added'**
  String get newlyAdded;

  /// No description provided for @seeAll.
  ///
  /// In en, this message translates to:
  /// **'See All'**
  String get seeAll;

  /// No description provided for @skip.
  ///
  /// In en, this message translates to:
  /// **'Skip'**
  String get skip;

  /// No description provided for @next.
  ///
  /// In en, this message translates to:
  /// **'Next'**
  String get next;

  /// No description provided for @createProfile.
  ///
  /// In en, this message translates to:
  /// **'Create Profile'**
  String get createProfile;

  /// No description provided for @welcomeTitle.
  ///
  /// In en, this message translates to:
  /// **'Welcome to Compair'**
  String get welcomeTitle;

  /// No description provided for @welcomeSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Your AI-powered Personal Decision Engine'**
  String get welcomeSubtitle;

  /// No description provided for @quizTitle.
  ///
  /// In en, this message translates to:
  /// **'Let\'s Get to Know You'**
  String get quizTitle;

  /// No description provided for @quizSubtitle.
  ///
  /// In en, this message translates to:
  /// **'A few questions to determine your Algorithm Identity'**
  String get quizSubtitle;

  /// No description provided for @compareTitle.
  ///
  /// In en, this message translates to:
  /// **'Magic Comparison'**
  String get compareTitle;

  /// No description provided for @compareSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Compare tech, subscriptions, or real estate'**
  String get compareSubtitle;

  /// No description provided for @scorePersonalFit.
  ///
  /// In en, this message translates to:
  /// **'Personal Fit'**
  String get scorePersonalFit;

  /// No description provided for @scoreCommunity.
  ///
  /// In en, this message translates to:
  /// **'Community'**
  String get scoreCommunity;

  /// No description provided for @scoreExpert.
  ///
  /// In en, this message translates to:
  /// **'Expert'**
  String get scoreExpert;

  /// No description provided for @scoreValuePrice.
  ///
  /// In en, this message translates to:
  /// **'Value/Price Ratio'**
  String get scoreValuePrice;

  /// No description provided for @pros.
  ///
  /// In en, this message translates to:
  /// **'Pros'**
  String get pros;

  /// No description provided for @cons.
  ///
  /// In en, this message translates to:
  /// **'Cons'**
  String get cons;

  /// No description provided for @specs.
  ///
  /// In en, this message translates to:
  /// **'Specifications'**
  String get specs;

  /// No description provided for @whereToBuy.
  ///
  /// In en, this message translates to:
  /// **'Where to Buy?'**
  String get whereToBuy;

  /// No description provided for @iBoughtThis.
  ///
  /// In en, this message translates to:
  /// **'I Bought This'**
  String get iBoughtThis;

  /// No description provided for @collection.
  ///
  /// In en, this message translates to:
  /// **'My Collection'**
  String get collection;

  /// No description provided for @comparisonHistory.
  ///
  /// In en, this message translates to:
  /// **'Comparison History'**
  String get comparisonHistory;

  /// No description provided for @upgradeToPro.
  ///
  /// In en, this message translates to:
  /// **'Upgrade to PRO (\$3.99/mo)'**
  String get upgradeToPro;

  /// No description provided for @darkTheme.
  ///
  /// In en, this message translates to:
  /// **'Dark Theme'**
  String get darkTheme;

  /// No description provided for @country.
  ///
  /// In en, this message translates to:
  /// **'Country (US Only)'**
  String get country;

  /// No description provided for @language.
  ///
  /// In en, this message translates to:
  /// **'Language'**
  String get language;

  /// No description provided for @currency.
  ///
  /// In en, this message translates to:
  /// **'Currency'**
  String get currency;

  /// No description provided for @notifications.
  ///
  /// In en, this message translates to:
  /// **'Notifications'**
  String get notifications;

  /// No description provided for @account.
  ///
  /// In en, this message translates to:
  /// **'Account'**
  String get account;

  /// No description provided for @signOut.
  ///
  /// In en, this message translates to:
  /// **'Sign Out'**
  String get signOut;

  /// No description provided for @signOutConfirm.
  ///
  /// In en, this message translates to:
  /// **'Are you sure you want to sign out?'**
  String get signOutConfirm;

  /// No description provided for @cancel.
  ///
  /// In en, this message translates to:
  /// **'Cancel'**
  String get cancel;

  /// No description provided for @error.
  ///
  /// In en, this message translates to:
  /// **'Error'**
  String get error;

  /// No description provided for @retry.
  ///
  /// In en, this message translates to:
  /// **'Retry'**
  String get retry;

  /// No description provided for @loading.
  ///
  /// In en, this message translates to:
  /// **'Loading...'**
  String get loading;

  /// No description provided for @noResults.
  ///
  /// In en, this message translates to:
  /// **'No results found'**
  String get noResults;

  /// No description provided for @pasteLink.
  ///
  /// In en, this message translates to:
  /// **'Paste Link'**
  String get pasteLink;

  /// No description provided for @pasteLinkHint.
  ///
  /// In en, this message translates to:
  /// **'Paste any link (Zillow, BestBuy, FB Marketplace...)'**
  String get pasteLinkHint;

  /// No description provided for @allShoppingSitesSupported.
  ///
  /// In en, this message translates to:
  /// **'All shopping sites are supported'**
  String get allShoppingSitesSupported;

  /// No description provided for @analyze.
  ///
  /// In en, this message translates to:
  /// **'Analyze'**
  String get analyze;

  /// No description provided for @analyzing.
  ///
  /// In en, this message translates to:
  /// **'Analyzing your persona & product...'**
  String get analyzing;

  /// No description provided for @winner.
  ///
  /// In en, this message translates to:
  /// **'Winner for You'**
  String get winner;

  /// No description provided for @aiAnalysis.
  ///
  /// In en, this message translates to:
  /// **'AI Analysis'**
  String get aiAnalysis;

  /// No description provided for @newComparison.
  ///
  /// In en, this message translates to:
  /// **'New Comparison'**
  String get newComparison;

  /// No description provided for @addToCollection.
  ///
  /// In en, this message translates to:
  /// **'Add to Collection'**
  String get addToCollection;

  /// No description provided for @addedToCollection.
  ///
  /// In en, this message translates to:
  /// **'Added to your collection! ✅'**
  String get addedToCollection;

  /// No description provided for @tech.
  ///
  /// In en, this message translates to:
  /// **'Technology'**
  String get tech;

  /// No description provided for @subscriptions.
  ///
  /// In en, this message translates to:
  /// **'Digital Subscriptions'**
  String get subscriptions;

  /// No description provided for @gaming.
  ///
  /// In en, this message translates to:
  /// **'Gaming'**
  String get gaming;

  /// No description provided for @realEstate.
  ///
  /// In en, this message translates to:
  /// **'Real Estate / Housing'**
  String get realEstate;

  /// No description provided for @vehicles.
  ///
  /// In en, this message translates to:
  /// **'Vehicles'**
  String get vehicles;

  /// No description provided for @freePlan.
  ///
  /// In en, this message translates to:
  /// **'Free Plan'**
  String get freePlan;

  /// No description provided for @proPlan.
  ///
  /// In en, this message translates to:
  /// **'PRO Plan'**
  String get proPlan;

  /// No description provided for @version.
  ///
  /// In en, this message translates to:
  /// **'Version'**
  String get version;

  /// No description provided for @yourAlgorithmIdentity.
  ///
  /// In en, this message translates to:
  /// **'Your Identity: {identity}'**
  String yourAlgorithmIdentity(String identity);

  /// No description provided for @whyXoverY.
  ///
  /// In en, this message translates to:
  /// **'Why this fits you better:'**
  String get whyXoverY;

  /// No description provided for @expertsSay.
  ///
  /// In en, this message translates to:
  /// **'What Experts Say:'**
  String get expertsSay;

  /// No description provided for @redditSays.
  ///
  /// In en, this message translates to:
  /// **'What Reddit/Community Says:'**
  String get redditSays;

  /// No description provided for @monthlySub.
  ///
  /// In en, this message translates to:
  /// **'\$3.99 / mo'**
  String get monthlySub;

  /// No description provided for @yearlySub.
  ///
  /// In en, this message translates to:
  /// **'\$39.99 / yr'**
  String get yearlySub;

  /// No description provided for @appearance.
  ///
  /// In en, this message translates to:
  /// **'Appearance'**
  String get appearance;

  /// No description provided for @theme.
  ///
  /// In en, this message translates to:
  /// **'Theme'**
  String get theme;

  /// No description provided for @display.
  ///
  /// In en, this message translates to:
  /// **'Display'**
  String get display;

  /// No description provided for @regionAndLanguage.
  ///
  /// In en, this message translates to:
  /// **'Region & Language'**
  String get regionAndLanguage;

  /// No description provided for @pushNotifications.
  ///
  /// In en, this message translates to:
  /// **'Push Notifications'**
  String get pushNotifications;

  /// No description provided for @emailUpdates.
  ///
  /// In en, this message translates to:
  /// **'Email Updates'**
  String get emailUpdates;

  /// No description provided for @promotionalOffers.
  ///
  /// In en, this message translates to:
  /// **'Promotional Offers'**
  String get promotionalOffers;

  /// No description provided for @notificationsSection.
  ///
  /// In en, this message translates to:
  /// **'Notifications'**
  String get notificationsSection;

  /// No description provided for @dataPrivacy.
  ///
  /// In en, this message translates to:
  /// **'Data & Privacy'**
  String get dataPrivacy;

  /// No description provided for @helpSupport.
  ///
  /// In en, this message translates to:
  /// **'Help & Support'**
  String get helpSupport;

  /// No description provided for @rateApp.
  ///
  /// In en, this message translates to:
  /// **'Rate App'**
  String get rateApp;

  /// No description provided for @contactUs.
  ///
  /// In en, this message translates to:
  /// **'Contact Us'**
  String get contactUs;

  /// No description provided for @deleteAccount.
  ///
  /// In en, this message translates to:
  /// **'Delete Account'**
  String get deleteAccount;

  /// No description provided for @appVersion.
  ///
  /// In en, this message translates to:
  /// **'App Version'**
  String get appVersion;

  /// No description provided for @aiChat.
  ///
  /// In en, this message translates to:
  /// **'Compair'**
  String get aiChat;

  /// No description provided for @collections.
  ///
  /// In en, this message translates to:
  /// **'Collections'**
  String get collections;

  /// No description provided for @overview.
  ///
  /// In en, this message translates to:
  /// **'Overview'**
  String get overview;

  /// No description provided for @reviews.
  ///
  /// In en, this message translates to:
  /// **'Reviews'**
  String get reviews;

  /// No description provided for @addToCart.
  ///
  /// In en, this message translates to:
  /// **'Add to Cart'**
  String get addToCart;

  /// No description provided for @share.
  ///
  /// In en, this message translates to:
  /// **'Share'**
  String get share;

  /// No description provided for @report.
  ///
  /// In en, this message translates to:
  /// **'Report'**
  String get report;

  /// No description provided for @edit.
  ///
  /// In en, this message translates to:
  /// **'Edit'**
  String get edit;

  /// No description provided for @done.
  ///
  /// In en, this message translates to:
  /// **'Done'**
  String get done;

  /// No description provided for @save.
  ///
  /// In en, this message translates to:
  /// **'Save'**
  String get save;

  /// No description provided for @confirm.
  ///
  /// In en, this message translates to:
  /// **'Confirm'**
  String get confirm;

  /// No description provided for @delete.
  ///
  /// In en, this message translates to:
  /// **'Delete'**
  String get delete;

  /// No description provided for @remove.
  ///
  /// In en, this message translates to:
  /// **'Remove'**
  String get remove;

  /// No description provided for @back.
  ///
  /// In en, this message translates to:
  /// **'Back'**
  String get back;

  /// No description provided for @close.
  ///
  /// In en, this message translates to:
  /// **'Close'**
  String get close;

  /// No description provided for @open.
  ///
  /// In en, this message translates to:
  /// **'Open'**
  String get open;

  /// No description provided for @more.
  ///
  /// In en, this message translates to:
  /// **'More'**
  String get more;

  /// No description provided for @less.
  ///
  /// In en, this message translates to:
  /// **'Less'**
  String get less;

  /// No description provided for @all.
  ///
  /// In en, this message translates to:
  /// **'All'**
  String get all;

  /// No description provided for @none.
  ///
  /// In en, this message translates to:
  /// **'None'**
  String get none;

  /// No description provided for @yes.
  ///
  /// In en, this message translates to:
  /// **'Yes'**
  String get yes;

  /// No description provided for @no.
  ///
  /// In en, this message translates to:
  /// **'No'**
  String get no;

  /// No description provided for @ok.
  ///
  /// In en, this message translates to:
  /// **'OK'**
  String get ok;

  /// No description provided for @select.
  ///
  /// In en, this message translates to:
  /// **'Select'**
  String get select;

  /// No description provided for @selected.
  ///
  /// In en, this message translates to:
  /// **'Selected'**
  String get selected;

  /// No description provided for @selectLanguage.
  ///
  /// In en, this message translates to:
  /// **'Select Language'**
  String get selectLanguage;

  /// No description provided for @selectCountry.
  ///
  /// In en, this message translates to:
  /// **'Select Country'**
  String get selectCountry;

  /// No description provided for @selectTheme.
  ///
  /// In en, this message translates to:
  /// **'Select Theme'**
  String get selectTheme;

  /// No description provided for @darkMode.
  ///
  /// In en, this message translates to:
  /// **'Dark Mode'**
  String get darkMode;

  /// No description provided for @lightMode.
  ///
  /// In en, this message translates to:
  /// **'Light Mode'**
  String get lightMode;

  /// No description provided for @systemDefault.
  ///
  /// In en, this message translates to:
  /// **'System Default'**
  String get systemDefault;

  /// No description provided for @algorithmIdentity.
  ///
  /// In en, this message translates to:
  /// **'Algorithm Identity'**
  String get algorithmIdentity;

  /// No description provided for @personalFit.
  ///
  /// In en, this message translates to:
  /// **'Personal Fit'**
  String get personalFit;

  /// No description provided for @communityInsight.
  ///
  /// In en, this message translates to:
  /// **'Community Insight'**
  String get communityInsight;

  /// No description provided for @expertReview.
  ///
  /// In en, this message translates to:
  /// **'Expert Review'**
  String get expertReview;

  /// No description provided for @valuePriceRatio.
  ///
  /// In en, this message translates to:
  /// **'Value/Price Ratio'**
  String get valuePriceRatio;

  /// No description provided for @winnerForYou.
  ///
  /// In en, this message translates to:
  /// **'Winner for You'**
  String get winnerForYou;

  /// No description provided for @quickCompareTitle.
  ///
  /// In en, this message translates to:
  /// **'Quick Compare'**
  String get quickCompareTitle;

  /// No description provided for @pasteProductLink.
  ///
  /// In en, this message translates to:
  /// **'Paste a product link or search below'**
  String get pasteProductLink;

  /// No description provided for @recentComparisons.
  ///
  /// In en, this message translates to:
  /// **'Recent Comparisons'**
  String get recentComparisons;

  /// No description provided for @emptyCollectionMsg.
  ///
  /// In en, this message translates to:
  /// **'Your collection is empty. Add products to compare!'**
  String get emptyCollectionMsg;

  /// No description provided for @emptyComparisonsMsg.
  ///
  /// In en, this message translates to:
  /// **'No comparisons yet. Start comparing products!'**
  String get emptyComparisonsMsg;

  /// No description provided for @viewAll.
  ///
  /// In en, this message translates to:
  /// **'View All'**
  String get viewAll;

  /// No description provided for @viewDetails.
  ///
  /// In en, this message translates to:
  /// **'View Details'**
  String get viewDetails;

  /// No description provided for @buyNow.
  ///
  /// In en, this message translates to:
  /// **'Buy Now'**
  String get buyNow;

  /// No description provided for @checkPrice.
  ///
  /// In en, this message translates to:
  /// **'Check Price'**
  String get checkPrice;

  /// No description provided for @priceHistory.
  ///
  /// In en, this message translates to:
  /// **'Price History'**
  String get priceHistory;

  /// No description provided for @similarProducts.
  ///
  /// In en, this message translates to:
  /// **'Similar Products'**
  String get similarProducts;

  /// No description provided for @alsoConsidering.
  ///
  /// In en, this message translates to:
  /// **'Also Considering'**
  String get alsoConsidering;

  /// No description provided for @yourDecision.
  ///
  /// In en, this message translates to:
  /// **'Your Decision'**
  String get yourDecision;

  /// No description provided for @myProfile.
  ///
  /// In en, this message translates to:
  /// **'My Profile'**
  String get myProfile;

  /// No description provided for @editProfile.
  ///
  /// In en, this message translates to:
  /// **'Edit Profile'**
  String get editProfile;

  /// No description provided for @behaviorReport.
  ///
  /// In en, this message translates to:
  /// **'Behavior Report'**
  String get behaviorReport;

  /// No description provided for @algorithmScore.
  ///
  /// In en, this message translates to:
  /// **'Algorithm Score'**
  String get algorithmScore;

  /// No description provided for @totalComparisons.
  ///
  /// In en, this message translates to:
  /// **'Total Comparisons'**
  String get totalComparisons;

  /// No description provided for @joinDate.
  ///
  /// In en, this message translates to:
  /// **'Member Since'**
  String get joinDate;

  /// No description provided for @logout.
  ///
  /// In en, this message translates to:
  /// **'Log Out'**
  String get logout;

  /// No description provided for @manageSubscriptions.
  ///
  /// In en, this message translates to:
  /// **'Manage Subscriptions'**
  String get manageSubscriptions;

  /// No description provided for @currentPlan.
  ///
  /// In en, this message translates to:
  /// **'Current Plan'**
  String get currentPlan;

  /// No description provided for @upgradePro.
  ///
  /// In en, this message translates to:
  /// **'Upgrade to PRO'**
  String get upgradePro;

  /// No description provided for @monthlyBilling.
  ///
  /// In en, this message translates to:
  /// **'Monthly Billing'**
  String get monthlyBilling;

  /// No description provided for @yearlyBilling.
  ///
  /// In en, this message translates to:
  /// **'Yearly Billing (Save 17%)'**
  String get yearlyBilling;

  /// No description provided for @perMonth.
  ///
  /// In en, this message translates to:
  /// **'/ month'**
  String get perMonth;

  /// No description provided for @perYear.
  ///
  /// In en, this message translates to:
  /// **'/ year'**
  String get perYear;

  /// No description provided for @activeSubscriptions.
  ///
  /// In en, this message translates to:
  /// **'Active Subscriptions'**
  String get activeSubscriptions;

  /// No description provided for @noSubscriptions.
  ///
  /// In en, this message translates to:
  /// **'No subscriptions yet'**
  String get noSubscriptions;

  /// No description provided for @manageInApp.
  ///
  /// In en, this message translates to:
  /// **'Manage in App Store'**
  String get manageInApp;

  /// No description provided for @popular.
  ///
  /// In en, this message translates to:
  /// **'Popular'**
  String get popular;

  /// No description provided for @new_.
  ///
  /// In en, this message translates to:
  /// **'New'**
  String get new_;

  /// No description provided for @sale.
  ///
  /// In en, this message translates to:
  /// **'Sale'**
  String get sale;

  /// No description provided for @bestValue.
  ///
  /// In en, this message translates to:
  /// **'Best Value'**
  String get bestValue;

  /// No description provided for @recommended.
  ///
  /// In en, this message translates to:
  /// **'Recommended'**
  String get recommended;

  /// No description provided for @compareNow.
  ///
  /// In en, this message translates to:
  /// **'Compare Now'**
  String get compareNow;

  /// No description provided for @startComparing.
  ///
  /// In en, this message translates to:
  /// **'Start Comparing'**
  String get startComparing;

  /// No description provided for @searchProducts.
  ///
  /// In en, this message translates to:
  /// **'Search Products'**
  String get searchProducts;

  /// No description provided for @filterBy.
  ///
  /// In en, this message translates to:
  /// **'Filter By'**
  String get filterBy;

  /// No description provided for @sortBy.
  ///
  /// In en, this message translates to:
  /// **'Sort By'**
  String get sortBy;

  /// No description provided for @price.
  ///
  /// In en, this message translates to:
  /// **'Price'**
  String get price;

  /// No description provided for @rating.
  ///
  /// In en, this message translates to:
  /// **'Rating'**
  String get rating;

  /// No description provided for @category.
  ///
  /// In en, this message translates to:
  /// **'Category'**
  String get category;

  /// No description provided for @brand.
  ///
  /// In en, this message translates to:
  /// **'Brand'**
  String get brand;

  /// No description provided for @inStock.
  ///
  /// In en, this message translates to:
  /// **'In Stock'**
  String get inStock;

  /// No description provided for @outOfStock.
  ///
  /// In en, this message translates to:
  /// **'Out of Stock'**
  String get outOfStock;

  /// No description provided for @compareProducts.
  ///
  /// In en, this message translates to:
  /// **'Compare Products'**
  String get compareProducts;

  /// No description provided for @compareSubscriptions.
  ///
  /// In en, this message translates to:
  /// **'Compare Subscriptions'**
  String get compareSubscriptions;

  /// No description provided for @selectProductsOrTry.
  ///
  /// In en, this message translates to:
  /// **'Select products or try a popular comparison'**
  String get selectProductsOrTry;

  /// No description provided for @popularComparisons.
  ///
  /// In en, this message translates to:
  /// **'Popular Comparisons'**
  String get popularComparisons;

  /// No description provided for @trendingProducts.
  ///
  /// In en, this message translates to:
  /// **'Trending Products'**
  String get trendingProducts;

  /// No description provided for @compareNowBtn.
  ///
  /// In en, this message translates to:
  /// **'Compare Now'**
  String get compareNowBtn;

  /// No description provided for @youtubeComparisons.
  ///
  /// In en, this message translates to:
  /// **'YouTube Comparisons'**
  String get youtubeComparisons;

  /// No description provided for @aiComparisonReview.
  ///
  /// In en, this message translates to:
  /// **'AI Comparison Review'**
  String get aiComparisonReview;

  /// No description provided for @userReviews.
  ///
  /// In en, this message translates to:
  /// **'User Reviews'**
  String get userReviews;

  /// No description provided for @writeAReview.
  ///
  /// In en, this message translates to:
  /// **'Write a Review'**
  String get writeAReview;

  /// No description provided for @noReviewsYet.
  ///
  /// In en, this message translates to:
  /// **'No reviews yet'**
  String get noReviewsYet;

  /// No description provided for @beFirstToReview.
  ///
  /// In en, this message translates to:
  /// **'Be the first to share your thoughts!'**
  String get beFirstToReview;

  /// No description provided for @aiPurchaseAdvisor.
  ///
  /// In en, this message translates to:
  /// **'AI Purchase Advisor'**
  String get aiPurchaseAdvisor;

  /// No description provided for @personalizedRecommendation.
  ///
  /// In en, this message translates to:
  /// **'Personalized recommendation'**
  String get personalizedRecommendation;

  /// No description provided for @getAiVerdict.
  ///
  /// In en, this message translates to:
  /// **'Get AI Purchase Verdict'**
  String get getAiVerdict;

  /// No description provided for @submitReview.
  ///
  /// In en, this message translates to:
  /// **'Submit Review'**
  String get submitReview;

  /// No description provided for @products.
  ///
  /// In en, this message translates to:
  /// **'Products'**
  String get products;

  /// No description provided for @comparePlansAndPricing.
  ///
  /// In en, this message translates to:
  /// **'Compare plans & pricing'**
  String get comparePlansAndPricing;

  /// No description provided for @noNotificationsYet.
  ///
  /// In en, this message translates to:
  /// **'No notifications yet'**
  String get noNotificationsYet;

  /// No description provided for @notificationsWillAppear.
  ///
  /// In en, this message translates to:
  /// **'Price drops and recommendations will appear here'**
  String get notificationsWillAppear;

  /// No description provided for @completeYourProfile.
  ///
  /// In en, this message translates to:
  /// **'Complete Your Profile'**
  String get completeYourProfile;

  /// No description provided for @getAiRecommendations.
  ///
  /// In en, this message translates to:
  /// **'Get AI-powered recommendations'**
  String get getAiRecommendations;

  /// No description provided for @searchProducts2.
  ///
  /// In en, this message translates to:
  /// **'Search 37K+ products...'**
  String get searchProducts2;

  /// No description provided for @pcBuilder.
  ///
  /// In en, this message translates to:
  /// **'PC Builder'**
  String get pcBuilder;

  /// No description provided for @buildDreamPc.
  ///
  /// In en, this message translates to:
  /// **'Build your dream PC with AI guidance'**
  String get buildDreamPc;

  /// No description provided for @compareNowSmall.
  ///
  /// In en, this message translates to:
  /// **'Compare now'**
  String get compareNowSmall;

  /// No description provided for @noRecommendationsYet.
  ///
  /// In en, this message translates to:
  /// **'No recommendations yet'**
  String get noRecommendationsYet;

  /// No description provided for @plans.
  ///
  /// In en, this message translates to:
  /// **'Plans'**
  String get plans;

  /// No description provided for @tapForDetails.
  ///
  /// In en, this message translates to:
  /// **'Tap for details'**
  String get tapForDetails;

  /// No description provided for @free.
  ///
  /// In en, this message translates to:
  /// **'Free'**
  String get free;

  /// No description provided for @plansAvailable.
  ///
  /// In en, this message translates to:
  /// **'{count} plans available'**
  String plansAvailable(int count);

  /// No description provided for @aiComparison.
  ///
  /// In en, this message translates to:
  /// **'AI Comparison'**
  String get aiComparison;

  /// No description provided for @failedTapToRetry.
  ///
  /// In en, this message translates to:
  /// **'Failed. Tap to retry.'**
  String get failedTapToRetry;

  /// No description provided for @yourMatch.
  ///
  /// In en, this message translates to:
  /// **'Your Match'**
  String get yourMatch;

  /// No description provided for @takeQuiz.
  ///
  /// In en, this message translates to:
  /// **'Take Quiz'**
  String get takeQuiz;

  /// No description provided for @priceTrends.
  ///
  /// In en, this message translates to:
  /// **'Price Trends'**
  String get priceTrends;

  /// No description provided for @comparePricesGoogle.
  ///
  /// In en, this message translates to:
  /// **'Compare Prices on Google Shopping'**
  String get comparePricesGoogle;

  /// No description provided for @startAiComparison.
  ///
  /// In en, this message translates to:
  /// **'Start AI Comparison'**
  String get startAiComparison;

  /// No description provided for @loadReviewVideos.
  ///
  /// In en, this message translates to:
  /// **'Load Review Videos'**
  String get loadReviewVideos;

  /// No description provided for @analyzeCommunityReviews.
  ///
  /// In en, this message translates to:
  /// **'Analyze Community Reviews'**
  String get analyzeCommunityReviews;

  /// No description provided for @praised.
  ///
  /// In en, this message translates to:
  /// **'Praised'**
  String get praised;

  /// No description provided for @criticized.
  ///
  /// In en, this message translates to:
  /// **'Criticized'**
  String get criticized;

  /// No description provided for @aiVerified.
  ///
  /// In en, this message translates to:
  /// **'AI Verified'**
  String get aiVerified;

  /// No description provided for @premiumInsights.
  ///
  /// In en, this message translates to:
  /// **'Premium Insights'**
  String get premiumInsights;

  /// No description provided for @personalizedMatch.
  ///
  /// In en, this message translates to:
  /// **'Personalized Match'**
  String get personalizedMatch;

  /// No description provided for @basedOnBehavior.
  ///
  /// In en, this message translates to:
  /// **'Based on your browsing history, preferences, and behavior patterns'**
  String get basedOnBehavior;

  /// No description provided for @recentComparisonsSec.
  ///
  /// In en, this message translates to:
  /// **'Recent Comparisons'**
  String get recentComparisonsSec;

  /// No description provided for @startComparing2.
  ///
  /// In en, this message translates to:
  /// **'Start comparing products to see them here'**
  String get startComparing2;

  /// No description provided for @savedItems.
  ///
  /// In en, this message translates to:
  /// **'Saved Items'**
  String get savedItems;

  /// No description provided for @emptyCollection.
  ///
  /// In en, this message translates to:
  /// **'Your collection is empty'**
  String get emptyCollection;

  /// No description provided for @addProductsToCollection.
  ///
  /// In en, this message translates to:
  /// **'Add products from search or comparisons'**
  String get addProductsToCollection;

  /// No description provided for @searchHint2.
  ///
  /// In en, this message translates to:
  /// **'Search products, brands, specs...'**
  String get searchHint2;

  /// No description provided for @filters.
  ///
  /// In en, this message translates to:
  /// **'Filters'**
  String get filters;

  /// No description provided for @sortBy2.
  ///
  /// In en, this message translates to:
  /// **'Sort By'**
  String get sortBy2;

  /// No description provided for @selectAtLeast2.
  ///
  /// In en, this message translates to:
  /// **'Select at least 2 products'**
  String get selectAtLeast2;

  /// No description provided for @couldNotLoadProduct.
  ///
  /// In en, this message translates to:
  /// **'Could not load product data'**
  String get couldNotLoadProduct;

  /// No description provided for @mustBeSameCategory.
  ///
  /// In en, this message translates to:
  /// **'Products must be from the same category to compare'**
  String get mustBeSameCategory;

  /// No description provided for @reviewSubmitted.
  ///
  /// In en, this message translates to:
  /// **'Review submitted! ⭐'**
  String get reviewSubmitted;

  /// No description provided for @failedToSubmit.
  ///
  /// In en, this message translates to:
  /// **'Failed to submit'**
  String failedToSubmit(String error);

  /// No description provided for @signInToReview.
  ///
  /// In en, this message translates to:
  /// **'Please sign in to write a review'**
  String get signInToReview;

  /// No description provided for @tryAgain.
  ///
  /// In en, this message translates to:
  /// **'Try Again'**
  String get tryAgain;

  /// No description provided for @noSubscriptionsCategory.
  ///
  /// In en, this message translates to:
  /// **'No subscriptions in this category'**
  String get noSubscriptionsCategory;

  /// No description provided for @services.
  ///
  /// In en, this message translates to:
  /// **'services'**
  String get services;

  /// No description provided for @aiAnalysisWillBeAvailable.
  ///
  /// In en, this message translates to:
  /// **'AI analysis will be available after processing.'**
  String get aiAnalysisWillBeAvailable;

  /// No description provided for @addedToCompare.
  ///
  /// In en, this message translates to:
  /// **'Added to compare'**
  String get addedToCompare;

  /// No description provided for @removedFromCompare.
  ///
  /// In en, this message translates to:
  /// **'Removed from compare'**
  String get removedFromCompare;

  /// No description provided for @overviewTab.
  ///
  /// In en, this message translates to:
  /// **'Overview'**
  String get overviewTab;

  /// No description provided for @specsTab.
  ///
  /// In en, this message translates to:
  /// **'Specs'**
  String get specsTab;

  /// No description provided for @reviewsTab.
  ///
  /// In en, this message translates to:
  /// **'Reviews'**
  String get reviewsTab;

  /// No description provided for @aiTab.
  ///
  /// In en, this message translates to:
  /// **'AI Analysis'**
  String get aiTab;

  /// No description provided for @myCollectionTitle.
  ///
  /// In en, this message translates to:
  /// **'My Collection'**
  String get myCollectionTitle;

  /// No description provided for @comparisonHistoryTitle.
  ///
  /// In en, this message translates to:
  /// **'Comparison History'**
  String get comparisonHistoryTitle;

  /// No description provided for @searchResultsTitle.
  ///
  /// In en, this message translates to:
  /// **'Search Results'**
  String get searchResultsTitle;

  /// No description provided for @forYouSection.
  ///
  /// In en, this message translates to:
  /// **'For You'**
  String get forYouSection;

  /// No description provided for @trendingSection.
  ///
  /// In en, this message translates to:
  /// **'Trending'**
  String get trendingSection;

  /// No description provided for @popularSection.
  ///
  /// In en, this message translates to:
  /// **'Popular'**
  String get popularSection;

  /// No description provided for @newSection.
  ///
  /// In en, this message translates to:
  /// **'New'**
  String get newSection;

  /// No description provided for @darkThemeLabel.
  ///
  /// In en, this message translates to:
  /// **'Dark'**
  String get darkThemeLabel;

  /// No description provided for @lightThemeLabel.
  ///
  /// In en, this message translates to:
  /// **'Light'**
  String get lightThemeLabel;

  /// No description provided for @systemThemeLabel.
  ///
  /// In en, this message translates to:
  /// **'System'**
  String get systemThemeLabel;

  /// No description provided for @priceDropAlerts.
  ///
  /// In en, this message translates to:
  /// **'Price Drop Alerts'**
  String get priceDropAlerts;

  /// No description provided for @displaySettings.
  ///
  /// In en, this message translates to:
  /// **'Display Settings'**
  String get displaySettings;

  /// No description provided for @defaultString.
  ///
  /// In en, this message translates to:
  /// **'Default'**
  String get defaultString;

  /// No description provided for @subscription.
  ///
  /// In en, this message translates to:
  /// **'Subscription'**
  String get subscription;

  /// No description provided for @exportMyData.
  ///
  /// In en, this message translates to:
  /// **'Export My Data'**
  String get exportMyData;

  /// No description provided for @clearCache.
  ///
  /// In en, this message translates to:
  /// **'Clear Cache'**
  String get clearCache;

  /// No description provided for @faqHelp.
  ///
  /// In en, this message translates to:
  /// **'FAQ & Help'**
  String get faqHelp;

  /// No description provided for @privacyPolicy.
  ///
  /// In en, this message translates to:
  /// **'Privacy Policy'**
  String get privacyPolicy;

  /// No description provided for @termsOfService.
  ///
  /// In en, this message translates to:
  /// **'Terms of Service'**
  String get termsOfService;

  /// No description provided for @openSourceLicenses.
  ///
  /// In en, this message translates to:
  /// **'Open Source Licenses'**
  String get openSourceLicenses;

  /// No description provided for @dataExported.
  ///
  /// In en, this message translates to:
  /// **'Data export will be emailed to you'**
  String get dataExported;

  /// No description provided for @cacheCleared.
  ///
  /// In en, this message translates to:
  /// **'Cache cleared successfully'**
  String get cacheCleared;

  /// No description provided for @helpCenterComingSoon.
  ///
  /// In en, this message translates to:
  /// **'Help center coming soon'**
  String get helpCenterComingSoon;

  /// No description provided for @storePageComingSoon.
  ///
  /// In en, this message translates to:
  /// **'Store page will be available after launch'**
  String get storePageComingSoon;

  /// No description provided for @shareLinkComingSoon.
  ///
  /// In en, this message translates to:
  /// **'Share link will be available after launch'**
  String get shareLinkComingSoon;

  /// No description provided for @currencyFollowsCountry.
  ///
  /// In en, this message translates to:
  /// **'Currency follows your country selection'**
  String get currencyFollowsCountry;

  /// No description provided for @smartphones.
  ///
  /// In en, this message translates to:
  /// **'Smartphones'**
  String get smartphones;

  /// No description provided for @laptops.
  ///
  /// In en, this message translates to:
  /// **'Laptops'**
  String get laptops;

  /// No description provided for @tablets.
  ///
  /// In en, this message translates to:
  /// **'Tablets'**
  String get tablets;

  /// No description provided for @headphones.
  ///
  /// In en, this message translates to:
  /// **'Headphones'**
  String get headphones;

  /// No description provided for @monitors.
  ///
  /// In en, this message translates to:
  /// **'Monitors'**
  String get monitors;

  /// No description provided for @tvsAndDisplays.
  ///
  /// In en, this message translates to:
  /// **'TVs & Displays'**
  String get tvsAndDisplays;

  /// No description provided for @processors.
  ///
  /// In en, this message translates to:
  /// **'Processors'**
  String get processors;

  /// No description provided for @graphicsCards.
  ///
  /// In en, this message translates to:
  /// **'Graphics Cards'**
  String get graphicsCards;

  /// No description provided for @smartwatches.
  ///
  /// In en, this message translates to:
  /// **'Smartwatches'**
  String get smartwatches;

  /// No description provided for @newArrivals.
  ///
  /// In en, this message translates to:
  /// **'New Arrivals'**
  String get newArrivals;

  /// No description provided for @trendingToday.
  ///
  /// In en, this message translates to:
  /// **'Trending Today'**
  String get trendingToday;

  /// No description provided for @compareStreaming.
  ///
  /// In en, this message translates to:
  /// **'Compare streaming & cloud services'**
  String get compareStreaming;

  /// No description provided for @latestHighScoring.
  ///
  /// In en, this message translates to:
  /// **'Latest high-scoring products'**
  String get latestHighScoring;

  /// No description provided for @goodMorning.
  ///
  /// In en, this message translates to:
  /// **'Good Morning'**
  String get goodMorning;

  /// No description provided for @goodAfternoon.
  ///
  /// In en, this message translates to:
  /// **'Good Afternoon'**
  String get goodAfternoon;

  /// No description provided for @goodEvening.
  ///
  /// In en, this message translates to:
  /// **'Good Evening'**
  String get goodEvening;

  /// No description provided for @completeProfileSuggestion.
  ///
  /// In en, this message translates to:
  /// **'Complete your profile for better suggestions'**
  String get completeProfileSuggestion;

  /// No description provided for @topPicksFor.
  ///
  /// In en, this message translates to:
  /// **'Top picks for {profession}'**
  String topPicksFor(String profession);

  /// No description provided for @curatedFor.
  ///
  /// In en, this message translates to:
  /// **'Curated for {ecosystem} users'**
  String curatedFor(String ecosystem);

  /// No description provided for @premiumPicks.
  ///
  /// In en, this message translates to:
  /// **'premium picks'**
  String get premiumPicks;

  /// No description provided for @budgetFriendly.
  ///
  /// In en, this message translates to:
  /// **'budget-friendly'**
  String get budgetFriendly;

  /// No description provided for @engineers.
  ///
  /// In en, this message translates to:
  /// **'Engineers'**
  String get engineers;

  /// No description provided for @designers.
  ///
  /// In en, this message translates to:
  /// **'Designers'**
  String get designers;

  /// No description provided for @students.
  ///
  /// In en, this message translates to:
  /// **'Students'**
  String get students;

  /// No description provided for @managers.
  ///
  /// In en, this message translates to:
  /// **'Managers'**
  String get managers;

  /// No description provided for @healthcarePros.
  ///
  /// In en, this message translates to:
  /// **'Healthcare Pros'**
  String get healthcarePros;

  /// No description provided for @teachers.
  ///
  /// In en, this message translates to:
  /// **'Teachers'**
  String get teachers;

  /// No description provided for @financePros.
  ///
  /// In en, this message translates to:
  /// **'Finance Pros'**
  String get financePros;

  /// No description provided for @deleteAccountWarning.
  ///
  /// In en, this message translates to:
  /// **'This action is permanent and cannot be undone. All your data will be lost.'**
  String get deleteAccountWarning;

  /// No description provided for @accountDeletionSubmitted.
  ///
  /// In en, this message translates to:
  /// **'Account deletion request submitted'**
  String get accountDeletionSubmitted;

  /// No description provided for @clearCacheWarning.
  ///
  /// In en, this message translates to:
  /// **'This will clear cached images and data. The app may load slower temporarily.'**
  String get clearCacheWarning;

  /// No description provided for @clear.
  ///
  /// In en, this message translates to:
  /// **'Clear'**
  String get clear;

  /// No description provided for @couldNotOpenEmail.
  ///
  /// In en, this message translates to:
  /// **'Could not open email app'**
  String get couldNotOpenEmail;

  /// No description provided for @guestUser.
  ///
  /// In en, this message translates to:
  /// **'Guest User'**
  String get guestUser;

  /// No description provided for @navigate.
  ///
  /// In en, this message translates to:
  /// **'Navigate'**
  String get navigate;

  /// No description provided for @browseCategories.
  ///
  /// In en, this message translates to:
  /// **'Browse Categories'**
  String get browseCategories;

  /// No description provided for @tools.
  ///
  /// In en, this message translates to:
  /// **'Tools'**
  String get tools;

  /// No description provided for @linkAnalysis.
  ///
  /// In en, this message translates to:
  /// **'Link Analysis'**
  String get linkAnalysis;

  /// No description provided for @linkCompare.
  ///
  /// In en, this message translates to:
  /// **'Link Compare'**
  String get linkCompare;

  /// No description provided for @subAnalysis.
  ///
  /// In en, this message translates to:
  /// **'Sub Analysis'**
  String get subAnalysis;

  /// No description provided for @productScan.
  ///
  /// In en, this message translates to:
  /// **'Product Scan'**
  String get productScan;

  /// No description provided for @dailyUsage.
  ///
  /// In en, this message translates to:
  /// **'Daily Usage'**
  String get dailyUsage;

  /// No description provided for @dailyLimitReached.
  ///
  /// In en, this message translates to:
  /// **'Daily Limit Reached'**
  String get dailyLimitReached;

  /// No description provided for @dailyLimitMessage.
  ///
  /// In en, this message translates to:
  /// **'You have used all your free credits for today. Upgrade to Premium for unlimited access.'**
  String get dailyLimitMessage;

  /// No description provided for @goPremium.
  ///
  /// In en, this message translates to:
  /// **'Go Premium'**
  String get goPremium;

  /// No description provided for @continueFree.
  ///
  /// In en, this message translates to:
  /// **'Continue Free'**
  String get continueFree;

  /// No description provided for @library.
  ///
  /// In en, this message translates to:
  /// **'Library'**
  String get library;

  /// No description provided for @privacy.
  ///
  /// In en, this message translates to:
  /// **'Privacy'**
  String get privacy;

  /// No description provided for @terms.
  ///
  /// In en, this message translates to:
  /// **'Terms'**
  String get terms;

  /// No description provided for @noInternetConnection.
  ///
  /// In en, this message translates to:
  /// **'No internet connection'**
  String get noInternetConnection;

  /// No description provided for @comparisons.
  ///
  /// In en, this message translates to:
  /// **'Comparisons'**
  String get comparisons;

  /// No description provided for @clicks.
  ///
  /// In en, this message translates to:
  /// **'Clicks'**
  String get clicks;

  /// No description provided for @unlockUnlimited.
  ///
  /// In en, this message translates to:
  /// **'Unlock unlimited comparisons'**
  String get unlockUnlimited;

  /// No description provided for @favorites.
  ///
  /// In en, this message translates to:
  /// **'Favorites'**
  String get favorites;

  /// No description provided for @noFavorites.
  ///
  /// In en, this message translates to:
  /// **'No favorites yet'**
  String get noFavorites;

  /// No description provided for @recentlyViewed.
  ///
  /// In en, this message translates to:
  /// **'Recently Viewed'**
  String get recentlyViewed;

  /// No description provided for @preferences.
  ///
  /// In en, this message translates to:
  /// **'Preferences'**
  String get preferences;

  /// No description provided for @profilePreferences.
  ///
  /// In en, this message translates to:
  /// **'Profile Preferences'**
  String get profilePreferences;

  /// No description provided for @profilePreferencesSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Ecosystem, Budget, Priorities'**
  String get profilePreferencesSubtitle;

  /// No description provided for @pro.
  ///
  /// In en, this message translates to:
  /// **'Premium'**
  String get pro;

  /// No description provided for @profileLoadError.
  ///
  /// In en, this message translates to:
  /// **'Profile could not be loaded'**
  String get profileLoadError;

  /// No description provided for @user.
  ///
  /// In en, this message translates to:
  /// **'User'**
  String get user;

  /// No description provided for @noProductsInCollection.
  ///
  /// In en, this message translates to:
  /// **'No products in collection'**
  String get noProductsInCollection;

  /// No description provided for @searchCategoryProductsHint.
  ///
  /// In en, this message translates to:
  /// **'Search {category} products...'**
  String searchCategoryProductsHint(String category);

  /// No description provided for @searchCompareHint.
  ///
  /// In en, this message translates to:
  /// **'Search products to compare...'**
  String get searchCompareHint;

  /// No description provided for @collectionEmptyTitle.
  ///
  /// In en, this message translates to:
  /// **'Your Collection is Empty'**
  String get collectionEmptyTitle;

  /// No description provided for @collectionEmptySubtitle.
  ///
  /// In en, this message translates to:
  /// **'Save your favorite products to start building your personal collection and compare them effortlessly.'**
  String get collectionEmptySubtitle;

  /// No description provided for @exploreProducts.
  ///
  /// In en, this message translates to:
  /// **'Explore Products'**
  String get exploreProducts;

  /// No description provided for @collectionSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Your favorite products in one place'**
  String get collectionSubtitle;

  /// No description provided for @errorLabel.
  ///
  /// In en, this message translates to:
  /// **'Error: {error}'**
  String errorLabel(Object error);

  /// No description provided for @sortPopular.
  ///
  /// In en, this message translates to:
  /// **'Popular'**
  String get sortPopular;

  /// No description provided for @sortTopRated.
  ///
  /// In en, this message translates to:
  /// **'Top Rated'**
  String get sortTopRated;

  /// No description provided for @sortPriceLowHigh.
  ///
  /// In en, this message translates to:
  /// **'Price: Low→High'**
  String get sortPriceLowHigh;

  /// No description provided for @sortPriceHighLow.
  ///
  /// In en, this message translates to:
  /// **'Price: High→Low'**
  String get sortPriceHighLow;

  /// No description provided for @sortNewest.
  ///
  /// In en, this message translates to:
  /// **'Newest'**
  String get sortNewest;

  /// No description provided for @searchInCategoryHint.
  ///
  /// In en, this message translates to:
  /// **'Search in {category}...'**
  String searchInCategoryHint(String category);

  /// No description provided for @filtersTooltip.
  ///
  /// In en, this message translates to:
  /// **'Filters'**
  String get filtersTooltip;

  /// No description provided for @productCount.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{1 Product} other{{count} Products}}'**
  String productCount(int count);

  /// No description provided for @clearAll.
  ///
  /// In en, this message translates to:
  /// **'Clear all'**
  String get clearAll;

  /// No description provided for @failedToLoadProducts.
  ///
  /// In en, this message translates to:
  /// **'Failed to load products'**
  String get failedToLoadProducts;

  /// No description provided for @noProductsMatchFilters.
  ///
  /// In en, this message translates to:
  /// **'No products match your filters'**
  String get noProductsMatchFilters;

  /// No description provided for @comingSoon.
  ///
  /// In en, this message translates to:
  /// **'Coming Soon'**
  String get comingSoon;

  /// No description provided for @noProductsFound.
  ///
  /// In en, this message translates to:
  /// **'No products found'**
  String get noProductsFound;

  /// No description provided for @productsAddingSoon.
  ///
  /// In en, this message translates to:
  /// **'Products in this category are being added.\nCheck back soon!'**
  String get productsAddingSoon;

  /// No description provided for @clearFilters.
  ///
  /// In en, this message translates to:
  /// **'Clear Filters'**
  String get clearFilters;

  /// No description provided for @reset.
  ///
  /// In en, this message translates to:
  /// **'Reset'**
  String get reset;

  /// No description provided for @applyFilters.
  ///
  /// In en, this message translates to:
  /// **'Apply Filters'**
  String get applyFilters;

  /// No description provided for @applyFiltersCount.
  ///
  /// In en, this message translates to:
  /// **'Apply Filters ({count})'**
  String applyFiltersCount(int count);

  /// No description provided for @any.
  ///
  /// In en, this message translates to:
  /// **'Any'**
  String get any;

  /// No description provided for @techScore.
  ///
  /// In en, this message translates to:
  /// **'Tech Score'**
  String get techScore;

  /// No description provided for @userScore.
  ///
  /// In en, this message translates to:
  /// **'User Score'**
  String get userScore;

  /// No description provided for @expertScore.
  ///
  /// In en, this message translates to:
  /// **'Expert Score'**
  String get expertScore;

  /// No description provided for @about.
  ///
  /// In en, this message translates to:
  /// **'About'**
  String get about;

  /// No description provided for @compareNowArrow.
  ///
  /// In en, this message translates to:
  /// **'Compare Now →'**
  String get compareNowArrow;

  /// No description provided for @deals.
  ///
  /// In en, this message translates to:
  /// **'Deals'**
  String get deals;

  /// No description provided for @prices.
  ///
  /// In en, this message translates to:
  /// **'Prices'**
  String get prices;

  /// No description provided for @current.
  ///
  /// In en, this message translates to:
  /// **'Current'**
  String get current;

  /// No description provided for @lowest.
  ///
  /// In en, this message translates to:
  /// **'Lowest'**
  String get lowest;

  /// No description provided for @highest.
  ///
  /// In en, this message translates to:
  /// **'Highest'**
  String get highest;

  /// No description provided for @couldNotLoadReviews.
  ///
  /// In en, this message translates to:
  /// **'Could not load reviews'**
  String get couldNotLoadReviews;

  /// No description provided for @shareYourExperience.
  ///
  /// In en, this message translates to:
  /// **'Share your experience (optional)'**
  String get shareYourExperience;

  /// No description provided for @reviewSubmittedStar.
  ///
  /// In en, this message translates to:
  /// **'Review submitted!'**
  String get reviewSubmittedStar;

  /// No description provided for @aiDeepAnalysis.
  ///
  /// In en, this message translates to:
  /// **'AI Deep Analysis'**
  String get aiDeepAnalysis;

  /// No description provided for @aiDeepAnalysisDesc.
  ///
  /// In en, this message translates to:
  /// **'Comprehensive AI-powered product evaluation'**
  String get aiDeepAnalysisDesc;

  /// No description provided for @smartAlternatives.
  ///
  /// In en, this message translates to:
  /// **'Smart Alternatives'**
  String get smartAlternatives;

  /// No description provided for @smartAlternativesDesc.
  ///
  /// In en, this message translates to:
  /// **'AI-curated similar products you might prefer'**
  String get smartAlternativesDesc;

  /// No description provided for @male.
  ///
  /// In en, this message translates to:
  /// **'Male'**
  String get male;

  /// No description provided for @female.
  ///
  /// In en, this message translates to:
  /// **'Female'**
  String get female;

  /// No description provided for @nonBinary.
  ///
  /// In en, this message translates to:
  /// **'Non-binary'**
  String get nonBinary;

  /// No description provided for @preferNotToSay.
  ///
  /// In en, this message translates to:
  /// **'Prefer not to say'**
  String get preferNotToSay;

  /// No description provided for @pleaseEnterEmailAndPassword.
  ///
  /// In en, this message translates to:
  /// **'Please enter email and password'**
  String get pleaseEnterEmailAndPassword;

  /// No description provided for @pleaseFillAllFields.
  ///
  /// In en, this message translates to:
  /// **'Please fill in all fields (Name, Email, Password, Birth Date, & Gender)'**
  String get pleaseFillAllFields;

  /// No description provided for @mustBe13OrOlder.
  ///
  /// In en, this message translates to:
  /// **'You must be at least 13 years old to use Compair.'**
  String get mustBe13OrOlder;

  /// No description provided for @pleaseEnterEmailToReset.
  ///
  /// In en, this message translates to:
  /// **'Please enter your email to reset password'**
  String get pleaseEnterEmailToReset;

  /// No description provided for @passwordResetEmailSent.
  ///
  /// In en, this message translates to:
  /// **'Password reset email sent!'**
  String get passwordResetEmailSent;

  /// No description provided for @compairTitle.
  ///
  /// In en, this message translates to:
  /// **'Compair'**
  String get compairTitle;

  /// No description provided for @smarterDecisions.
  ///
  /// In en, this message translates to:
  /// **'Smarter Decisions, Powered by AI'**
  String get smarterDecisions;

  /// No description provided for @continueAsGuest.
  ///
  /// In en, this message translates to:
  /// **'Continue as Guest'**
  String get continueAsGuest;

  /// No description provided for @continueWithGoogle.
  ///
  /// In en, this message translates to:
  /// **'Continue with Google'**
  String get continueWithGoogle;

  /// No description provided for @continueWithApple.
  ///
  /// In en, this message translates to:
  /// **'Continue with Apple'**
  String get continueWithApple;

  /// No description provided for @continueWithEmail.
  ///
  /// In en, this message translates to:
  /// **'Continue with Email'**
  String get continueWithEmail;

  /// No description provided for @or.
  ///
  /// In en, this message translates to:
  /// **'or'**
  String get or;

  /// No description provided for @byContinuingYouAgree.
  ///
  /// In en, this message translates to:
  /// **'By continuing you agree to our '**
  String get byContinuingYouAgree;

  /// No description provided for @termsLabel.
  ///
  /// In en, this message translates to:
  /// **'Terms'**
  String get termsLabel;

  /// No description provided for @welcomeBack.
  ///
  /// In en, this message translates to:
  /// **'Welcome back'**
  String get welcomeBack;

  /// No description provided for @signInToYourAccount.
  ///
  /// In en, this message translates to:
  /// **'Sign in to your account'**
  String get signInToYourAccount;

  /// No description provided for @email.
  ///
  /// In en, this message translates to:
  /// **'Email'**
  String get email;

  /// No description provided for @password.
  ///
  /// In en, this message translates to:
  /// **'Password'**
  String get password;

  /// No description provided for @forgotPassword.
  ///
  /// In en, this message translates to:
  /// **'Forgot Password?'**
  String get forgotPassword;

  /// No description provided for @signIn.
  ///
  /// In en, this message translates to:
  /// **'Sign In'**
  String get signIn;

  /// No description provided for @dontHaveAccount.
  ///
  /// In en, this message translates to:
  /// **'Don\'t have an account? '**
  String get dontHaveAccount;

  /// No description provided for @createOne.
  ///
  /// In en, this message translates to:
  /// **'Create one'**
  String get createOne;

  /// No description provided for @createAccount.
  ///
  /// In en, this message translates to:
  /// **'Create Account'**
  String get createAccount;

  /// No description provided for @joinSmarterWay.
  ///
  /// In en, this message translates to:
  /// **'Join the smarter way to decide'**
  String get joinSmarterWay;

  /// No description provided for @fullName.
  ///
  /// In en, this message translates to:
  /// **'Full Name'**
  String get fullName;

  /// No description provided for @birthDate.
  ///
  /// In en, this message translates to:
  /// **'Birth Date'**
  String get birthDate;

  /// No description provided for @gender.
  ///
  /// In en, this message translates to:
  /// **'Gender'**
  String get gender;

  /// No description provided for @alreadyHaveAccount.
  ///
  /// In en, this message translates to:
  /// **'Already have an account? '**
  String get alreadyHaveAccount;

  /// No description provided for @signInLink.
  ///
  /// In en, this message translates to:
  /// **'Sign in'**
  String get signInLink;

  /// No description provided for @searchProductsHint.
  ///
  /// In en, this message translates to:
  /// **'Search products...'**
  String get searchProductsHint;

  /// No description provided for @recent.
  ///
  /// In en, this message translates to:
  /// **'Recent'**
  String get recent;

  /// No description provided for @clearLabel.
  ///
  /// In en, this message translates to:
  /// **'Clear'**
  String get clearLabel;

  /// No description provided for @trendingSearches.
  ///
  /// In en, this message translates to:
  /// **'Trending Searches'**
  String get trendingSearches;

  /// No description provided for @topRatedProducts.
  ///
  /// In en, this message translates to:
  /// **'Top Rated Products'**
  String get topRatedProducts;

  /// No description provided for @byTechScore.
  ///
  /// In en, this message translates to:
  /// **'by Tech Score'**
  String get byTechScore;

  /// No description provided for @noResultsFound.
  ///
  /// In en, this message translates to:
  /// **'No results found'**
  String get noResultsFound;

  /// No description provided for @tryDifferentKeywords.
  ///
  /// In en, this message translates to:
  /// **'Try different keywords or check for typos'**
  String get tryDifferentKeywords;

  /// No description provided for @couldNotLoadProducts.
  ///
  /// In en, this message translates to:
  /// **'Could not load products'**
  String get couldNotLoadProducts;

  /// No description provided for @usedForPersonalizedRecs.
  ///
  /// In en, this message translates to:
  /// **'Used for personalized recommendations'**
  String get usedForPersonalizedRecs;

  /// No description provided for @importantForDeviceCompat.
  ///
  /// In en, this message translates to:
  /// **'Important for device compatibility'**
  String get importantForDeviceCompat;

  /// No description provided for @youCanChangeLater.
  ///
  /// In en, this message translates to:
  /// **'You can change this later'**
  String get youCanChangeLater;

  /// No description provided for @selectMultiple.
  ///
  /// In en, this message translates to:
  /// **'Select multiple'**
  String get selectMultiple;

  /// No description provided for @toAvoidRecommendingOwned.
  ///
  /// In en, this message translates to:
  /// **'To avoid recommending what you already have'**
  String get toAvoidRecommendingOwned;

  /// No description provided for @forPricingAndAvailability.
  ///
  /// In en, this message translates to:
  /// **'For pricing and availability'**
  String get forPricingAndAvailability;

  /// No description provided for @pickAtLeast3.
  ///
  /// In en, this message translates to:
  /// **'Pick at least 3 to personalize your feed'**
  String get pickAtLeast3;

  /// No description provided for @toOptimizeExperience.
  ///
  /// In en, this message translates to:
  /// **'To optimize your experience'**
  String get toOptimizeExperience;

  /// No description provided for @forSmarterAiRecs.
  ///
  /// In en, this message translates to:
  /// **'For smarter AI recommendations'**
  String get forSmarterAiRecs;

  /// No description provided for @youMustAnswerThis.
  ///
  /// In en, this message translates to:
  /// **'You must answer this question'**
  String get youMustAnswerThis;

  /// No description provided for @thisQuestionRequired.
  ///
  /// In en, this message translates to:
  /// **'This question is required and cannot be skipped'**
  String get thisQuestionRequired;

  /// No description provided for @pleaseAnswerRequired.
  ///
  /// In en, this message translates to:
  /// **'Please answer the required questions'**
  String get pleaseAnswerRequired;

  /// No description provided for @failedToSaveProfile.
  ///
  /// In en, this message translates to:
  /// **'Failed to save profile: {error}'**
  String failedToSaveProfile(String error);

  /// No description provided for @speechNotAvailable.
  ///
  /// In en, this message translates to:
  /// **'Speech recognition not available on this device'**
  String get speechNotAvailable;

  /// No description provided for @askMeAnything.
  ///
  /// In en, this message translates to:
  /// **'Ask me anything'**
  String get askMeAnything;

  /// No description provided for @productsComparisonsRecs.
  ///
  /// In en, this message translates to:
  /// **'Products, comparisons, recommendations'**
  String get productsComparisonsRecs;

  /// No description provided for @compairAi.
  ///
  /// In en, this message translates to:
  /// **'Compair AI'**
  String get compairAi;

  /// No description provided for @onlineKnowsPrefs.
  ///
  /// In en, this message translates to:
  /// **'Online • Knows your preferences'**
  String get onlineKnowsPrefs;

  /// No description provided for @copiedToClipboard.
  ///
  /// In en, this message translates to:
  /// **'Copied to clipboard'**
  String get copiedToClipboard;

  /// No description provided for @thinking.
  ///
  /// In en, this message translates to:
  /// **'Thinking...'**
  String get thinking;

  /// No description provided for @listening.
  ///
  /// In en, this message translates to:
  /// **'Listening...'**
  String get listening;

  /// No description provided for @compareSmarter.
  ///
  /// In en, this message translates to:
  /// **'Compare Smarter'**
  String get compareSmarter;

  /// No description provided for @compareSmarterDesc.
  ///
  /// In en, this message translates to:
  /// **'AI-powered side-by-side comparison of any product. Every spec, every detail.'**
  String get compareSmarterDesc;

  /// No description provided for @personalizedForYou.
  ///
  /// In en, this message translates to:
  /// **'Personalized For You'**
  String get personalizedForYou;

  /// No description provided for @personalizedForYouDesc.
  ///
  /// In en, this message translates to:
  /// **'Every recommendation is powered by your unique profile.'**
  String get personalizedForYouDesc;

  /// No description provided for @decideWithConfidence.
  ///
  /// In en, this message translates to:
  /// **'Decide With Confidence'**
  String get decideWithConfidence;

  /// No description provided for @decideWithConfidenceDesc.
  ///
  /// In en, this message translates to:
  /// **'Expert reviews, AI analysis, community scores, and price history — all in one place.'**
  String get decideWithConfidenceDesc;

  /// No description provided for @getStarted.
  ///
  /// In en, this message translates to:
  /// **'Get Started'**
  String get getStarted;

  /// No description provided for @myComparisons.
  ///
  /// In en, this message translates to:
  /// **'My Comparisons'**
  String get myComparisons;

  /// No description provided for @failedToLoadError.
  ///
  /// In en, this message translates to:
  /// **'Failed to load: {error}'**
  String failedToLoadError(String error);

  /// No description provided for @noComparisonsYet.
  ///
  /// In en, this message translates to:
  /// **'No comparisons yet'**
  String get noComparisonsYet;

  /// No description provided for @startComparingHistory.
  ///
  /// In en, this message translates to:
  /// **'Start comparing products to see\nyour history here.'**
  String get startComparingHistory;

  /// No description provided for @linkDetectedClipboard.
  ///
  /// In en, this message translates to:
  /// **'Link detected from clipboard'**
  String get linkDetectedClipboard;

  /// No description provided for @pleaseEnterValidUrl.
  ///
  /// In en, this message translates to:
  /// **'Please enter a valid product URL'**
  String get pleaseEnterValidUrl;

  /// No description provided for @pleaseSignInFirst.
  ///
  /// In en, this message translates to:
  /// **'Please sign in first'**
  String get pleaseSignInFirst;

  /// No description provided for @startOver.
  ///
  /// In en, this message translates to:
  /// **'Start over'**
  String get startOver;

  /// No description provided for @validatingUrl.
  ///
  /// In en, this message translates to:
  /// **'Validating URL...'**
  String get validatingUrl;

  /// No description provided for @identifyingProduct.
  ///
  /// In en, this message translates to:
  /// **'Identifying product...'**
  String get identifyingProduct;

  /// No description provided for @analyzingSpecs.
  ///
  /// In en, this message translates to:
  /// **'Analyzing specifications...'**
  String get analyzingSpecs;

  /// No description provided for @generatingQuiz.
  ///
  /// In en, this message translates to:
  /// **'Generating quiz...'**
  String get generatingQuiz;

  /// No description provided for @computingMatch.
  ///
  /// In en, this message translates to:
  /// **'Computing match...'**
  String get computingMatch;

  /// No description provided for @analysisProgress.
  ///
  /// In en, this message translates to:
  /// **'Analysis Progress'**
  String get analysisProgress;

  /// No description provided for @pasteProductUrl.
  ///
  /// In en, this message translates to:
  /// **'Paste a product URL'**
  String get pasteProductUrl;

  /// No description provided for @fromAnyOnlineStore.
  ///
  /// In en, this message translates to:
  /// **'From any online store worldwide'**
  String get fromAnyOnlineStore;

  /// No description provided for @pasteFromClipboard.
  ///
  /// In en, this message translates to:
  /// **'Paste from clipboard'**
  String get pasteFromClipboard;

  /// No description provided for @analyzeWithAi.
  ///
  /// In en, this message translates to:
  /// **'Analyze with AI'**
  String get analyzeWithAi;

  /// No description provided for @aiIsAnalyzing.
  ///
  /// In en, this message translates to:
  /// **'AI is analyzing...'**
  String get aiIsAnalyzing;

  /// No description provided for @howItWorks.
  ///
  /// In en, this message translates to:
  /// **'How it works'**
  String get howItWorks;

  /// No description provided for @pasteAnyLink.
  ///
  /// In en, this message translates to:
  /// **'Paste any link'**
  String get pasteAnyLink;

  /// No description provided for @from100PlusStores.
  ///
  /// In en, this message translates to:
  /// **'From 100+ stores worldwide'**
  String get from100PlusStores;

  /// No description provided for @quickAiQuiz.
  ///
  /// In en, this message translates to:
  /// **'Quick AI quiz'**
  String get quickAiQuiz;

  /// No description provided for @getYourMatchScore.
  ///
  /// In en, this message translates to:
  /// **'Get your match score'**
  String get getYourMatchScore;

  /// No description provided for @prosConsAlternatives.
  ///
  /// In en, this message translates to:
  /// **'Pros, cons & alternatives for YOU'**
  String get prosConsAlternatives;

  /// No description provided for @worksWith100PlusStores.
  ///
  /// In en, this message translates to:
  /// **'Works with 100+ stores'**
  String get worksWith100PlusStores;

  /// No description provided for @priceAnalysis.
  ///
  /// In en, this message translates to:
  /// **'Price\nAnalysis'**
  String get priceAnalysis;

  /// No description provided for @smartAlternativesShort.
  ///
  /// In en, this message translates to:
  /// **'Smart\nAlternatives'**
  String get smartAlternativesShort;

  /// No description provided for @reviewDigest.
  ///
  /// In en, this message translates to:
  /// **'Review\nDigest'**
  String get reviewDigest;

  /// No description provided for @seeMyMatchScore.
  ///
  /// In en, this message translates to:
  /// **'See My Match Score'**
  String get seeMyMatchScore;

  /// No description provided for @skipQuizShowBasic.
  ///
  /// In en, this message translates to:
  /// **'Skip quiz & show basic result'**
  String get skipQuizShowBasic;

  /// No description provided for @analysisSaved.
  ///
  /// In en, this message translates to:
  /// **'Analysis saved!'**
  String get analysisSaved;

  /// No description provided for @compatibilityBreakdown.
  ///
  /// In en, this message translates to:
  /// **'Compatibility Breakdown'**
  String get compatibilityBreakdown;

  /// No description provided for @prosForYou.
  ///
  /// In en, this message translates to:
  /// **'Pros for You'**
  String get prosForYou;

  /// No description provided for @consForYou.
  ///
  /// In en, this message translates to:
  /// **'Cons for You'**
  String get consForYou;

  /// No description provided for @aiVerdict.
  ///
  /// In en, this message translates to:
  /// **'AI Verdict'**
  String get aiVerdict;

  /// No description provided for @betterAlternatives.
  ///
  /// In en, this message translates to:
  /// **'Better Alternatives'**
  String get betterAlternatives;

  /// No description provided for @productImage.
  ///
  /// In en, this message translates to:
  /// **'Product Image'**
  String get productImage;

  /// No description provided for @multiLinkCompare.
  ///
  /// In en, this message translates to:
  /// **'Multi-Link Compare'**
  String get multiLinkCompare;

  /// No description provided for @addLinksToFindBest.
  ///
  /// In en, this message translates to:
  /// **'Add links to find your best match'**
  String get addLinksToFindBest;

  /// No description provided for @addAnotherLink.
  ///
  /// In en, this message translates to:
  /// **'Add another link'**
  String get addAnotherLink;

  /// No description provided for @aiComparing.
  ///
  /// In en, this message translates to:
  /// **'AI comparing...'**
  String get aiComparing;

  /// No description provided for @compareWithAi.
  ///
  /// In en, this message translates to:
  /// **'Compare with AI'**
  String get compareWithAi;

  /// No description provided for @bestMatch.
  ///
  /// In en, this message translates to:
  /// **'Best Match'**
  String get bestMatch;

  /// No description provided for @pasteProductUrlHint.
  ///
  /// In en, this message translates to:
  /// **'Paste product URL...'**
  String get pasteProductUrlHint;

  /// No description provided for @aiRanking.
  ///
  /// In en, this message translates to:
  /// **'AI Ranking'**
  String get aiRanking;

  /// No description provided for @yourCompatibility.
  ///
  /// In en, this message translates to:
  /// **'Your Compatibility'**
  String get yourCompatibility;

  /// No description provided for @basedOnProfilePrefs.
  ///
  /// In en, this message translates to:
  /// **'Based on your profile, quiz answers & preferences'**
  String get basedOnProfilePrefs;

  /// No description provided for @pcBuilderTitle.
  ///
  /// In en, this message translates to:
  /// **'PC Builder'**
  String get pcBuilderTitle;

  /// No description provided for @aiAnalyzingCompatibility.
  ///
  /// In en, this message translates to:
  /// **'AI analyzing compatibility...'**
  String get aiAnalyzingCompatibility;

  /// No description provided for @yourPcBuild.
  ///
  /// In en, this message translates to:
  /// **'Your PC Build'**
  String get yourPcBuild;

  /// No description provided for @totalCost.
  ///
  /// In en, this message translates to:
  /// **'Total Cost'**
  String get totalCost;

  /// No description provided for @estWattage.
  ///
  /// In en, this message translates to:
  /// **'Est. Wattage'**
  String get estWattage;

  /// No description provided for @parts.
  ///
  /// In en, this message translates to:
  /// **'Parts'**
  String get parts;

  /// No description provided for @score.
  ///
  /// In en, this message translates to:
  /// **'Score'**
  String get score;

  /// No description provided for @priceAsc.
  ///
  /// In en, this message translates to:
  /// **'Price ↑'**
  String get priceAsc;

  /// No description provided for @priceDesc.
  ///
  /// In en, this message translates to:
  /// **'Price ↓'**
  String get priceDesc;

  /// No description provided for @buildScore.
  ///
  /// In en, this message translates to:
  /// **'Build Score'**
  String get buildScore;

  /// No description provided for @avgTechScore.
  ///
  /// In en, this message translates to:
  /// **'Avg Tech Score'**
  String get avgTechScore;

  /// No description provided for @notSelected.
  ///
  /// In en, this message translates to:
  /// **'Not selected'**
  String get notSelected;

  /// No description provided for @componentsSelected.
  ///
  /// In en, this message translates to:
  /// **'{count} components selected'**
  String componentsSelected(int count);

  /// No description provided for @nextStepLabel.
  ///
  /// In en, this message translates to:
  /// **'Next: {step}'**
  String nextStepLabel(String step);

  /// No description provided for @skipStepLabel.
  ///
  /// In en, this message translates to:
  /// **'Skip → {step}'**
  String skipStepLabel(String step);

  /// No description provided for @stepProgress.
  ///
  /// In en, this message translates to:
  /// **'Step {current} of {total}'**
  String stepProgress(int current, int total);

  /// No description provided for @privacyPolicyTitle.
  ///
  /// In en, this message translates to:
  /// **'Privacy Policy'**
  String get privacyPolicyTitle;

  /// No description provided for @termsOfServiceTitle.
  ///
  /// In en, this message translates to:
  /// **'Terms of Service'**
  String get termsOfServiceTitle;

  /// No description provided for @faqTitle.
  ///
  /// In en, this message translates to:
  /// **'FAQ'**
  String get faqTitle;

  /// No description provided for @servicesTitle.
  ///
  /// In en, this message translates to:
  /// **'Services'**
  String get servicesTitle;

  /// No description provided for @noServicesInCategory.
  ///
  /// In en, this message translates to:
  /// **'No services in this category'**
  String get noServicesInCategory;

  /// No description provided for @errorLoadingServices.
  ///
  /// In en, this message translates to:
  /// **'Error loading services'**
  String get errorLoadingServices;

  /// No description provided for @linkCopied.
  ///
  /// In en, this message translates to:
  /// **'Link copied!'**
  String get linkCopied;

  /// No description provided for @noPlansAvailable.
  ///
  /// In en, this message translates to:
  /// **'No plans available'**
  String get noPlansAvailable;

  /// No description provided for @includedFeatures.
  ///
  /// In en, this message translates to:
  /// **'Included Features'**
  String get includedFeatures;

  /// No description provided for @visitWebsite.
  ///
  /// In en, this message translates to:
  /// **'Visit Website'**
  String get visitWebsite;

  /// No description provided for @couldNotOpenUrl.
  ///
  /// In en, this message translates to:
  /// **'Could not open {url}'**
  String couldNotOpenUrl(String url);

  /// No description provided for @invalidUrl.
  ///
  /// In en, this message translates to:
  /// **'Invalid URL: {url}'**
  String invalidUrl(String url);

  /// No description provided for @analyzingReviews.
  ///
  /// In en, this message translates to:
  /// **'Analyzing reviews...'**
  String get analyzingReviews;

  /// No description provided for @aiReviewSummary.
  ///
  /// In en, this message translates to:
  /// **'AI Review Summary'**
  String get aiReviewSummary;

  /// No description provided for @notSignedIn.
  ///
  /// In en, this message translates to:
  /// **'Not signed in'**
  String get notSignedIn;

  /// No description provided for @noBehaviorDataYet.
  ///
  /// In en, this message translates to:
  /// **'No behavior data yet'**
  String get noBehaviorDataYet;

  /// No description provided for @whyWeAsk.
  ///
  /// In en, this message translates to:
  /// **'Why we ask'**
  String get whyWeAsk;

  /// No description provided for @gotIt.
  ///
  /// In en, this message translates to:
  /// **'Got it'**
  String get gotIt;

  /// No description provided for @quizStepOf.
  ///
  /// In en, this message translates to:
  /// **'Step {current} of {total}'**
  String quizStepOf(String current, String total);

  /// No description provided for @createMyProfile.
  ///
  /// In en, this message translates to:
  /// **'Create My Profile'**
  String get createMyProfile;

  /// No description provided for @continueButton.
  ///
  /// In en, this message translates to:
  /// **'Continue'**
  String get continueButton;

  /// No description provided for @youreAllSet.
  ///
  /// In en, this message translates to:
  /// **'You\'re All Set!'**
  String get youreAllSet;

  /// No description provided for @personalizedFeedReady.
  ///
  /// In en, this message translates to:
  /// **'Your personalized feed is ready'**
  String get personalizedFeedReady;

  /// No description provided for @startExploring.
  ///
  /// In en, this message translates to:
  /// **'Start Exploring →'**
  String get startExploring;

  /// No description provided for @quizAgeRange.
  ///
  /// In en, this message translates to:
  /// **'What is your age range?'**
  String get quizAgeRange;

  /// No description provided for @quizEcosystem.
  ///
  /// In en, this message translates to:
  /// **'Which ecosystem do you use?'**
  String get quizEcosystem;

  /// No description provided for @quizBudget.
  ///
  /// In en, this message translates to:
  /// **'What is your budget preference?'**
  String get quizBudget;

  /// No description provided for @quizPriorities.
  ///
  /// In en, this message translates to:
  /// **'What are your priorities?'**
  String get quizPriorities;

  /// No description provided for @quizDevices.
  ///
  /// In en, this message translates to:
  /// **'Which devices do you own?'**
  String get quizDevices;

  /// No description provided for @quizSubscriptions.
  ///
  /// In en, this message translates to:
  /// **'Which subscriptions do you have?'**
  String get quizSubscriptions;

  /// No description provided for @quizCountry.
  ///
  /// In en, this message translates to:
  /// **'Which country are you in?'**
  String get quizCountry;

  /// No description provided for @quizProducts.
  ///
  /// In en, this message translates to:
  /// **'What products interest you?'**
  String get quizProducts;

  /// No description provided for @quizUsage.
  ///
  /// In en, this message translates to:
  /// **'Why are you using Compair?'**
  String get quizUsage;

  /// No description provided for @quizProfession.
  ///
  /// In en, this message translates to:
  /// **'What is your profession?'**
  String get quizProfession;

  /// No description provided for @whyAgeRange.
  ///
  /// In en, this message translates to:
  /// **'Technology preferences and usage habits vary by age group. This helps us recommend the most suitable products for you.'**
  String get whyAgeRange;

  /// No description provided for @whyEcosystem.
  ///
  /// In en, this message translates to:
  /// **'Apple and Android ecosystems work well with different products. We use this to suggest the most compatible devices.'**
  String get whyEcosystem;

  /// No description provided for @whyBudget.
  ///
  /// In en, this message translates to:
  /// **'Your budget helps us recommend products within your preferred price range.'**
  String get whyBudget;

  /// No description provided for @whyPriorities.
  ///
  /// In en, this message translates to:
  /// **'Knowing your priorities helps us understand what matters to you the most in our comparisons.'**
  String get whyPriorities;

  /// No description provided for @whyDevices.
  ///
  /// In en, this message translates to:
  /// **'This allows us to consider compatibility when making new recommendations.'**
  String get whyDevices;

  /// No description provided for @whySubscriptions.
  ///
  /// In en, this message translates to:
  /// **'We will skip recommending what you already pay for and show you better alternatives.'**
  String get whySubscriptions;

  /// No description provided for @whyCountry.
  ///
  /// In en, this message translates to:
  /// **'Prices and service availability vary by country. (Currently US Only)'**
  String get whyCountry;

  /// No description provided for @whyProducts.
  ///
  /// In en, this message translates to:
  /// **'We\'ll show products from your favorite categories on the home screen and tailor recommendations to your interests.'**
  String get whyProducts;

  /// No description provided for @whyUsage.
  ///
  /// In en, this message translates to:
  /// **'This allows us to highlight the features that are most suitable to you.'**
  String get whyUsage;

  /// No description provided for @whyProfession.
  ///
  /// In en, this message translates to:
  /// **'Your profession helps us suggest the right products — an engineer has different needs than a student, designer, or manager.'**
  String get whyProfession;

  /// No description provided for @genAlphaZ.
  ///
  /// In en, this message translates to:
  /// **'Gen Alpha/Z (13-17)'**
  String get genAlphaZ;

  /// No description provided for @genZ.
  ///
  /// In en, this message translates to:
  /// **'Gen Z (18-24)'**
  String get genZ;

  /// No description provided for @millennial.
  ///
  /// In en, this message translates to:
  /// **'Millennial (25-34)'**
  String get millennial;

  /// No description provided for @xennial.
  ///
  /// In en, this message translates to:
  /// **'Xennial (35-44)'**
  String get xennial;

  /// No description provided for @genX.
  ///
  /// In en, this message translates to:
  /// **'Gen X (45-54)'**
  String get genX;

  /// No description provided for @fiftyFivePlus.
  ///
  /// In en, this message translates to:
  /// **'55 and above'**
  String get fiftyFivePlus;

  /// No description provided for @apple.
  ///
  /// In en, this message translates to:
  /// **'Apple'**
  String get apple;

  /// No description provided for @android.
  ///
  /// In en, this message translates to:
  /// **'Android'**
  String get android;

  /// No description provided for @mixed.
  ///
  /// In en, this message translates to:
  /// **'Mixed'**
  String get mixed;

  /// No description provided for @budgetValue.
  ///
  /// In en, this message translates to:
  /// **'Budget / Value'**
  String get budgetValue;

  /// No description provided for @midRange.
  ///
  /// In en, this message translates to:
  /// **'Mid-Range'**
  String get midRange;

  /// No description provided for @premium.
  ///
  /// In en, this message translates to:
  /// **'Premium'**
  String get premium;

  /// No description provided for @doesNotMatter.
  ///
  /// In en, this message translates to:
  /// **'Does Not Matter'**
  String get doesNotMatter;

  /// No description provided for @quality.
  ///
  /// In en, this message translates to:
  /// **'Quality'**
  String get quality;

  /// No description provided for @design.
  ///
  /// In en, this message translates to:
  /// **'Design'**
  String get design;

  /// No description provided for @ecosystemFit.
  ///
  /// In en, this message translates to:
  /// **'Ecosystem Fit'**
  String get ecosystemFit;

  /// No description provided for @performance.
  ///
  /// In en, this message translates to:
  /// **'Performance'**
  String get performance;

  /// No description provided for @durability.
  ///
  /// In en, this message translates to:
  /// **'Durability'**
  String get durability;

  /// No description provided for @iphone.
  ///
  /// In en, this message translates to:
  /// **'iPhone'**
  String get iphone;

  /// No description provided for @androidPhone.
  ///
  /// In en, this message translates to:
  /// **'Android Phone'**
  String get androidPhone;

  /// No description provided for @ipad.
  ///
  /// In en, this message translates to:
  /// **'iPad'**
  String get ipad;

  /// No description provided for @androidTablet.
  ///
  /// In en, this message translates to:
  /// **'Android Tablet'**
  String get androidTablet;

  /// No description provided for @mac.
  ///
  /// In en, this message translates to:
  /// **'Mac'**
  String get mac;

  /// No description provided for @windowsPc.
  ///
  /// In en, this message translates to:
  /// **'Windows PC'**
  String get windowsPc;

  /// No description provided for @linux.
  ///
  /// In en, this message translates to:
  /// **'Linux'**
  String get linux;

  /// No description provided for @smartWatch.
  ///
  /// In en, this message translates to:
  /// **'Smart Watch'**
  String get smartWatch;

  /// No description provided for @unitedStates.
  ///
  /// In en, this message translates to:
  /// **'United States'**
  String get unitedStates;

  /// No description provided for @tvs.
  ///
  /// In en, this message translates to:
  /// **'TVs'**
  String get tvs;

  /// No description provided for @cameras.
  ///
  /// In en, this message translates to:
  /// **'Cameras'**
  String get cameras;

  /// No description provided for @speakers.
  ///
  /// In en, this message translates to:
  /// **'Speakers'**
  String get speakers;

  /// No description provided for @desktops.
  ///
  /// In en, this message translates to:
  /// **'Desktops'**
  String get desktops;

  /// No description provided for @networking.
  ///
  /// In en, this message translates to:
  /// **'Networking'**
  String get networking;

  /// No description provided for @drones.
  ///
  /// In en, this message translates to:
  /// **'Drones'**
  String get drones;

  /// No description provided for @smartHome.
  ///
  /// In en, this message translates to:
  /// **'Smart Home'**
  String get smartHome;

  /// No description provided for @detailedResearch.
  ///
  /// In en, this message translates to:
  /// **'Detailed Research'**
  String get detailedResearch;

  /// No description provided for @quickDecisions.
  ///
  /// In en, this message translates to:
  /// **'Quick Decisions'**
  String get quickDecisions;

  /// No description provided for @priceTracking.
  ///
  /// In en, this message translates to:
  /// **'Price Tracking'**
  String get priceTracking;

  /// No description provided for @everything.
  ///
  /// In en, this message translates to:
  /// **'Everything'**
  String get everything;

  /// No description provided for @student.
  ///
  /// In en, this message translates to:
  /// **'Student'**
  String get student;

  /// No description provided for @engineerDev.
  ///
  /// In en, this message translates to:
  /// **'Engineer / Developer'**
  String get engineerDev;

  /// No description provided for @designerCreative.
  ///
  /// In en, this message translates to:
  /// **'Designer / Creative'**
  String get designerCreative;

  /// No description provided for @businessManager.
  ///
  /// In en, this message translates to:
  /// **'Business / Manager'**
  String get businessManager;

  /// No description provided for @healthcarePro.
  ///
  /// In en, this message translates to:
  /// **'Healthcare Professional'**
  String get healthcarePro;

  /// No description provided for @educator.
  ///
  /// In en, this message translates to:
  /// **'Educator'**
  String get educator;

  /// No description provided for @freelancer.
  ///
  /// In en, this message translates to:
  /// **'Freelancer'**
  String get freelancer;

  /// No description provided for @retired.
  ///
  /// In en, this message translates to:
  /// **'Retired'**
  String get retired;

  /// No description provided for @otherProfession.
  ///
  /// In en, this message translates to:
  /// **'Other'**
  String get otherProfession;

  /// No description provided for @addSubscription.
  ///
  /// In en, this message translates to:
  /// **'Add Subscription'**
  String get addSubscription;

  /// No description provided for @removeSubscription.
  ///
  /// In en, this message translates to:
  /// **'Remove Subscription'**
  String get removeSubscription;

  /// No description provided for @removeSubscriptionConfirm.
  ///
  /// In en, this message translates to:
  /// **'Remove {name} from your tracked subscriptions?'**
  String removeSubscriptionConfirm(String name);

  /// No description provided for @selectPlan.
  ///
  /// In en, this message translates to:
  /// **'Select Plan'**
  String get selectPlan;

  /// No description provided for @logOut.
  ///
  /// In en, this message translates to:
  /// **'Log Out'**
  String get logOut;

  /// No description provided for @searchServices.
  ///
  /// In en, this message translates to:
  /// **'Search services...'**
  String get searchServices;

  /// No description provided for @profileComplete.
  ///
  /// In en, this message translates to:
  /// **'Profile Complete'**
  String get profileComplete;

  /// No description provided for @categoryEngagement.
  ///
  /// In en, this message translates to:
  /// **'Category Engagement'**
  String get categoryEngagement;

  /// No description provided for @askAboutImage.
  ///
  /// In en, this message translates to:
  /// **'Ask about this image...'**
  String get askAboutImage;

  /// No description provided for @personalizedQuestions.
  ///
  /// In en, this message translates to:
  /// **'4-6 personalized questions'**
  String get personalizedQuestions;

  /// No description provided for @plusMore.
  ///
  /// In en, this message translates to:
  /// **'+ {count} more'**
  String plusMore(String count);

  /// No description provided for @saved.
  ///
  /// In en, this message translates to:
  /// **'Saved'**
  String get saved;

  /// No description provided for @searchCategory.
  ///
  /// In en, this message translates to:
  /// **'Search {category}...'**
  String searchCategory(String category);

  /// No description provided for @onlySameCategoryCompare.
  ///
  /// In en, this message translates to:
  /// **'Only {category} products can be compared together'**
  String onlySameCategoryCompare(String category);

  /// No description provided for @loadingPopularComparisons.
  ///
  /// In en, this message translates to:
  /// **'Loading popular comparisons...'**
  String get loadingPopularComparisons;

  /// No description provided for @anErrorOccurred.
  ///
  /// In en, this message translates to:
  /// **'An error occurred: {error}'**
  String anErrorOccurred(String error);

  /// No description provided for @searchYoutubeComparison.
  ///
  /// In en, this message translates to:
  /// **'Search YouTube for \"{names}\" comparison videos.'**
  String searchYoutubeComparison(String names);

  /// No description provided for @watchOnYoutube.
  ///
  /// In en, this message translates to:
  /// **'Watch on YouTube'**
  String get watchOnYoutube;

  /// No description provided for @failedToLoadSubscriptions.
  ///
  /// In en, this message translates to:
  /// **'Failed to load subscriptions'**
  String get failedToLoadSubscriptions;

  /// No description provided for @errorMessage.
  ///
  /// In en, this message translates to:
  /// **'Error: {error}'**
  String errorMessage(String error);

  /// No description provided for @streaming.
  ///
  /// In en, this message translates to:
  /// **'Streaming'**
  String get streaming;

  /// No description provided for @music.
  ///
  /// In en, this message translates to:
  /// **'Music'**
  String get music;

  /// No description provided for @aiTools.
  ///
  /// In en, this message translates to:
  /// **'AI Tools'**
  String get aiTools;

  /// No description provided for @cloud.
  ///
  /// In en, this message translates to:
  /// **'Cloud'**
  String get cloud;

  /// No description provided for @productivity.
  ///
  /// In en, this message translates to:
  /// **'Productivity'**
  String get productivity;

  /// No description provided for @nServices.
  ///
  /// In en, this message translates to:
  /// **'{count} services'**
  String nServices(String count);

  /// No description provided for @nGroups.
  ///
  /// In en, this message translates to:
  /// **'{count} groups'**
  String nGroups(String count);

  /// No description provided for @nSpecs.
  ///
  /// In en, this message translates to:
  /// **'{count} specs'**
  String nSpecs(String count);

  /// No description provided for @generalFeatures.
  ///
  /// In en, this message translates to:
  /// **'General Features'**
  String get generalFeatures;

  /// No description provided for @designAndDimensions.
  ///
  /// In en, this message translates to:
  /// **'Design & Dimensions'**
  String get designAndDimensions;

  /// No description provided for @basicHardware.
  ///
  /// In en, this message translates to:
  /// **'Basic Hardware'**
  String get basicHardware;

  /// No description provided for @camera.
  ///
  /// In en, this message translates to:
  /// **'Camera'**
  String get camera;

  /// No description provided for @battery.
  ///
  /// In en, this message translates to:
  /// **'Battery'**
  String get battery;

  /// No description provided for @networkConnections.
  ///
  /// In en, this message translates to:
  /// **'Network Connections'**
  String get networkConnections;

  /// No description provided for @connectivity.
  ///
  /// In en, this message translates to:
  /// **'Connectivity'**
  String get connectivity;

  /// No description provided for @software.
  ///
  /// In en, this message translates to:
  /// **'Software'**
  String get software;

  /// No description provided for @audio.
  ///
  /// In en, this message translates to:
  /// **'Audio'**
  String get audio;

  /// No description provided for @sensors.
  ///
  /// In en, this message translates to:
  /// **'Sensors'**
  String get sensors;

  /// No description provided for @memory.
  ///
  /// In en, this message translates to:
  /// **'Memory'**
  String get memory;

  /// No description provided for @processor.
  ///
  /// In en, this message translates to:
  /// **'Processor'**
  String get processor;

  /// No description provided for @storage.
  ///
  /// In en, this message translates to:
  /// **'Storage'**
  String get storage;

  /// No description provided for @gpu.
  ///
  /// In en, this message translates to:
  /// **'GPU'**
  String get gpu;

  /// No description provided for @security.
  ///
  /// In en, this message translates to:
  /// **'Security'**
  String get security;

  /// No description provided for @build.
  ///
  /// In en, this message translates to:
  /// **'Build'**
  String get build;

  /// No description provided for @ports.
  ///
  /// In en, this message translates to:
  /// **'Ports'**
  String get ports;

  /// No description provided for @inputDevices.
  ///
  /// In en, this message translates to:
  /// **'Input Devices'**
  String get inputDevices;

  /// No description provided for @other.
  ///
  /// In en, this message translates to:
  /// **'Other'**
  String get other;

  /// No description provided for @features.
  ///
  /// In en, this message translates to:
  /// **'Features'**
  String get features;

  /// No description provided for @displaySize.
  ///
  /// In en, this message translates to:
  /// **'Display Size'**
  String get displaySize;

  /// No description provided for @screenTechnology.
  ///
  /// In en, this message translates to:
  /// **'Screen Technology'**
  String get screenTechnology;

  /// No description provided for @screenArea.
  ///
  /// In en, this message translates to:
  /// **'Screen Area'**
  String get screenArea;

  /// No description provided for @screenResolutionStandard.
  ///
  /// In en, this message translates to:
  /// **'Screen Resolution Standard'**
  String get screenResolutionStandard;

  /// No description provided for @colorCount.
  ///
  /// In en, this message translates to:
  /// **'Color Count'**
  String get colorCount;

  /// No description provided for @pixelDensity.
  ///
  /// In en, this message translates to:
  /// **'Pixel Density'**
  String get pixelDensity;

  /// No description provided for @displayFeatures.
  ///
  /// In en, this message translates to:
  /// **'Display Features'**
  String get displayFeatures;

  /// No description provided for @screenToBodyRatio.
  ///
  /// In en, this message translates to:
  /// **'Screen-to-body Ratio'**
  String get screenToBodyRatio;

  /// No description provided for @aspectRatio.
  ///
  /// In en, this message translates to:
  /// **'Aspect Ratio'**
  String get aspectRatio;

  /// No description provided for @learning.
  ///
  /// In en, this message translates to:
  /// **'Learning'**
  String get learning;

  /// No description provided for @fitness.
  ///
  /// In en, this message translates to:
  /// **'Fitness'**
  String get fitness;

  /// No description provided for @vpn.
  ///
  /// In en, this message translates to:
  /// **'VPN'**
  String get vpn;

  /// No description provided for @specsCount.
  ///
  /// In en, this message translates to:
  /// **'specs'**
  String get specsCount;

  /// No description provided for @groups.
  ///
  /// In en, this message translates to:
  /// **'groups'**
  String get groups;

  /// No description provided for @specGroupGeneral.
  ///
  /// In en, this message translates to:
  /// **'General Features'**
  String get specGroupGeneral;

  /// No description provided for @specGroupDesign.
  ///
  /// In en, this message translates to:
  /// **'Design & Dimensions'**
  String get specGroupDesign;

  /// No description provided for @specGroupHardware.
  ///
  /// In en, this message translates to:
  /// **'Basic Hardware'**
  String get specGroupHardware;

  /// No description provided for @specGroupCamera.
  ///
  /// In en, this message translates to:
  /// **'Camera'**
  String get specGroupCamera;

  /// No description provided for @specGroupBattery.
  ///
  /// In en, this message translates to:
  /// **'Battery'**
  String get specGroupBattery;

  /// No description provided for @specGroupNetwork.
  ///
  /// In en, this message translates to:
  /// **'Network Connections'**
  String get specGroupNetwork;

  /// No description provided for @specGroupDisplay.
  ///
  /// In en, this message translates to:
  /// **'Display'**
  String get specGroupDisplay;

  /// No description provided for @specGroupStorage.
  ///
  /// In en, this message translates to:
  /// **'Storage'**
  String get specGroupStorage;

  /// No description provided for @specGroupConnectivity.
  ///
  /// In en, this message translates to:
  /// **'Connectivity'**
  String get specGroupConnectivity;

  /// No description provided for @specGroupSoftware.
  ///
  /// In en, this message translates to:
  /// **'Software'**
  String get specGroupSoftware;

  /// No description provided for @specGroupAudio.
  ///
  /// In en, this message translates to:
  /// **'Audio'**
  String get specGroupAudio;

  /// No description provided for @specGroupSecurity.
  ///
  /// In en, this message translates to:
  /// **'Security'**
  String get specGroupSecurity;

  /// No description provided for @specGroupPerformance.
  ///
  /// In en, this message translates to:
  /// **'Performance'**
  String get specGroupPerformance;

  /// No description provided for @specGroupSensors.
  ///
  /// In en, this message translates to:
  /// **'Sensors'**
  String get specGroupSensors;

  /// No description provided for @specGroupFeatures.
  ///
  /// In en, this message translates to:
  /// **'Features'**
  String get specGroupFeatures;

  /// No description provided for @specGroupProcessor.
  ///
  /// In en, this message translates to:
  /// **'Processor'**
  String get specGroupProcessor;

  /// No description provided for @specGroupMemory.
  ///
  /// In en, this message translates to:
  /// **'Memory'**
  String get specGroupMemory;

  /// No description provided for @specGroupPorts.
  ///
  /// In en, this message translates to:
  /// **'Ports & Interfaces'**
  String get specGroupPorts;

  /// No description provided for @specGroupGpu.
  ///
  /// In en, this message translates to:
  /// **'Graphics Card'**
  String get specGroupGpu;

  /// No description provided for @specGroupKeyboard.
  ///
  /// In en, this message translates to:
  /// **'Keyboard'**
  String get specGroupKeyboard;

  /// No description provided for @specGroupOther.
  ///
  /// In en, this message translates to:
  /// **'Other'**
  String get specGroupOther;

  /// No description provided for @specGroupWeight.
  ///
  /// In en, this message translates to:
  /// **'Weight & Dimensions'**
  String get specGroupWeight;

  /// No description provided for @specGroupScreen.
  ///
  /// In en, this message translates to:
  /// **'Screen'**
  String get specGroupScreen;

  /// No description provided for @specGroupVideo.
  ///
  /// In en, this message translates to:
  /// **'Video'**
  String get specGroupVideo;

  /// No description provided for @specGroupImage.
  ///
  /// In en, this message translates to:
  /// **'Image'**
  String get specGroupImage;

  /// No description provided for @specGroupCharging.
  ///
  /// In en, this message translates to:
  /// **'Charging'**
  String get specGroupCharging;

  /// No description provided for @specGroupWireless.
  ///
  /// In en, this message translates to:
  /// **'Wireless'**
  String get specGroupWireless;

  /// No description provided for @specGroupStorageOptical.
  ///
  /// In en, this message translates to:
  /// **'Storage & Optical Drive'**
  String get specGroupStorageOptical;

  /// No description provided for @specGroupBatteryOther.
  ///
  /// In en, this message translates to:
  /// **'Battery & Other'**
  String get specGroupBatteryOther;

  /// No description provided for @specGroupIntegratedGpu.
  ///
  /// In en, this message translates to:
  /// **'Integrated Graphics'**
  String get specGroupIntegratedGpu;

  /// No description provided for @specGroupExternalGpu.
  ///
  /// In en, this message translates to:
  /// **'External Graphics'**
  String get specGroupExternalGpu;

  /// No description provided for @specGroupConnectionInterface.
  ///
  /// In en, this message translates to:
  /// **'Connections & Interfaces'**
  String get specGroupConnectionInterface;

  /// No description provided for @specGroupBody.
  ///
  /// In en, this message translates to:
  /// **'Body'**
  String get specGroupBody;

  /// No description provided for @specGroupMainFeatures.
  ///
  /// In en, this message translates to:
  /// **'Main Features'**
  String get specGroupMainFeatures;

  /// No description provided for @specGroupMultimedia.
  ///
  /// In en, this message translates to:
  /// **'Multimedia'**
  String get specGroupMultimedia;

  /// No description provided for @specGroupPower.
  ///
  /// In en, this message translates to:
  /// **'Power'**
  String get specGroupPower;

  /// No description provided for @specGroupInputOutput.
  ///
  /// In en, this message translates to:
  /// **'Input/Output'**
  String get specGroupInputOutput;

  /// No description provided for @specGroupCommunications.
  ///
  /// In en, this message translates to:
  /// **'Communications'**
  String get specGroupCommunications;

  /// No description provided for @specGroupExpansion.
  ///
  /// In en, this message translates to:
  /// **'Expansion Slots'**
  String get specGroupExpansion;

  /// No description provided for @specGroupOptics.
  ///
  /// In en, this message translates to:
  /// **'Optics'**
  String get specGroupOptics;

  /// No description provided for @newBadge.
  ///
  /// In en, this message translates to:
  /// **'NEW'**
  String get newBadge;

  /// No description provided for @proBadge.
  ///
  /// In en, this message translates to:
  /// **'Premium'**
  String get proBadge;

  /// No description provided for @fromSite.
  ///
  /// In en, this message translates to:
  /// **'from {siteName}'**
  String fromSite(String siteName);

  /// No description provided for @details.
  ///
  /// In en, this message translates to:
  /// **'Details'**
  String get details;

  /// No description provided for @noItemFound.
  ///
  /// In en, this message translates to:
  /// **'No {item} found'**
  String noItemFound(String item);

  /// No description provided for @skipItem.
  ///
  /// In en, this message translates to:
  /// **'Skip {item}'**
  String skipItem(String item);

  /// No description provided for @nPlatforms.
  ///
  /// In en, this message translates to:
  /// **'{count} platforms'**
  String nPlatforms(String count);

  /// No description provided for @maxScore.
  ///
  /// In en, this message translates to:
  /// **'max {score}'**
  String maxScore(String score);

  /// No description provided for @startDate.
  ///
  /// In en, this message translates to:
  /// **'Start Date'**
  String get startDate;

  /// No description provided for @nextRenewal.
  ///
  /// In en, this message translates to:
  /// **'Next Renewal'**
  String get nextRenewal;

  /// No description provided for @errorPrefix.
  ///
  /// In en, this message translates to:
  /// **'Error: {message}'**
  String errorPrefix(String message);

  /// No description provided for @catTablets.
  ///
  /// In en, this message translates to:
  /// **'Tablets'**
  String get catTablets;

  /// No description provided for @catSmartphones.
  ///
  /// In en, this message translates to:
  /// **'Smartphones'**
  String get catSmartphones;

  /// No description provided for @catLaptops.
  ///
  /// In en, this message translates to:
  /// **'Laptops'**
  String get catLaptops;

  /// No description provided for @catGpus.
  ///
  /// In en, this message translates to:
  /// **'Graphics Cards'**
  String get catGpus;

  /// No description provided for @catDesktops.
  ///
  /// In en, this message translates to:
  /// **'Desktops'**
  String get catDesktops;

  /// No description provided for @catHeadphones.
  ///
  /// In en, this message translates to:
  /// **'Headphones'**
  String get catHeadphones;

  /// No description provided for @catTvs.
  ///
  /// In en, this message translates to:
  /// **'TVs & Displays'**
  String get catTvs;

  /// No description provided for @catSmartwatches.
  ///
  /// In en, this message translates to:
  /// **'Smartwatches'**
  String get catSmartwatches;

  /// No description provided for @catCameras.
  ///
  /// In en, this message translates to:
  /// **'Cameras'**
  String get catCameras;

  /// No description provided for @catConsoles.
  ///
  /// In en, this message translates to:
  /// **'Gaming'**
  String get catConsoles;

  /// No description provided for @catSpeakers.
  ///
  /// In en, this message translates to:
  /// **'Speakers'**
  String get catSpeakers;

  /// No description provided for @catRouters.
  ///
  /// In en, this message translates to:
  /// **'Networking'**
  String get catRouters;

  /// No description provided for @catDrones.
  ///
  /// In en, this message translates to:
  /// **'Drones'**
  String get catDrones;

  /// No description provided for @catSmartHome.
  ///
  /// In en, this message translates to:
  /// **'Smart Home'**
  String get catSmartHome;

  /// No description provided for @catDashcams.
  ///
  /// In en, this message translates to:
  /// **'Dashcams'**
  String get catDashcams;

  /// No description provided for @catMonitors.
  ///
  /// In en, this message translates to:
  /// **'Monitors'**
  String get catMonitors;

  /// No description provided for @catCpus.
  ///
  /// In en, this message translates to:
  /// **'Processors'**
  String get catCpus;

  /// No description provided for @nCategories.
  ///
  /// In en, this message translates to:
  /// **'{count} categories'**
  String nCategories(String count);

  /// No description provided for @oneCategory.
  ///
  /// In en, this message translates to:
  /// **'1 category'**
  String get oneCategory;

  /// No description provided for @specDisplaySize.
  ///
  /// In en, this message translates to:
  /// **'Display Size'**
  String get specDisplaySize;

  /// No description provided for @specScreenSize.
  ///
  /// In en, this message translates to:
  /// **'Screen Size'**
  String get specScreenSize;

  /// No description provided for @specScreenTechnology.
  ///
  /// In en, this message translates to:
  /// **'Screen Technology'**
  String get specScreenTechnology;

  /// No description provided for @specResolution.
  ///
  /// In en, this message translates to:
  /// **'Resolution'**
  String get specResolution;

  /// No description provided for @specRefreshRate.
  ///
  /// In en, this message translates to:
  /// **'Refresh Rate'**
  String get specRefreshRate;

  /// No description provided for @specBrightness.
  ///
  /// In en, this message translates to:
  /// **'Brightness'**
  String get specBrightness;

  /// No description provided for @specProcessor.
  ///
  /// In en, this message translates to:
  /// **'Processor'**
  String get specProcessor;

  /// No description provided for @specChipset.
  ///
  /// In en, this message translates to:
  /// **'Chipset'**
  String get specChipset;

  /// No description provided for @specCpu.
  ///
  /// In en, this message translates to:
  /// **'CPU'**
  String get specCpu;

  /// No description provided for @specRam.
  ///
  /// In en, this message translates to:
  /// **'RAM'**
  String get specRam;

  /// No description provided for @specInternalStorage.
  ///
  /// In en, this message translates to:
  /// **'Internal Storage'**
  String get specInternalStorage;

  /// No description provided for @specStorage.
  ///
  /// In en, this message translates to:
  /// **'Storage'**
  String get specStorage;

  /// No description provided for @specExpandableStorage.
  ///
  /// In en, this message translates to:
  /// **'Expandable Storage'**
  String get specExpandableStorage;

  /// No description provided for @specBatteryCapacity.
  ///
  /// In en, this message translates to:
  /// **'Battery Capacity'**
  String get specBatteryCapacity;

  /// No description provided for @specChargingSpeed.
  ///
  /// In en, this message translates to:
  /// **'Charging Speed'**
  String get specChargingSpeed;

  /// No description provided for @specWirelessCharging.
  ///
  /// In en, this message translates to:
  /// **'Wireless Charging'**
  String get specWirelessCharging;

  /// No description provided for @specOperatingSystem.
  ///
  /// In en, this message translates to:
  /// **'Operating System'**
  String get specOperatingSystem;

  /// No description provided for @specOs.
  ///
  /// In en, this message translates to:
  /// **'OS'**
  String get specOs;

  /// No description provided for @specWeight.
  ///
  /// In en, this message translates to:
  /// **'Weight'**
  String get specWeight;

  /// No description provided for @specDimensions.
  ///
  /// In en, this message translates to:
  /// **'Dimensions'**
  String get specDimensions;

  /// No description provided for @specThickness.
  ///
  /// In en, this message translates to:
  /// **'Thickness'**
  String get specThickness;

  /// No description provided for @specHeight.
  ///
  /// In en, this message translates to:
  /// **'Height'**
  String get specHeight;

  /// No description provided for @specWidth.
  ///
  /// In en, this message translates to:
  /// **'Width'**
  String get specWidth;

  /// No description provided for @specMainCamera.
  ///
  /// In en, this message translates to:
  /// **'Main Camera'**
  String get specMainCamera;

  /// No description provided for @specFrontCamera.
  ///
  /// In en, this message translates to:
  /// **'Front Camera'**
  String get specFrontCamera;

  /// No description provided for @specRearCamera.
  ///
  /// In en, this message translates to:
  /// **'Rear Camera'**
  String get specRearCamera;

  /// No description provided for @specVideoRecording.
  ///
  /// In en, this message translates to:
  /// **'Video Recording'**
  String get specVideoRecording;

  /// No description provided for @specSim.
  ///
  /// In en, this message translates to:
  /// **'SIM'**
  String get specSim;

  /// No description provided for @specDualSim.
  ///
  /// In en, this message translates to:
  /// **'Dual SIM'**
  String get specDualSim;

  /// No description provided for @specNfc.
  ///
  /// In en, this message translates to:
  /// **'NFC'**
  String get specNfc;

  /// No description provided for @specBluetooth.
  ///
  /// In en, this message translates to:
  /// **'Bluetooth'**
  String get specBluetooth;

  /// No description provided for @specWifi.
  ///
  /// In en, this message translates to:
  /// **'Wi-Fi'**
  String get specWifi;

  /// No description provided for @specUsb.
  ///
  /// In en, this message translates to:
  /// **'USB'**
  String get specUsb;

  /// No description provided for @specHeadphoneJack.
  ///
  /// In en, this message translates to:
  /// **'Headphone Jack'**
  String get specHeadphoneJack;

  /// No description provided for @specWaterResistance.
  ///
  /// In en, this message translates to:
  /// **'Water Resistance'**
  String get specWaterResistance;

  /// No description provided for @specIpRating.
  ///
  /// In en, this message translates to:
  /// **'IP Rating'**
  String get specIpRating;

  /// No description provided for @specFingerprintSensor.
  ///
  /// In en, this message translates to:
  /// **'Fingerprint Sensor'**
  String get specFingerprintSensor;

  /// No description provided for @specFaceRecognition.
  ///
  /// In en, this message translates to:
  /// **'Face Recognition'**
  String get specFaceRecognition;

  /// No description provided for @specColor.
  ///
  /// In en, this message translates to:
  /// **'Color'**
  String get specColor;

  /// No description provided for @specColors.
  ///
  /// In en, this message translates to:
  /// **'Colors'**
  String get specColors;

  /// No description provided for @specGpu.
  ///
  /// In en, this message translates to:
  /// **'GPU'**
  String get specGpu;

  /// No description provided for @specGraphics.
  ///
  /// In en, this message translates to:
  /// **'Graphics'**
  String get specGraphics;

  /// No description provided for @specReleaseDate.
  ///
  /// In en, this message translates to:
  /// **'Release Date'**
  String get specReleaseDate;

  /// No description provided for @specPrice.
  ///
  /// In en, this message translates to:
  /// **'Price'**
  String get specPrice;

  /// No description provided for @specNetwork.
  ///
  /// In en, this message translates to:
  /// **'Network'**
  String get specNetwork;

  /// No description provided for @spec5g.
  ///
  /// In en, this message translates to:
  /// **'5G'**
  String get spec5g;

  /// No description provided for @spec4g.
  ///
  /// In en, this message translates to:
  /// **'4G / LTE'**
  String get spec4g;

  /// No description provided for @specBand.
  ///
  /// In en, this message translates to:
  /// **'Frequency Bands'**
  String get specBand;

  /// No description provided for @specSpeaker.
  ///
  /// In en, this message translates to:
  /// **'Speaker'**
  String get specSpeaker;

  /// No description provided for @specMicrophone.
  ///
  /// In en, this message translates to:
  /// **'Microphone'**
  String get specMicrophone;

  /// No description provided for @specSensor.
  ///
  /// In en, this message translates to:
  /// **'Sensors'**
  String get specSensor;

  /// No description provided for @specGyroscope.
  ///
  /// In en, this message translates to:
  /// **'Gyroscope'**
  String get specGyroscope;

  /// No description provided for @specAccelerometer.
  ///
  /// In en, this message translates to:
  /// **'Accelerometer'**
  String get specAccelerometer;

  /// No description provided for @specProximity.
  ///
  /// In en, this message translates to:
  /// **'Proximity'**
  String get specProximity;

  /// No description provided for @specCompass.
  ///
  /// In en, this message translates to:
  /// **'Compass'**
  String get specCompass;

  /// No description provided for @specBarometer.
  ///
  /// In en, this message translates to:
  /// **'Barometer'**
  String get specBarometer;

  /// No description provided for @specGps.
  ///
  /// In en, this message translates to:
  /// **'GPS'**
  String get specGps;

  /// No description provided for @specMemoryType.
  ///
  /// In en, this message translates to:
  /// **'Memory Type'**
  String get specMemoryType;

  /// No description provided for @specMemorySpeed.
  ///
  /// In en, this message translates to:
  /// **'Memory Speed'**
  String get specMemorySpeed;

  /// No description provided for @specStorageType.
  ///
  /// In en, this message translates to:
  /// **'Storage Type'**
  String get specStorageType;

  /// No description provided for @specDisplayType.
  ///
  /// In en, this message translates to:
  /// **'Display Type'**
  String get specDisplayType;

  /// No description provided for @specPanelType.
  ///
  /// In en, this message translates to:
  /// **'Panel Type'**
  String get specPanelType;

  /// No description provided for @specResponseTime.
  ///
  /// In en, this message translates to:
  /// **'Response Time'**
  String get specResponseTime;

  /// No description provided for @specContrastRatio.
  ///
  /// In en, this message translates to:
  /// **'Contrast Ratio'**
  String get specContrastRatio;

  /// No description provided for @specColorGamut.
  ///
  /// In en, this message translates to:
  /// **'Color Gamut'**
  String get specColorGamut;

  /// No description provided for @specHdr.
  ///
  /// In en, this message translates to:
  /// **'HDR'**
  String get specHdr;

  /// No description provided for @specTouchscreen.
  ///
  /// In en, this message translates to:
  /// **'Touchscreen'**
  String get specTouchscreen;

  /// No description provided for @specKeyboard.
  ///
  /// In en, this message translates to:
  /// **'Keyboard'**
  String get specKeyboard;

  /// No description provided for @specTrackpad.
  ///
  /// In en, this message translates to:
  /// **'Trackpad'**
  String get specTrackpad;

  /// No description provided for @specWebcam.
  ///
  /// In en, this message translates to:
  /// **'Webcam'**
  String get specWebcam;

  /// No description provided for @specPorts.
  ///
  /// In en, this message translates to:
  /// **'Ports'**
  String get specPorts;

  /// No description provided for @specConnectivity.
  ///
  /// In en, this message translates to:
  /// **'Connectivity'**
  String get specConnectivity;

  /// No description provided for @specWireless.
  ///
  /// In en, this message translates to:
  /// **'Wireless'**
  String get specWireless;

  /// No description provided for @specBatteryLife.
  ///
  /// In en, this message translates to:
  /// **'Battery Life'**
  String get specBatteryLife;

  /// No description provided for @specPowerSupply.
  ///
  /// In en, this message translates to:
  /// **'Power Supply'**
  String get specPowerSupply;

  /// No description provided for @specTdp.
  ///
  /// In en, this message translates to:
  /// **'TDP'**
  String get specTdp;

  /// No description provided for @specCores.
  ///
  /// In en, this message translates to:
  /// **'Cores'**
  String get specCores;

  /// No description provided for @specThreads.
  ///
  /// In en, this message translates to:
  /// **'Threads'**
  String get specThreads;

  /// No description provided for @specBaseClock.
  ///
  /// In en, this message translates to:
  /// **'Base Clock'**
  String get specBaseClock;

  /// No description provided for @specBoostClock.
  ///
  /// In en, this message translates to:
  /// **'Boost Clock'**
  String get specBoostClock;

  /// No description provided for @specCache.
  ///
  /// In en, this message translates to:
  /// **'Cache'**
  String get specCache;

  /// No description provided for @specArchitecture.
  ///
  /// In en, this message translates to:
  /// **'Architecture'**
  String get specArchitecture;

  /// No description provided for @specProcess.
  ///
  /// In en, this message translates to:
  /// **'Process'**
  String get specProcess;

  /// No description provided for @specVram.
  ///
  /// In en, this message translates to:
  /// **'VRAM'**
  String get specVram;

  /// No description provided for @specMemoryBus.
  ///
  /// In en, this message translates to:
  /// **'Memory Bus'**
  String get specMemoryBus;

  /// No description provided for @specCudaCores.
  ///
  /// In en, this message translates to:
  /// **'CUDA Cores'**
  String get specCudaCores;

  /// No description provided for @specStreamProcessors.
  ///
  /// In en, this message translates to:
  /// **'Stream Processors'**
  String get specStreamProcessors;

  /// No description provided for @specClockSpeed.
  ///
  /// In en, this message translates to:
  /// **'Clock Speed'**
  String get specClockSpeed;

  /// No description provided for @specMaxResolution.
  ///
  /// In en, this message translates to:
  /// **'Max Resolution'**
  String get specMaxResolution;

  /// No description provided for @specFormFactor.
  ///
  /// In en, this message translates to:
  /// **'Form Factor'**
  String get specFormFactor;

  /// No description provided for @specNoiseLevel.
  ///
  /// In en, this message translates to:
  /// **'Noise Level'**
  String get specNoiseLevel;

  /// No description provided for @specDriverSize.
  ///
  /// In en, this message translates to:
  /// **'Driver Size'**
  String get specDriverSize;

  /// No description provided for @specFrequencyResponse.
  ///
  /// In en, this message translates to:
  /// **'Frequency Response'**
  String get specFrequencyResponse;

  /// No description provided for @specImpedance.
  ///
  /// In en, this message translates to:
  /// **'Impedance'**
  String get specImpedance;

  /// No description provided for @specActiveNoiseCancellation.
  ///
  /// In en, this message translates to:
  /// **'Active Noise Cancellation'**
  String get specActiveNoiseCancellation;

  /// No description provided for @specMicrophoneType.
  ///
  /// In en, this message translates to:
  /// **'Microphone Type'**
  String get specMicrophoneType;

  /// No description provided for @specConnectionType.
  ///
  /// In en, this message translates to:
  /// **'Connection Type'**
  String get specConnectionType;

  /// No description provided for @specWirelessRange.
  ///
  /// In en, this message translates to:
  /// **'Wireless Range'**
  String get specWirelessRange;

  /// No description provided for @specSmartAssistant.
  ///
  /// In en, this message translates to:
  /// **'Smart Assistant'**
  String get specSmartAssistant;

  /// No description provided for @specModel.
  ///
  /// In en, this message translates to:
  /// **'Model'**
  String get specModel;

  /// No description provided for @specBrand.
  ///
  /// In en, this message translates to:
  /// **'Brand'**
  String get specBrand;

  /// No description provided for @specSeries.
  ///
  /// In en, this message translates to:
  /// **'Series'**
  String get specSeries;

  /// No description provided for @specYear.
  ///
  /// In en, this message translates to:
  /// **'Year'**
  String get specYear;

  /// No description provided for @specWarranty.
  ///
  /// In en, this message translates to:
  /// **'Warranty'**
  String get specWarranty;

  /// No description provided for @catGroupMobile.
  ///
  /// In en, this message translates to:
  /// **'Mobile'**
  String get catGroupMobile;

  /// No description provided for @catGroupComputers.
  ///
  /// In en, this message translates to:
  /// **'Computers'**
  String get catGroupComputers;

  /// No description provided for @catGroupComponents.
  ///
  /// In en, this message translates to:
  /// **'Components'**
  String get catGroupComponents;

  /// No description provided for @catGroupDisplay.
  ///
  /// In en, this message translates to:
  /// **'Display'**
  String get catGroupDisplay;

  /// No description provided for @catGroupAudio.
  ///
  /// In en, this message translates to:
  /// **'Audio'**
  String get catGroupAudio;

  /// No description provided for @catGroupWearables.
  ///
  /// In en, this message translates to:
  /// **'Wearables'**
  String get catGroupWearables;

  /// No description provided for @catGroupCameras.
  ///
  /// In en, this message translates to:
  /// **'Cameras'**
  String get catGroupCameras;

  /// No description provided for @catGroupGaming.
  ///
  /// In en, this message translates to:
  /// **'Gaming'**
  String get catGroupGaming;

  /// No description provided for @catGroupPeripherals.
  ///
  /// In en, this message translates to:
  /// **'Peripherals'**
  String get catGroupPeripherals;

  /// No description provided for @catGroupNetworking.
  ///
  /// In en, this message translates to:
  /// **'Networking'**
  String get catGroupNetworking;

  /// No description provided for @catGroupSmartHome.
  ///
  /// In en, this message translates to:
  /// **'Smart Home'**
  String get catGroupSmartHome;

  /// No description provided for @catGroupAccessories.
  ///
  /// In en, this message translates to:
  /// **'Accessories'**
  String get catGroupAccessories;

  /// No description provided for @catGroupDrones.
  ///
  /// In en, this message translates to:
  /// **'Drones'**
  String get catGroupDrones;

  /// No description provided for @catRam.
  ///
  /// In en, this message translates to:
  /// **'RAM'**
  String get catRam;

  /// No description provided for @catSsd.
  ///
  /// In en, this message translates to:
  /// **'SSDs'**
  String get catSsd;

  /// No description provided for @catMotherboards.
  ///
  /// In en, this message translates to:
  /// **'Motherboards'**
  String get catMotherboards;

  /// No description provided for @catPsu.
  ///
  /// In en, this message translates to:
  /// **'Power Supplies'**
  String get catPsu;

  /// No description provided for @catCases.
  ///
  /// In en, this message translates to:
  /// **'Cases'**
  String get catCases;

  /// No description provided for @catCoolers.
  ///
  /// In en, this message translates to:
  /// **'Coolers'**
  String get catCoolers;

  /// No description provided for @catProjectors.
  ///
  /// In en, this message translates to:
  /// **'Projectors'**
  String get catProjectors;

  /// No description provided for @catMediaPlayers.
  ///
  /// In en, this message translates to:
  /// **'Media Players'**
  String get catMediaPlayers;

  /// No description provided for @catSoundbars.
  ///
  /// In en, this message translates to:
  /// **'Soundbars'**
  String get catSoundbars;

  /// No description provided for @catMicrophones.
  ///
  /// In en, this message translates to:
  /// **'Microphones'**
  String get catMicrophones;

  /// No description provided for @catSmartRings.
  ///
  /// In en, this message translates to:
  /// **'Smart Rings'**
  String get catSmartRings;

  /// No description provided for @catActionCameras.
  ///
  /// In en, this message translates to:
  /// **'Action Cameras'**
  String get catActionCameras;

  /// No description provided for @catSecurityCameras.
  ///
  /// In en, this message translates to:
  /// **'Security Cameras'**
  String get catSecurityCameras;

  /// No description provided for @catIpCameras.
  ///
  /// In en, this message translates to:
  /// **'IP Cameras'**
  String get catIpCameras;

  /// No description provided for @catGimbals.
  ///
  /// In en, this message translates to:
  /// **'Gimbals'**
  String get catGimbals;

  /// No description provided for @catTripods.
  ///
  /// In en, this message translates to:
  /// **'Tripods'**
  String get catTripods;

  /// No description provided for @catLenses.
  ///
  /// In en, this message translates to:
  /// **'Lenses'**
  String get catLenses;

  /// No description provided for @catGamingConsoles.
  ///
  /// In en, this message translates to:
  /// **'Gaming Consoles'**
  String get catGamingConsoles;

  /// No description provided for @catGamepads.
  ///
  /// In en, this message translates to:
  /// **'Gamepads'**
  String get catGamepads;

  /// No description provided for @catVrHeadsets.
  ///
  /// In en, this message translates to:
  /// **'VR Headsets'**
  String get catVrHeadsets;

  /// No description provided for @catKeyboards.
  ///
  /// In en, this message translates to:
  /// **'Keyboards'**
  String get catKeyboards;

  /// No description provided for @catMice.
  ///
  /// In en, this message translates to:
  /// **'Mice'**
  String get catMice;

  /// No description provided for @catPrinters.
  ///
  /// In en, this message translates to:
  /// **'Printers'**
  String get catPrinters;

  /// No description provided for @catWebcams.
  ///
  /// In en, this message translates to:
  /// **'Webcams'**
  String get catWebcams;

  /// No description provided for @catRoutersModems.
  ///
  /// In en, this message translates to:
  /// **'Routers & Modems'**
  String get catRoutersModems;

  /// No description provided for @catRobotVacuums.
  ///
  /// In en, this message translates to:
  /// **'Robot Vacuums'**
  String get catRobotVacuums;

  /// No description provided for @catPowerBanks.
  ///
  /// In en, this message translates to:
  /// **'Power Banks'**
  String get catPowerBanks;

  /// No description provided for @catEReaders.
  ///
  /// In en, this message translates to:
  /// **'E-Readers'**
  String get catEReaders;

  /// No description provided for @nPlans.
  ///
  /// In en, this message translates to:
  /// **'{count} plans'**
  String nPlans(String count);

  /// No description provided for @onePlan.
  ///
  /// In en, this message translates to:
  /// **'1 plan'**
  String get onePlan;

  /// No description provided for @nTypes.
  ///
  /// In en, this message translates to:
  /// **'{count} types'**
  String nTypes(String count);

  /// No description provided for @oneType.
  ///
  /// In en, this message translates to:
  /// **'1 type'**
  String get oneType;

  /// No description provided for @specValYes.
  ///
  /// In en, this message translates to:
  /// **'Yes'**
  String get specValYes;

  /// No description provided for @specValNo.
  ///
  /// In en, this message translates to:
  /// **'No'**
  String get specValNo;

  /// No description provided for @specValAvailable.
  ///
  /// In en, this message translates to:
  /// **'Available'**
  String get specValAvailable;

  /// No description provided for @specValNotAvailable.
  ///
  /// In en, this message translates to:
  /// **'Not Available'**
  String get specValNotAvailable;

  /// No description provided for @specValUnknown.
  ///
  /// In en, this message translates to:
  /// **'Unknown'**
  String get specValUnknown;

  /// No description provided for @specValNone.
  ///
  /// In en, this message translates to:
  /// **'None'**
  String get specValNone;

  /// No description provided for @specValSupported.
  ///
  /// In en, this message translates to:
  /// **'Supported'**
  String get specValSupported;

  /// No description provided for @specValNotSupported.
  ///
  /// In en, this message translates to:
  /// **'Not Supported'**
  String get specValNotSupported;

  /// No description provided for @specValIncluded.
  ///
  /// In en, this message translates to:
  /// **'Included'**
  String get specValIncluded;

  /// No description provided for @specValNotIncluded.
  ///
  /// In en, this message translates to:
  /// **'Not Included'**
  String get specValNotIncluded;

  /// No description provided for @specValWireless.
  ///
  /// In en, this message translates to:
  /// **'Wireless'**
  String get specValWireless;

  /// No description provided for @specValWired.
  ///
  /// In en, this message translates to:
  /// **'Wired'**
  String get specValWired;

  /// No description provided for @specValBoth.
  ///
  /// In en, this message translates to:
  /// **'Both'**
  String get specValBoth;

  /// No description provided for @specValPlastic.
  ///
  /// In en, this message translates to:
  /// **'Plastic'**
  String get specValPlastic;

  /// No description provided for @specValMetal.
  ///
  /// In en, this message translates to:
  /// **'Metal'**
  String get specValMetal;

  /// No description provided for @specValGlass.
  ///
  /// In en, this message translates to:
  /// **'Glass'**
  String get specValGlass;

  /// No description provided for @specValAluminum.
  ///
  /// In en, this message translates to:
  /// **'Aluminum'**
  String get specValAluminum;

  /// No description provided for @specValCeramic.
  ///
  /// In en, this message translates to:
  /// **'Ceramic'**
  String get specValCeramic;

  /// No description provided for @specValLeather.
  ///
  /// In en, this message translates to:
  /// **'Leather'**
  String get specValLeather;

  /// No description provided for @specValSilicon.
  ///
  /// In en, this message translates to:
  /// **'Silicon'**
  String get specValSilicon;

  /// No description provided for @specValFront.
  ///
  /// In en, this message translates to:
  /// **'Front'**
  String get specValFront;

  /// No description provided for @specValRear.
  ///
  /// In en, this message translates to:
  /// **'Rear'**
  String get specValRear;

  /// No description provided for @specValSide.
  ///
  /// In en, this message translates to:
  /// **'Side'**
  String get specValSide;

  /// No description provided for @specValUnderDisplay.
  ///
  /// In en, this message translates to:
  /// **'Under Display'**
  String get specValUnderDisplay;

  /// No description provided for @paywallPurchaseSuccess.
  ///
  /// In en, this message translates to:
  /// **'Welcome to Compair Pro! 🎉'**
  String get paywallPurchaseSuccess;

  /// No description provided for @paywallRestoreSuccess.
  ///
  /// In en, this message translates to:
  /// **'Subscription restored! ✅'**
  String get paywallRestoreSuccess;

  /// No description provided for @paywallNoSubscription.
  ///
  /// In en, this message translates to:
  /// **'No active subscription found'**
  String get paywallNoSubscription;

  /// No description provided for @paywallHeadline.
  ///
  /// In en, this message translates to:
  /// **'Unlock the Full Experience'**
  String get paywallHeadline;

  /// No description provided for @paywallSubheading.
  ///
  /// In en, this message translates to:
  /// **'Make smarter decisions with unlimited AI power'**
  String get paywallSubheading;

  /// No description provided for @paywallRestoreButton.
  ///
  /// In en, this message translates to:
  /// **'Restore purchases'**
  String get paywallRestoreButton;

  /// No description provided for @paywallLegalText.
  ///
  /// In en, this message translates to:
  /// **'Auto-renews. Cancel anytime in App Store/Play Store settings.'**
  String get paywallLegalText;

  /// No description provided for @paywallFeatureComparisons.
  ///
  /// In en, this message translates to:
  /// **'Unlimited Comparisons'**
  String get paywallFeatureComparisons;

  /// No description provided for @paywallFeatureComparisonsDesc.
  ///
  /// In en, this message translates to:
  /// **'Compare as many products as you want'**
  String get paywallFeatureComparisonsDesc;

  /// No description provided for @paywallFeatureQuestions.
  ///
  /// In en, this message translates to:
  /// **'Unlimited AI Questions'**
  String get paywallFeatureQuestions;

  /// No description provided for @paywallFeatureQuestionsDesc.
  ///
  /// In en, this message translates to:
  /// **'Ask our AI anything about products'**
  String get paywallFeatureQuestionsDesc;

  /// No description provided for @paywallFeatureAnalysis.
  ///
  /// In en, this message translates to:
  /// **'Full Link Analysis'**
  String get paywallFeatureAnalysis;

  /// No description provided for @paywallFeatureAnalysisDesc.
  ///
  /// In en, this message translates to:
  /// **'Deep dive into product specifications'**
  String get paywallFeatureAnalysisDesc;

  /// No description provided for @paywallFeatureYoutube.
  ///
  /// In en, this message translates to:
  /// **'YouTube Reviews'**
  String get paywallFeatureYoutube;

  /// No description provided for @paywallFeatureYoutubeDesc.
  ///
  /// In en, this message translates to:
  /// **'Video reviews right in the app'**
  String get paywallFeatureYoutubeDesc;

  /// No description provided for @paywallFeatureHistory.
  ///
  /// In en, this message translates to:
  /// **'90-Day Price History'**
  String get paywallFeatureHistory;

  /// No description provided for @paywallFeatureHistoryDesc.
  ///
  /// In en, this message translates to:
  /// **'Track prices over time'**
  String get paywallFeatureHistoryDesc;

  /// No description provided for @paywallFeatureSupport.
  ///
  /// In en, this message translates to:
  /// **'Priority Support'**
  String get paywallFeatureSupport;

  /// No description provided for @paywallFeatureSupportDesc.
  ///
  /// In en, this message translates to:
  /// **'Get help when you need it'**
  String get paywallFeatureSupportDesc;

  /// No description provided for @paywallDiscountBadge.
  ///
  /// In en, this message translates to:
  /// **'SAVE 17%'**
  String get paywallDiscountBadge;

  /// No description provided for @paywallYearly.
  ///
  /// In en, this message translates to:
  /// **'Yearly'**
  String get paywallYearly;

  /// No description provided for @paywallMonthly.
  ///
  /// In en, this message translates to:
  /// **'Monthly'**
  String get paywallMonthly;

  /// No description provided for @paywallBilledMonthly.
  ///
  /// In en, this message translates to:
  /// **'billed monthly'**
  String get paywallBilledMonthly;

  /// No description provided for @paywallStartYearly.
  ///
  /// In en, this message translates to:
  /// **'Start Pro — \$39.99/year'**
  String get paywallStartYearly;

  /// No description provided for @paywallStartMonthly.
  ///
  /// In en, this message translates to:
  /// **'Start Pro — \$3.99/month'**
  String get paywallStartMonthly;

  /// No description provided for @scorePriceValue.
  ///
  /// In en, this message translates to:
  /// **'Price/Value'**
  String get scorePriceValue;

  /// No description provided for @comparisonCategoryGeneral.
  ///
  /// In en, this message translates to:
  /// **'General'**
  String get comparisonCategoryGeneral;

  /// No description provided for @comparisonBadgeAiAnalysis.
  ///
  /// In en, this message translates to:
  /// **'AI Analysis'**
  String get comparisonBadgeAiAnalysis;

  /// No description provided for @pcBuild.
  ///
  /// In en, this message translates to:
  /// **'PC Build'**
  String get pcBuild;

  /// No description provided for @linkPaste.
  ///
  /// In en, this message translates to:
  /// **'Link Paste'**
  String get linkPaste;

  /// No description provided for @productsLabel.
  ///
  /// In en, this message translates to:
  /// **'Products'**
  String get productsLabel;

  /// No description provided for @aiPoweredLabel.
  ///
  /// In en, this message translates to:
  /// **'Powered'**
  String get aiPoweredLabel;

  /// No description provided for @techLabel.
  ///
  /// In en, this message translates to:
  /// **'Tech'**
  String get techLabel;

  /// No description provided for @product1.
  ///
  /// In en, this message translates to:
  /// **'Product 1'**
  String get product1;

  /// No description provided for @product2.
  ///
  /// In en, this message translates to:
  /// **'Product 2'**
  String get product2;

  /// No description provided for @compareAction.
  ///
  /// In en, this message translates to:
  /// **'Compare'**
  String get compareAction;

  /// No description provided for @perfectMatch.
  ///
  /// In en, this message translates to:
  /// **'Perfect Match! 🎯'**
  String get perfectMatch;

  /// No description provided for @greatMatch.
  ///
  /// In en, this message translates to:
  /// **'Great Match 👍'**
  String get greatMatch;

  /// No description provided for @goodMatch.
  ///
  /// In en, this message translates to:
  /// **'Good Match'**
  String get goodMatch;

  /// No description provided for @averageMatch.
  ///
  /// In en, this message translates to:
  /// **'Average Match'**
  String get averageMatch;

  /// No description provided for @notIdeal.
  ///
  /// In en, this message translates to:
  /// **'Not Ideal'**
  String get notIdeal;

  /// No description provided for @lowMatch.
  ///
  /// In en, this message translates to:
  /// **'Low Match'**
  String get lowMatch;

  /// No description provided for @highlyRecommended.
  ///
  /// In en, this message translates to:
  /// **'Highly recommended'**
  String get highlyRecommended;

  /// No description provided for @generallyPositive.
  ///
  /// In en, this message translates to:
  /// **'Generally positive'**
  String get generallyPositive;

  /// No description provided for @mixedOpinions.
  ///
  /// In en, this message translates to:
  /// **'Mixed opinions'**
  String get mixedOpinions;

  /// No description provided for @notableConcerns.
  ///
  /// In en, this message translates to:
  /// **'Notable concerns'**
  String get notableConcerns;

  /// No description provided for @satisfactionSource.
  ///
  /// In en, this message translates to:
  /// **'Based on Reddit, forums & community reviews'**
  String get satisfactionSource;

  /// No description provided for @showLess.
  ///
  /// In en, this message translates to:
  /// **'Show less'**
  String get showLess;

  /// No description provided for @readMore.
  ///
  /// In en, this message translates to:
  /// **'Read more'**
  String get readMore;

  /// No description provided for @comingSoonDescription.
  ///
  /// In en, this message translates to:
  /// **'We\'re adding products to our database. You can skip this step for now.'**
  String get comingSoonDescription;

  /// No description provided for @helpfulLabel.
  ///
  /// In en, this message translates to:
  /// **'helpful'**
  String get helpfulLabel;

  /// No description provided for @specGroupDurability.
  ///
  /// In en, this message translates to:
  /// **'Physical Durability'**
  String get specGroupDurability;

  /// No description provided for @specGroupScreenViewfinder.
  ///
  /// In en, this message translates to:
  /// **'Screen & Viewfinder'**
  String get specGroupScreenViewfinder;

  /// No description provided for @specGroupExposureShooting.
  ///
  /// In en, this message translates to:
  /// **'Exposure & Shooting'**
  String get specGroupExposureShooting;

  /// No description provided for @specGroupFlash.
  ///
  /// In en, this message translates to:
  /// **'Flash'**
  String get specGroupFlash;

  /// No description provided for @specGroupOtherInfo.
  ///
  /// In en, this message translates to:
  /// **'Other Information'**
  String get specGroupOtherInfo;

  /// No description provided for @specGroupRecording.
  ///
  /// In en, this message translates to:
  /// **'Recording'**
  String get specGroupRecording;

  /// No description provided for @specGroupFocus.
  ///
  /// In en, this message translates to:
  /// **'Focus'**
  String get specGroupFocus;

  /// No description provided for @specValRechargeable.
  ///
  /// In en, this message translates to:
  /// **'Rechargeable'**
  String get specValRechargeable;

  /// No description provided for @specValNonRechargeable.
  ///
  /// In en, this message translates to:
  /// **'Non-Rechargeable'**
  String get specValNonRechargeable;

  /// No description provided for @specValLithium.
  ///
  /// In en, this message translates to:
  /// **'Lithium'**
  String get specValLithium;

  /// No description provided for @specValLithiumIon.
  ///
  /// In en, this message translates to:
  /// **'Lithium-Ion'**
  String get specValLithiumIon;

  /// No description provided for @specValLithiumPolymer.
  ///
  /// In en, this message translates to:
  /// **'Lithium Polymer'**
  String get specValLithiumPolymer;

  /// No description provided for @specValEnabled.
  ///
  /// In en, this message translates to:
  /// **'Enabled'**
  String get specValEnabled;

  /// No description provided for @specValDisabled.
  ///
  /// In en, this message translates to:
  /// **'Disabled'**
  String get specValDisabled;

  /// No description provided for @specValAuto.
  ///
  /// In en, this message translates to:
  /// **'Auto'**
  String get specValAuto;

  /// No description provided for @specValManual.
  ///
  /// In en, this message translates to:
  /// **'Manual'**
  String get specValManual;

  /// No description provided for @specValOptical.
  ///
  /// In en, this message translates to:
  /// **'Optical'**
  String get specValOptical;

  /// No description provided for @specValDigital.
  ///
  /// In en, this message translates to:
  /// **'Digital'**
  String get specValDigital;

  /// No description provided for @specValHybrid.
  ///
  /// In en, this message translates to:
  /// **'Hybrid'**
  String get specValHybrid;

  /// No description provided for @specValStereo.
  ///
  /// In en, this message translates to:
  /// **'Stereo'**
  String get specValStereo;

  /// No description provided for @specValMono.
  ///
  /// In en, this message translates to:
  /// **'Mono'**
  String get specValMono;

  /// No description provided for @specValBuiltIn.
  ///
  /// In en, this message translates to:
  /// **'Built-in'**
  String get specValBuiltIn;

  /// No description provided for @specValRemovable.
  ///
  /// In en, this message translates to:
  /// **'Removable'**
  String get specValRemovable;

  /// No description provided for @specValNonRemovable.
  ///
  /// In en, this message translates to:
  /// **'Non-removable'**
  String get specValNonRemovable;

  /// No description provided for @specValWaterproof.
  ///
  /// In en, this message translates to:
  /// **'Waterproof'**
  String get specValWaterproof;

  /// No description provided for @specValWaterResistant.
  ///
  /// In en, this message translates to:
  /// **'Water Resistant'**
  String get specValWaterResistant;

  /// No description provided for @specValDustproof.
  ///
  /// In en, this message translates to:
  /// **'Dustproof'**
  String get specValDustproof;

  /// No description provided for @specValShockproof.
  ///
  /// In en, this message translates to:
  /// **'Shockproof'**
  String get specValShockproof;

  /// No description provided for @specValTouchscreen.
  ///
  /// In en, this message translates to:
  /// **'Touchscreen'**
  String get specValTouchscreen;

  /// No description provided for @specValFoldable.
  ///
  /// In en, this message translates to:
  /// **'Foldable'**
  String get specValFoldable;

  /// No description provided for @specValRotating.
  ///
  /// In en, this message translates to:
  /// **'Rotating'**
  String get specValRotating;

  /// No description provided for @specValFixed.
  ///
  /// In en, this message translates to:
  /// **'Fixed'**
  String get specValFixed;

  /// No description provided for @specValAdjustable.
  ///
  /// In en, this message translates to:
  /// **'Adjustable'**
  String get specValAdjustable;

  /// No description provided for @specValAutomatic.
  ///
  /// In en, this message translates to:
  /// **'Automatic'**
  String get specValAutomatic;

  /// No description provided for @specGroupDisplayAudio.
  ///
  /// In en, this message translates to:
  /// **'Display / Audio'**
  String get specGroupDisplayAudio;

  /// No description provided for @specGroupHardwareSoftware.
  ///
  /// In en, this message translates to:
  /// **'Hardware / Software'**
  String get specGroupHardwareSoftware;

  /// No description provided for @specGroupConnections.
  ///
  /// In en, this message translates to:
  /// **'Connections'**
  String get specGroupConnections;

  /// No description provided for @specGroupReceivers.
  ///
  /// In en, this message translates to:
  /// **'Receivers'**
  String get specGroupReceivers;

  /// No description provided for @specGroupEnergyDesign.
  ///
  /// In en, this message translates to:
  /// **'Energy & Design'**
  String get specGroupEnergyDesign;

  /// No description provided for @specGroupDimensionsWeight.
  ///
  /// In en, this message translates to:
  /// **'Dimensions & Weight'**
  String get specGroupDimensionsWeight;

  /// No description provided for @specGroupTechInfra.
  ///
  /// In en, this message translates to:
  /// **'Technological Infrastructure'**
  String get specGroupTechInfra;

  /// No description provided for @specGroupPowerConnections.
  ///
  /// In en, this message translates to:
  /// **'Power & Connections'**
  String get specGroupPowerConnections;

  /// No description provided for @specGroupOtherConnections.
  ///
  /// In en, this message translates to:
  /// **'Other Connections'**
  String get specGroupOtherConnections;

  /// No description provided for @specGroupStorageBattery.
  ///
  /// In en, this message translates to:
  /// **'Storage & Battery'**
  String get specGroupStorageBattery;

  /// No description provided for @specGroupRearConnections.
  ///
  /// In en, this message translates to:
  /// **'Rear Connections'**
  String get specGroupRearConnections;

  /// No description provided for @specGroupCooling.
  ///
  /// In en, this message translates to:
  /// **'Cooling'**
  String get specGroupCooling;

  /// No description provided for @specGroupNpu.
  ///
  /// In en, this message translates to:
  /// **'Neural Processing Unit (NPU)'**
  String get specGroupNpu;

  /// No description provided for @specGroupTechnical.
  ///
  /// In en, this message translates to:
  /// **'Technical Information'**
  String get specGroupTechnical;

  /// No description provided for @specGroupEuLabel.
  ///
  /// In en, this message translates to:
  /// **'EU Energy Label'**
  String get specGroupEuLabel;

  /// No description provided for @guest.
  ///
  /// In en, this message translates to:
  /// **'Guest'**
  String get guest;

  /// No description provided for @suggestBestPhone.
  ///
  /// In en, this message translates to:
  /// **'Best phone under \$500?'**
  String get suggestBestPhone;

  /// No description provided for @suggestCompareLaptops.
  ///
  /// In en, this message translates to:
  /// **'Compare MacBook vs Dell XPS'**
  String get suggestCompareLaptops;

  /// No description provided for @suggestHeadphones.
  ///
  /// In en, this message translates to:
  /// **'Top headphones for music'**
  String get suggestHeadphones;

  /// No description provided for @suggestCameraPhones.
  ///
  /// In en, this message translates to:
  /// **'Best camera phones 2025'**
  String get suggestCameraPhones;

  /// No description provided for @suggestGamingMonitor.
  ///
  /// In en, this message translates to:
  /// **'Gaming monitor recommendations'**
  String get suggestGamingMonitor;

  /// No description provided for @suggestMechKeyboard.
  ///
  /// In en, this message translates to:
  /// **'Best mechanical keyboards'**
  String get suggestMechKeyboard;

  /// No description provided for @choose.
  ///
  /// In en, this message translates to:
  /// **'Choose'**
  String get choose;

  /// No description provided for @pcBuilderDesc.
  ///
  /// In en, this message translates to:
  /// **'Choose components to build your PC'**
  String get pcBuilderDesc;

  /// No description provided for @sortByName.
  ///
  /// In en, this message translates to:
  /// **'Name'**
  String get sortByName;

  /// No description provided for @sortByScore.
  ///
  /// In en, this message translates to:
  /// **'Score'**
  String get sortByScore;

  /// No description provided for @tapToChoose.
  ///
  /// In en, this message translates to:
  /// **'Tap to choose a component'**
  String get tapToChoose;

  /// No description provided for @compatibleOnly.
  ///
  /// In en, this message translates to:
  /// **'Compatible only'**
  String get compatibleOnly;

  /// No description provided for @advantages.
  ///
  /// In en, this message translates to:
  /// **'Advantages'**
  String get advantages;

  /// No description provided for @disadvantages.
  ///
  /// In en, this message translates to:
  /// **'Disadvantages'**
  String get disadvantages;

  /// No description provided for @specGroupConnectionsSlots.
  ///
  /// In en, this message translates to:
  /// **'Connections & Slots'**
  String get specGroupConnectionsSlots;

  /// No description provided for @specGroupDesignFunction.
  ///
  /// In en, this message translates to:
  /// **'Design & Function'**
  String get specGroupDesignFunction;

  /// No description provided for @specGroupDocOther.
  ///
  /// In en, this message translates to:
  /// **'Document & Other'**
  String get specGroupDocOther;

  /// No description provided for @specGroupFan.
  ///
  /// In en, this message translates to:
  /// **'Fan Features'**
  String get specGroupFan;

  /// No description provided for @specGroupImageSound.
  ///
  /// In en, this message translates to:
  /// **'Image/Sound Features'**
  String get specGroupImageSound;

  /// No description provided for @specGroupMemoryStorage.
  ///
  /// In en, this message translates to:
  /// **'Memory & Storage'**
  String get specGroupMemoryStorage;

  /// No description provided for @specGroupPump.
  ///
  /// In en, this message translates to:
  /// **'Pump Features'**
  String get specGroupPump;

  /// No description provided for @specGroupPowerStorage.
  ///
  /// In en, this message translates to:
  /// **'Power & Storage Features'**
  String get specGroupPowerStorage;

  /// No description provided for @specGroupVideoLens.
  ///
  /// In en, this message translates to:
  /// **'Video & Lens'**
  String get specGroupVideoLens;

  /// No description provided for @specGroupDocumentation.
  ///
  /// In en, this message translates to:
  /// **'Documentation'**
  String get specGroupDocumentation;

  /// No description provided for @analyzingServices.
  ///
  /// In en, this message translates to:
  /// **'Analyzing services...'**
  String get analyzingServices;

  /// No description provided for @askFollowUp.
  ///
  /// In en, this message translates to:
  /// **'Ask a follow-up question…'**
  String get askFollowUp;

  /// No description provided for @couldNotGenerateAnalysis.
  ///
  /// In en, this message translates to:
  /// **'Could not generate analysis.'**
  String get couldNotGenerateAnalysis;

  /// No description provided for @allPlans.
  ///
  /// In en, this message translates to:
  /// **'ALL PLANS'**
  String get allPlans;

  /// No description provided for @specAnalysis.
  ///
  /// In en, this message translates to:
  /// **'Spec\nAnalysis'**
  String get specAnalysis;

  /// No description provided for @personalMatch.
  ///
  /// In en, this message translates to:
  /// **'Personal\nMatch'**
  String get personalMatch;

  /// No description provided for @foundInDatabase.
  ///
  /// In en, this message translates to:
  /// **'Found in Compair Database'**
  String get foundInDatabase;

  /// No description provided for @techScoreLabel.
  ///
  /// In en, this message translates to:
  /// **'Tech Score'**
  String get techScoreLabel;

  /// No description provided for @aiConfidence.
  ///
  /// In en, this message translates to:
  /// **'AI Confidence'**
  String get aiConfidence;

  /// No description provided for @similarInDatabase.
  ///
  /// In en, this message translates to:
  /// **'Similar in Our Database'**
  String get similarInDatabase;

  /// No description provided for @signInToCompare.
  ///
  /// In en, this message translates to:
  /// **'Sign in to compare products'**
  String get signInToCompare;

  /// No description provided for @poweredByAi.
  ///
  /// In en, this message translates to:
  /// **'Powered by Compair AI'**
  String get poweredByAi;

  /// No description provided for @retryAvailable.
  ///
  /// In en, this message translates to:
  /// **'Retry available'**
  String get retryAvailable;

  /// No description provided for @generatingVerdict.
  ///
  /// In en, this message translates to:
  /// **'Generating AI verdict…'**
  String get generatingVerdict;

  /// No description provided for @pricePerformance.
  ///
  /// In en, this message translates to:
  /// **'Price-Performance'**
  String get pricePerformance;

  /// No description provided for @video.
  ///
  /// In en, this message translates to:
  /// **'Video'**
  String get video;

  /// No description provided for @unlockPro.
  ///
  /// In en, this message translates to:
  /// **'Unlock PRO'**
  String get unlockPro;

  /// No description provided for @unlimitedComparisons.
  ///
  /// In en, this message translates to:
  /// **'Unlimited comparisons & AI analysis'**
  String get unlimitedComparisons;

  /// No description provided for @filterLabel.
  ///
  /// In en, this message translates to:
  /// **'Filter'**
  String get filterLabel;

  /// No description provided for @compareCount.
  ///
  /// In en, this message translates to:
  /// **'Compare {count}'**
  String compareCount(Object count);

  /// No description provided for @textSizePreference.
  ///
  /// In en, this message translates to:
  /// **'Choose text size preference'**
  String get textSizePreference;

  /// No description provided for @small.
  ///
  /// In en, this message translates to:
  /// **'Small'**
  String get small;

  /// No description provided for @large.
  ///
  /// In en, this message translates to:
  /// **'Large'**
  String get large;

  /// No description provided for @exportDataConfirm.
  ///
  /// In en, this message translates to:
  /// **'Your data will be sent to your email address.'**
  String get exportDataConfirm;

  /// No description provided for @exportLabel.
  ///
  /// In en, this message translates to:
  /// **'Export'**
  String get exportLabel;

  /// No description provided for @aiLinkAnalysis.
  ///
  /// In en, this message translates to:
  /// **'AI Link Analysis'**
  String get aiLinkAnalysis;

  /// No description provided for @aiPoweredProductAnalysis.
  ///
  /// In en, this message translates to:
  /// **'AI-powered product analysis'**
  String get aiPoweredProductAnalysis;

  /// No description provided for @dropProductUrl.
  ///
  /// In en, this message translates to:
  /// **'Drop any product URL from 100+ stores'**
  String get dropProductUrl;

  /// No description provided for @aiQuiz.
  ///
  /// In en, this message translates to:
  /// **'AI Quiz'**
  String get aiQuiz;

  /// No description provided for @answerQuickQuestions.
  ///
  /// In en, this message translates to:
  /// **'Answer quick questions about your needs'**
  String get answerQuickQuestions;

  /// No description provided for @matchScoreLabel.
  ///
  /// In en, this message translates to:
  /// **'Match Score'**
  String get matchScoreLabel;

  /// No description provided for @getPersonalizedScore.
  ///
  /// In en, this message translates to:
  /// **'Get personalized compatibility score'**
  String get getPersonalizedScore;

  /// No description provided for @youtubeReviews.
  ///
  /// In en, this message translates to:
  /// **'YouTube Reviews'**
  String get youtubeReviews;

  /// No description provided for @proTab.
  ///
  /// In en, this message translates to:
  /// **'Premium'**
  String get proTab;

  /// No description provided for @similarTab.
  ///
  /// In en, this message translates to:
  /// **'Similar'**
  String get similarTab;

  /// No description provided for @quickQuiz.
  ///
  /// In en, this message translates to:
  /// **'Quick Quiz'**
  String get quickQuiz;

  /// No description provided for @computing.
  ///
  /// In en, this message translates to:
  /// **'Computing...'**
  String get computing;

  /// No description provided for @added.
  ///
  /// In en, this message translates to:
  /// **'Added'**
  String get added;

  /// No description provided for @selectComponent.
  ///
  /// In en, this message translates to:
  /// **'Select'**
  String get selectComponent;

  /// No description provided for @productComparisons.
  ///
  /// In en, this message translates to:
  /// **'Product Comparisons'**
  String get productComparisons;

  /// No description provided for @aiChatMessages.
  ///
  /// In en, this message translates to:
  /// **'AI Chat Messages'**
  String get aiChatMessages;

  /// No description provided for @saveProducts.
  ///
  /// In en, this message translates to:
  /// **'Save Products'**
  String get saveProducts;

  /// No description provided for @prioritySupport.
  ///
  /// In en, this message translates to:
  /// **'Priority Support'**
  String get prioritySupport;

  /// No description provided for @unlimited.
  ///
  /// In en, this message translates to:
  /// **'Unlimited'**
  String get unlimited;

  /// No description provided for @paywallBilledYearly.
  ///
  /// In en, this message translates to:
  /// **'\$1.67/mo'**
  String get paywallBilledYearly;

  /// No description provided for @paywallTrialBanner.
  ///
  /// In en, this message translates to:
  /// **'🎁  3-day free trial — cancel anytime'**
  String get paywallTrialBanner;

  /// No description provided for @paywallCTAYearly.
  ///
  /// In en, this message translates to:
  /// **'Start Free Trial — \$19.99/yr'**
  String get paywallCTAYearly;

  /// No description provided for @paywallCTAMonthly.
  ///
  /// In en, this message translates to:
  /// **'Start Free Trial — \$3.99/mo'**
  String get paywallCTAMonthly;

  /// No description provided for @paywallRestorePurchase.
  ///
  /// In en, this message translates to:
  /// **'Restore Purchase'**
  String get paywallRestorePurchase;

  /// No description provided for @paywallTerms.
  ///
  /// In en, this message translates to:
  /// **'By continuing you agree to our Terms and Privacy Policy'**
  String get paywallTerms;

  /// No description provided for @subscriptionIntelligence.
  ///
  /// In en, this message translates to:
  /// **'Subscription Intelligence'**
  String get subscriptionIntelligence;

  /// No description provided for @subscriptionAnalysisSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Type any subscription and get AI-powered analysis'**
  String get subscriptionAnalysisSubtitle;

  /// No description provided for @addSubscriptionHint.
  ///
  /// In en, this message translates to:
  /// **'e.g. Netflix, Spotify...'**
  String get addSubscriptionHint;

  /// No description provided for @analyzeButton.
  ///
  /// In en, this message translates to:
  /// **'Analyze'**
  String get analyzeButton;

  /// No description provided for @followUpHint.
  ///
  /// In en, this message translates to:
  /// **'Ask a follow-up question…'**
  String get followUpHint;

  /// No description provided for @compatibilityScore.
  ///
  /// In en, this message translates to:
  /// **'Compatibility'**
  String get compatibilityScore;

  /// No description provided for @singleAnalysis.
  ///
  /// In en, this message translates to:
  /// **'Single Analysis'**
  String get singleAnalysis;

  /// No description provided for @compareMode.
  ///
  /// In en, this message translates to:
  /// **'Compare Mode'**
  String get compareMode;

  /// No description provided for @subscriptionIntelligenceSubtitle.
  ///
  /// In en, this message translates to:
  /// **'AI-powered analysis with real web data'**
  String get subscriptionIntelligenceSubtitle;

  /// No description provided for @subscriptionInputHint.
  ///
  /// In en, this message translates to:
  /// **'Type a subscription (e.g. Netflix)'**
  String get subscriptionInputHint;

  /// No description provided for @featureLiveData.
  ///
  /// In en, this message translates to:
  /// **'Live Web Data'**
  String get featureLiveData;

  /// No description provided for @featureReddit.
  ///
  /// In en, this message translates to:
  /// **'Reddit Insights'**
  String get featureReddit;

  /// No description provided for @featureProfile.
  ///
  /// In en, this message translates to:
  /// **'Your Profile'**
  String get featureProfile;

  /// No description provided for @stepTypeTitle.
  ///
  /// In en, this message translates to:
  /// **'Type a Subscription'**
  String get stepTypeTitle;

  /// No description provided for @stepTypeDesc.
  ///
  /// In en, this message translates to:
  /// **'Enter any service name — Netflix, Spotify, ChatGPT Plus…'**
  String get stepTypeDesc;

  /// No description provided for @stepAnalyzeTitle.
  ///
  /// In en, this message translates to:
  /// **'AI Analysis'**
  String get stepAnalyzeTitle;

  /// No description provided for @stepAnalyzeDesc.
  ///
  /// In en, this message translates to:
  /// **'Real-time web data: pricing, Reddit sentiment, expert reviews'**
  String get stepAnalyzeDesc;

  /// No description provided for @stepScoreTitle.
  ///
  /// In en, this message translates to:
  /// **'Compatibility Score'**
  String get stepScoreTitle;

  /// No description provided for @stepScoreDesc.
  ///
  /// In en, this message translates to:
  /// **'Get a personalized match score based on your profile'**
  String get stepScoreDesc;

  /// No description provided for @addAnotherSubscription.
  ///
  /// In en, this message translates to:
  /// **'Add another…'**
  String get addAnotherSubscription;

  /// No description provided for @compatibilityScores.
  ///
  /// In en, this message translates to:
  /// **'Compatibility Scores'**
  String get compatibilityScores;

  /// No description provided for @personalizedQuiz.
  ///
  /// In en, this message translates to:
  /// **'Personalized Quiz'**
  String get personalizedQuiz;

  /// No description provided for @personalizedQuizDesc.
  ///
  /// In en, this message translates to:
  /// **'AI tailors questions to your usage patterns'**
  String get personalizedQuizDesc;

  /// No description provided for @pleaseEnterSubscriptionName.
  ///
  /// In en, this message translates to:
  /// **'Please add at least one subscription'**
  String get pleaseEnterSubscriptionName;

  /// No description provided for @resultLabel.
  ///
  /// In en, this message translates to:
  /// **'Result'**
  String get resultLabel;

  /// No description provided for @searchingWebData.
  ///
  /// In en, this message translates to:
  /// **'Searching web data...'**
  String get searchingWebData;

  /// No description provided for @smartCompatibility.
  ///
  /// In en, this message translates to:
  /// **'Smart Compatibility'**
  String get smartCompatibility;

  /// No description provided for @smartCompatibilityDesc.
  ///
  /// In en, this message translates to:
  /// **'Match score based on your profile & answers'**
  String get smartCompatibilityDesc;

  /// No description provided for @startAnalysis.
  ///
  /// In en, this message translates to:
  /// **'Start Analysis'**
  String get startAnalysis;

  /// No description provided for @typeLabel.
  ///
  /// In en, this message translates to:
  /// **'Type'**
  String get typeLabel;

  /// No description provided for @webPoweredInsights.
  ///
  /// In en, this message translates to:
  /// **'Web-Powered Insights'**
  String get webPoweredInsights;

  /// No description provided for @webPoweredInsightsDesc.
  ///
  /// In en, this message translates to:
  /// **'Real-time pricing, Reddit & forum opinions'**
  String get webPoweredInsightsDesc;

  /// No description provided for @discoverPopular.
  ///
  /// In en, this message translates to:
  /// **'Popular products from every category'**
  String get discoverPopular;

  /// No description provided for @whichShouldIBuy.
  ///
  /// In en, this message translates to:
  /// **'Which Should I Buy?'**
  String get whichShouldIBuy;

  /// No description provided for @quickAiComparisonResult.
  ///
  /// In en, this message translates to:
  /// **'Quick AI comparison result'**
  String get quickAiComparisonResult;

  /// No description provided for @comprehensiveAiComparison.
  ///
  /// In en, this message translates to:
  /// **'Comprehensive AI-powered comparison evaluation'**
  String get comprehensiveAiComparison;

  /// No description provided for @aiAlternativesToConsider.
  ///
  /// In en, this message translates to:
  /// **'AI-curated alternatives you should consider'**
  String get aiAlternativesToConsider;

  /// No description provided for @aiProductAdvisor.
  ///
  /// In en, this message translates to:
  /// **'AI Product Advisor'**
  String get aiProductAdvisor;

  /// No description provided for @personalizedPurchaseAdvice.
  ///
  /// In en, this message translates to:
  /// **'Personalized comparison purchase advice'**
  String get personalizedPurchaseAdvice;

  /// No description provided for @pricePrediction.
  ///
  /// In en, this message translates to:
  /// **'Price Prediction'**
  String get pricePrediction;

  /// No description provided for @aiPriceTrendAnalysis.
  ///
  /// In en, this message translates to:
  /// **'AI-powered price trend analysis & best time to buy'**
  String get aiPriceTrendAnalysis;

  /// No description provided for @aiCompatibilityAnalysis.
  ///
  /// In en, this message translates to:
  /// **'AI-powered compatibility analysis'**
  String get aiCompatibilityAnalysis;

  /// No description provided for @completeQuiz.
  ///
  /// In en, this message translates to:
  /// **'Complete Quiz'**
  String get completeQuiz;

  /// No description provided for @basedOnYourPreferences.
  ///
  /// In en, this message translates to:
  /// **'Based on your preferences and usage habits'**
  String get basedOnYourPreferences;

  /// No description provided for @comparisonVideos.
  ///
  /// In en, this message translates to:
  /// **'Comparison Videos'**
  String get comparisonVideos;

  /// No description provided for @tapToLoadVideos.
  ///
  /// In en, this message translates to:
  /// **'Tap to load comparison videos'**
  String get tapToLoadVideos;

  /// No description provided for @productLabel.
  ///
  /// In en, this message translates to:
  /// **'Product'**
  String get productLabel;

  /// No description provided for @noSimilarProductsFound.
  ///
  /// In en, this message translates to:
  /// **'No similar products found'**
  String get noSimilarProductsFound;

  /// No description provided for @readyToCompare.
  ///
  /// In en, this message translates to:
  /// **'Ready to compare!'**
  String get readyToCompare;

  /// No description provided for @analysisHistoryTooltip.
  ///
  /// In en, this message translates to:
  /// **'Analysis History'**
  String get analysisHistoryTooltip;

  /// No description provided for @pasteProductLinkCardTitle.
  ///
  /// In en, this message translates to:
  /// **'Paste Product Link'**
  String get pasteProductLinkCardTitle;

  /// No description provided for @pasteProductLinkSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Get AI-powered analysis with quiz'**
  String get pasteProductLinkSubtitle;

  /// No description provided for @compareProductsSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Add 2-4 product links to compare'**
  String get compareProductsSubtitle;

  /// No description provided for @addProductLabel.
  ///
  /// In en, this message translates to:
  /// **'Add Product'**
  String get addProductLabel;

  /// No description provided for @analyzingProductsTitle.
  ///
  /// In en, this message translates to:
  /// **'Analyzing Products...'**
  String get analyzingProductsTitle;

  /// No description provided for @analyzingProductsSubtitle.
  ///
  /// In en, this message translates to:
  /// **'AI is comparing your products side by side'**
  String get analyzingProductsSubtitle;

  /// No description provided for @howComparisonWorks.
  ///
  /// In en, this message translates to:
  /// **'How Comparison Works'**
  String get howComparisonWorks;

  /// No description provided for @addLinksCompareTitle.
  ///
  /// In en, this message translates to:
  /// **'Add 2-4 Links'**
  String get addLinksCompareTitle;

  /// No description provided for @addLinksCompareSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Paste product URLs you want to compare'**
  String get addLinksCompareSubtitle;

  /// No description provided for @sideBySideTitle.
  ///
  /// In en, this message translates to:
  /// **'Side-by-Side'**
  String get sideBySideTitle;

  /// No description provided for @sideBySideSubtitle.
  ///
  /// In en, this message translates to:
  /// **'See ranked comparison with pros & cons'**
  String get sideBySideSubtitle;

  /// No description provided for @comparisonResults.
  ///
  /// In en, this message translates to:
  /// **'Comparison Results'**
  String get comparisonResults;

  /// No description provided for @aiRecommendation.
  ///
  /// In en, this message translates to:
  /// **'AI Recommendation'**
  String get aiRecommendation;

  /// No description provided for @detailedComparisonTitle.
  ///
  /// In en, this message translates to:
  /// **'Detailed Comparison'**
  String get detailedComparisonTitle;

  /// No description provided for @pricingAnalysisTitle.
  ///
  /// In en, this message translates to:
  /// **'Pricing Analysis'**
  String get pricingAnalysisTitle;

  /// No description provided for @featureComparisonTitle.
  ///
  /// In en, this message translates to:
  /// **'Feature Comparison'**
  String get featureComparisonTitle;

  /// No description provided for @userExperienceTitle.
  ///
  /// In en, this message translates to:
  /// **'User Experience'**
  String get userExperienceTitle;

  /// No description provided for @scanStep.
  ///
  /// In en, this message translates to:
  /// **'Scan'**
  String get scanStep;

  /// No description provided for @analyzeStep.
  ///
  /// In en, this message translates to:
  /// **'Analyze'**
  String get analyzeStep;

  /// No description provided for @productsAnalyzed.
  ///
  /// In en, this message translates to:
  /// **'{count} products analyzed'**
  String productsAnalyzed(int count);

  /// No description provided for @productSlotLabel.
  ///
  /// In en, this message translates to:
  /// **'Product {slot}'**
  String productSlotLabel(int slot);

  /// No description provided for @pasteProductUrlNumbered.
  ///
  /// In en, this message translates to:
  /// **'Paste product URL {index}...'**
  String pasteProductUrlNumbered(int index);

  /// No description provided for @productProgress.
  ///
  /// In en, this message translates to:
  /// **'Product {current} of {total}'**
  String productProgress(int current, int total);
}

class _AppLocalizationsDelegate
    extends LocalizationsDelegate<AppLocalizations> {
  const _AppLocalizationsDelegate();

  @override
  Future<AppLocalizations> load(Locale locale) {
    return SynchronousFuture<AppLocalizations>(lookupAppLocalizations(locale));
  }

  @override
  bool isSupported(Locale locale) => <String>[
    'ar',
    'de',
    'en',
    'es',
    'fr',
    'it',
    'ja',
    'nl',
    'pl',
    'pt',
    'sv',
    'tr',
  ].contains(locale.languageCode);

  @override
  bool shouldReload(_AppLocalizationsDelegate old) => false;
}

AppLocalizations lookupAppLocalizations(Locale locale) {
  // Lookup logic when only language code is specified.
  switch (locale.languageCode) {
    case 'ar':
      return AppLocalizationsAr();
    case 'de':
      return AppLocalizationsDe();
    case 'en':
      return AppLocalizationsEn();
    case 'es':
      return AppLocalizationsEs();
    case 'fr':
      return AppLocalizationsFr();
    case 'it':
      return AppLocalizationsIt();
    case 'ja':
      return AppLocalizationsJa();
    case 'nl':
      return AppLocalizationsNl();
    case 'pl':
      return AppLocalizationsPl();
    case 'pt':
      return AppLocalizationsPt();
    case 'sv':
      return AppLocalizationsSv();
    case 'tr':
      return AppLocalizationsTr();
  }

  throw FlutterError(
    'AppLocalizations.delegate failed to load unsupported locale "$locale". This is likely '
    'an issue with the localizations generation tool. Please file an issue '
    'on GitHub with a reproducible sample app and the gen-l10n configuration '
    'that was used.',
  );
}
