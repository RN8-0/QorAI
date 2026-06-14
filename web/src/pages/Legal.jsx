import { Link } from 'react-router-dom';
import { useI18n } from '../i18n/index.jsx';
import { useSeo } from '../lib/seo';
import './Legal.css';

const CONTACT_EMAIL = 'contact@arain.digital';
const UPDATED = 'June 14, 2026';

const META = {
  terms: {
    path: '/terms',
    icon: '§',
    en: ['Terms of Service', 'Rules for using Qor AI, Premium subscriptions, AI outputs, acceptable use, cancellation and service limits.'],
    tr: ['Kullanım Koşulları', 'Qor AI kullanımı, Premium abonelikler, AI çıktıları, kabul edilebilir kullanım, iptal ve hizmet sınırları.'],
    de: ['Nutzungsbedingungen', 'Regeln für die Nutzung von Qor AI, Premium-Abonnements, KI-Ausgaben, zulässige Nutzung, Kündigung und Servicegrenzen.'],
  },
  privacy: {
    path: '/privacy',
    icon: '◎',
    en: ['Privacy Policy', 'How Qor AI collects, uses, protects and shares data for accounts, AI analysis, subscriptions, analytics and support.'],
    tr: ['Gizlilik Politikası', 'Qor AI hesaplar, AI analizi, abonelikler, analizler ve destek için verileri nasıl toplar, kullanır, korur ve paylaşır.'],
    de: ['Datenschutzerklärung', 'Wie Qor AI Daten für Konten, KI-Analysen, Abonnements, Analytik und Support erhebt, nutzt, schützt und weitergibt.'],
  },
  refund: {
    path: '/refund',
    icon: '$',
    en: ['Refund Policy', 'Refund eligibility, refund windows, subscriptions, renewals, app-store purchases and how to request help.'],
    tr: ['İade Politikası', 'İade uygunluğu, iade süreleri, abonelikler, yenilemeler, uygulama mağazası satın alımları ve yardım talebi.'],
    de: ['Rückerstattungsrichtlinie', 'Erstattungsfähigkeit, Fristen, Abonnements, Verlängerungen, App-Store-Käufe und Supportanfragen.'],
  },
  cookies: {
    path: '/cookies',
    icon: '●',
    en: ['Cookie Policy', 'How Qor AI uses essential storage, analytics, affiliate attribution and third-party cookies.'],
    tr: ['Çerez Politikası', 'Qor AI zorunlu depolama, analiz, affiliate atıf ve üçüncü taraf çerezlerini nasıl kullanır.'],
    de: ['Cookie-Richtlinie', 'Wie Qor AI notwendige Speicherung, Analytik, Affiliate-Zuordnung und Drittanbieter-Cookies nutzt.'],
  },
  contact: {
    path: '/contact',
    icon: '@',
    en: ['Contact Qor AI', 'Support, billing questions, privacy requests, missing product reports and partnership messages.'],
    tr: ['Qor AI ile İletişim', 'Destek, fatura soruları, gizlilik talepleri, eksik ürün bildirimleri ve iş birliği mesajları.'],
    de: ['Qor AI kontaktieren', 'Support, Zahlungsfragen, Datenschutzanfragen, fehlende Produkte und Partnerschaften.'],
  },
  about: {
    path: '/about',
    icon: 'Q',
    en: ['About Qor AI', 'What Qor AI is, what it sells, how Premium works and how product recommendations stay independent.'],
    tr: ['Qor AI Hakkında', 'Qor AI nedir, ne satar, Premium nasıl çalışır ve ürün önerileri nasıl bağımsız kalır.'],
    de: ['Über Qor AI', 'Was Qor AI ist, was verkauft wird, wie Premium funktioniert und wie Empfehlungen unabhängig bleiben.'],
  },
  faq: {
    path: '/faq',
    icon: '?',
    en: ['FAQ', 'Common questions about Qor AI, Premium, billing, refunds, privacy, AI accuracy and product data.'],
    tr: ['SSS', 'Qor AI, Premium, ödeme, iade, gizlilik, AI doğruluğu ve ürün verileri hakkında sık sorulan sorular.'],
    de: ['FAQ', 'Häufige Fragen zu Qor AI, Premium, Abrechnung, Erstattungen, Datenschutz, KI-Genauigkeit und Produktdaten.'],
  },
};

