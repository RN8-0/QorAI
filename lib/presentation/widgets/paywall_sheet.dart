/// Qor AI — Premium Paywall Screen (v2)
/// Dark glassmorphism design, Free vs Pro comparison, 3-day trial
library;

import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:qor_ai/core/errors.dart';
import 'package:qor_ai/core/spec_word_dictionary.dart' as spec_dict;
import 'package:qor_ai/core/theme.dart';
import 'package:qor_ai/core/constants.dart';
import 'package:qor_ai/presentation/providers/providers.dart';
import 'package:qor_ai/core/pb_client.dart';
import 'package:in_app_purchase/in_app_purchase.dart';
import 'package:qor_ai/routing/router.dart';
import 'package:qor_ai/services/subscription_service.dart';

const _kPremiumBase = AppTheme.premiumGold;
const _kPremiumLight = AppTheme.premiumChampagne;
const _kPremiumDeep = AppTheme.premiumBronze;
const _kPremiumGradient = AppTheme.premiumGradient;

const Map<String, Map<String, String>> _paywallExactTranslations = {
  'You are a yearly subscriber': {
    'de': 'Sie haben ein Jahresabo',
    'es': 'Tienes una suscripcion anual',
    'fr': 'Vous avez un abonnement annuel',
    'it': 'Hai un abbonamento annuale',
    'ja': '年間プランをご利用中です',
    'nl': 'Je hebt een jaarabonnement',
    'pl': 'Masz subskrypcje roczna',
    'pt': 'Voce tem uma assinatura anual',
    'sv': 'Du har en arsprenumeration',
    'ar': 'لديك اشتراك سنوي',
  },
  'You are a monthly subscriber': {
    'de': 'Sie haben ein Monatsabo',
    'es': 'Tienes una suscripcion mensual',
    'fr': 'Vous avez un abonnement mensuel',
    'it': 'Hai un abbonamento mensile',
    'ja': '月額プランをご利用中です',
    'nl': 'Je hebt een maandabonnement',
    'pl': 'Masz subskrypcje miesieczna',
    'pt': 'Voce tem uma assinatura mensal',
    'sv': 'Du har en manadsprenumeration',
    'ar': 'لديك اشتراك شهري',
  },
  'You are a premium subscriber': {
    'de': 'Sie sind Premium-Abonnent',
    'es': 'Eres suscriptor premium',
    'fr': 'Vous etes abonne premium',
    'it': 'Sei un abbonato premium',
    'ja': 'プレミアム会員です',
    'nl': 'Je bent premium-abonnee',
    'pl': 'Masz subskrypcje premium',
    'pt': 'Voce e assinante premium',
    'sv': 'Du ar premiumprenumerant',
    'ar': 'أنت مشترك بريميوم',
  },
  'Unknown': {
    'de': 'Unbekannt',
    'es': 'Desconocido',
    'fr': 'Inconnu',
    'it': 'Sconosciuto',
    'ja': '不明',
    'nl': 'Onbekend',
    'pl': 'Nieznane',
    'pt': 'Desconhecido',
    'sv': 'Okant',
    'ar': 'غير معروف',
  },
  'Your premium benefits are active and all limits are unlocked.': {
    'de':
        'Deine Premium-Vorteile sind aktiv und alle Limits wurden freigeschaltet.',
    'es':
        'Tus ventajas premium estan activas y todos los limites se han desbloqueado.',
    'fr':
        'Vos avantages premium sont actifs et toutes les limites sont debloquees.',
    'it':
        'I tuoi vantaggi premium sono attivi e tutti i limiti sono sbloccati.',
    'ja': 'プレミアム特典が有効で、すべての制限が解除されています。',
    'nl': 'Je premiumvoordelen zijn actief en alle limieten zijn ontgrendeld.',
    'pl':
        'Twoje korzysci premium sa aktywne i wszystkie limity zostaly odblokowane.',
    'pt':
        'Seus beneficios premium estao ativos e todos os limites foram liberados.',
    'sv': 'Dina premiumfordelar ar aktiva och alla gransningar ar upplasta.',
    'ar': 'مزايا بريميوم الخاصة بك مفعلة وتم فتح جميع الحدود.',
  },
  'Started on': {
    'de': 'Begonnen am',
    'es': 'Inicio',
    'fr': 'Commence le',
    'it': 'Iniziato il',
    'ja': '開始日',
    'nl': 'Gestart op',
    'pl': 'Rozpoczeto',
    'pt': 'Iniciado em',
    'sv': 'Startade den',
    'ar': 'تاريخ البدء',
  },
  'Estimated renewal / end': {
    'de': 'Geschatzte Verlangerung / Ende',
    'es': 'Renovacion / fin estimado',
    'fr': 'Renouvellement / fin estime',
    'it': 'Rinnovo / fine stimata',
    'ja': '更新予定 / 終了日',
    'nl': 'Geschatte verlenging / einddatum',
    'pl': 'Szacowane odnowienie / zakonczenie',
    'pt': 'Renovacao / termino estimado',
    'sv': 'Beraknad fornyelse / slutdatum',
    'ar': 'التجديد / الانتهاء المتوقع',
  },
  'Active plan': {
    'de': 'Aktiver Plan',
    'es': 'Plan activo',
    'fr': 'Forfait actif',
    'it': 'Piano attivo',
    'ja': '現在のプラン',
    'nl': 'Actief plan',
    'pl': 'Aktywny plan',
    'pt': 'Plano ativo',
    'sv': 'Aktiv plan',
    'ar': 'الخطة النشطة',
  },
  'Yearly': {
    'de': 'Jahrlich',
    'es': 'Anual',
    'fr': 'Annuel',
    'it': 'Annuale',
    'ja': '年間',
    'nl': 'Jaarlijks',
    'pl': 'Roczny',
    'pt': 'Anual',
    'sv': 'Arlig',
    'ar': 'سنوي',
  },
  'Monthly': {
    'de': 'Monatlich',
    'es': 'Mensual',
    'fr': 'Mensuel',
    'it': 'Mensile',
    'ja': '月額',
    'nl': 'Maandelijks',
    'pl': 'Miesieczny',
    'pt': 'Mensal',
    'sv': 'Manad',
    'ar': 'شهري',
  },
  'Free': {
    'de': 'Kostenlos',
    'es': 'Gratis',
    'fr': 'Gratuit',
    'it': 'Gratis',
    'ja': '無料',
    'nl': 'Gratis',
    'pl': 'Darmowy',
    'pt': 'Gratis',
    'sv': 'Gratis',
    'ar': 'مجاني',
  },
  'Your subscription is active. You can manage it from Google Play anytime.': {
    'de':
        'Dein Abo ist aktiv. Du kannst es jederzeit uber Google Play verwalten.',
    'es':
        'Tu suscripcion esta activa. Puedes gestionarla cuando quieras desde Google Play.',
    'fr':
        'Votre abonnement est actif. Vous pouvez le gerer a tout moment depuis Google Play.',
    'it':
        'Il tuo abbonamento e attivo. Puoi gestirlo in qualsiasi momento da Google Play.',
    'ja': 'サブスクリプションは有効です。Google Play からいつでも管理できます。',
    'nl':
        'Je abonnement is actief. Je kunt het altijd beheren via Google Play.',
    'pl':
        'Twoja subskrypcja jest aktywna. Mozesz nia zarzadzac w dowolnym momencie w Google Play.',
    'pt':
        'Sua assinatura esta ativa. Voce pode gerencia-la a qualquer momento pelo Google Play.',
    'sv':
        'Din prenumeration ar aktiv. Du kan hantera den nar som helst via Google Play.',
    'ar': 'اشتراكك نشط. يمكنك إدارته في أي وقت من خلال Google Play.',
  },
  'Smart Link Analysis': {
    'de': 'Intelligente Link-Analyse',
    'es': 'Analisis inteligente de enlaces',
    'fr': 'Analyse intelligente des liens',
    'it': 'Analisi intelligente dei link',
    'ja': 'スマートリンク分析',
    'nl': 'Slimme linkanalyse',
    'pl': 'Inteligentna analiza linkow',
    'pt': 'Analise inteligente de links',
    'sv': 'Smart lankanalys',
    'ar': 'تحليل الروابط الذكي',
  },
  'Paste any product URL for instant AI product analysis.': {
    'de':
        'Fuge eine beliebige Produkt-URL ein, um sofort eine KI-Analyse zu erhalten.',
    'es':
        'Pega cualquier URL de producto para obtener un analisis instantaneo con IA.',
    'fr':
        'Collez n importe quelle URL produit pour obtenir instantanement une analyse IA.',
    'it': 'Incolla qualsiasi URL prodotto per ottenere subito un analisi AI.',
    'ja': '商品のURLを貼り付けるだけで、AIによる即時分析を取得できます。',
    'nl': 'Plak een product-URL voor directe AI-productanalyse.',
    'pl':
        'Wklej dowolny adres URL produktu, aby natychmiast uzyskac analize AI.',
    'pt':
        'Cole qualquer URL de produto para obter uma analise instantanea com IA.',
    'sv': 'Klistra in valfri produkt-URL for omedelbar AI-analys.',
    'ar': 'الصق اي رابط منتج للحصول على تحليل فوري بالذكاء الاصطناعي.',
  },
  'Side-by-Side Compare': {
    'de': 'Direkter Vergleich',
    'es': 'Comparacion lado a lado',
    'fr': 'Comparaison cote a cote',
    'it': 'Confronto affiancato',
    'ja': '並べて比較',
    'nl': 'Vergelijk naast elkaar',
    'pl': 'Porownanie obok siebie',
    'pt': 'Comparacao lado a lado',
    'sv': 'Jamfor sida vid sida',
    'ar': 'مقارنة جنبا الى جنب',
  },
  'Compare more products with AI summaries and better context.': {
    'de':
        'Vergleiche mehr Produkte mit KI-Zusammenfassungen und besserem Kontext.',
    'es': 'Compara mas productos con resúmenes de IA y mejor contexto.',
    'fr':
        'Comparez plus de produits avec des resumes IA et un meilleur contexte.',
    'it': 'Confronta piu prodotti con riepiloghi AI e un contesto migliore.',
    'ja': 'AI要約とより良い文脈で、さらに多くの商品を比較できます。',
    'nl': 'Vergelijk meer producten met AI-samenvattingen en betere context.',
    'pl':
        'Porownuj wiecej produktow dzieki podsumowaniom AI i lepszemu kontekstowi.',
    'pt': 'Compare mais produtos com resumos de IA e contexto melhor.',
    'sv': 'Jamfor fler produkter med AI-sammanfattningar och battre kontext.',
    'ar': 'قارن المزيد من المنتجات مع ملخصات الذكاء الاصطناعي وسياق اوضح.',
  },
};

