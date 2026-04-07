# Compair — AI-Powered Price Comparison & Personal Product Recommender

<p align="center">
  <img src="assets/images/logo.png" alt="Compair Logo" width="120"/>
</p>

> **Compair** is a cross-platform Flutter application that helps users discover, compare, and make smarter purchase decisions using AI-powered personalized recommendations, real-time price tracking, and deep product analysis.

---

## ✨ Features

### 🏠 Personalized Home Feed
- Onboarding quiz captures user interests, budget range, ecosystem preference (Apple / Android / Mixed), and age range
- Home feed dynamically surfaces products from the user's interest categories (up to 20 per category)
- Algorithm sorts recommendations by relevance using `ProfileAlgorithmService`

### 🔍 Intelligent Search
- Cloud Function-powered server-side search with result caching (30 min TTL, 1 GiB memory)
- 400 ms debounce for smooth typing experience
- Pre-loaded popular searches (iPhone 16, Galaxy S25, MacBook Pro M4, PS5, etc.)

### 📦 Rich Product Detail Page
- **Hero image** with always-white background for clean presentation
- **Tech Score & Rating rows** — expert, community, and user scores at a glance
- **Compatibility badges** — ecosystem fit indicator
- **Price comparison** — side-by-side retailer prices
- **Pros / Cons** — curated highlights
- **Grouped Specifications** — all spec groups collapsed by default; tap to expand; 20+ admin-defined group types with custom icons and colors
- **YouTube Reviews** (YouTube Data API v3) — top 3 most-viewed review videos in the user's device language, with view counts
- **AI Review Analysis** (Google Custom Search + DeepSeek) — crawls real web reviews, summarizes sentiment: satisfaction %, praised features, common criticisms
- **User Reviews** — star rating + comment system; write a review via a bottom sheet; live Firestore sync

### 🎨 Theme
- Defaults to **light/white theme** on first launch
- User can switch to dark mode from settings
- All product images rendered on a white background for consistency

### 🔐 Authentication
- Email/password, Google Sign-In, Apple Sign-In
- Firebase Auth + Firestore user profiles

### ⚖️ Product Comparison (Battles)
- Admin-curated and user-initiated head-to-head comparisons
- Side-by-side spec diff with winner highlighting

---

## 🛡️ Admin Panel (Web)

Full-featured web admin panel hosted on Firebase:

| Feature | Description |
|---------|-------------|
| **Dashboard** | Product/user/comparison stats, category charts, daily trends, top brands |
| **Products** | Full CRUD, search, filters, bulk delete, variant deduplication, spec viewer |
| **Users** | List, search, premium toggle, full deletion (Auth + Firestore + subcollections) |
| **Scraper** | Bulk scrape from epey.com, single URL, score update, inventory scan |
| **App Control** | Ads, homepage, push notifications, maintenance mode, versioning |
| **Algorithm** | Match score weights, brand controls, behavior signals, home feed config |
| **Settings** | Danger zone (delete all), about |

### Scraper Setup
The scraper uses a local CORS proxy so that requests to epey.com use **your IP address** (avoids bot detection):

```bash
node scripts/scraper-proxy.js
```

Then open the admin panel → Scraper tab. The proxy runs on `localhost:3456`.

### Security
- Admin access restricted to email whitelist in `app_config/admins`
- User deletion via Cloud Function (`deleteUserAccount`) removes Auth + Firestore + subcollections
- Firestore rules enforce admin-only writes for products, users, and app config
- No auto-admin creation — admins must be manually added

---

## 🏗️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Flutter 3.x (Dart) |
| State Management | Riverpod (flutter_riverpod) |
| Backend | Firebase (Firestore, Auth, Storage, Cloud Functions) |
| AI / LLM | DeepSeek API (`deepseek-chat`) |
| Video | YouTube Data API v3 |
| Web Search | Google Custom Search API |
| Local Cache | Hive |
| Routing | GoRouter |
| Image Loading | CachedNetworkImage |
| Admin Panel | Vanilla JS + Firebase Hosting |
| Scraper | Node.js local proxy + browser-side parsing |

---

## 📁 Project Structure

```
├── admin/                  # Web admin panel (Firebase Hosting)
│   ├── index.html
│   ├── css/style.css
│   └── js/
│       ├── app.js          # Core admin logic
│       └── scraper.js      # Scraper module
├── functions/              # Cloud Functions (europe-west1)
│   └── index.js            # AI, search, user deletion, scoring
├── lib/                    # Flutter app
│   ├── config/             # Environment config
│   ├── core/               # Theme, constants, utilities
│   ├── data/
│   │   ├── datasources/    # Firebase & Hive data sources
│   │   ├── models/         # Firestore model classes
│   │   └── repositories/   # Repository pattern
│   ├── domain/
│   │   └── entities/       # Pure domain entities
│   ├── presentation/
│   │   ├── providers/      # Riverpod providers
│   │   └── screens/        # UI screens
│   └── services/           # YouTube, Google Search, DeepSeek, Cache
├── scripts/                # Utility & scraper scripts
│   └── scraper-proxy.js    # Local CORS proxy for admin scraper
├── website/                # Public website (Firebase Hosting)
├── firebase.json           # Firebase config
├── firestore.rules         # Firestore security rules
└── pubspec.yaml            # Flutter dependencies
```

---

## 🔥 Firebase Hosting

| Site | URL | Content |
|------|-----|---------|
| `compair-website` | https://compair-website.web.app | Public website |
| `compair-admin-panel` | https://compair-admin-panel.web.app | Admin panel |

Deploy:
```bash
firebase deploy --only hosting        # Both sites
firebase deploy --only hosting:admin  # Admin panel only
firebase deploy --only hosting:website # Website only
```

---

## 🚀 Getting Started

### Prerequisites
- Flutter SDK ≥ 3.0
- Node.js ≥ 18
- Firebase CLI (`npm i -g firebase-tools`)
- Firebase project with Firestore, Auth, and Storage enabled
- API keys for: YouTube Data API v3, Google Custom Search API, DeepSeek

### Setup

1. **Clone the repo**
   ```bash
   git clone https://github.com/arain-0/Compair.git
   cd Compair
   flutter pub get
   ```

2. **Firebase setup**
   - Add `google-services.json` (Android) and `GoogleService-Info.plist` (iOS)
   - Deploy rules & functions: `firebase deploy --only "firestore:rules,functions"`

3. **Run with API keys**
   ```bash
   flutter run \
     --dart-define=YOUTUBE_API_KEY=your_key \
     --dart-define=GOOGLE_SEARCH_API_KEY=your_key \
     --dart-define=GOOGLE_SEARCH_ENGINE_ID=your_id \
     --dart-define=DEEPSEEK_API_KEY=your_key
   ```

---

## 🔑 Environment Variables

All secrets are passed via `--dart-define` and accessed through `EnvConfig`:

| Variable | Purpose |
|----------|---------|
| `YOUTUBE_API_KEY` | YouTube Data API v3 — product review videos |
| `GOOGLE_SEARCH_API_KEY` | Google Custom Search — web review crawling |
| `GOOGLE_SEARCH_ENGINE_ID` | Custom Search Engine ID |
| `DEEPSEEK_API_KEY` | DeepSeek LLM — AI review sentiment analysis |

---

## 📱 Supported Platforms

- ✅ Android
- ✅ iOS
- ✅ Web (limited)

---

## 🌍 Localization

- Supports multiple languages via Flutter's `l10n` system (`lib/l10n/`)
- YouTube video search adapts to device locale (15 languages supported)
- AI review keywords localized for accurate international web searches

---

## 📄 License

Private repository — all rights reserved.