const COPY = {
  en: {
    common: {
      updated: `Last updated: ${UPDATED}`,
      onThisPage: 'On this page',
      quickLinks: 'Related policies',
      contact: 'Contact',
      email: CONTACT_EMAIL,
      home: 'Home',
      premium: 'Premium pricing',
      legalBrand: 'Qor AI is operated under the Qor AI sole proprietor brand. If a formal legal name is required for a specific transaction or verification process, it can be provided to the payment processor during onboarding.',
    },
    terms: [
      ['Who We Are', [
        'Qor AI is an AI-powered product advisory service available through qorai.net and the Qor AI mobile app. The service helps users search technology products, compare specifications, paste product links for AI analysis, scan product images, evaluate subscriptions and ask product-related questions.',
        'These Terms apply to the Qor AI website, mobile application, Premium subscription, account features, AI chat, link analysis, product comparison tools and any related support services. Qor AI is offered under the Qor AI sole proprietor brand.',
      ]],
      ['Acceptance of These Terms', [
        'By accessing Qor AI, creating an account, starting a free trial, buying Premium or continuing to use the service, you agree to these Terms and to our Privacy Policy. If you do not agree, you should not use the service.',
        'You must be at least 13 years old, or the minimum age required in your country, to use Qor AI. If you use Qor AI on behalf of another person or organization, you confirm that you have authority to accept these Terms for them.',
      ]],
      ['What Qor AI Provides', [
        'Qor AI provides catalog search, product pages, AI product analysis, comparison tools, link analysis, subscription comparison, product scoring, personal fit signals and Premium recommendations. The service is designed to support purchase research, not to replace your own judgment.',
        'Product data may come from public websites, partner feeds, marketplace pages, manufacturer information, user activity and AI enrichment. We work to keep information useful and current, but prices, availability, specifications and reviews can change without notice.',
      ]],
      ['Accounts and Security', [
        'Some features require an account. You agree to provide accurate information, keep your login details secure and notify us if you suspect unauthorized access. You are responsible for activity under your account unless the activity was caused by our failure to protect the service.',
        'Creating multiple accounts to bypass Qor Coin limits, trial limits, abuse checks, Premium restrictions or usage controls is not allowed. We may suspend or close accounts that appear fraudulent, automated or abusive.',
      ]],
      ['Premium, Trials and Billing', [
        'Qor AI Premium unlocks broader AI usage across Qor AI Chat, visual scanner, product analysis, link analysis, link comparison, subscription analysis, premium recommendations and extended price history. The current public pricing page is available at /premium.',
        'Web checkout may be processed by Paddle acting as merchant of record. Mobile purchases may be processed through Google Play or Apple App Store where available. The final price, taxes, currency, renewal date and payment method are shown at checkout before you confirm payment.',
        'Free trials, if offered, convert to a paid subscription at the end of the trial unless canceled before the trial ends. Subscriptions renew automatically until canceled. You can manage web subscriptions through the billing portal provided after purchase, and app-store subscriptions through the relevant app-store account settings.',
      ]],
      ['Refunds and Cancellations', [
        'Cancellation stops future renewal; it does not automatically refund charges that already happened. Refund eligibility is explained in our Refund Policy.',
        'For Paddle web purchases, refund requests should be sent to Qor AI support so we can review the transaction and, where approved, issue the refund through Paddle. For Google Play or Apple App Store purchases, refunds may need to be requested through the relevant store because the store controls the payment flow.',
      ]],
      ['AI Outputs and Product Advice', [
        'Qor AI uses AI models to summarize product information, interpret specifications, generate recommendations, ask follow-up questions and provide product-related explanations. AI output can be incomplete, outdated, biased or incorrect.',
        'Qor AI does not provide financial, legal, medical or professional advice. You should verify important product details, prices, compatibility and purchase conditions with the retailer or manufacturer before buying.',
      ]],
      ['Affiliate and Third-Party Links', [
        'Some store or retailer links may be affiliate links. Qor AI may earn a commission when you buy through those links. This does not change the price you pay and does not control Qor AI scores, rankings or Premium analysis.',
        'Qor AI is not the seller of third-party physical products shown in the catalog. Retailers, marketplaces and manufacturers are responsible for their own pricing, shipping, returns, warranties and product claims.',
      ]],
      ['Acceptable Use', [
        'You may not scrape the service at scale, reverse engineer private APIs, attack infrastructure, bypass access limits, abuse trials, upload unlawful content, impersonate others, interfere with other users or use Qor AI outputs to mislead people.',
        'You may not use Qor AI to build a competing product database or automated recommendation product without written permission. Reasonable personal use, screenshots and ordinary sharing of results are allowed.',
      ]],
      ['Intellectual Property', [
        'The Qor AI name, logo, interface, code, product ranking methods, AI prompts, databases, design and original content are owned by or licensed to Qor AI. You may not copy or resell the service except as allowed by law or with written permission.',
        'You keep ownership of information you submit, such as profile answers, chat prompts and product links. You grant Qor AI a limited license to process that information to operate, secure and improve the service.',
      ]],
      ['Availability, Changes and Termination', [
        'We may improve, modify, pause or discontinue parts of Qor AI. We try to avoid disruption, but we do not guarantee that every feature, data source, AI provider or product category will always remain available.',
        'We may suspend or terminate access if an account violates these Terms, creates security risk, causes chargebacks through abuse, attempts fraud or harms other users. Where practical, we will provide notice and an opportunity to resolve the issue.',
      ]],
      ['Disclaimers and Liability', [
        'Qor AI is provided "as is" and "as available." To the maximum extent permitted by law, we disclaim warranties of merchantability, fitness for a particular purpose, non-infringement, uninterrupted availability and error-free operation.',
        'To the maximum extent permitted by law, Qor AI is not liable for indirect, incidental, special, consequential or punitive damages, lost profits, lost data, missed deals, purchase decisions or third-party retailer issues.',
      ]],
      ['Contact', [
        `Questions about these Terms can be sent to ${CONTACT_EMAIL}. Please include the email address connected to your Qor AI account and a clear description of the issue so we can help faster.`,
      ]],
    ],
    privacy: [
      ['Information We Collect', [
        'We collect account information such as email address, display name, authentication provider, account status, verification status and basic profile settings. If you create a personal recommendation profile, we may store your budget range, product interests, current devices, subscriptions, priorities and quiz answers.',
        'We collect usage data needed to operate the service: searches, product views, compare lists, link analysis requests, AI chat prompts, product scan events, subscription analysis inputs, Qor Coin usage, Premium status and support interactions.',
      ]],
      ['Payment and Subscription Data', [
        'When web payments are processed by Paddle, Paddle acts as merchant of record and handles card details, tax calculation, invoices, receipts, fraud checks and payment compliance. Qor AI does not store full card numbers or CVV codes.',
        'We may receive limited subscription data from Paddle or app stores, such as product ID, plan type, customer ID, transaction ID, renewal status, cancellation status, country, currency, purchase date and entitlement state so we can unlock Premium.',
      ]],
      ['AI Inputs and Product Links', [
        'When you ask Qor AI a question, paste a product link, request product analysis or compare subscriptions, the relevant text, URL, product context and profile signals may be sent to AI providers to generate a response.',
        'Do not submit sensitive personal information, passwords, government IDs, medical records or payment card details into AI prompts. Qor AI is designed for product and subscription research, not for storing sensitive documents.',
      ]],
      ['How We Use Data', [
        'We use data to authenticate accounts, maintain Qor Coin balances, unlock Premium, generate AI responses, personalize recommendations, improve product matching, prevent abuse, provide support, debug issues and measure aggregate product performance.',
        'We do not sell your personal data. We do not use your private profile or chat history to sell third-party advertising profiles.',
      ]],
      ['Service Providers', [
        'Qor AI may use trusted providers for hosting, authentication, database storage, AI inference, analytics, email, payment processing, affiliate attribution and error monitoring. These providers process data only as needed to provide their services.',
        'Examples may include PocketBase-powered backend infrastructure, AI model providers, analytics tools, Paddle for web billing, app stores for mobile billing and affiliate or retailer networks after you click outbound store links.',
      ]],
      ['Cookies, Local Storage and Analytics', [
        'The website uses essential local storage and cookies for sign-in sessions, theme preference, security and service operation. The site language follows your browser language and does not require a manual language selector.',
        'We may use analytics to understand page visits, feature usage and technical performance. Affiliate partners or retailers may set cookies after you click outbound links so purchases can be attributed correctly.',
      ]],
      ['Data Retention', [
        'We keep account data while your account is active. We keep subscription and transaction records as long as needed for accounting, tax, fraud prevention, chargeback handling and legal compliance.',
        'If you delete your account, we aim to remove active account data within 30 days. Backups, logs and payment records may remain for a limited period where needed for security, legal or operational reasons.',
      ]],
      ['Security', [
        'We use HTTPS, access controls, token-based authentication, server-side permission rules and operational monitoring to protect data. No online service can be guaranteed perfectly secure, but we take reasonable measures to reduce risk.',
      ]],
      ['Your Rights', [
        'Depending on your location, you may request access, correction, deletion, restriction, portability or objection to processing of your personal data. You may also withdraw consent where processing is based on consent.',
        `To exercise these rights, contact ${CONTACT_EMAIL}. We may need to verify your account before fulfilling the request.`,
      ]],
      ['Children', [
        'Qor AI is not directed to children under 13. If you believe a child provided personal information without appropriate consent, contact us and we will review and delete the information where required.',
      ]],
      ['Changes', [
        'We may update this Privacy Policy as the service, providers, laws or payment flows change. The updated date on this page shows the latest version. Material changes may also be communicated through the website, app or email.',
      ]],
    ],
    refund: [
      ['Summary', [
        'This Refund Policy explains when Qor AI Premium purchases may be refunded, how to request a refund and which payment provider controls the refund flow. It applies to Qor AI web purchases and explains how mobile app-store purchases are handled.',
      ]],
      ['Web Purchases Through Paddle', [
        'For new Qor AI Premium purchases made through Paddle checkout on the web, you may request a refund within 30 days of the initial purchase if the service does not meet your expectations or if you purchased by mistake.',
        'Approved refunds are issued through Paddle to the original payment method where possible. Card refunds typically take several business days to appear depending on your bank or card issuer.',
      ]],
      ['Renewals and Subscription Changes', [
        'Subscription renewals are generally refundable if you contact us within 14 days of the renewal and there has not been heavy usage after the renewal. We review renewal requests fairly, especially if you forgot to cancel or were charged unexpectedly.',
        'Partial refunds may be used where appropriate. Subscription upgrades, downgrades and prorated credits may be handled by Paddle according to the billing state of the subscription.',
      ]],
      ['Mobile App Purchases', [
        'Purchases made through Google Play or Apple App Store are controlled by the relevant app store. If the store requires the customer to request the refund directly, we may not be able to issue it from our side.',
        'If you contact us about a mobile purchase, include your app-store order ID, Qor AI account email and the reason for the request. We will tell you the right next step.',
      ]],
      ['When Refunds May Be Declined', [
        'Refunds may be declined for abuse, fraud, repeated refund requests, account sharing, attempts to bypass usage limits, chargeback abuse, violations of the Terms or requests made outside the applicable refund window.',
        'Refunds do not apply to third-party physical products, retailer purchases, marketplace orders, shipping, warranties or returns from stores linked from Qor AI. Those are handled by the retailer or marketplace that sold the product.',
      ]],
      ['How to Request a Refund', [
        `Email ${CONTACT_EMAIL} with the subject "Refund request". Include your Qor AI account email, payment provider, transaction ID or order ID, purchase date and a short explanation.`,
        'We aim to respond within 5 business days. If approved, access to Premium may end immediately or at the end of the refunded billing period depending on the transaction state.',
      ]],
      ['Chargebacks', [
        'Please contact us before opening a chargeback so we can investigate and resolve the issue. Chargebacks may slow down resolution and can result in account restrictions while the payment is disputed.',
      ]],
    ],
    cookies: [
      ['Essential Storage', [
        'Qor AI uses essential cookies or local storage for login sessions, security tokens, theme settings and service operation. Without this storage, account features may not work correctly.',
      ]],
      ['Browser Language', [
        'Qor AI does not require manual language selection. The site reads your browser language and uses the matching supported language where available.',
      ]],
      ['Analytics and Performance', [
        'We may use analytics to understand traffic, feature adoption and page performance. Analytics help us improve Qor AI and diagnose technical issues.',
      ]],
      ['Affiliate Attribution', [
        'When you click outbound store or retailer links, affiliate partners or retailers may set cookies to attribute purchases. This does not change product scores or the price you pay.',
      ]],
      ['Checkout and Payment Providers', [
        'If you start a web checkout, Paddle may use cookies or similar technologies to operate checkout, calculate tax, prevent fraud, remember checkout state and issue receipts. Qor AI does not control Paddle checkout cookies, but we only use Paddle for payment and subscription processing.',
        'If you buy through Google Play or Apple App Store, those stores may use their own account, security and billing cookies according to their own policies.',
      ]],
      ['Managing Cookies', [
        'You can block or delete cookies from your browser settings. Some features, especially account login and checkout, may stop working if essential storage is disabled.',
      ]],
      ['Changes to Cookie Use', [
        'We may update this Cookie Policy when we add or remove analytics, payment, affiliate, security or support providers. The updated date on this page shows the current version.',
      ]],
    ],
    contact: [
      ['Email Support', [
        `For support, billing, refund, privacy, product data, partnership or press questions, email ${CONTACT_EMAIL}.`,
        'Include your Qor AI account email, relevant product link or transaction ID and a concise description of the issue. This helps us respond faster.',
      ]],
      ['What to Include', [
        'For billing or refund requests, include the payment provider, transaction ID, purchase date, plan name and the account email used in Qor AI. For product data issues, include the product link and the field that looks incorrect.',
        'For privacy requests, clearly state whether you want access, correction, deletion or another privacy action. We may ask for account verification before making account-level changes.',
      ]],
      ['Response Times', [
        'We aim to respond to most messages within a few business days. Billing, refund and privacy requests are prioritized because they may involve account access or payment deadlines.',
      ]],
      ['What We Can Help With', [
        'We can help with account access, Premium status, Paddle checkout questions, app-store subscription questions, refund requests, product data corrections, link analysis issues and privacy requests.',
      ]],
      ['Security and Abuse Reports', [
        'If you believe your account was accessed without permission, you found a security issue or you see suspicious usage, contact us with as much context as possible. Do not send passwords, card numbers or sensitive documents in plain email.',
      ]],
    ],
    about: [
      ['What Qor AI Does', [
        'Qor AI is a product research and decision assistant. It combines product catalog data, specifications, AI analysis, link analysis, comparisons, personal profile signals and subscription intelligence to help users make better buying decisions.',
      ]],
      ['What Qor AI Sells', [
        'Qor AI sells Premium access to software features. Premium unlocks broader AI usage, visual scanner, link analysis, product analysis, subscription analysis, extended price history and more personalized recommendations.',
      ]],
      ['Independence', [
        'Qor AI may earn affiliate commissions from some outbound store links, but commissions do not determine product scores, Premium recommendations or AI conclusions. Product fit and user context matter more than commercial relationships.',
      ]],
      ['Data Sources and AI Limits', [
        'Product information can come from public retailer pages, marketplace pages, manufacturer information, partner feeds, user interactions and AI enrichment. This makes discovery faster, but it also means some prices, stock states or specifications can change before Qor AI refreshes them.',
        'AI analysis is designed to explain tradeoffs and surface useful questions. It should not be treated as a warranty, retailer promise, legal advice or final compatibility guarantee.',
      ]],
      ['Payments', [
        'Web payments may be processed by Paddle as merchant of record. Mobile purchases may be handled by Google Play or Apple App Store depending on platform availability.',
      ]],
      ['Who Qor AI Is For', [
        'Qor AI is built for people comparing technology products, subscriptions and buying options before they spend money. It is also useful when a user has several product links and wants a clearer summary before deciding.',
      ]],
    ],
    faq: [
      ['What is Qor AI Premium?', [
        'Premium is the paid plan for heavier AI usage. It expands access to Qor AI Chat, visual scanner, product AI analysis, link analysis, link comparison, subscription analysis, premium recommendations and extended price history.',
      ]],
      ['Where is the pricing page?', [
        'The pricing page is /premium. It lists current public prices, trial information and the main Premium features.',
      ]],
      ['Can I get a refund?', [
        'For web purchases through Paddle, new Premium purchases may be refundable within 30 days. Renewal and app-store rules are explained in the Refund Policy.',
      ]],
      ['How do I cancel Premium?', [
        'Web subscriptions can be canceled through the billing portal provided after purchase or by contacting support. App-store subscriptions must usually be managed inside Google Play or Apple App Store account settings.',
      ]],
      ['Does Qor AI store my card details?', [
        'No. Web card details are handled by Paddle, and app-store payments are handled by the relevant store. Qor AI stores only limited subscription status data needed to unlock Premium.',
      ]],
      ['Why can web and mobile billing differ?', [
        'Web purchases may be handled by Paddle, while mobile purchases may be handled by Google Play or Apple App Store. Taxes, receipts, refund steps and subscription management can differ because each provider controls its own checkout flow.',
      ]],
      ['Is AI output always correct?', [
        'No. AI output can be wrong or outdated. Qor AI is a research assistant, not a guarantee. Always verify important specifications, prices and compatibility with official retailer or manufacturer sources.',
      ]],
      ['What should I do if product data is wrong?', [
        `Send the product link and the incorrect field to ${CONTACT_EMAIL}. We use reports to improve catalog quality, but retailer prices and stock may still change faster than our refresh cycle.`,
      ]],
      ['How is the site language selected?', [
        'The website follows your browser language. There is no manual language selector on the site.',
      ]],
    ],
  },
};

