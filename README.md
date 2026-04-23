# Qor AI — AI-Powered Price Comparison & Personal Product Recommender

<p align="center">
  <img src="assets/images/logo.png" alt="Qor AI Logo" width="120"/>
</p>

> **Qor AI** is a cross-platform Flutter application that helps users discover, compare, and make smarter purchase decisions using AI-powered personalized recommendations, real-time price tracking, and deep product analysis.

---

## ✨ Features

### 🏠 Personalized Home Feed
- Onboarding quiz captures user interests, budget range, ecosystem preference (Apple / Android / Mixed), and age range
- Home feed dynamically surfaces products from the user's interest categories (up to 20 per category)
- Algorithm sorts recommendations by relevance using `ProfileAlgorithmService`

### 🔍 Intelligent Search
- Typesense-backed product search with PocketBase data sync
- 400 ms debounce for smooth typing experience
- Pre-loaded popular searches (iPhone 16, Galaxy S25, MacBook Pro M4, PS5, etc.)

### 📦 Rich Product Detail Page
- **Hero image** with always-white background for clean presentation
- **Tech Score & Rating rows** — expert, community, and user scores at a glance
- **Compatibility badges** — ecosystem fit indicator
- **Price comparison** — side-by-side retailer prices
- **Pros / Cons** — curated highlights
- **Grouped Specifications** — all spec groups collapsed by default; tap to expand; 20+ admin-defined group types with custom icons and colors
- **YouTube Reviews** — top 3 embeddable review videos parsed from public YouTube search results in the user's device language
- **AI Review Analysis** (DeepSeek) — crawls real web reviews, summarizes sentiment: satisfaction %, praised features, common criticisms
- **User Reviews** — star rating + comment system; write a review via a bottom sheet; PocketBase-backed sync

### 🎨 Theme
- Defaults to **light/white theme** on first launch
- User can switch to dark mode from settings
- All product images rendered on a white background for consistency

### 🔐 Authentication
- Email/password, Google Sign-In, Apple Sign-In
- PocketBase user profiles and auth flows

### ⚖️ Product Comparison (Battles)
- Admin-curated and user-initiated head-to-head comparisons
- Side-by-side spec diff with winner highlighting

---

## 🛡️ Admin Panel (Web)

Full-featured web admin panel hosted on Coolify / Hetzner:

| Feature | Description |
|---------|-------------|
| **Dashboard** | Product/user/comparison stats, category charts, daily trends, top brands |
| **Products** | Full CRUD, search, filters, bulk delete, variant deduplication, spec viewer |
| **Users** | List, search, premium toggle, full deletion from PocketBase |
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
- Admin access is handled through GitHub OAuth on the `admins` auth collection and then upgraded to a PocketBase superuser session on the backend
- User deletion and product/app management are handled directly through PocketBase
- No Firebase Auth / Firestore dependency remains in runtime flows

---

## 🏗️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Flutter 3.x (Dart) |
| State Management | Riverpod (flutter_riverpod) |
| Backend | PocketBase + Typesense + Hetzner/Coolify |
| AI / LLM | DeepSeek API (`deepseek-chat`) |
| Video | Public YouTube search parsing |
| Web Search | PocketBase / app-side crawling |
| Local Cache | Hive |
| Routing | GoRouter |
| Image Loading | CachedNetworkImage |
| Admin Panel | Vanilla JS + Coolify static hosting |
| Scraper | Node.js local proxy + browser-side parsing |

---

## 📁 Project Structure

```
├── admin/                  # Web admin panel (Coolify static app)
│   ├── index.html
│   ├── css/style.css
│   └── js/
│       ├── app.js          # Core admin logic
│       └── scraper.js      # Scraper module
├── lib/                    # Flutter app
│   ├── config/             # Environment config
│   ├── core/               # Theme, constants, utilities
│   ├── data/
│   │   ├── datasources/    # PocketBase & Hive data sources
│   │   ├── models/         # Data models
│   │   └── repositories/   # Repository pattern
│   ├── domain/
│   │   └── entities/       # Pure domain entities
│   ├── presentation/
│   │   ├── providers/      # Riverpod providers
│   │   └── screens/        # UI screens
│   └── services/           # YouTube, DeepSeek, Gemini, Cache
├── scripts/                # Utility & scraper scripts
│   └── scraper-proxy.js    # Local CORS proxy for admin scraper
├── website/                # Public website (Coolify static app)
├── migration/              # One-off migration and infra scripts
└── pubspec.yaml            # Flutter dependencies
```

---

## 🌐 Web Deployments

| Site | URL | Content |
|------|-----|---------|
| `qorai-website` | https://qorai.app | Public website |
| `qorai-admin` | https://z1221ae58okr865xdquykps8.46.225.95.201.sslip.io | Admin panel |

Note: `https://yv5z6sfeiogrv3jn4djss832.46.225.95.201.sslip.io` is the PocketBase backend endpoint, not the public website.

Deploy:
```bash
npm run deploy:web       # Website + admin
npm run deploy:website   # Website only
npm run deploy:admin     # Admin only
```

---

## 🚀 Getting Started

### Prerequisites
- Flutter SDK ≥ 3.0
- Node.js ≥ 18
- API keys for: DeepSeek (Gemini optional if enabled on PocketBase)

### Setup

1. **Clone the repo**
   ```bash
   git clone https://github.com/arain-0/Qor AI.git
   cd Qor AI
   flutter pub get
   ```

2. **Backend setup**
   - Configure PocketBase URL / auth hook on your target environment
   - Keep `migration/.env` updated for Coolify deployment automation

3. **Run with API keys**
   ```bash
   flutter run \
     --dart-define=DEEPSEEK_API_KEY=your_key
   ```

---

## 🔑 Environment Variables

All secrets are passed via `--dart-define` and accessed through `EnvConfig`:

| Variable | Purpose |
|----------|---------|
| `DEEPSEEK_API_KEY` | DeepSeek LLM — AI review sentiment analysis |
| `GEMINI_API_KEY` | Gemini LLM (optional, also loadable from PB RemoteConfig) |

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