void showPaywallSheet(BuildContext context) {
  context.push(AppRoutes.premium);
}

class PaywallScreen extends ConsumerStatefulWidget {
  const PaywallScreen({super.key});

  @override
  ConsumerState<PaywallScreen> createState() => _PaywallScreenState();
}

class _PaywallScreenState extends ConsumerState<PaywallScreen>
    with TickerProviderStateMixin {
  bool _isLoading = true;
  bool _isPurchasing = false;
  int _selectedPlan = 0; // 0 = yearly (default), 1 = monthly

  late AnimationController _floatController;
  late AnimationController _shimmerController;
  late AnimationController _pulseController;
  late AnimationController _enterController;

  late Animation<double> _floatAnim;
  late Animation<double> _enterAnim;

  String get _languageCode =>
      Localizations.localeOf(context).languageCode.toLowerCase();

  bool get _isTurkish => _languageCode == 'tr';

  String _txt({required String tr, required String en}) {
    if (_isTurkish) return tr;
    if (_languageCode == 'en') return en;

    final exact = _paywallExactTranslations[en]?[_languageCode];
    if (exact != null && exact.isNotEmpty) {
      return exact;
    }

    final translated = spec_dict.translateSpec(en, _languageCode);
    return translated.toLowerCase() != en.toLowerCase() ? translated : en;
  }

  @override
  void initState() {
    super.initState();

    _floatController = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 3),
    )..repeat(reverse: true);
    _shimmerController = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 2),
    )..repeat();
    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1800),
    )..repeat(reverse: true);
    _enterController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 600),
    )..forward();

    _floatAnim = Tween<double>(begin: -6, end: 6).animate(
      CurvedAnimation(parent: _floatController, curve: Curves.easeInOut),
    );
    _enterAnim = CurvedAnimation(
      parent: _enterController,
      curve: Curves.easeOutCubic,
    );

    _loadOfferings();
  }

  @override
  void dispose() {
    _floatController.dispose();
    _shimmerController.dispose();
    _pulseController.dispose();
    _enterController.dispose();
    super.dispose();
  }

  Future<void> _loadOfferings() async {
    final service = ref.read(subscriptionServiceProvider);
    if (!service.isInitialized) {
      await service.initialize();
    }
    if (service.isPremium) {
      await _syncPremiumStatus(service.status);
    }
    if (mounted) {
      setState(() {
        _isLoading = false;
      });
    }
  }

  Future<void> _purchase(ProductDetails product) async {
    setState(() => _isPurchasing = true);
    final service = ref.read(subscriptionServiceProvider);
    final result = await service.purchaseProduct(product);
    if (!mounted) return;
    if (service.isPremium) {
      await _syncPremiumStatus(service.status);
      if (!mounted) return;
    }
    setState(() => _isPurchasing = false);
    switch (result) {
      case Success():
        if (mounted) _showPurchaseSuccessScreen();
      case Failure(error: final e):
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(e.message),
            behavior: SnackBarBehavior.floating,
            backgroundColor: AppTheme.error,
          ),
        );
    }
  }

  Future<void> _restore() async {
    setState(() => _isPurchasing = true);
    final service = ref.read(subscriptionServiceProvider);
    final result = await service.restorePurchases();
    if (!mounted) return;
    setState(() => _isPurchasing = false);
    switch (result) {
      case Success(data: final isPremium):
        if (isPremium) {
          await _syncPremiumStatus(service.status);
          if (!mounted) return;
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(
                context.l10n?.paywallRestoreSuccess ??
                    'Subscription restored! ✅',
              ),
              behavior: SnackBarBehavior.floating,
              backgroundColor: const Color(0xFF10B981),
            ),
          );
        } else {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(
                context.l10n?.paywallNoSubscription ??
                    'No active subscription found',
              ),
              behavior: SnackBarBehavior.floating,
            ),
          );
        }
      case Failure(error: final e):
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(e.message),
            behavior: SnackBarBehavior.floating,
            backgroundColor: AppTheme.error,
          ),
        );
    }
  }

  Future<void> _syncPremiumStatus(SubscriptionStatus status) async {
    final uid = ref.read(authStateProvider).valueOrNull;
    if (uid == null || !status.isPremium) {
      return;
    }

    try {
      final user = ref.read(userProfileProvider).valueOrNull;
      final existingPremium =
          (user?.userSubscriptionDetails['premium'] as Map?) ?? const {};
      // Keep the Play purchase token even if this particular sync didn't carry
      // one (e.g. a status restored without it), so the backend always has a
      // value to verify the subscription against Google Play.
      final purchaseToken =
          status.purchaseToken ?? existingPremium['purchaseToken'] as String?;
      final details = <String, Map<String, dynamic>>{
        ...?user?.userSubscriptionDetails,
        'premium': {
          'productId': status.activeProductId,
          'planType': _planType(status.activeProductId),
          if (status.purchaseDate != null)
            'startedAt': status.purchaseDate!.toIso8601String(),
          if (status.expirationDate != null)
            'expiresAt': status.expirationDate!.toIso8601String(),
          if (purchaseToken != null && purchaseToken.isNotEmpty)
            'purchaseToken': purchaseToken,
          'source': 'google_play',
          'updatedAt': DateTime.now().toIso8601String(),
        },
      };

      await ref.read(pbDataSourceProvider).updateUser(uid, {
        'isPremium': true,
        'userSubscriptionDetails': details,
      });
      ref.invalidate(userProfileProvider);
    } catch (_) {}
  }

  String _planType(String? productId) {
    if (productId == AppConstants.yearlySubscriptionId) return 'yearly';
    if (productId == AppConstants.monthlySubscriptionId) return 'monthly';
    return 'premium';
  }

  String _planLabel(String? productId) {
    return switch (_planType(productId)) {
      'yearly' => _txt(
        tr: 'Yıllık abonesiniz',
        en: 'You are a yearly subscriber',
      ),
      'monthly' => _txt(
        tr: 'Aylık abonesiniz',
        en: 'You are a monthly subscriber',
      ),
      _ => _txt(tr: 'Premium abonesiniz', en: 'You are a premium subscriber'),
    };
  }

  ProductDetails? _findProductById(
    List<ProductDetails> products,
    String productId,
  ) {
    for (final product in products) {
      if (product.id == productId) return product;
    }
    return null;
  }

  ProductDetails? _selectedProduct(List<ProductDetails> products) {
    final productId = _selectedPlan == 0
        ? AppConstants.yearlySubscriptionId
        : AppConstants.monthlySubscriptionId;
    return _findProductById(products, productId) ??
        (products.isNotEmpty ? products.first : null);
  }

  String _formatDate(DateTime? date) {
    if (date == null) {
      return _txt(tr: 'Bilinmiyor', en: 'Unknown');
    }
    return MaterialLocalizations.of(context).formatCompactDate(date.toLocal());
  }

  DateTime? _resolveSubscriptionDate(
    SubscriptionStatus status, {
    required bool isStart,
  }) {
    final directDate = isStart ? status.purchaseDate : status.expirationDate;
    if (directDate != null) return directDate;

    if (!isStart &&
        status.purchaseDate != null &&
        status.activeProductId != null) {
      final trialEnds = status.purchaseDate!.add(
        Duration(days: AppConstants.trialDays),
      );
      return status.activeProductId == AppConstants.yearlySubscriptionId
          ? trialEnds.add(const Duration(days: 365))
          : trialEnds.add(const Duration(days: 30));
    }

    final user = ref.read(userProfileProvider).valueOrNull;
    final premiumDetails = user?.userSubscriptionDetails['premium'];
    final profileRawValue = premiumDetails?[isStart ? 'startedAt' : 'expiresAt']
        ?.toString();
    if (profileRawValue != null && profileRawValue.isNotEmpty) {
      final parsed = DateTime.tryParse(profileRawValue);
      if (parsed != null) return parsed;
    }

    final authPremium =
        pb.authStore.record?.data['userSubscriptionDetails']?['premium'];
    if (authPremium is Map) {
      for (final key
          in isStart
              ? const ['startedAt', 'purchaseDate', 'purchasedAt', 'updatedAt']
              : const ['expiresAt', 'expirationDate', 'renewalDate']) {
        final rawValue = authPremium[key]?.toString();
        if (rawValue == null || rawValue.isEmpty) continue;
        final parsed = DateTime.tryParse(rawValue);
        if (parsed != null) return parsed;
      }
    }

    return null;
  }

  String _premiumUpsellSummary() {
    return switch (_languageCode) {
      'ar' =>
        'مقارنات غير محدودة ودردشة AI وتحليل الروابط وتجربة بريميوم انظف.',
      'de' =>
        'Unbegrenzte Vergleiche, AI-Chat, Link-Analyse und ein klareres Premium-Erlebnis.',
      'es' =>
        'Comparaciones ilimitadas, chat con AI, analisis de enlaces y una experiencia premium mas limpia.',
      'fr' =>
        'Comparaisons illimitees, chat AI, analyse de liens et une experience premium plus epuree.',
      'it' =>
        'Confronti illimitati, chat AI, analisi link e un esperienza premium piu pulita.',
      'ja' => '無制限比較、AIチャット、リンク分析、より洗練されたプレミアム体験。',
      'nl' =>
        'Onbeperkt vergelijken, AI-chat, linkanalyse en een schonere premiumervaring.',
      'pl' =>
        'Nielimitowane porownania, czat AI, analiza linkow i czystsze doswiadczenie premium.',
      'pt' =>
        'Comparacoes ilimitadas, chat com AI, analise de links e uma experiencia premium mais limpa.',
      'sv' =>
        'Obegransade jamforelser, AI-chatt, lankanalys och en renare premiumupplevelse.',
      'tr' =>
        'Qor AI Premium ile tüm AI akışlarında sınır kalkar; daha hızlı karar verir, ürünleri daha net tarar ve her öneriyi kendi profilinize göre alırsınız.',
      _ =>
        'Premium removes the cap across every AI flow so you can compare, scan, and ask without slowing down.',
    };
  }

  String _trialStartSummary() {
    return switch (_languageCode) {
      'ar' =>
        '${AppConstants.trialDays} ايام بدون رسوم، ثم تبدأ الخطة التي اخترتها.',
      'de' =>
        '${AppConstants.trialDays} Tage kostenlos, danach startet dein gewahlter Plan.',
      'es' =>
        'Sin cargo durante ${AppConstants.trialDays} dias; luego comienza el plan que elijas.',
      'fr' =>
        'Aucun frais pendant ${AppConstants.trialDays} jours, puis votre formule selectionnee commence.',
      'it' =>
        'Nessun addebito per ${AppConstants.trialDays} giorni, poi parte il piano selezionato.',
      'ja' => '${AppConstants.trialDays}日間は無料、その後選択したプランが開始されます。',
      'nl' =>
        '${AppConstants.trialDays} dagen geen kosten, daarna start je gekozen abonnement.',
      'pl' =>
        'Brak oplat przez ${AppConstants.trialDays} dni, a potem rozpocznie sie wybrany plan.',
      'pt' =>
        'Sem cobranca por ${AppConstants.trialDays} dias; depois seu plano selecionado comeca.',
      'sv' =>
        'Ingen kostnad i ${AppConstants.trialDays} dagar, sedan startar din valda plan.',
      'tr' =>
        '${AppConstants.trialDays} gün ücretsiz, ardından seçtiğiniz plan devreye girer.',
      _ =>
        'No charge for ${AppConstants.trialDays} days, then your selected plan starts.',
    };
  }

  String _limitedByBalanceLabel() {
    return _txt(
      tr: '${AppConstants.qorCurrencyName} bakiyeniz yettiği kadar',
      en: 'As long as your ${AppConstants.qorCurrencyName} balance lasts',
    );
  }

  String _unlimitedCreditsLabel() {
    return _txt(
      tr: 'Sınırsız ${AppConstants.qorCurrencyName}',
      en: 'Unlimited ${AppConstants.qorCurrencyName}',
    );
  }

  void _showPurchaseSuccessScreen() {
    showGeneralDialog(
      context: context,
      barrierDismissible: true,
      barrierLabel: 'PurchaseSuccess',
      barrierColor: Colors.black87,
      transitionDuration: const Duration(milliseconds: 400),
      pageBuilder: (ctx, anim, secondAnim) {
        return FadeTransition(
          opacity: anim,
          child: ScaleTransition(
            scale: Tween<double>(
              begin: 0.8,
              end: 1.0,
            ).animate(CurvedAnimation(parent: anim, curve: Curves.easeOutBack)),
            child: Center(
              child: Container(
                margin: const EdgeInsets.all(32),
                padding: const EdgeInsets.all(28),
                decoration: BoxDecoration(
                  color: context.surfaceElevatedColor,
                  borderRadius: BorderRadius.circular(28),
                  border: Border.all(
                    color: _kPremiumBase.withValues(alpha: 0.3),
                  ),
                  boxShadow: [
                    BoxShadow(
                      color: _kPremiumBase.withValues(alpha: 0.25),
                      blurRadius: 40,
                      offset: const Offset(0, 16),
                    ),
                  ],
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    TweenAnimationBuilder<double>(
                      tween: Tween(begin: 0.0, end: 1.0),
                      duration: const Duration(milliseconds: 800),
                      curve: Curves.elasticOut,
                      builder: (_, val, child) =>
                          Transform.scale(scale: val, child: child),
                      child: Container(
                        width: 88,
                        height: 88,
                        decoration: BoxDecoration(
                          gradient: _kPremiumGradient,
                          shape: BoxShape.circle,
                          boxShadow: [
                            BoxShadow(
                              color: _kPremiumBase.withValues(alpha: 0.4),
                              blurRadius: 24,
                              offset: const Offset(0, 8),
                            ),
                          ],
                        ),
                        child: const Icon(
                          Icons.check_rounded,
                          color: Colors.white,
                          size: 44,
                        ),
                      ),
                    ),
                    const SizedBox(height: 20),
                    Text(
                      _txt(tr: 'Hoşgeldiniz!', en: 'Welcome!'),
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 28,
                        fontWeight: FontWeight.w900,
                        color: context.textPrimary,
                        letterSpacing: -0.5,
                        decoration: TextDecoration.none,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'QOR AI PREMIUM',
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 16,
                        fontWeight: FontWeight.w900,
                        color: _kPremiumBase,
                        letterSpacing: 2,
                        decoration: TextDecoration.none,
                      ),
                    ),
                    const SizedBox(height: 14),
                    Text(
                      _txt(
                        tr: 'Tüm AI özelliklerine sınırsız erişim artık sizin! Keyifle kullanın.',
                        en: 'You now have unlimited access to all AI features! Enjoy.',
                      ),
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 14,
                        color: context.textSecondary,
                        height: 1.5,
                        decoration: TextDecoration.none,
                      ),
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 24),
                    SizedBox(
                      width: double.infinity,
                      height: 50,
                      child: DecoratedBox(
                        decoration: BoxDecoration(
                          gradient: _kPremiumGradient,
                          borderRadius: BorderRadius.circular(14),
                        ),
                        child: ElevatedButton(
                          onPressed: () {
                            Navigator.pop(ctx);
                            setState(() {});
                          },
                          style: ElevatedButton.styleFrom(
                            backgroundColor: Colors.transparent,
                            shadowColor: Colors.transparent,
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(14),
                            ),
                          ),
                          child: Text(
                            _txt(
                              tr: 'Harika, başla!',
                              en: 'Awesome, let\'s go!',
                            ),
                            style: GoogleFonts.plusJakartaSans(
                              fontSize: 15,
                              fontWeight: FontWeight.w800,
                              color: Colors.white,
                              decoration: TextDecoration.none,
                            ),
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        );
      },
    );
  }

  void _handlePurchaseTap() {
    // Auth gate: require logged-in user
    final authRecord = pb.authStore.record;
    if (authRecord == null || !pb.authStore.isValid) {
      context.push(AppRoutes.login);
      return;
    }

    // PocketBase doesn't track provider data the same way — just check auth is valid
    // The subscription service handles the rest

    final service = ref.read(subscriptionServiceProvider);
    final prods = service.products;
    if (prods.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: const Text(
            'Products could not be loaded. Please try again later.',
          ),
          behavior: SnackBarBehavior.floating,
          backgroundColor: AppTheme.error,
        ),
      );
      return;
    }

    final product = _selectedProduct(prods);
    if (product == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            _txt(
              tr: 'Abonelik ürünü yüklenemedi. Lütfen biraz sonra tekrar deneyin.',
              en: 'Subscription product could not be loaded. Please try again.',
            ),
          ),
          behavior: SnackBarBehavior.floating,
          backgroundColor: AppTheme.error,
        ),
      );
      return;
    }
    _purchase(product);
  }

  @override
  Widget build(BuildContext context) {
    final bg = context.backgroundColor;
    final textPrimary = context.textPrimary;
    final service = ref.watch(subscriptionServiceProvider);
    final isPremium = service.isPremium;
    return Scaffold(
      backgroundColor: bg,
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
        leading: IconButton(
          icon: Icon(Icons.arrow_back_ios_new_rounded, color: textPrimary),
          onPressed: () => Navigator.pop(context),
        ),
      ),
      body: FadeTransition(
        opacity: _enterAnim,
        child: Stack(
          children: [
            // Ambient glow orbs
            Positioned(
              top: -50,
              right: -40,
              child: _buildOrb(180, _kPremiumBase, 0.10),
            ),
            Positioned(
              top: 120,
              left: -70,
              child: _buildOrb(150, _kPremiumLight, 0.08),
            ),
            Positioned(
              bottom: 150,
              right: -20,
              child: _buildOrb(130, _kPremiumDeep, 0.08),
            ),

            // Content
            SingleChildScrollView(
              padding: EdgeInsets.only(
                left: 20,
                right: 20,
                top: MediaQuery.of(context).padding.top + kToolbarHeight,
                bottom: MediaQuery.of(context).viewInsets.bottom + 24,
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const SizedBox(height: 20),
                  if (isPremium) ...[
                    _buildActiveSubscriptionSection(service),
                    if (service.status.activeProductId ==
                        AppConstants.monthlySubscriptionId) ...[
                      const SizedBox(height: 20),
                      _buildYearlyUpgradeSection(service),
                    ],
                    const SizedBox(height: 20),
                    _buildComparisonTable(),
                    const SizedBox(height: 20),
                    _buildPremiumMomentumDeck(isPremium: true),
                  ] else ...[
                    _buildHeroSection(),
                    const SizedBox(height: 20),
                    _buildPremiumMomentumDeck(),
                    const SizedBox(height: 20),
                    _buildTrialBanner(),
                    const SizedBox(height: 18),
                    _buildPlanToggle(),
                    const SizedBox(height: 20),
                    _buildComparisonTable(),
                    const SizedBox(height: 22),
                    _buildCTAButton(),
                    const SizedBox(height: 10),
                    _buildRestoreLink(),
                  ],
                  const SizedBox(height: 8),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildOrb(double size, Color color, double opacity) {
    return AnimatedBuilder(
      animation: _floatAnim,
      builder: (context, child) => Transform.translate(
        offset: Offset(0, _floatAnim.value),
        child: Container(
          width: size,
          height: size,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: color.withValues(alpha: opacity),
            boxShadow: [
              BoxShadow(
                color: color.withValues(alpha: opacity * 0.6),
                blurRadius: size * 0.6,
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildHeroSection() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: context.surfaceVariantColor,
        borderRadius: BorderRadius.circular(28),
        border: Border.all(color: _kPremiumBase.withValues(alpha: 0.20)),
        boxShadow: [
          BoxShadow(
            color: _kPremiumBase.withValues(alpha: 0.12),
            blurRadius: 28,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      child: Column(
        children: [
          AnimatedBuilder(
            animation: _floatAnim,
            builder: (context, child) => Transform.translate(
              offset: Offset(0, _floatAnim.value * 0.4),
              child: Container(
                width: 74,
                height: 74,
                decoration: BoxDecoration(
                  gradient: _kPremiumGradient,
                  shape: BoxShape.circle,
                  boxShadow: [
                    BoxShadow(
                      color: _kPremiumBase.withValues(alpha: 0.28),
                      blurRadius: 20,
                      offset: const Offset(0, 8),
                    ),
                  ],
                ),
                child: const Icon(
                  Icons.diamond_rounded,
                  color: Colors.white,
                  size: 34,
                ),
              ),
            ),
          ),
          const SizedBox(height: 14),
          _buildShimmerBadge(),
          const SizedBox(height: 14),
          Text(
            context.l10n?.paywallHeadline ?? 'Unlock Qor AI Premium',
            style: GoogleFonts.plusJakartaSans(
              fontSize: 26,
              fontWeight: FontWeight.w800,
              color: context.textPrimary,
              letterSpacing: -0.5,
              height: 1.15,
            ),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 8),
          Text(
            _premiumUpsellSummary(),
            style: GoogleFonts.plusJakartaSans(
              fontSize: 14,
              color: context.textSecondary,
              height: 1.45,
            ),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 14),
          _buildHeroPills(),
        ],
      ),
    );
  }

  Widget _buildHeroPills() {
    final pills = [
      (
        Icons.chat_bubble_outline_rounded,
        _txt(tr: 'Sınırsız Qor AI Chat', en: 'Unlimited Qor AI Chat'),
      ),
      (
        Icons.image_search_rounded,
        _txt(tr: 'Gelişmiş görsel tarayıcı', en: 'Advanced visual scanner'),
      ),
      (
        Icons.tips_and_updates_rounded,
        _txt(tr: 'Daha akıllı öneriler', en: 'Smarter recommendations'),
      ),
    ];

    return Wrap(
      alignment: WrapAlignment.center,
      spacing: 8,
      runSpacing: 8,
      children: pills
          .map((pill) => _buildHeroPill(icon: pill.$1, label: pill.$2))
          .toList(),
    );
  }

  Widget _buildHeroPill({required IconData icon, required String label}) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: _kPremiumBase.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: _kPremiumBase.withValues(alpha: 0.16)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 15, color: _kPremiumDeep),
          const SizedBox(width: 7),
          Text(
            label,
            style: GoogleFonts.plusJakartaSans(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              color: context.textPrimary,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildShimmerBadge() {
    return AnimatedBuilder(
      animation: _shimmerController,
      builder: (context, child) {
        final shimmer = _shimmerController.value;
        return ClipRRect(
          borderRadius: BorderRadius.circular(20),
          child: ShaderMask(
            shaderCallback: (bounds) => LinearGradient(
              begin: Alignment(shimmer * 3 - 2, 0),
              end: Alignment(shimmer * 3 - 0.5, 0),
              colors: [
                Colors.white.withValues(alpha: 0),
                Colors.white.withValues(alpha: 0.4),
                Colors.white.withValues(alpha: 0),
              ],
            ).createShader(bounds),
            blendMode: BlendMode.srcATop,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [
                    _kPremiumBase.withValues(alpha: 0.18),
                    _kPremiumLight.withValues(alpha: 0.18),
                  ],
                ),
                borderRadius: BorderRadius.circular(20),
                border: Border.all(
                  color: _kPremiumBase.withValues(alpha: 0.28),
                ),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(
                    Icons.auto_awesome_rounded,
                    color: _kPremiumDeep,
                    size: 14,
                  ),
                  const SizedBox(width: 6),
                  Text(
                    'QOR AI PREMIUM',
                    style: GoogleFonts.plusJakartaSans(
                      color: context.textPrimary,
                      fontSize: 12,
                      fontWeight: FontWeight.w900,
                      letterSpacing: 2,
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  Widget _buildTrialBanner() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      decoration: BoxDecoration(
        color: context.surfaceVariantColor,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppTheme.success.withValues(alpha: 0.18)),
      ),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: AppTheme.success.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(12),
            ),
            child: const Icon(
              Icons.workspace_premium_rounded,
              color: AppTheme.success,
              size: 20,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  context.l10n?.paywallTrialBanner ??
                      '${AppConstants.trialDays}-Day Free Trial',
                  style: GoogleFonts.plusJakartaSans(
                    color: context.textPrimary,
                    fontWeight: FontWeight.w700,
                    fontSize: 14,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  _trialStartSummary(),
                  style: GoogleFonts.plusJakartaSans(
                    color: context.textSecondary,
                    fontSize: 12,
                    height: 1.35,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPlanToggle() {
    final service = ref.read(subscriptionServiceProvider);
    final prods = service.products;

    String yearlyPrice;
    String yearlyMonthly;
    String monthlyPrice;
    int savingsPct;

    // Use real Play Store prices when available
    ProductDetails? yearlyProduct;
    ProductDetails? monthlyProduct;
    for (final p in prods) {
      if (p.id == AppConstants.yearlySubscriptionId) yearlyProduct = p;
      if (p.id == AppConstants.monthlySubscriptionId) monthlyProduct = p;
    }

    if (yearlyProduct != null && monthlyProduct != null) {
      yearlyPrice = yearlyProduct.price;
      monthlyPrice = monthlyProduct.price;
      final perMonth = yearlyProduct.rawPrice / 12;
      yearlyMonthly =
          '${perMonth.toStringAsFixed(2)} ${yearlyProduct.currencyCode}/mo';
      savingsPct =
          ((monthlyProduct.rawPrice * 12 - yearlyProduct.rawPrice) /
                  (monthlyProduct.rawPrice * 12) *
                  100)
              .round();
    } else {
      yearlyPrice = '\$${AppConstants.yearlyProPrice.toStringAsFixed(2)}';
      monthlyPrice = '\$${AppConstants.monthlyProPrice.toStringAsFixed(2)}';
      yearlyMonthly =
          '\$${(AppConstants.yearlyProPrice / 12).toStringAsFixed(2)}/mo';
      savingsPct =
          (((AppConstants.monthlyProPrice * 12 - AppConstants.yearlyProPrice) /
                      (AppConstants.monthlyProPrice * 12)) *
                  100)
              .round();
    }

    return Row(
      children: [
        Expanded(
          child: _buildPlanCard(
            index: 0,
            label: context.l10n?.paywallYearly ?? 'Yearly',
            price: yearlyPrice,
            sub: yearlyMonthly,
            badge: 'SAVE $savingsPct%',
            badgeColor: _kPremiumBase,
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: _buildPlanCard(
            index: 1,
            label: context.l10n?.paywallMonthly ?? 'Monthly',
            price: monthlyPrice,
            sub: context.l10n?.paywallBilledMonthly ?? 'billed monthly',
            badge: null,
            badgeColor: Colors.transparent,
          ),
        ),
      ],
    );
  }

  Widget _buildPlanCard({
    required int index,
    required String label,
    required String price,
    required String sub,
    required String? badge,
    required Color badgeColor,
  }) {
    final isSelected = _selectedPlan == index;
    return GestureDetector(
      onTap: () => setState(() => _selectedPlan = index),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(20),
          gradient: isSelected
              ? LinearGradient(
                  colors: [
                    _kPremiumDeep.withValues(alpha: 0.26),
                    _kPremiumBase.withValues(alpha: 0.18),
                    _kPremiumLight.withValues(alpha: 0.16),
                  ],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                )
              : null,
          color: isSelected ? null : context.surfaceVariantColor,
          border: Border.all(
            color: isSelected
                ? _kPremiumBase.withValues(alpha: 0.65)
                : context.dividerColor,
            width: isSelected ? 2 : 1,
          ),
        ),
        child: Column(
          children: [
            if (badge != null)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                margin: const EdgeInsets.only(bottom: 6),
                decoration: BoxDecoration(
                  color: badgeColor.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: badgeColor.withValues(alpha: 0.4)),
                ),
                child: Text(
                  badge,
                  style: GoogleFonts.plusJakartaSans(
                    color: badgeColor,
                    fontSize: 10,
                    fontWeight: FontWeight.w900,
                    letterSpacing: 0.8,
                  ),
                ),
              )
            else
              const SizedBox(height: 21),

            Text(
              label,
              style: GoogleFonts.plusJakartaSans(
                color: isSelected ? context.textPrimary : context.textSecondary,
                fontSize: 13,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              price,
              style: GoogleFonts.plusJakartaSans(
                color: context.textPrimary,
                fontSize: 22,
                fontWeight: FontWeight.w800,
                letterSpacing: -0.5,
              ),
            ),
            Text(
              sub,
              style: GoogleFonts.plusJakartaSans(
                color: context.textTertiaryColor,
                fontSize: 11,
              ),
            ),

            const SizedBox(height: 8),
            AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              width: 24,
              height: 24,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: isSelected ? _kPremiumBase : Colors.transparent,
                border: Border.all(
                  color: isSelected ? _kPremiumBase : context.dividerColor,
                  width: 2,
                ),
              ),
              child: isSelected
                  ? const Icon(
                      Icons.check_rounded,
                      color: Colors.white,
                      size: 14,
                    )
                  : null,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildActiveSubscriptionSection(SubscriptionService service) {
    final status = service.status;
    final accent = status.activeProductId == AppConstants.yearlySubscriptionId
        ? _kPremiumLight
        : _kPremiumBase;

    return Column(
      children: [
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            color: context.surfaceVariantColor,
            borderRadius: BorderRadius.circular(28),
            border: Border.all(
              color: accent.withValues(alpha: 0.28),
              width: 1.4,
            ),
            boxShadow: [
              BoxShadow(
                color: accent.withValues(alpha: 0.12),
                blurRadius: 28,
                offset: const Offset(0, 10),
              ),
            ],
          ),
          child: Column(
            children: [
              Container(
                width: 76,
                height: 76,
                decoration: BoxDecoration(
                  gradient: _kPremiumGradient,
                  shape: BoxShape.circle,
                  boxShadow: [
                    BoxShadow(
                      color: accent.withValues(alpha: 0.3),
                      blurRadius: 24,
                      offset: const Offset(0, 8),
                    ),
                  ],
                ),
                child: const Icon(
                  Icons.diamond_rounded,
                  color: Colors.white,
                  size: 36,
                ),
              ),
              const SizedBox(height: 14),
              _buildShimmerBadge(),
              const SizedBox(height: 14),
              Text(
                _planLabel(status.activeProductId),
                textAlign: TextAlign.center,
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 28,
                  fontWeight: FontWeight.w800,
                  color: context.textPrimary,
                  letterSpacing: -0.5,
                  height: 1.15,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                _txt(
                  tr: 'Qor AI Chat, görsel tarayıcı, link analizi ve premium öneriler artık tamamen açık.',
                  en: 'Qor AI Chat, visual scanner, link analysis, and premium recommendations are fully unlocked.',
                ),
                textAlign: TextAlign.center,
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 14,
                  color: context.textSecondary,
                  height: 1.45,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: context.surfaceVariantColor,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: accent.withValues(alpha: 0.18)),
          ),
          child: Column(
            children: [
              _buildSubscriptionMetaRow(
                icon: Icons.calendar_today_rounded,
                label: _txt(tr: 'Başlangıç tarihi', en: 'Started on'),
                value: _formatDate(
                  _resolveSubscriptionDate(status, isStart: true),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildYearlyUpgradeSection(SubscriptionService service) {
    final status = service.status;
    final prods = service.products;
    final yearlyProduct = _findProductById(
      prods,
      AppConstants.yearlySubscriptionId,
    );
    final isCurrentPlanSelected = _selectedPlan == 1;
    final yearlyLabel =
        yearlyProduct?.price ??
        '\$${AppConstants.yearlyProPrice.toStringAsFixed(2)}/yıl';

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: context.surfaceVariantColor,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: _kPremiumBase.withValues(alpha: 0.18)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            _txt(tr: 'Yıllık plana geç', en: 'Switch to yearly'),
            style: GoogleFonts.plusJakartaSans(
              fontSize: 18,
              fontWeight: FontWeight.w800,
              color: context.textPrimary,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            _txt(
              tr: 'Aylık planınız aktif. Yıllık pakete geçerek daha düşük aylık maliyetle Premium kullanabilirsiniz.',
              en: 'Your monthly plan is active. Move to yearly for a lower effective monthly price.',
            ),
            style: GoogleFonts.plusJakartaSans(
              fontSize: 13,
              color: context.textSecondary,
              height: 1.4,
            ),
          ),
          const SizedBox(height: 16),
          _buildPlanToggle(),
          const SizedBox(height: 14),
          SizedBox(
            width: double.infinity,
            height: 54,
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: isCurrentPlanSelected ? null : _kPremiumGradient,
                color: isCurrentPlanSelected
                    ? context.surfaceElevatedColor
                    : null,
                borderRadius: BorderRadius.circular(18),
                border: Border.all(
                  color: isCurrentPlanSelected
                      ? context.dividerColor
                      : Colors.transparent,
                ),
              ),
              child: ElevatedButton(
                onPressed:
                    (_isPurchasing || _isLoading || isCurrentPlanSelected)
                    ? null
                    : _handlePurchaseTap,
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.transparent,
                  shadowColor: Colors.transparent,
                  disabledBackgroundColor: Colors.transparent,
                  disabledForegroundColor: context.textSecondary,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(18),
                  ),
                ),
                child: _isPurchasing
                    ? const SizedBox(
                        width: 22,
                        height: 22,
                        child: CircularProgressIndicator(
                          strokeWidth: 2.5,
                          valueColor: AlwaysStoppedAnimation(Colors.white),
                        ),
                      )
                    : Text(
                        isCurrentPlanSelected
                            ? _txt(
                                tr: 'Mevcut aylık plan aktif',
                                en: 'Current monthly plan is active',
                              )
                            : _txt(
                                tr: 'Yıllık plana geç • $yearlyLabel',
                                en: 'Switch to yearly • $yearlyLabel',
                              ),
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 15,
                          fontWeight: FontWeight.w800,
                          color: isCurrentPlanSelected
                              ? context.textSecondary
                              : Colors.white,
                        ),
                      ),
              ),
            ),
          ),
          const SizedBox(height: 10),
          Text(
            _txt(
              tr: 'Aktif plan: ${_planLabel(status.activeProductId)}',
              en: 'Active plan: ${_planLabel(status.activeProductId)}',
            ),
            style: GoogleFonts.plusJakartaSans(
              fontSize: 12,
              color: context.textTertiaryColor,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSubscriptionMetaRow({
    required IconData icon,
    required String label,
    required String value,
  }) {
    return Row(
      children: [
        Container(
          width: 36,
          height: 36,
          decoration: BoxDecoration(
            color: _kPremiumBase.withValues(alpha: 0.12),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Icon(icon, size: 18, color: _kPremiumBase),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                label,
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  color: context.textSecondary,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                value,
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                  color: context.textPrimary,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildComparisonTable() {
    final l = context.l10n;
    final unlimited = l?.unlimited ?? 'Unlimited';
    final limitedCredits = _limitedByBalanceLabel();
    final rows = [
      _TableRow(
        _txt(tr: 'Qor AI Chat', en: 'Qor AI Chat'),
        limitedCredits,
        _unlimitedCreditsLabel(),
        Icons.chat_bubble_outline_rounded,
      ),
      _TableRow(
        _txt(tr: 'Görsel Tarayıcı', en: 'Visual Scanner'),
        limitedCredits,
        unlimited,
        Icons.image_search_rounded,
      ),
      _TableRow(
        _txt(tr: 'Akıllı Link Analizi', en: 'Smart Link Analysis'),
        limitedCredits,
        unlimited,
        Icons.link_rounded,
      ),
      _TableRow(
        _txt(tr: 'Premium Öneriler', en: 'Premium Recommendations'),
        _txt(tr: 'Standart', en: 'Standard'),
        _txt(tr: 'Daha derin kişiselleştirme', en: 'Deeper personalization'),
        Icons.auto_awesome_rounded,
      ),
      _TableRow(
        l?.productComparisons ?? 'Product Comparisons',
        true,
        true,
        Icons.compare_arrows_rounded,
      ),
      _TableRow(
        l?.youtubeReviews ?? 'YouTube Reviews',
        true,
        true,
        Icons.play_circle_rounded,
      ),
      _TableRow(
        _txt(tr: 'Ürün Arama', en: 'Product Search'),
        true,
        true,
        Icons.search_rounded,
      ),
      _TableRow(
        _txt(tr: 'Kategoriler', en: 'Categories'),
        true,
        true,
        Icons.category_rounded,
      ),
      _TableRow(
        l?.prioritySupport ?? 'Priority Support',
        false,
        true,
        Icons.support_agent_rounded,
      ),
    ];

    return Container(
      decoration: BoxDecoration(
        color: context.surfaceVariantColor,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: context.dividerColor),
      ),
      child: Column(
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            decoration: BoxDecoration(
              color: context.surfaceElevatedColor,
              borderRadius: const BorderRadius.vertical(
                top: Radius.circular(20),
              ),
            ),
            child: Row(
              children: [
                const Expanded(flex: 5, child: SizedBox()),
                Expanded(
                  flex: 3,
                  child: Text(
                    _txt(tr: 'Ücretsiz', en: 'Free'),
                    textAlign: TextAlign.center,
                    style: GoogleFonts.plusJakartaSans(
                      color: context.textSecondary,
                      fontWeight: FontWeight.w700,
                      fontSize: 12,
                    ),
                  ),
                ),
                Expanded(
                  flex: 3,
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 3,
                    ),
                    decoration: BoxDecoration(
                      gradient: _kPremiumGradient,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      'Premium',
                      textAlign: TextAlign.center,
                      style: GoogleFonts.plusJakartaSans(
                        color: Colors.white,
                        fontWeight: FontWeight.w800,
                        fontSize: 12,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
          for (int i = 0; i < rows.length; i++)
            _buildTableRow(rows[i], i == rows.length - 1),
        ],
      ),
    );
  }

  Widget _buildPremiumMomentumDeck({bool isPremium = false}) {
    final items = [
      (
        Icons.bolt_rounded,
        _txt(tr: 'Daha hızlı karar ver', en: 'Decide faster'),
        _txt(
          tr: 'Tek tek sekmeler arasında kaybolmadan, tüm kritik içgörüleri tek akışta görün.',
          en: 'See the critical product insight in one flow instead of hopping between tabs.',
        ),
      ),
      (
        Icons.diamond_rounded,
        _txt(tr: 'Sınır değil hız hissi', en: 'Feel speed, not limits'),
        _txt(
          tr: isPremium
              ? 'Premium aktif olduğu için tüm AI akışları doğrudan açık ve limitsiz.'
              : 'Premium, Q limitlerini kaldırır ve yoğun kullanımda sizi yarıda bırakmaz.',
          en: isPremium
              ? 'Premium is active, so every AI flow stays open and unlimited.'
              : 'Premium removes Q limits so heavy usage never cuts you off mid-flow.',
        ),
      ),
      (
        Icons.psychology_alt_rounded,
        _txt(tr: 'Size göre daha isabetli', en: 'More tailored to you'),
        _txt(
          tr: 'Profiliniz, ilgi alanlarınız ve cihaz ekosisteminiz önerilere daha güçlü yansır.',
          en: 'Your profile, interests, and ecosystem shape stronger recommendations.',
        ),
      ),
    ];

    return Column(
      children: items
          .map(
            (item) => Container(
              width: double.infinity,
              margin: const EdgeInsets.only(bottom: 10),
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: context.surfaceVariantColor,
                borderRadius: BorderRadius.circular(22),
                border: Border.all(
                  color: _kPremiumBase.withValues(alpha: 0.16),
                ),
                boxShadow: [
                  BoxShadow(
                    color: _kPremiumBase.withValues(alpha: 0.06),
                    blurRadius: 18,
                    offset: const Offset(0, 8),
                  ),
                ],
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 44,
                    height: 44,
                    decoration: BoxDecoration(
                      gradient: _kPremiumGradient,
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: Icon(item.$1, color: Colors.white, size: 20),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          item.$2,
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 14,
                            fontWeight: FontWeight.w800,
                            color: context.textPrimary,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          item.$3,
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 12,
                            height: 1.45,
                            color: context.textSecondary,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          )
          .toList(),
    );
  }

  Widget _buildRestoreLink() {
    return TextButton(
      onPressed: _isPurchasing ? null : _restore,
      child: Text(
        context.l10n?.paywallRestoreButton ?? 'Restore purchases',
        style: GoogleFonts.plusJakartaSans(
          color: context.textSecondary,
          fontSize: 12,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }

  Widget _buildTableRow(_TableRow row, bool isLast) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      decoration: BoxDecoration(
        border: isLast
            ? null
            : Border(bottom: BorderSide(color: context.dividerColor)),
      ),
      child: Row(
        children: [
          Expanded(
            flex: 5,
            child: Row(
              children: [
                Icon(row.icon, color: context.textSecondary, size: 15),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    row.feature,
                    style: GoogleFonts.plusJakartaSans(
                      color: context.textPrimary,
                      fontSize: 12,
                    ),
                  ),
                ),
              ],
            ),
          ),
          Expanded(flex: 3, child: _buildCellValue(row.free, false)),
          Expanded(flex: 3, child: _buildCellValue(row.pro, true)),
        ],
      ),
    );
  }

  Widget _buildCellValue(dynamic value, bool isPro) {
    if (value is bool) {
      return Center(
        child: Icon(
          value ? Icons.check_circle_rounded : Icons.cancel_rounded,
          color: value
              ? AppTheme.success
              : context.textTertiaryColor.withValues(alpha: 0.4),
          size: 18,
        ),
      );
    }
    return Center(
      child: Text(
        value.toString(),
        style: GoogleFonts.plusJakartaSans(
          color: isPro ? _kPremiumBase : context.textSecondary,
          fontSize: 11,
          fontWeight: isPro ? FontWeight.w700 : FontWeight.w500,
        ),
        textAlign: TextAlign.center,
      ),
    );
  }

  Widget _buildCTAButton() {
    final service = ref.read(subscriptionServiceProvider);
    final prods = service.products;

    String label;
    final product = _selectedProduct(prods);
    if (product != null) {
      label = _txt(
        tr: 'Premium\'u başlat • ${product.price}',
        en: 'Start Free Trial • ${product.price}',
      );
    } else {
      label = _selectedPlan == 0
          ? _txt(
              tr: 'Premium\'u başlat • \$${AppConstants.yearlyProPrice.toStringAsFixed(2)}/yıl',
              en: 'Start Free Trial • \$${AppConstants.yearlyProPrice.toStringAsFixed(2)}/yr',
            )
          : _txt(
              tr: 'Premium\'u başlat • \$${AppConstants.monthlyProPrice.toStringAsFixed(2)}/ay',
              en: 'Start Free Trial • \$${AppConstants.monthlyProPrice.toStringAsFixed(2)}/mo',
            );
    }

    return AnimatedBuilder(
      animation: _pulseController,
      builder: (_, child) {
        final pulse = math.sin(_pulseController.value * math.pi);
        return Container(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(18),
            boxShadow: [
              BoxShadow(
                color: _kPremiumBase.withValues(alpha: 0.22 + pulse * 0.08),
                blurRadius: 20 + pulse * 12,
                offset: const Offset(0, 6),
              ),
            ],
          ),
          child: child,
        );
      },
      child: SizedBox(
        width: double.infinity,
        height: 58,
        child: DecoratedBox(
          decoration: BoxDecoration(
            gradient: _kPremiumGradient,
            borderRadius: BorderRadius.circular(18),
          ),
          child: ElevatedButton(
            onPressed: (_isPurchasing || _isLoading)
                ? null
                : _handlePurchaseTap,
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.transparent,
              shadowColor: Colors.transparent,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(18),
              ),
            ),
            child: _isPurchasing
                ? const SizedBox(
                    width: 22,
                    height: 22,
                    child: CircularProgressIndicator(
                      strokeWidth: 2.5,
                      valueColor: AlwaysStoppedAnimation(Colors.white),
                    ),
                  )
                : Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Icon(
                        Icons.diamond_rounded,
                        color: Colors.white,
                        size: 18,
                      ),
                      const SizedBox(width: 8),
                      Text(
                        _isLoading
                            ? (context.l10n?.paywallStartYearly ??
                                  _txt(
                                    tr: 'Ücretsiz denemeyi başlat',
                                    en: 'Start Free Trial',
                                  ))
                            : label,
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 15,
                          fontWeight: FontWeight.w800,
                          color: Colors.white,
                          letterSpacing: 0.2,
                        ),
                      ),
                    ],
                  ),
          ),
        ),
      ),
    );
  }
}

class _TableRow {
  final String feature;
  final dynamic free;
  final dynamic pro;
  final IconData icon;
  const _TableRow(this.feature, this.free, this.pro, this.icon);
}