COPY.tr = {
  common: {
    updated: `Son güncelleme: 14 Haziran 2026`,
    onThisPage: 'Bu sayfada',
    quickLinks: 'İlgili politikalar',
    contact: 'İletişim',
    email: CONTACT_EMAIL,
    home: 'Ana Sayfa',
    premium: 'Premium fiyatlandırma',
    legalBrand: 'Qor AI, Qor AI şahıs/sole proprietor markası altında işletilir. Belirli bir işlem veya doğrulama süreci için resmi yasal ad gerekirse ödeme sağlayıcısına onboarding sırasında sağlanabilir.',
  },
  terms: [
    ['Biz Kimiz', [
      'Qor AI; qorai.net ve Qor AI mobil uygulaması üzerinden çalışan AI destekli ürün danışmanı hizmetidir. Kullanıcıların teknoloji ürünlerini aramasına, özellikleri karşılaştırmasına, ürün linklerini AI ile analiz etmesine, ürün görsellerini taramasına, abonelikleri değerlendirmesine ve ürün odaklı sorular sormasına yardımcı olur.',
      'Bu Koşullar; Qor AI web sitesi, mobil uygulama, Premium abonelik, hesap özellikleri, AI sohbet, link analizi, ürün karşılaştırma araçları ve ilgili destek hizmetleri için geçerlidir. Qor AI, Qor AI şahıs/sole proprietor markası altında sunulur.',
    ]],
    ['Koşulların Kabulü', [
      'Qor AI’a erişerek, hesap oluşturarak, ücretsiz deneme başlatarak, Premium satın alarak veya hizmeti kullanmaya devam ederek bu Koşulları ve Gizlilik Politikamızı kabul etmiş olursunuz. Kabul etmiyorsanız hizmeti kullanmamalısınız.',
      'Qor AI’ı kullanmak için en az 13 yaşında veya ülkenizde geçerli minimum yaşta olmalısınız. Qor AI’ı başka bir kişi ya da kuruluş adına kullanıyorsanız, bu Koşulları onlar adına kabul etme yetkiniz olduğunu beyan edersiniz.',
    ]],
    ['Qor AI Ne Sunar', [
      'Qor AI katalog arama, ürün sayfaları, AI ürün analizi, karşılaştırma araçları, link analizi, abonelik karşılaştırma, ürün skoru, kişisel uyum sinyalleri ve Premium öneriler sunar. Hizmet, satın alma araştırmasını desteklemek için tasarlanmıştır; kendi kararınızın yerine geçmez.',
      'Ürün verileri herkese açık web siteleri, partner feed’leri, pazar yeri sayfaları, üretici bilgileri, kullanıcı etkileşimi ve AI zenginleştirmesinden gelebilir. Bilgileri faydalı ve güncel tutmaya çalışırız; ancak fiyat, stok, teknik özellik ve yorumlar haber vermeden değişebilir.',
    ]],
    ['Hesaplar ve Güvenlik', [
      'Bazı özellikler hesap gerektirir. Doğru bilgi sağlamayı, giriş bilgilerinizi güvenli tutmayı ve yetkisiz erişim şüpheniz varsa bize bildirmeyi kabul edersiniz. Hesabınızdaki işlemlerden, işlem bizim güvenlik eksikliğimizden kaynaklanmadıkça siz sorumlusunuz.',
      'Qor Coin limitlerini, deneme sınırlarını, kötüye kullanım kontrollerini, Premium kısıtlarını veya kullanım kontrollerini aşmak için birden fazla hesap oluşturmak yasaktır. Dolandırıcı, otomatik veya kötüye kullanım görünen hesapları askıya alabilir ya da kapatabiliriz.',
    ]],
    ['Premium, Denemeler ve Ödeme', [
      'Qor AI Premium; Qor AI Chat, görsel tarayıcı, ürün analizi, link analizi, link karşılaştırma, abonelik analizi, premium öneriler ve genişletilmiş fiyat geçmişi dahil daha kapsamlı AI kullanımını açar. Güncel herkese açık fiyatlandırma sayfası /premium adresindedir.',
      'Web checkout, merchant of record olarak Paddle tarafından işlenebilir. Mobil satın almalar uygun olduğunda Google Play veya Apple App Store üzerinden işlenebilir. Nihai fiyat, vergiler, para birimi, yenileme tarihi ve ödeme yöntemi ödeme onayından önce checkout ekranında gösterilir.',
      'Sunuluyorsa ücretsiz denemeler, deneme bitmeden iptal edilmezse deneme sonunda ücretli aboneliğe dönüşür. Abonelikler iptal edilene kadar otomatik yenilenir. Web aboneliklerini satın alma sonrası sağlanan fatura portalından, uygulama mağazası aboneliklerini ilgili mağaza hesabı ayarlarından yönetebilirsiniz.',
    ]],
    ['İadeler ve İptaller', [
      'İptal gelecekteki yenilemeyi durdurur; gerçekleşmiş ödemeleri otomatik olarak iade etmez. İade uygunluğu İade Politikamızda açıklanır.',
      'Paddle web satın almaları için iade talepleri Qor AI desteğine gönderilmelidir; işlemi inceleyip uygun olduğunda iadeyi Paddle üzerinden başlatırız. Google Play veya Apple App Store satın almalarında iade, ödeme akışını mağaza kontrol ettiği için ilgili mağazadan talep edilmelidir.',
    ]],
    ['AI Çıktıları ve Ürün Tavsiyesi', [
      'Qor AI; ürün bilgilerini özetlemek, teknik özellikleri yorumlamak, öneriler üretmek, takip soruları sormak ve ürün odaklı açıklamalar sunmak için AI modelleri kullanır. AI çıktıları eksik, eski, taraflı veya hatalı olabilir.',
      'Qor AI finansal, hukuki, tıbbi veya profesyonel danışmanlık vermez. Satın almadan önce önemli ürün detaylarını, fiyatları, uyumluluğu ve satın alma koşullarını satıcı veya üretici kaynaklarından doğrulamalısınız.',
    ]],
    ['Affiliate ve Üçüncü Taraf Linkler', [
      'Bazı mağaza veya satıcı linkleri affiliate link olabilir. Bu linkler üzerinden satın alım yaparsanız Qor AI komisyon kazanabilir. Bu, ödediğiniz fiyatı değiştirmez ve Qor AI skorlarını, sıralamalarını veya Premium analizini kontrol etmez.',
      'Qor AI katalogda gösterilen üçüncü taraf fiziksel ürünlerin satıcısı değildir. Perakendeciler, pazar yerleri ve üreticiler kendi fiyatlandırma, gönderim, iade, garanti ve ürün beyanlarından sorumludur.',
    ]],
    ['Kabul Edilebilir Kullanım', [
      'Hizmeti büyük ölçekte kazıyamaz, özel API’leri tersine mühendislik yapamaz, altyapıya saldırıda bulunamaz, erişim limitlerini aşamaz, denemeleri kötüye kullanamaz, yasa dışı içerik yükleyemez, başkası gibi davranamaz, diğer kullanıcıları engelleyemez veya Qor AI çıktılarıyla insanları yanıltamazsınız.',
      'Yazılı izin olmadan Qor AI’ı rakip bir ürün veritabanı veya otomatik öneri ürünü oluşturmak için kullanamazsınız. Makul kişisel kullanım, ekran görüntüsü alma ve sonuçları olağan şekilde paylaşma serbesttir.',
    ]],
    ['Fikri Mülkiyet', [
      'Qor AI adı, logosu, arayüzü, kodu, ürün sıralama yöntemleri, AI promptları, veri tabanları, tasarımı ve özgün içeriği Qor AI’a veya lisans verenlerine aittir. Hizmeti yasanın izin verdiği haller dışında veya yazılı izin olmadan kopyalayamaz ya da yeniden satamazsınız.',
      'Profil yanıtları, sohbet promptları ve ürün linkleri gibi gönderdiğiniz bilgilerin mülkiyeti sizde kalır. Bu bilgileri hizmeti işletmek, güvenceye almak ve geliştirmek için işlememize sınırlı lisans verirsiniz.',
    ]],
    ['Erişilebilirlik, Değişiklikler ve Fesih', [
      'Qor AI’ın bazı bölümlerini geliştirebilir, değiştirebilir, duraklatabilir veya sonlandırabiliriz. Kesintiyi önlemeye çalışırız; ancak her özelliğin, veri kaynağının, AI sağlayıcısının veya ürün kategorisinin her zaman kullanılabilir kalacağını garanti etmeyiz.',
      'Bir hesap bu Koşulları ihlal ederse, güvenlik riski oluşturursa, kötüye kullanım yoluyla chargeback yaratırsa, dolandırıcılık girişiminde bulunursa veya diğer kullanıcılara zarar verirse erişimi askıya alabilir ya da sonlandırabiliriz. Uygun olduğunda bildirim ve çözüm fırsatı sağlamaya çalışırız.',
    ]],
    ['Sorumluluk Reddi ve Sınırı', [
      'Qor AI "olduğu gibi" ve "mevcut olduğu şekilde" sunulur. Yasanın izin verdiği azami ölçüde ticarete elverişlilik, belirli bir amaca uygunluk, ihlal etmeme, kesintisiz erişim ve hatasız çalışma garantilerini reddederiz.',
      'Yasanın izin verdiği azami ölçüde Qor AI dolaylı, arızi, özel, sonuçsal veya cezai zararlardan, kâr kaybından, veri kaybından, kaçan fırsatlardan, satın alma kararlarından veya üçüncü taraf satıcı sorunlarından sorumlu değildir.',
    ]],
    ['İletişim', [
      `Bu Koşullar hakkındaki sorular ${CONTACT_EMAIL} adresine gönderilebilir. Daha hızlı yardımcı olabilmemiz için Qor AI hesabınıza bağlı e-postayı ve konuyu açıkça yazın.`,
    ]],
  ],
  privacy: [
    ['Topladığımız Bilgiler', [
      'E-posta adresi, görünen ad, kimlik doğrulama sağlayıcısı, hesap durumu, doğrulama durumu ve temel profil ayarları gibi hesap bilgilerini toplarız. Kişisel öneri profili oluşturursanız bütçe aralığınız, ürün ilgi alanlarınız, mevcut cihazlarınız, abonelikleriniz, öncelikleriniz ve quiz yanıtlarınız saklanabilir.',
      'Hizmeti işletmek için gerekli kullanım verilerini toplarız: aramalar, ürün görüntülemeleri, karşılaştırma listeleri, link analizi talepleri, AI chat promptları, ürün tarama olayları, abonelik analizi girdileri, Qor Coin kullanımı, Premium durumu ve destek etkileşimleri.',
    ]],
    ['Ödeme ve Abonelik Verileri', [
      'Web ödemeleri Paddle tarafından işlendiğinde Paddle merchant of record olarak kart bilgilerini, vergi hesaplamasını, faturaları, makbuzları, dolandırıcılık kontrollerini ve ödeme uyumluluğunu yönetir. Qor AI tam kart numarası veya CVV saklamaz.',
      'Premium erişimi açmak için Paddle veya uygulama mağazalarından ürün kimliği, plan türü, müşteri ID’si, işlem ID’si, yenileme durumu, iptal durumu, ülke, para birimi, satın alma tarihi ve hak sahipliği durumu gibi sınırlı abonelik verileri alabiliriz.',
    ]],
    ['AI Girdileri ve Ürün Linkleri', [
      'Qor AI’a soru sorduğunuzda, ürün linki yapıştırdığınızda, ürün analizi istediğinizde veya abonelikleri karşılaştırdığınızda ilgili metin, URL, ürün bağlamı ve profil sinyalleri yanıt üretmek için AI sağlayıcılarına gönderilebilir.',
      'AI promptlarına hassas kişisel bilgi, parola, resmi kimlik numarası, sağlık kaydı veya ödeme kartı bilgisi girmeyin. Qor AI ürün ve abonelik araştırması için tasarlanmıştır; hassas belge saklama hizmeti değildir.',
    ]],
    ['Verileri Nasıl Kullanırız', [
      'Verileri hesapları doğrulamak, Qor Coin bakiyelerini korumak, Premium’u açmak, AI yanıtları üretmek, önerileri kişiselleştirmek, ürün eşleşmesini geliştirmek, kötüye kullanımı önlemek, destek sağlamak, hataları gidermek ve toplu ürün performansını ölçmek için kullanırız.',
      'Kişisel verilerinizi satmayız. Özel profilinizi veya chat geçmişinizi üçüncü taraf reklam profilleri satmak için kullanmayız.',
    ]],
    ['Hizmet Sağlayıcılar', [
      'Qor AI barındırma, kimlik doğrulama, veri tabanı, AI çıkarımı, analiz, e-posta, ödeme işleme, affiliate atıf ve hata izleme için güvenilir sağlayıcılar kullanabilir. Bu sağlayıcılar verileri yalnızca hizmetlerini sunmak için gerekli olduğu ölçüde işler.',
      'Örnekler PocketBase tabanlı backend altyapısı, AI model sağlayıcıları, analiz araçları, web ödemeleri için Paddle, mobil ödemeler için uygulama mağazaları ve dış mağaza linklerine tıkladıktan sonra affiliate veya perakendeci ağları olabilir.',
    ]],
    ['Çerezler, Yerel Depolama ve Analiz', [
      'Web sitesi giriş oturumları, tema tercihi, güvenlik ve hizmet işletimi için zorunlu yerel depolama ve çerezler kullanır. Site dili tarayıcı dilinizi takip eder ve manuel dil seçici gerektirmez.',
      'Sayfa ziyaretlerini, özellik kullanımını ve teknik performansı anlamak için analiz kullanabiliriz. Affiliate partnerleri veya perakendeciler, dış linklere tıkladığınızda satın alımları doğru ilişkilendirmek için çerez yerleştirebilir.',
    ]],
    ['Veri Saklama', [
      'Hesabınız aktif olduğu sürece hesap verilerini saklarız. Abonelik ve işlem kayıtlarını muhasebe, vergi, dolandırıcılık önleme, chargeback yönetimi ve yasal uyumluluk için gerekli olduğu sürece saklarız.',
      'Hesabınızı silerseniz aktif hesap verilerini 30 gün içinde kaldırmayı hedefleriz. Yedekler, loglar ve ödeme kayıtları güvenlik, yasal veya operasyonel nedenlerle sınırlı süre kalabilir.',
    ]],
    ['Güvenlik', [
      'Verileri korumak için HTTPS, erişim kontrolleri, token tabanlı kimlik doğrulama, sunucu tarafı izin kuralları ve operasyonel izleme kullanırız. Hiçbir çevrimiçi hizmet kusursuz güvenli garanti edilemez; ancak riski azaltmak için makul önlemler alırız.',
    ]],
    ['Haklarınız', [
      'Konumunuza bağlı olarak kişisel verilerinize erişim, düzeltme, silme, işlemeyi kısıtlama, taşınabilirlik veya itiraz talep edebilirsiniz. İşleme rızaya dayanıyorsa rızanızı geri çekebilirsiniz.',
      `Bu hakları kullanmak için ${CONTACT_EMAIL} adresinden bize ulaşın. Talebi yerine getirmeden önce hesabınızı doğrulamamız gerekebilir.`,
    ]],
    ['Çocuklar', [
      'Qor AI 13 yaş altındaki çocuklara yönelik değildir. Bir çocuğun uygun izin olmadan kişisel bilgi sağladığını düşünüyorsanız bize ulaşın; gerekli olduğunda bilgileri inceleyip sileriz.',
    ]],
    ['Değişiklikler', [
      'Hizmet, sağlayıcılar, yasalar veya ödeme akışları değiştikçe bu Gizlilik Politikasını güncelleyebiliriz. Sayfadaki güncelleme tarihi en son sürümü gösterir. Önemli değişiklikler web sitesi, uygulama veya e-posta ile bildirilebilir.',
    ]],
  ],
  refund: [
    ['Özet', [
      'Bu İade Politikası, Qor AI Premium satın almalarının ne zaman iade edilebileceğini, iade talebinin nasıl yapılacağını ve iade akışını hangi ödeme sağlayıcısının kontrol ettiğini açıklar. Qor AI web satın almaları için geçerlidir ve mobil uygulama mağazası satın almalarının nasıl ele alındığını açıklar.',
    ]],
    ['Paddle Üzerinden Web Satın Almaları', [
      'Web’de Paddle checkout üzerinden yapılan yeni Qor AI Premium satın almaları için, hizmet beklentinizi karşılamazsa veya yanlışlıkla satın aldıysanız ilk satın alma tarihinden itibaren 30 gün içinde iade talep edebilirsiniz.',
      'Onaylanan iadeler mümkün olduğunda Paddle üzerinden orijinal ödeme yöntemine yapılır. Kart iadelerinin bankanıza veya kart sağlayıcınıza bağlı olarak görünmesi birkaç iş günü sürebilir.',
    ]],
    ['Yenilemeler ve Abonelik Değişiklikleri', [
      'Abonelik yenilemeleri, yenilemeden sonra yoğun kullanım yoksa ve yenilemeden itibaren 14 gün içinde bize ulaşırsanız genellikle iade için değerlendirilebilir. İptali unuttuysanız veya beklenmedik şekilde ücretlendirildiyseniz talepleri adil şekilde inceleriz.',
      'Uygun durumlarda kısmi iade kullanılabilir. Abonelik yükseltmeleri, düşürmeleri ve oransal krediler aboneliğin fatura durumuna göre Paddle tarafından yönetilebilir.',
    ]],
    ['Mobil Uygulama Satın Almaları', [
      'Google Play veya Apple App Store üzerinden yapılan satın almalar ilgili uygulama mağazası tarafından kontrol edilir. Mağaza müşterinin iadeyi doğrudan talep etmesini gerektiriyorsa bizim taraftan iade yapamayabiliriz.',
      'Mobil satın alma için bize ulaşırsanız uygulama mağazası sipariş ID’nizi, Qor AI hesap e-postanızı ve talep nedeninizi ekleyin. Size doğru sonraki adımı söyleriz.',
    ]],
    ['İadenin Reddedilebileceği Durumlar', [
      'Kötüye kullanım, dolandırıcılık, tekrarlayan iade talepleri, hesap paylaşımı, kullanım limitlerini aşma girişimi, chargeback kötüye kullanımı, Koşulların ihlali veya geçerli iade süresi dışındaki taleplerde iade reddedilebilir.',
      'İadeler Qor AI’dan link verilen üçüncü taraf fiziksel ürünlere, perakendeci satın almalarına, pazar yeri siparişlerine, gönderim ücretlerine, garantilere veya mağaza iadelerine uygulanmaz. Bunlar ürünü satan perakendeci veya pazar yeri tarafından yönetilir.',
    ]],
    ['İade Nasıl Talep Edilir', [
      `${CONTACT_EMAIL} adresine "İade talebi" konu başlığıyla e-posta gönderin. Qor AI hesap e-postanızı, ödeme sağlayıcısını, işlem ID’si veya sipariş ID’sini, satın alma tarihini ve kısa açıklamayı ekleyin.`,
      '5 iş günü içinde yanıt vermeyi hedefleriz. Onaylanırsa Premium erişimi işlem durumuna göre hemen veya iade edilen fatura döneminin sonunda sona erebilir.',
    ]],
    ['Chargeback', [
      'Lütfen chargeback açmadan önce bizimle iletişime geçin; sorunu inceleyip çözebiliriz. Chargeback çözümü yavaşlatabilir ve ödeme itirazı sürerken hesap kısıtlamalarına yol açabilir.',
    ]],
  ],
  cookies: [
    ['Zorunlu Depolama', [
      'Qor AI giriş oturumları, güvenlik token’ları, tema ayarları ve hizmetin çalışması için zorunlu çerezler veya yerel depolama kullanır. Bu depolama olmadan hesap özellikleri doğru çalışmayabilir.',
    ]],
    ['Tarayıcı Dili', [
      'Qor AI manuel dil seçimi gerektirmez. Site tarayıcı dilinizi okur ve desteklenen uygun dili kullanır.',
    ]],
    ['Analiz ve Performans', [
      'Trafiği, özellik kullanımını ve sayfa performansını anlamak için analiz kullanabiliriz. Analizler Qor AI’ı geliştirmemize ve teknik sorunları teşhis etmemize yardımcı olur.',
    ]],
    ['Affiliate Atıf', [
      'Dış mağaza veya perakendeci linklerine tıkladığınızda affiliate partnerleri veya perakendeciler satın alımları ilişkilendirmek için çerez kullanabilir. Bu ürün skorlarını veya ödediğiniz fiyatı değiştirmez.',
    ]],
    ['Checkout ve Ödeme Sağlayıcıları', [
      'Web checkout başlatırsanız Paddle checkout’u çalıştırmak, vergi hesaplamak, dolandırıcılığı önlemek, checkout durumunu hatırlamak ve makbuz oluşturmak için çerez veya benzer teknolojiler kullanabilir. Qor AI Paddle checkout çerezlerini kontrol etmez; Paddle’ı yalnızca ödeme ve abonelik işleme için kullanırız.',
      'Google Play veya Apple App Store üzerinden satın alırsanız bu mağazalar kendi hesap, güvenlik ve faturalama çerezlerini kendi politikalarına göre kullanabilir.',
    ]],
    ['Çerezleri Yönetme', [
      'Çerezleri tarayıcı ayarlarınızdan engelleyebilir veya silebilirsiniz. Zorunlu depolama kapatılırsa özellikle hesap girişi ve checkout gibi bazı özellikler çalışmayabilir.',
    ]],
    ['Çerez Kullanımındaki Değişiklikler', [
      'Analiz, ödeme, affiliate, güvenlik veya destek sağlayıcıları eklediğimizde ya da kaldırdığımızda bu Çerez Politikasını güncelleyebiliriz. Bu sayfadaki güncelleme tarihi geçerli sürümü gösterir.',
    ]],
  ],
  contact: [
    ['E-posta Desteği', [
      `Destek, ödeme, iade, gizlilik, ürün verisi, iş birliği veya basın soruları için ${CONTACT_EMAIL} adresine yazın.`,
      'Qor AI hesap e-postanızı, ilgili ürün linkini veya işlem ID’sini ve sorunun kısa açıklamasını ekleyin. Bu daha hızlı yanıt vermemizi sağlar.',
    ]],
    ['Neleri Eklemelisiniz', [
      'Ödeme veya iade taleplerinde ödeme sağlayıcısını, işlem ID’sini, satın alma tarihini, plan adını ve Qor AI’da kullanılan hesap e-postasını ekleyin. Ürün verisi sorunlarında ürün linkini ve yanlış görünen alanı yazın.',
      'Gizlilik taleplerinde erişim, düzeltme, silme veya başka bir gizlilik işlemi mi istediğinizi açıkça belirtin. Hesap seviyesinde işlem yapmadan önce hesap doğrulaması isteyebiliriz.',
    ]],
    ['Yanıt Süreleri', [
      'Çoğu mesaja birkaç iş günü içinde yanıt vermeyi hedefleriz. Hesap erişimi veya ödeme süresi içerebileceği için fatura, iade ve gizlilik taleplerine öncelik verilir.',
    ]],
    ['Hangi Konularda Yardım Ederiz', [
      'Hesap erişimi, Premium durumu, Paddle checkout soruları, uygulama mağazası abonelikleri, iade talepleri, ürün verisi düzeltmeleri, link analizi sorunları ve gizlilik taleplerinde yardımcı olabiliriz.',
    ]],
    ['Güvenlik ve Kötüye Kullanım Bildirimleri', [
      'Hesabınıza izinsiz erişildiğini düşünüyorsanız, güvenlik sorunu bulduysanız veya şüpheli kullanım görüyorsanız mümkün olduğunca bağlam ekleyerek bize yazın. Şifre, kart numarası veya hassas belgeyi düz e-posta içinde göndermeyin.',
    ]],
  ],
  about: [
    ['Qor AI Ne Yapar', [
      'Qor AI bir ürün araştırma ve karar asistanıdır. Ürün katalog verisi, teknik özellikler, AI analizi, link analizi, karşılaştırmalar, kişisel profil sinyalleri ve abonelik zekasını birleştirerek kullanıcıların daha iyi satın alma kararları vermesine yardımcı olur.',
    ]],
    ['Qor AI Ne Satar', [
      'Qor AI yazılım özelliklerine Premium erişim satar. Premium daha kapsamlı AI kullanımı, görsel tarayıcı, link analizi, ürün analizi, abonelik analizi, genişletilmiş fiyat geçmişi ve daha kişisel öneriler sunar.',
    ]],
    ['Bağımsızlık', [
      'Qor AI bazı dış mağaza linklerinden affiliate komisyonu kazanabilir; ancak komisyonlar ürün skorlarını, Premium önerileri veya AI sonuçlarını belirlemez. Ürün uyumu ve kullanıcı bağlamı ticari ilişkilerden daha önemlidir.',
    ]],
    ['Veri Kaynakları ve AI Sınırları', [
      'Ürün bilgileri herkese açık perakendeci sayfaları, pazar yeri sayfaları, üretici bilgileri, partner feed’leri, kullanıcı etkileşimleri ve AI zenginleştirmesinden gelebilir. Bu keşfi hızlandırır; ancak bazı fiyat, stok veya teknik özellikler Qor AI yenilemeden önce değişebilir.',
      'AI analizi, alternatifleri açıklamak ve doğru soruları görünür yapmak için tasarlanmıştır. Garanti, satıcı taahhüdü, hukuki tavsiye veya nihai uyumluluk güvencesi olarak görülmemelidir.',
    ]],
    ['Ödemeler', [
      'Web ödemeleri merchant of record olarak Paddle tarafından işlenebilir. Mobil satın almalar platform uygunluğuna göre Google Play veya Apple App Store tarafından yönetilebilir.',
    ]],
    ['Qor AI Kimler İçin', [
      'Qor AI teknoloji ürünlerini, abonelikleri ve satın alma seçeneklerini para harcamadan önce karşılaştıran kullanıcılar için tasarlanır. Birkaç ürün linki olup karar öncesi daha net özet isteyen kullanıcılar için de uygundur.',
    ]],
  ],
  faq: [
    ['Qor AI Premium nedir?', [
      'Premium daha yoğun AI kullanımı için ücretli plandır. Qor AI Chat, görsel tarayıcı, ürün AI analizi, link analizi, link karşılaştırma, abonelik analizi, premium öneriler ve genişletilmiş fiyat geçmişi erişimini artırır.',
    ]],
    ['Fiyatlandırma sayfası nerede?', [
      'Fiyatlandırma sayfası /premium adresindedir. Güncel herkese açık fiyatları, deneme bilgisini ve ana Premium özellikleri listeler.',
    ]],
    ['İade alabilir miyim?', [
      'Paddle üzerinden web satın almalarında yeni Premium satın almaları 30 gün içinde iade için uygun olabilir. Yenileme ve uygulama mağazası kuralları İade Politikasında açıklanır.',
    ]],
    ['Premium’u nasıl iptal ederim?', [
      'Web abonelikleri satın alma sonrası sağlanan fatura portalından veya destekle iletişime geçilerek iptal edilebilir. Uygulama mağazası abonelikleri genellikle Google Play veya Apple App Store hesap ayarlarından yönetilmelidir.',
    ]],
    ['Qor AI kart bilgilerimi saklar mı?', [
      'Hayır. Web kart bilgileri Paddle tarafından, uygulama mağazası ödemeleri ilgili mağaza tarafından yönetilir. Qor AI yalnızca Premium’u açmak için gereken sınırlı abonelik durumu verisini saklar.',
    ]],
    ['Web ve mobil ödeme neden farklı olabilir?', [
      'Web satın almaları Paddle tarafından, mobil satın almalar Google Play veya Apple App Store tarafından yönetilebilir. Vergiler, makbuzlar, iade adımları ve abonelik yönetimi farklı olabilir çünkü her sağlayıcı kendi checkout akışını kontrol eder.',
    ]],
    ['AI çıktıları her zaman doğru mu?', [
      'Hayır. AI çıktıları hatalı veya eski olabilir. Qor AI bir araştırma asistanıdır, garanti değildir. Önemli teknik özellikleri, fiyatları ve uyumluluğu resmi satıcı veya üretici kaynaklarından doğrulayın.',
    ]],
    ['Ürün verisi yanlışsa ne yapmalıyım?', [
      `Ürün linkini ve yanlış alanı ${CONTACT_EMAIL} adresine gönderin. Bildirimleri katalog kalitesini iyileştirmek için kullanırız; ancak perakendeci fiyatı ve stok bilgisi yenileme döngümüzden daha hızlı değişebilir.`,
    ]],
    ['Site dili nasıl seçiliyor?', [
      'Web sitesi tarayıcı dilinizi takip eder. Sitede manuel dil seçici yoktur.',
    ]],
  ],
};

COPY.de = {
  common: {
    updated: `Zuletzt aktualisiert: 14. Juni 2026`,
    onThisPage: 'Auf dieser Seite',
    quickLinks: 'Verwandte Richtlinien',
    contact: 'Kontakt',
    email: CONTACT_EMAIL,
    home: 'Startseite',
    premium: 'Premium-Preise',
    legalBrand: 'Qor AI wird unter der Qor AI Einzelunternehmer-/Sole-Proprietor-Marke betrieben. Falls für eine bestimmte Transaktion oder Verifizierung ein formeller rechtlicher Name erforderlich ist, kann er dem Zahlungsanbieter während des Onboardings bereitgestellt werden.',
  },
  terms: [
    ['Wer wir sind', [
      'Qor AI ist ein KI-gestützter Produktberater über qorai.net und die Qor AI Mobil-App. Der Dienst hilft bei Produktsuche, Spezifikationsvergleich, KI-Linkanalyse, visueller Produktsuche, Abo-Bewertung und produktbezogenen Fragen.',
      'Diese Bedingungen gelten für Website, App, Premium-Abonnement, Kontofunktionen, KI-Chat, Linkanalyse, Produktvergleiche und Support. Qor AI wird unter der Qor AI Sole-Proprietor-Marke angeboten.',
    ]],
    ['Annahme der Bedingungen', [
      'Durch Zugriff, Kontoerstellung, Start einer Testphase, Kauf von Premium oder weitere Nutzung akzeptieren Sie diese Bedingungen und unsere Datenschutzerklärung. Wenn Sie nicht zustimmen, dürfen Sie den Dienst nicht nutzen.',
      'Sie müssen mindestens 13 Jahre alt sein oder das in Ihrem Land geltende Mindestalter erreicht haben. Wenn Sie Qor AI für eine andere Person oder Organisation nutzen, bestätigen Sie Ihre Berechtigung dazu.',
    ]],
    ['Leistungsbeschreibung', [
      'Qor AI bietet Katalogsuche, Produktseiten, KI-Produktanalyse, Vergleichstools, Linkanalyse, Abo-Vergleich, Produktscores, persönliche Fit-Signale und Premium-Empfehlungen. Der Dienst unterstützt Kaufrecherche und ersetzt nicht Ihr eigenes Urteil.',
      'Produktdaten können aus öffentlichen Websites, Partnerfeeds, Marktplätzen, Herstellerinformationen, Nutzeraktivität und KI-Anreicherung stammen. Preise, Verfügbarkeit, Spezifikationen und Bewertungen können sich ohne Hinweis ändern.',
    ]],
    ['Konten und Sicherheit', [
      'Einige Funktionen erfordern ein Konto. Sie müssen korrekte Angaben machen, Zugangsdaten schützen und uns bei Verdacht auf unbefugten Zugriff informieren.',
      'Mehrfachkonten zur Umgehung von Qor-Coin-Limits, Testlimits, Missbrauchsprüfungen oder Premium-Beschränkungen sind untersagt.',
    ]],
    ['Premium, Testphasen und Abrechnung', [
      'Qor AI Premium schaltet umfangreichere KI-Nutzung für Chat, visuellen Scanner, Produktanalyse, Linkanalyse, Linkvergleich, Abo-Analyse, Premium-Empfehlungen und erweiterten Preisverlauf frei. Die öffentliche Preisseite ist /premium.',
      'Web-Checkout kann von Paddle als Merchant of Record verarbeitet werden. Mobile Käufe können über Google Play oder Apple App Store laufen. Endpreis, Steuern, Währung, Verlängerungsdatum und Zahlungsmethode werden vor der Bestätigung angezeigt.',
      'Kostenlose Testphasen werden nach Ablauf kostenpflichtig, sofern sie nicht rechtzeitig gekündigt werden. Abonnements verlängern sich automatisch bis zur Kündigung.',
    ]],
    ['Erstattungen und Kündigung', [
      'Kündigung stoppt zukünftige Verlängerungen, erstattet aber nicht automatisch bereits erfolgte Zahlungen. Die Erstattungsfähigkeit steht in unserer Rückerstattungsrichtlinie.',
      'Für Paddle-Webkäufe senden Sie Erstattungsanfragen an Qor AI Support. Für Google Play oder Apple App Store Käufe kann eine Anfrage direkt beim jeweiligen Store erforderlich sein.',
    ]],
    ['KI-Ausgaben und Produktberatung', [
      'Qor AI nutzt KI-Modelle, um Produktinformationen zusammenzufassen, Spezifikationen zu interpretieren und Empfehlungen zu erzeugen. KI-Ausgaben können unvollständig, veraltet oder falsch sein.',
      'Qor AI bietet keine Finanz-, Rechts-, Medizin- oder Berufsberatung. Prüfen Sie wichtige Produktdetails, Preise und Kompatibilität vor dem Kauf beim Händler oder Hersteller.',
    ]],
    ['Affiliate- und Drittanbieterlinks', [
      'Einige Händlerlinks können Affiliate-Links sein. Qor AI kann eine Provision erhalten; der Preis für Sie ändert sich nicht und Scores oder Empfehlungen werden dadurch nicht gesteuert.',
      'Qor AI ist nicht Verkäufer der gezeigten physischen Drittprodukte. Händler und Marktplätze verantworten Preise, Versand, Rückgaben, Garantien und Produktangaben.',
    ]],
    ['Zulässige Nutzung', [
      'Großflächiges Scraping, Reverse Engineering privater APIs, Angriffe, Umgehung von Limits, Testmissbrauch, rechtswidrige Inhalte, Identitätstäuschung und irreführende Nutzung von Qor AI Ausgaben sind untersagt.',
    ]],
    ['Geistiges Eigentum', [
      'Name, Logo, Interface, Code, Rankingmethoden, Prompts, Datenbanken, Design und Originalinhalte gehören Qor AI oder Lizenzgebern. Ihre eigenen Eingaben bleiben Ihre Daten; wir verarbeiten sie zur Bereitstellung und Verbesserung des Dienstes.',
    ]],
    ['Verfügbarkeit und Beendigung', [
      'Wir können Teile von Qor AI verbessern, ändern, pausieren oder einstellen. Wir garantieren nicht, dass jede Funktion, Datenquelle, jeder KI-Anbieter oder jede Kategorie dauerhaft verfügbar bleibt.',
      'Bei Verstoß gegen diese Bedingungen, Sicherheitsrisiken, Betrug oder Missbrauch können wir den Zugang aussetzen oder beenden.',
    ]],
    ['Haftungsausschluss', [
      'Qor AI wird "wie besehen" und "wie verfügbar" bereitgestellt. Soweit gesetzlich zulässig, haften wir nicht für indirekte Schäden, entgangene Gewinne, Datenverlust, Kaufentscheidungen oder Probleme mit Drittanbietern.',
    ]],
    ['Kontakt', [
      `Fragen zu diesen Bedingungen senden Sie bitte an ${CONTACT_EMAIL}. Bitte geben Sie die E-Mail Ihres Qor AI Kontos und eine klare Beschreibung an.`,
    ]],
  ],
  privacy: [
    ['Erhobene Informationen', [
      'Wir erheben Kontodaten wie E-Mail-Adresse, Anzeigename, Authentifizierungsanbieter, Kontostatus, Verifizierungsstatus und Profileinstellungen. Bei Empfehlungsprofilen können Budget, Interessen, Geräte, Abonnements, Prioritäten und Quizantworten gespeichert werden.',
      'Zur Bereitstellung erfassen wir Suchanfragen, Produktaufrufe, Vergleichslisten, Linkanalysen, KI-Chat-Prompts, Produktscans, Abo-Analyse-Eingaben, Qor-Coin-Nutzung, Premium-Status und Supportinteraktionen.',
    ]],
    ['Zahlungs- und Abodaten', [
      'Wenn Webzahlungen von Paddle verarbeitet werden, handelt Paddle als Merchant of Record und verarbeitet Kartendaten, Steuern, Rechnungen, Belege, Betrugsprüfungen und Zahlungs-Compliance. Qor AI speichert keine vollständigen Kartennummern oder CVV.',
      'Wir können begrenzte Abodaten von Paddle oder App-Stores erhalten, etwa Produkt-ID, Plan, Kunden-ID, Transaktion, Verlängerungsstatus, Kündigungsstatus, Land, Währung, Kaufdatum und Berechtigungsstatus.',
    ]],
    ['KI-Eingaben und Produktlinks', [
      'Bei Fragen, Produktlinks, Produktanalysen oder Abo-Vergleichen können relevante Texte, URLs, Produktkontext und Profilsignale an KI-Anbieter gesendet werden, um eine Antwort zu erzeugen.',
      'Senden Sie keine sensiblen personenbezogenen Daten, Passwörter, Ausweisdaten, Gesundheitsakten oder Kartendaten in KI-Prompts.',
    ]],
    ['Nutzung der Daten', [
      'Wir nutzen Daten für Authentifizierung, Qor-Coin-Balance, Premium-Freischaltung, KI-Antworten, Personalisierung, Missbrauchsprävention, Support, Fehlerbehebung und aggregierte Produktperformance.',
      'Wir verkaufen keine personenbezogenen Daten und nutzen private Profile oder Chatverläufe nicht zum Verkauf von Werbeprofilen.',
    ]],
    ['Dienstleister', [
      'Qor AI kann vertrauenswürdige Anbieter für Hosting, Authentifizierung, Datenbank, KI, Analytik, E-Mail, Zahlungen, Affiliate-Zuordnung und Fehlermonitoring nutzen.',
      'Beispiele sind PocketBase-Infrastruktur, KI-Modellanbieter, Analytiktools, Paddle für Webabrechnung, App-Stores für mobile Abrechnung und Affiliate- oder Händlernetzwerke nach Klick auf externe Links.',
    ]],
    ['Cookies, lokaler Speicher und Analytik', [
      'Die Website nutzt notwendigen lokalen Speicher und Cookies für Sitzungen, Theme, Sicherheit und Betrieb. Die Sprache folgt der Browsersprache; es gibt keinen manuellen Sprachschalter.',
      'Analytik kann Seitenbesuche, Feature-Nutzung und technische Performance messen. Affiliate-Partner oder Händler können nach externen Klicks Cookies zur Zuordnung setzen.',
    ]],
    ['Aufbewahrung', [
      'Kontodaten bleiben während aktiver Konten gespeichert. Abo- und Transaktionsdaten bleiben so lange gespeichert, wie es für Buchhaltung, Steuern, Betrugsprävention, Chargebacks und Compliance nötig ist.',
      'Nach Kontolöschung entfernen wir aktive Kontodaten nach Möglichkeit innerhalb von 30 Tagen. Backups, Logs und Zahlungsdaten können begrenzt weiterbestehen.',
    ]],
    ['Sicherheit', [
      'Wir nutzen HTTPS, Zugriffskontrollen, tokenbasierte Authentifizierung, serverseitige Berechtigungen und Monitoring. Kein Onlinedienst ist perfekt sicher, aber wir reduzieren Risiken mit angemessenen Maßnahmen.',
    ]],
    ['Ihre Rechte', [
      'Je nach Standort können Sie Auskunft, Berichtigung, Löschung, Einschränkung, Übertragbarkeit oder Widerspruch verlangen.',
      `Zur Ausübung dieser Rechte kontaktieren Sie ${CONTACT_EMAIL}. Wir müssen Ihr Konto möglicherweise verifizieren.`,
    ]],
    ['Kinder', [
      'Qor AI richtet sich nicht an Kinder unter 13 Jahren. Wenn Sie glauben, dass ein Kind Daten ohne Zustimmung bereitgestellt hat, kontaktieren Sie uns.',
    ]],
    ['Änderungen', [
      'Wir können diese Datenschutzerklärung aktualisieren, wenn sich Dienst, Anbieter, Gesetze oder Zahlungsflüsse ändern. Das Datum auf dieser Seite zeigt die aktuelle Version.',
    ]],
  ],
  refund: [
    ['Zusammenfassung', [
      'Diese Richtlinie erklärt, wann Qor AI Premium Käufe erstattet werden können, wie Sie eine Erstattung anfordern und welcher Zahlungsanbieter den Ablauf steuert.',
    ]],
    ['Webkäufe über Paddle', [
      'Für neue Qor AI Premium Käufe über Paddle-Webcheckout können Sie innerhalb von 30 Tagen nach Erstkauf eine Erstattung anfordern, wenn der Dienst Ihre Erwartungen nicht erfüllt oder der Kauf versehentlich erfolgte.',
      'Genehmigte Erstattungen werden nach Möglichkeit über Paddle auf die ursprüngliche Zahlungsmethode ausgeführt.',
    ]],
    ['Verlängerungen und Änderungen', [
      'Verlängerungen können erstattungsfähig sein, wenn Sie uns innerhalb von 14 Tagen kontaktieren und nach der Verlängerung keine intensive Nutzung stattfand.',
      'Teilweise Erstattungen, Upgrades, Downgrades und anteilige Credits können je nach Abostatus von Paddle verarbeitet werden.',
    ]],
    ['Mobile App-Käufe', [
      'Käufe über Google Play oder Apple App Store werden vom jeweiligen Store kontrolliert. In manchen Fällen muss die Erstattung direkt dort beantragt werden.',
      'Bitte senden Sie Store-Bestell-ID, Qor AI Konto-E-Mail und Grund der Anfrage, damit wir den richtigen nächsten Schritt nennen können.',
    ]],
    ['Wann Erstattungen abgelehnt werden können', [
      'Erstattungen können bei Missbrauch, Betrug, wiederholten Anfragen, Account-Sharing, Limitumgehung, Chargeback-Missbrauch, Verstoß gegen Bedingungen oder verspäteten Anfragen abgelehnt werden.',
      'Diese Richtlinie gilt nicht für physische Drittprodukte, Händlerkäufe, Marktplatzbestellungen, Versand, Garantien oder Rückgaben externer Shops.',
    ]],
    ['Erstattung anfordern', [
      `Senden Sie eine E-Mail an ${CONTACT_EMAIL} mit dem Betreff "Refund request". Nennen Sie Konto-E-Mail, Zahlungsanbieter, Transaktions- oder Bestell-ID, Kaufdatum und kurze Erklärung.`,
      'Wir bemühen uns, innerhalb von 5 Werktagen zu antworten. Bei Genehmigung kann Premium-Zugang je nach Transaktion sofort oder am Ende der erstatteten Periode enden.',
    ]],
    ['Chargebacks', [
      'Bitte kontaktieren Sie uns vor einem Chargeback, damit wir den Fall prüfen können. Chargebacks können die Lösung verzögern und vorübergehende Kontobeschränkungen auslösen.',
    ]],
  ],
  cookies: [
    ['Notwendige Speicherung', [
      'Qor AI nutzt notwendige Cookies oder lokalen Speicher für Sitzungen, Sicherheitstoken, Theme-Einstellungen und Betrieb. Ohne diese Speicherung funktionieren Kontofunktionen möglicherweise nicht.',
    ]],
    ['Browsersprache', [
      'Qor AI benötigt keine manuelle Sprachauswahl. Die Website liest Ihre Browsersprache und nutzt eine passende unterstützte Sprache.',
    ]],
    ['Analytik und Performance', [
      'Wir können Analytik verwenden, um Traffic, Feature-Nutzung und Seitenperformance zu verstehen und technische Probleme zu diagnostizieren.',
    ]],
    ['Affiliate-Zuordnung', [
      'Nach Klicks auf externe Shop- oder Händlerlinks können Affiliate-Partner oder Händler Cookies zur Kaufzuordnung setzen. Dies ändert weder Scores noch Preis.',
    ]],
    ['Checkout und Zahlungsanbieter', [
      'Wenn Sie einen Web-Checkout starten, kann Paddle Cookies oder ähnliche Technologien für Checkout-Betrieb, Steuerberechnung, Betrugsprävention, Checkout-Status und Belege nutzen. Qor AI kontrolliert Paddle-Checkout-Cookies nicht, nutzt Paddle aber nur für Zahlungs- und Abonnementverarbeitung.',
      'Bei Käufen über Google Play oder Apple App Store können diese Stores eigene Konto-, Sicherheits- und Abrechnungscookies nach ihren eigenen Richtlinien verwenden.',
    ]],
    ['Cookies verwalten', [
      'Sie können Cookies im Browser blockieren oder löschen. Einige Funktionen wie Login und Checkout funktionieren dann möglicherweise nicht.',
    ]],
    ['Änderungen der Cookie-Nutzung', [
      'Wir können diese Cookie-Richtlinie aktualisieren, wenn Analyse-, Zahlungs-, Affiliate-, Sicherheits- oder Supportanbieter hinzukommen oder entfernt werden. Das Datum auf dieser Seite zeigt die aktuelle Version.',
    ]],
  ],
  contact: [
    ['E-Mail-Support', [
      `Für Support, Abrechnung, Erstattung, Datenschutz, Produktdaten, Partnerschaften oder Presse schreiben Sie an ${CONTACT_EMAIL}.`,
      'Bitte nennen Sie Konto-E-Mail, relevanten Produktlink oder Transaktions-ID und eine kurze Beschreibung.',
    ]],
    ['Was Sie angeben sollten', [
      'Bei Zahlungs- oder Erstattungsfragen nennen Sie Zahlungsanbieter, Transaktions-ID, Kaufdatum, Planname und die in Qor AI verwendete Konto-E-Mail. Bei Produktdatenproblemen senden Sie den Produktlink und das falsch wirkende Feld.',
      'Bei Datenschutzanfragen geben Sie klar an, ob Sie Auskunft, Berichtigung, Löschung oder eine andere Datenschutzmaßnahme wünschen. Vor Kontomaßnahmen kann eine Verifizierung erforderlich sein.',
    ]],
    ['Antwortzeiten', [
      'Wir versuchen, die meisten Nachrichten innerhalb weniger Werktage zu beantworten. Abrechnung, Erstattung und Datenschutz werden priorisiert.',
    ]],
    ['Wobei wir helfen', [
      'Wir helfen bei Kontozugriff, Premium-Status, Paddle-Checkout, App-Store-Abos, Erstattungen, Produktdatenkorrekturen, Linkanalyse und Datenschutzanfragen.',
    ]],
    ['Sicherheits- und Missbrauchsmeldungen', [
      'Wenn Sie unbefugten Kontozugriff vermuten, ein Sicherheitsproblem gefunden haben oder verdächtige Nutzung sehen, kontaktieren Sie uns mit möglichst viel Kontext. Senden Sie keine Passwörter, Kartennummern oder sensiblen Dokumente per normaler E-Mail.',
    ]],
  ],
  about: [
    ['Was Qor AI macht', [
      'Qor AI ist ein Produktrecherche- und Entscheidungsassistent. Produktdaten, Spezifikationen, KI-Analyse, Linkanalyse, Vergleiche, Profilsignale und Abo-Intelligenz helfen bei besseren Kaufentscheidungen.',
    ]],
    ['Was Qor AI verkauft', [
      'Qor AI verkauft Premium-Zugang zu Softwarefunktionen: mehr KI-Nutzung, visueller Scanner, Linkanalyse, Produktanalyse, Abo-Analyse, erweiterter Preisverlauf und persönlichere Empfehlungen.',
    ]],
    ['Unabhängigkeit', [
      'Qor AI kann Affiliate-Provisionen aus externen Shoplinks erhalten. Provisionen bestimmen jedoch keine Scores, Premium-Empfehlungen oder KI-Ergebnisse.',
    ]],
    ['Datenquellen und KI-Grenzen', [
      'Produktinformationen können aus öffentlichen Händlerseiten, Marktplätzen, Herstellerinformationen, Partnerfeeds, Nutzerinteraktionen und KI-Anreicherung stammen. Das beschleunigt Recherche, bedeutet aber auch, dass Preise, Verfügbarkeit oder Spezifikationen sich vor der nächsten Aktualisierung ändern können.',
      'KI-Analyse soll Abwägungen erklären und nützliche Fragen sichtbar machen. Sie ist keine Garantie, kein Händler-Versprechen, keine Rechtsberatung und keine endgültige Kompatibilitätszusage.',
    ]],
    ['Zahlungen', [
      'Webzahlungen können von Paddle als Merchant of Record verarbeitet werden. Mobile Käufe können je nach Plattform über Google Play oder Apple App Store laufen.',
    ]],
    ['Für wen Qor AI gedacht ist', [
      'Qor AI ist für Menschen gedacht, die Technologieprodukte, Abonnements und Kaufoptionen vergleichen, bevor sie Geld ausgeben. Es hilft auch, wenn mehrere Produktlinks vorliegen und eine klarere Zusammenfassung vor der Entscheidung benötigt wird.',
    ]],
  ],
  faq: [
    ['Was ist Qor AI Premium?', [
      'Premium ist der kostenpflichtige Plan für intensivere KI-Nutzung. Er erweitert Chat, visuellen Scanner, Produktanalyse, Linkanalyse, Abo-Analyse, Premium-Empfehlungen und Preisverlauf.',
    ]],
    ['Wo ist die Preisseite?', [
      'Die Preisseite ist /premium. Dort stehen aktuelle Preise, Testphase und Hauptfunktionen.',
    ]],
    ['Kann ich eine Erstattung erhalten?', [
      'Für Webkäufe über Paddle können neue Premium-Käufe innerhalb von 30 Tagen erstattungsfähig sein. Details stehen in der Rückerstattungsrichtlinie.',
    ]],
    ['Wie kündige ich Premium?', [
      'Web-Abonnements können über das nach dem Kauf bereitgestellte Abrechnungsportal oder über den Support gekündigt werden. App-Store-Abos müssen in der Regel in den Google Play oder Apple App Store Kontoeinstellungen verwaltet werden.',
    ]],
    ['Speichert Qor AI Kartendaten?', [
      'Nein. Web-Kartendaten verarbeitet Paddle, App-Store-Zahlungen verarbeitet der jeweilige Store. Qor AI speichert nur begrenzte Statusdaten zur Premium-Freischaltung.',
    ]],
    ['Warum können Web- und Mobilabrechnung unterschiedlich sein?', [
      'Webkäufe können über Paddle laufen, mobile Käufe über Google Play oder Apple App Store. Steuern, Belege, Erstattungsschritte und Abonnementverwaltung können abweichen, weil jeder Anbieter seinen Checkout selbst kontrolliert.',
    ]],
    ['Sind KI-Ausgaben immer korrekt?', [
      'Nein. KI kann falsch oder veraltet sein. Prüfen Sie wichtige Spezifikationen, Preise und Kompatibilität bei offiziellen Quellen.',
    ]],
    ['Was tun, wenn Produktdaten falsch sind?', [
      `Senden Sie den Produktlink und das falsche Feld an ${CONTACT_EMAIL}. Wir nutzen Meldungen zur Verbesserung der Katalogqualität, aber Händlerpreise und Lagerbestände können sich schneller ändern als unser Aktualisierungszyklus.`,
    ]],
    ['Wie wird die Sprache gewählt?', [
      'Die Website folgt Ihrer Browsersprache. Es gibt keinen manuellen Sprachschalter.',
    ]],
  ],
};

function textFor(lang, key) {
  const page = META[key] || META.terms;
  return page[lang] || page.en;
}

export default function LegalPage({ kind }) {
  const { lang } = useI18n();
  const copy = COPY[lang] || COPY.en;
  const common = copy.common;
  const [title, desc] = textFor(lang, kind);
  const sections = copy[kind] || COPY.en[kind] || [];
  const meta = META[kind] || META.terms;

  useSeo({
    title: `${title} - Qor AI`,
    description: desc,
    path: meta.path,
    type: 'article',
  });

  return (
    <div className="legal-page">
      <section className="legal-hero">
        <div className="container legal-hero-inner">
          <span className="legal-mark">{meta.icon}</span>
          <div>
            <p className="legal-kicker">QOR AI</p>
            <h1>{title}</h1>
            <p>{desc}</p>
            <div className="legal-meta">
              <span>{common.updated}</span>
              <span>qorai.net{meta.path}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="container legal-shell">
        <aside className="legal-toc">
          <strong>{common.onThisPage}</strong>
          {sections.map(([sectionTitle], index) => (
            <a key={sectionTitle} href={`#s${index + 1}`}>{index + 1}. {sectionTitle}</a>
          ))}
        </aside>

        <article className="legal-doc">
          <div className="legal-note">
            <strong>Qor AI</strong>
            <p>{common.legalBrand}</p>
          </div>

          {sections.map(([sectionTitle, paragraphs], index) => (
            <section className="legal-section" id={`s${index + 1}`} key={sectionTitle}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <h2>{sectionTitle}</h2>
              {paragraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </section>
          ))}

          <div className="legal-actions">
            <Link className="btn btn-ghost" to="/">{common.home}</Link>
            <Link className="btn btn-grad" to="/premium">{common.premium}</Link>
            <a className="btn btn-ghost" href={`mailto:${CONTACT_EMAIL}`}>{common.contact}</a>
          </div>
        </article>

        <aside className="legal-related">
          <strong>{common.quickLinks}</strong>
          <Link to="/terms">{textFor(lang, 'terms')[0]}</Link>
          <Link to="/privacy">{textFor(lang, 'privacy')[0]}</Link>
          <Link to="/refund">{textFor(lang, 'refund')[0]}</Link>
          <Link to="/cookies">{textFor(lang, 'cookies')[0]}</Link>
          <Link to="/contact">{textFor(lang, 'contact')[0]}</Link>
        </aside>
      </section>
    </div>
  );
}
