/// Qor AI – Subscription Intelligence Screen
/// Modeled after AI Link Analysis — phase-based state machine with
/// AI quiz generation and grounded web analysis.
library;

import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:google_fonts/google_fonts.dart';

import 'package:qor_ai/core/theme.dart';
import 'package:qor_ai/core/quiz_gate.dart';
import 'package:qor_ai/core/constants.dart';
import 'package:qor_ai/domain/entities/ai_entities.dart';
import 'package:qor_ai/presentation/providers/providers.dart';
import 'package:qor_ai/routing/router.dart' show AppRoutes, routerProvider;
import 'package:qor_ai/presentation/widgets/glass_container.dart';
import 'package:qor_ai/presentation/widgets/gradient_button.dart';
import 'package:qor_ai/presentation/widgets/login_required_dialog.dart';
import 'package:qor_ai/presentation/widgets/paywall_sheet.dart';
import 'package:qor_ai/presentation/widgets/animated_gradient_input_shell.dart';
import 'package:qor_ai/presentation/widgets/qor_badges.dart';
import 'package:qor_ai/presentation/widgets/shared/ai_report_view.dart';
import 'package:qor_ai/presentation/widgets/shared/ai_report_adapters.dart';
import 'package:qor_ai/presentation/widgets/shared/scanning_arc.dart';
import 'package:qor_ai/core/qor_limit_messages.dart';
import 'package:qor_ai/presentation/widgets/limit_reached_dialog.dart';

// ─── Design tokens (mapped to global AppTheme brand palette) ─────────────────
const _kPrimary = AppTheme.brandBlue;
const _kSecondary = AppTheme.brandSkyBlue;
const _kAccent = AppTheme.brandCyan;
const _kDeep = AppTheme.brandDeepBlue;

const Map<String, Map<String, String>> _kSubscriptionScreenTranslations = {
  'maxSubscriptionsComparable': {
    'ar': 'يمكنك مقارنة ما يصل إلى {count} اشتراكات.',
    'de': 'Du kannst bis zu {count} Abonnements vergleichen.',
    'en': 'You can compare up to {count} subscriptions.',
    'es': 'Puedes comparar hasta {count} suscripciones.',
    'fr': 'Vous pouvez comparer jusqu\'à {count} abonnements.',
    'it': 'Puoi confrontare fino a {count} abbonamenti.',
    'ja': '比較できるサブスクリプションは最大{count}件です。',
    'nl': 'Je kunt maximaal {count} abonnementen vergelijken.',
    'pl': 'Możesz porównać maksymalnie {count} subskrypcje.',
    'pt': 'Você pode comparar até {count} assinaturas.',
    'sv': 'Du kan jämföra upp till {count} prenumerationer.',
    'tr': 'En fazla {count} abonelik karşılaştırılabilir.',
  },
  'enterAtLeastOneSubscription': {
    'ar': 'يرجى إدخال اشتراك واحد على الأقل.',
    'de': 'Bitte gib mindestens ein Abonnement ein.',
    'en': 'Please enter at least one subscription.',
    'es': 'Introduce al menos una suscripción.',
    'fr': 'Veuillez saisir au moins un abonnement.',
    'it': 'Inserisci almeno un abbonamento.',
    'ja': '少なくとも1つのサブスクリプションを入力してください。',
    'nl': 'Voer ten minste één abonnement in.',
    'pl': 'Wpisz co najmniej jedną subskrypcję.',
    'pt': 'Digite pelo menos uma assinatura.',
    'sv': 'Ange minst en prenumeration.',
    'tr': 'Lütfen en az bir abonelik adı girin.',
  },
  'identifyingServices': {
    'ar': 'جارٍ التعرّف على الخدمات',
    'de': 'Dienste werden erkannt',
    'en': 'Identifying Services',
    'es': 'Identificando servicios',
    'fr': 'Identification des services',
    'it': 'Identificazione dei servizi',
    'ja': 'サービスを識別中',
    'nl': 'Services identificeren',
    'pl': 'Identyfikowanie usług',
    'pt': 'Identificando serviços',
    'sv': 'Identifierar tjänster',
    'tr': 'Servisleri Tanıyoruz',
  },
  'identifyingServicesDetail': {
    'ar': 'نؤكد أسماء الاشتراكات التي أدخلتها ونطابقها مع الفئات المناسبة.',
    'de': 'Wir prüfen deine Abonnementnamen und ordnen sie den richtigen Kategorien zu.',
    'en': 'Validating subscription names and mapping them to the right categories.',
    'es': 'Validamos los nombres de las suscripciones y las vinculamos con la categoría correcta.',
    'fr': 'Nous validons les noms des abonnements et les associons aux bonnes catégories.',
    'it': 'Convalidiamo i nomi degli abbonamenti e li associamo alla categoria corretta.',
    'ja': '入力したサブスクリプション名を確認し、適切なカテゴリに割り当てます。',
    'nl': 'We valideren je abonnementsnamen en koppelen ze aan de juiste categorieën.',
    'pl': 'Sprawdzamy nazwy subskrypcji i przypisujemy je do właściwych kategorii.',
    'pt': 'Validamos os nomes das assinaturas e os mapeamos para as categorias corretas.',
    'sv': 'Vi validerar prenumerationsnamnen och mappar dem till rätt kategorier.',
    'tr': 'Girdiğin abonelik isimlerini doğrulayıp kategoriye eşliyoruz.',
  },
  'craftingPersonalQuiz': {
    'ar': 'جارٍ إعداد الاختبار الشخصي',
    'de': 'Persönliches Quiz wird erstellt',
    'en': 'Crafting Personal Quiz',
    'es': 'Preparando quiz personal',
    'fr': 'Création du quiz personnel',
    'it': 'Preparazione del quiz personale',
    'ja': 'パーソナルクイズを作成中',
    'nl': 'Persoonlijke quiz maken',
    'pl': 'Tworzenie osobistego quizu',
    'pt': 'Criando quiz pessoal',
    'sv': 'Skapar personligt quiz',
    'tr': 'Kişisel Quiz Hazırlanıyor',
  },
  'craftingPersonalQuizDetail': {
    'ar': 'ينشئ الذكاء الاصطناعي أسئلة لفهم عاداتك وتوقعاتك.',
    'de': 'Die KI erstellt Fragen, um deine Gewohnheiten und Erwartungen zu verstehen.',
    'en': 'AI is generating questions based on your habits and expectations.',
    'es': 'La IA genera preguntas según tus hábitos y expectativas.',
    'fr': 'L’IA génère des questions selon vos habitudes et vos attentes.',
    'it': 'L\'IA genera domande in base alle tue abitudini e aspettative.',
    'ja': 'AIがあなたの習慣や期待に合わせて質問を生成しています。',
    'nl': 'AI genereert vragen op basis van je gewoonten en verwachtingen.',
    'pl': 'AI tworzy pytania na podstawie Twoich nawyków i oczekiwań.',
    'pt': 'A IA gera perguntas com base nos seus hábitos e expectativas.',
    'sv': 'AI skapar frågor utifrån dina vanor och förväntningar.',
    'tr': 'Alışkanlıklarını anlamak için AI sorular oluşturuyor.',
  },
  'scanningCommunityVoice': {
    'ar': 'جارٍ فحص آراء المجتمع',
    'de': 'Community-Stimmen werden analysiert',
    'en': 'Scanning Community Voice',
    'es': 'Analizando la voz de la comunidad',
    'fr': 'Analyse des avis de la communauté',
    'it': 'Analisi della voce della community',
    'ja': 'コミュニティの声を解析中',
    'nl': 'Community-stem analyseren',
    'pl': 'Analiza głosu społeczności',
    'pt': 'Analisando a voz da comunidade',
    'sv': 'Skannar community-röster',
    'tr': 'İnternet Yorumları Taranıyor',
  },
  'scanningCommunityVoiceDetail': {
    'ar': 'نجمع مراجعات حقيقية من Reddit والمنتديات ووسائل التواصل الاجتماعي.',
    'de': 'Wir sammeln echte Bewertungen von Reddit, Foren und sozialen Medien.',
    'en': 'Collecting real reviews from Reddit, forums, and social media.',
    'es': 'Recopilamos opiniones reales de Reddit, foros y redes sociales.',
    'fr': 'Nous recueillons de vrais avis depuis Reddit, les forums et les réseaux sociaux.',
    'it': 'Raccogliamo recensioni reali da Reddit, forum e social media.',
    'ja': 'Reddit、フォーラム、SNSから実際のレビューを集めています。',
    'nl': 'We verzamelen echte reviews van Reddit, forums en sociale media.',
    'pl': 'Zbieramy prawdziwe opinie z Reddita, forów i mediów społecznościowych.',
    'pt': 'Coletamos avaliações reais do Reddit, fóruns e redes sociais.',
    'sv': 'Vi samlar in riktiga omdömen från Reddit, forum och sociala medier.',
    'tr': 'Reddit, forum ve sosyal medyadan gerçek yorumları topluyoruz.',
  },
  'positiveNegativeDigest': {
    'ar': 'ملخص الإيجابيات والسلبيات',
    'de': 'Positiv-/Negativ-Zusammenfassung',
    'en': 'Positive / Negative Digest',
    'es': 'Resumen positivo / negativo',
    'fr': 'Résumé positif / négatif',
    'it': 'Riepilogo positivo / negativo',
    'ja': '肯定 / 否定の要約',
    'nl': 'Positieve / negatieve samenvatting',
    'pl': 'Podsumowanie plusów / minusów',
    'pt': 'Resumo positivo / negativo',
    'sv': 'Positiv / negativ sammanfattning',
    'tr': 'Olumlu / Olumsuz Özet',
  },
  'positiveNegativeDigestDetail': {
    'ar': 'نفصل الجوانب الإيجابية والسلبية في ملاحظات المستخدمين.',
    'de': 'Wir trennen positive und negative Signale im Nutzerfeedback.',
    'en': 'Extracting pros and cons from community feedback.',
    'es': 'Extraemos pros y contras de los comentarios de la comunidad.',
    'fr': 'Nous extrayons les points forts et les limites des retours de la communauté.',
    'it': 'Estraiamo pro e contro dal feedback della community.',
    'ja': 'コミュニティのフィードバックから長所と短所を抽出します。',
    'nl': 'We halen voor- en nadelen uit feedback van de community.',
    'pl': 'Wyciągamy zalety i wady z opinii społeczności.',
    'pt': 'Extraímos prós e contras do feedback da comunidade.',
    'sv': 'Vi lyfter fram för- och nackdelar från community-feedback.',
    'tr': 'Yorumlardaki artıları ve eksileri ayrıştırıyoruz.',
  },
  'computingCompatibility': {
    'ar': 'جارٍ حساب التوافق',
    'de': 'Kompatibilität wird berechnet',
    'en': 'Computing Compatibility',
    'es': 'Calculando compatibilidad',
    'fr': 'Calcul de compatibilité',
    'it': 'Calcolo della compatibilità',
    'ja': '適合度を計算中',
    'nl': 'Compatibiliteit berekenen',
    'pl': 'Obliczanie dopasowania',
    'pt': 'Calculando compatibilidade',
    'sv': 'Beräknar kompatibilitet',
    'tr': 'Uyumluluk Hesaplanıyor',
  },
  'computingCompatibilityDetail': {
    'ar': 'نمزج ملفك الشخصي وإجابات الاختبار وذكاء الويب للوصول إلى أفضل تطابق.',
    'de': 'Wir kombinieren dein Profil, deine Quizantworten und Web-Signale zum besten Match.',
    'en': 'Blending your profile, quiz answers, and web intelligence into the best match.',
    'es': 'Combinamos tu perfil, las respuestas del quiz y la inteligencia web para hallar el mejor ajuste.',
    'fr': 'Nous combinons votre profil, vos réponses et les signaux du web pour trouver le meilleur match.',
    'it': 'Combiniamo profilo, risposte al quiz e dati web per trovare il miglior abbinamento.',
    'ja': 'プロフィール、クイズ回答、Web情報を組み合わせて最適な一致を導きます。',
    'nl': 'We combineren je profiel, quizantwoorden en web-signalen tot de beste match.',
    'pl': 'Łączymy Twój profil, odpowiedzi z quizu i dane z sieci, by znaleźć najlepsze dopasowanie.',
    'pt': 'Combinamos seu perfil, respostas do quiz e sinais da web para encontrar a melhor combinação.',
    'sv': 'Vi väger samman din profil, dina quizsvar och webbsignaler till bästa match.',
    'tr': 'Profilin + quiz cevapların + internet verileri birleşiyor.',
  },
  'subscriptionAnalysis': {
    'ar': 'تحليل الاشتراك',
    'de': 'Abo-Analyse',
    'en': 'Subscription Analysis',
    'es': 'Análisis de suscripción',
    'fr': 'Analyse d\'abonnement',
    'it': 'Analisi abbonamento',
    'ja': 'サブスクリプション分析',
    'nl': 'Abonnementsanalyse',
    'pl': 'Analiza subskrypcji',
    'pt': 'Análise de assinatura',
    'sv': 'Prenumerationsanalys',
    'tr': 'Abonelik Analizi',
  },
  'unlockUnlimitedQWithPremium': {
    'ar': 'افتح Q غير محدود مع Premium',
    'de': 'Schalte unbegrenztes Q mit Premium frei',
    'en': 'Unlock unlimited Q with Premium',
    'es': 'Desbloquea Q ilimitado con Premium',
    'fr': 'Débloquez un Q illimité avec Premium',
    'it': 'Sblocca Q illimitato con Premium',
    'ja': 'Premiumで無制限Qを解放',
    'nl': 'Ontgrendel onbeperkt Q met Premium',
    'pl': 'Odblokuj nielimitowane Q z Premium',
    'pt': 'Desbloqueie Q ilimitado com Premium',
    'sv': 'Lås upp obegränsad Q med Premium',
    'tr': 'Premium ile sınırsız Q aç',
  },
  'communityVoice': {
    'ar': 'آراء المجتمع',
    'de': 'Community-Stimmen',
    'en': 'Community Voice',
    'es': 'Voz de la comunidad',
    'fr': 'Voix de la communauté',
    'it': 'Voce della community',
    'ja': 'コミュニティの声',
    'nl': 'Community-stem',
    'pl': 'Głos społeczności',
    'pt': 'Voz da comunidade',
    'sv': 'Community-röster',
    'tr': 'İnternet Yorumları',
  },
  'communityVoiceSubtitle': {
    'ar': 'آراء حقيقية من Reddit والمنتديات ووسائل التواصل مع ملخص إيجابي/سلبي.',
    'de': 'Echtes Feedback aus Reddit, Foren und Social Media mit Positiv-/Negativ-Zusammenfassung.',
    'en': 'Real user feedback from Reddit, forums, and social media with a positive/negative summary.',
    'es': 'Opiniones reales de Reddit, foros y redes sociales con resumen positivo/negativo.',
    'fr': 'Retours réels depuis Reddit, les forums et les réseaux sociaux avec résumé positif/négatif.',
    'it': 'Feedback reale da Reddit, forum e social media con riepilogo positivo/negativo.',
    'ja': 'Reddit、フォーラム、SNSの実際の声を肯定/否定で要約します。',
    'nl': 'Echte feedback van Reddit, forums en sociale media met een positieve/negatieve samenvatting.',
    'pl': 'Prawdziwe opinie z Reddita, forów i social mediów z podsumowaniem plusów i minusów.',
    'pt': 'Feedback real de Reddit, fóruns e redes sociais com resumo positivo/negativo.',
    'sv': 'Riktiga omdömen från Reddit, forum och sociala medier med positiv/negativ sammanfattning.',
    'tr': 'Reddit, forum ve sosyal medyadan gerçek kullanıcı yorumları — olumlu/olumsuz özet.',
  },
  'personalQuiz': {
    'ar': 'اختبار شخصي',
    'de': 'Persönliches Quiz',
    'en': 'Personal Quiz',
    'es': 'Quiz personal',
    'fr': 'Quiz personnel',
    'it': 'Quiz personale',
    'ja': 'パーソナルクイズ',
    'nl': 'Persoonlijke quiz',
    'pl': 'Quiz osobisty',
    'pt': 'Quiz pessoal',
    'sv': 'Personligt quiz',
    'tr': 'Kişisel Quiz',
  },
  'personalQuizSubtitle': {
    'ar': 'تُفصِّل الذكاء الاصطناعي الأسئلة وفق عاداتك لتخصيص النتيجة.',
    'de': 'Die KI passt Fragen an deine Gewohnheiten an und personalisiert so das Ergebnis.',
    'en': 'AI tailors questions to your habits so every answer sharpens the match.',
    'es': 'La IA adapta las preguntas a tus hábitos para afinar cada resultado.',
    'fr': 'L’IA adapte les questions à vos habitudes pour affiner chaque résultat.',
    'it': 'L\'IA adatta le domande alle tue abitudini per affinare ogni risultato.',
    'ja': 'AIがあなたの習慣に合わせて質問を調整し、結果をより正確にします。',
    'nl': 'AI stemt vragen af op je gewoonten zodat elk antwoord de match verfijnt.',
    'pl': 'AI dopasowuje pytania do Twoich nawyków, aby każdy wynik był trafniejszy.',
    'pt': 'A IA ajusta as perguntas aos seus hábitos para refinar cada resultado.',
    'sv': 'AI anpassar frågorna efter dina vanor så att varje svar förbättrar matchen.',
    'tr': 'AI alışkanlıklarınıza göre sorular hazırlar — her cevap analizi sizin için kişiselleştirir.',
  },
  'smartMatch': {
    'ar': 'مطابقة ذكية',
    'de': 'Smart Match',
    'en': 'Smart Match',
    'es': 'Emparejamiento inteligente',
    'fr': 'Match intelligent',
    'it': 'Match intelligente',
    'ja': 'スマートマッチ',
    'nl': 'Slimme match',
    'pl': 'Inteligentne dopasowanie',
    'pt': 'Correspondência inteligente',
    'sv': 'Smart match',
    'tr': 'Akıllı Eşleşme',
  },
  'smartMatchSubtitle': {
    'ar': 'درجة توافق وتوصية مفصلة وفق ملفك الشخصي للعثور على أفضل اشتراك.',
    'de': 'Kompatibilitätsscore und detaillierte Empfehlung passend zu deinem Profil.',
    'en': 'Compatibility score and a detailed recommendation tuned to your profile.',
    'es': 'Puntuación de compatibilidad y recomendación detallada según tu perfil.',
    'fr': 'Score de compatibilité et recommandation détaillée selon votre profil.',
    'it': 'Punteggio di compatibilità e consiglio dettagliato in base al tuo profilo.',
    'ja': 'プロフィールに合わせた適合度スコアと詳細なおすすめを提示します。',
    'nl': 'Compatibiliteitsscore en gedetailleerde aanbeveling afgestemd op je profiel.',
    'pl': 'Ocena dopasowania i szczegółowa rekomendacja dopasowana do Twojego profilu.',
    'pt': 'Pontuação de compatibilidade e recomendação detalhada para o seu perfil.',
    'sv': 'Kompatibilitetspoäng och detaljerad rekommendation anpassad till din profil.',
    'tr': 'Profilinize göre uyumluluk puanı ve detaylı öneri — en uygun aboneliği bulun.',
  },
};

String _subscriptionScreenText(
  String key,
  String languageCode, {
  Map<String, String> replacements = const {},
}) {
  var value =
      _kSubscriptionScreenTranslations[key]?[normalizeQorLanguageCode(languageCode)] ??
      _kSubscriptionScreenTranslations[key]?['en'] ??
      key;
  replacements.forEach((token, replacement) {
    value = value.replaceAll('{$token}', replacement);
  });
  return value;
}

// ─── Local model for a validated subscription chip ───────────────────────────

class _ValidatedChip {
  final String displayName;
  final String categoryKey;
  const _ValidatedChip({required this.displayName, required this.categoryKey});
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

class SubscriptionsScreen extends ConsumerStatefulWidget {
  const SubscriptionsScreen({super.key});
  @override
  ConsumerState<SubscriptionsScreen> createState() =>
      _SubscriptionsScreenState();
}

class _SubscriptionsScreenState extends ConsumerState<SubscriptionsScreen>
    with TickerProviderStateMixin, AutomaticKeepAliveClientMixin {
  static const int _kMaxChips = 4;

  final TextEditingController _inputCtrl = TextEditingController();
  final FocusNode _inputFocus = FocusNode();
  final List<_ValidatedChip> _chips = [];
  String? _chipError;
  bool _validatingChip = false;

  late AnimationController _pulseController;

  static const _suggestions = [
    'Netflix',
    'Spotify',
    'ChatGPT Plus',
    'Disney+',
    'Apple One',
    'YouTube Premium',
    'Xbox Game Pass',
    'iCloud+',
    'Adobe CC',
    'Claude Pro',
  ];

  @override
  bool get wantKeepAlive => true;

  @override
  void initState() {
    super.initState();
    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 2),
    )..repeat(reverse: true);

    // Clear any stale error from previous session so the red banner does
    // not greet users before they even hit "Start Analysis".
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      ref.read(subQuizProvider.notifier).clearError();
    });
  }

  @override
  void dispose() {
    _inputCtrl.dispose();
    _inputFocus.dispose();
    _pulseController.dispose();
    super.dispose();
  }

  void _removeChip(String displayName) {
    setState(() {
      _chips.removeWhere((c) => c.displayName == displayName);
      _chipError = null;
    });
    ref.read(subQuizProvider.notifier).clearError();
  }

  String _copy(String key, {Map<String, String> replacements = const {}}) {
    final languageCode =
        ref.read(localeProvider)?.languageCode ??
        Localizations.localeOf(context).languageCode;
    return _subscriptionScreenText(
      key,
      languageCode,
      replacements: replacements,
    );
  }

  Future<void> _addChipAsync(String name) async {
    if (_validatingChip) return; // serialize concurrent adds
    final trimmed = name.trim();
    if (trimmed.isEmpty) return;

    // Max chip limit check
    if (_chips.length >= _kMaxChips) {
      setState(() {
        _chipError = _copy(
          'maxSubscriptionsComparable',
          replacements: {'count': '$_kMaxChips'},
        );
      });
      return;
    }

    setState(() {
      _validatingChip = true;
      _chipError = null;
    });

    final result = await ref
        .read(subQuizProvider.notifier)
        .validateSingleSubscriptionChip(
          rawName: trimmed,
          existingDisplayNames: _chips.map((c) => c.displayName).toList(),
          chipCategoryMap: {
            for (final c in _chips) c.displayName.toLowerCase(): c.categoryKey,
          },
        );

    if (!mounted) return;

    if (result.isValid) {
      setState(() {
        _chips.add(
          _ValidatedChip(
            displayName: result.displayName!,
            categoryKey: result.categoryKey!,
          ),
        );
        _inputCtrl.clear();
        _chipError = null;
        _validatingChip = false;
      });
    } else {
      setState(() {
        _chipError = result.error;
        _validatingChip = false;
      });
    }
  }

  Future<void> _startAnalysis() async {
    // Misafir AI'ı kullanamaz → giriş dialog'u aç, login'e yönlendir.
    if (!requireAuth(context)) return;
    final pending = _inputCtrl.text.trim();

    if (pending.isNotEmpty) {
      // If it's just a duplicate of an already-added chip, clear it and proceed
      final isDuplicate = _chips.any(
        (c) => c.displayName.toLowerCase() == pending.toLowerCase(),
      );
      if (isDuplicate) {
        _inputCtrl.clear();
      } else {
        await _addChipAsync(pending);
        // If chip-add set an error, abort analysis
        if (_chipError != null) return;
      }
    }

    if (_chips.isEmpty) {
      setState(() => _chipError = _copy('enterAtLeastOneSubscription'));
      return;
    }

    setState(() => _chipError = null);
    _inputFocus.unfocus();

    // AI analizi quiz tamamlanmadan kullanılamaz → kibar uyarı + quize yönlendir.
    if (!mounted) return;
    if (!await ensureOnboardingQuizGate(context, ref)) return;
    if (!mounted) return;

    ref
        .read(subQuizProvider.notifier)
        .startQuiz(
          _chips.map((c) => c.displayName).toList(),
          skipResolution: true,
        );
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    final state = ref.watch(subQuizProvider);
    final isWorking =
        state.phase == SubFlowPhase.quizLoading ||
        state.phase == SubFlowPhase.analyzing;

    ref.listen<bool>(premiumProvider, (prev, next) {
      if (!mounted || prev == next || !next) return;
      final current = ref.read(subQuizProvider);
      if (current.error != null) {
        ref.read(subQuizProvider.notifier).reset();
      }
    });

    ref.listen<SubQuizState>(subQuizProvider, (prev, next) {
      if (!mounted || next.error == null || next.error == prev?.error) return;
      final langCode = ref.read(localeProvider)?.languageCode;
      if (!isInsufficientQMessage(next.error, langCode)) return;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        ref.read(subQuizProvider.notifier).clearError();
        showInsufficientQDialog(
          context,
          ref,
          feature: 'subscription_analysis',
        );
      });
    });

    final langCode = ref.read(localeProvider)?.languageCode;
    final hasInlineError =
        state.error != null && !isInsufficientQMessage(state.error, langCode);

    return Scaffold(
      backgroundColor: context.backgroundColor,
      body: Stack(
        children: [
          _buildBackgroundOrbs(),
          CustomScrollView(
            slivers: [
              _buildAppBar(state),
              SliverPadding(
                padding: const EdgeInsets.symmetric(
                  horizontal: 20,
                  vertical: 10,
                ),
                sliver: SliverList(
                  delegate: SliverChildListDelegate([
                    // Phase timeline (during loading phases)
                    if (state.phase == SubFlowPhase.quizLoading ||
                        state.phase == SubFlowPhase.analyzing)
                      _buildPhaseTimeline(state.phase),

                    // Idle: input + suggestions
                    if (state.phase == SubFlowPhase.idle) ...[
                      const SizedBox(height: 12),
                      _buildInputCard(isWorking),
                      if (_chipError != null) ...[
                        const SizedBox(height: 8),
                        _buildChipWarning(_chipError!),
                      ],
                      const SizedBox(height: 20),
                      if (hasInlineError) ...[
                        _buildError(state.error!),
                        const SizedBox(height: 16),
                      ],
                      _buildInfoCards(),
                    ],

                    // Quiz phase
                    if (state.phase == SubFlowPhase.quiz && state.quiz != null)
                      _SubQuizView(
                        quiz: state.quiz!,
                        subscriptionNames: state.subscriptionNames,
                        answeredQuestions: state.answeredQuestions,
                        currentIndex: state.currentQuestionIndex,
                        onAnswer: (idx, answer) {
                          ref
                              .read(subQuizProvider.notifier)
                              .answerQuestion(idx, answer);
                        },
                        onSubmit: () async {
                          await ref.read(subQuizProvider.notifier).submitQuiz();
                        },
                        onSkip: () {
                          ref.read(subQuizProvider.notifier).skipQuiz();
                        },
                      ),

                    // Result phase
                    if (state.phase == SubFlowPhase.result)
                      _SubResultView(
                        analysisText: state.analysisResult ?? '',
                        scores: state.scores,
                        subscriptionNames: state.subscriptionNames,
                        structured: state.structured,
                        countryCode: ref.read(selectedCountryProvider),
                      ),

                    SizedBox(
                      height:
                          AppTheme.navBarTotalClearance +
                          MediaQuery.of(context).padding.bottom +
                          24,
                    ),
                  ]),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  // ── Geri (çıkış) ──────────────────────────────────────────────────────────
  //
  // BUG (kullanıcı): analiz başladıktan sonra geri butonu doğru çalışmıyordu.
  // ÖLÇÜLEN DAVRANIŞ: buton `subQuizProvider.reset()` çağırıyordu — yani
  //   1) ekranı KAPATMIYOR, aynı sekmede boş başlangıç ekranına dönüyordu,
  //   2) süren analizin ekrandaki tüm ilerlemesini SİLİYORDU (iş arka planda
  //      koşmaya devam ettiği için sonuç sonradan boş ekranın üstüne düşüyordu).
  //
  // BEKLENEN: analiz arka planda SÜRSÜN, ekran kapansın, bildirimle geri
  // dönülebilsin. `subQuizProvider` autoDispose DEĞİL — sekmeden çıkmak işi
  // öldürmez; geri dönünce faz neyse o görünür.
  //
  // "Baştan başla" (sağ üst yenile ikonu, yalnız sonuç hazırken) gerçek
  // sıfırlama için zaten duruyor — geri butonu artık onun işini yapmıyor.
  void _onBack() {
    HapticFeedback.selectionClick();
    final rootNav = Navigator.maybeOf(context, rootNavigator: true);
    if (rootNav != null && rootNav.canPop()) {
      rootNav.pop();
      return;
    }
    // Sekme kökündeyiz: shell'in ana sayfasına dön (MainShell.didPopRoute ile
    // aynı davranış). Analiz koşmaya devam eder, hazır olunca Qor bildirimi
    // kullanıcıyı buraya geri getirir.
    ref.read(routerProvider).go(AppRoutes.home);
  }

  // ── App Bar ────────────────────────────────────────────────────────────────

  SliverAppBar _buildAppBar(SubQuizState state) {
    return SliverAppBar(
      backgroundColor: context.backgroundColor,
      floating: false,
      pinned: true,
      toolbarHeight: 56,
      leading: state.phase != SubFlowPhase.idle
          ? IconButton(
              icon: Icon(Icons.arrow_back_rounded, color: context.textPrimary),
              onPressed: _onBack,
            )
          : Padding(
              padding: const EdgeInsets.only(left: 12),
              child: Center(
                child: Image.asset(
                  'assets/logo/qor_ai_logo.png',
                  width: 32,
                  height: 32,
                ),
              ),
            ),
      centerTitle: true,
      title: Builder(
        builder: (ctx) {
          final isDark = Theme.of(ctx).brightness == Brightness.dark;
          final title = _getTitle(state.phase);
          if (isDark) {
            return ShaderMask(
              shaderCallback: (bounds) => const LinearGradient(
                colors: [_kPrimary, _kSecondary, _kAccent],
              ).createShader(bounds),
              child: Text(
                title,
                style: GoogleFonts.inter(
                  fontWeight: FontWeight.w800,
                  fontSize: 18,
                  color: Colors.white,
                  letterSpacing: -0.5,
                ),
              ),
            );
          }
          return Text(
            title,
            style: GoogleFonts.inter(
              fontWeight: FontWeight.w800,
              fontSize: 18,
              color: _kPrimary,
              letterSpacing: -0.5,
            ),
          );
        },
      ),
      actions: [
        // "Baştan başla" yalnızca SONUÇ hazırken. Quiz / analiz esnasında ve
        // idle'da sağ üstte buton yok. Analiz geçmişi artık YALNIZ Profil >
        // "Analiz Geçmişi" altında (kullanıcı isteği).
        if (state.phase == SubFlowPhase.result)
          _buildAppBarAction(
            icon: Icons.refresh_rounded,
            onPressed: () {
              HapticFeedback.mediumImpact();
              ref.read(subQuizProvider.notifier).reset();
              setState(() {});
            },
            tooltip: context.l10n?.startOver ?? 'Start over',
          ),
        const SizedBox(width: 4),
      ],
    );
  }

  Widget _buildAppBarAction({
    required IconData icon,
    required VoidCallback onPressed,
    required String tooltip,
  }) {
    return Tooltip(
      message: tooltip,
      child: GestureDetector(
        onTap: onPressed,
        child: Container(
          width: 36,
          height: 36,
          decoration: BoxDecoration(
            color: context.surfaceElevatedColor,
            borderRadius: BorderRadius.circular(12),
          ),
          child: Center(
            child: Icon(icon, size: 18, color: context.textPrimary),
          ),
        ),
      ),
    );
  }

  String _getTitle(SubFlowPhase phase) {
    switch (phase) {
      case SubFlowPhase.idle:
        return context.l10n?.subscriptionIntelligence ??
            'Subscription Intelligence';
      case SubFlowPhase.quizLoading:
        return context.l10n?.generatingQuiz ?? 'Generating quiz...';
      case SubFlowPhase.quiz:
        return context.l10n?.quickQuiz ?? 'Quick Quiz';
      case SubFlowPhase.analyzing:
        return context.l10n?.aiIsAnalyzing ?? 'AI Analyzing...';
      case SubFlowPhase.result:
        return context.l10n?.yourMatch ?? 'Your Match';
    }
  }

  // ── Background Orbs ────────────────────────────────────────────────────────

  Widget _buildBackgroundOrbs() {
    // Arka plandaki gradyant orb'lar KALDIRILDI (kullanıcı isteği).
    return const SizedBox.shrink();
  }

  // ── Phase Timeline ─────────────────────────────────────────────────────────

  Widget _buildPhaseTimeline(SubFlowPhase phase) {
    final isQuizLoading = phase == SubFlowPhase.quizLoading;

    // Detailed AI steps with rich descriptions
    final steps = [
      _PhaseStep(
        label: _copy('identifyingServices'),
        detail: _copy('identifyingServicesDetail'),
        icon: Icons.fingerprint_rounded,
        isDone: phase.index > SubFlowPhase.quizLoading.index,
        isActive: isQuizLoading,
      ),
      _PhaseStep(
        label: _copy('craftingPersonalQuiz'),
        detail: _copy('craftingPersonalQuizDetail'),
        icon: Icons.psychology_alt_rounded,
        isDone: phase.index > SubFlowPhase.quizLoading.index,
        isActive: isQuizLoading,
      ),
      _PhaseStep(
        label: _copy('scanningCommunityVoice'),
        detail: _copy('scanningCommunityVoiceDetail'),
        icon: Icons.forum_rounded,
        isDone: phase == SubFlowPhase.result,
        isActive: phase == SubFlowPhase.analyzing,
      ),
      _PhaseStep(
        label: _copy('positiveNegativeDigest'),
        detail: _copy('positiveNegativeDigestDetail'),
        icon: Icons.sentiment_satisfied_rounded,
        isDone: phase == SubFlowPhase.result,
        isActive: phase == SubFlowPhase.analyzing,
      ),
      _PhaseStep(
        label: _copy('computingCompatibility'),
        detail: _copy('computingCompatibilityDetail'),
        icon: Icons.auto_graph_rounded,
        isDone: phase == SubFlowPhase.result,
        isActive: phase == SubFlowPhase.analyzing,
      ),
    ];

    final doneCount = steps.where((s) => s.isDone).length;
    final percent = ((doneCount / steps.length) * 100).toInt();
    final activeStep = steps.firstWhere(
      (s) => s.isActive,
      orElse: () => steps.first,
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // ── Hero: Big animated orb with live status ──
        Center(
          child: SizedBox(
            width: 180,
            height: 180,
            child: Stack(
              alignment: Alignment.center,
              children: [
                // Outer ring — progress
                SizedBox(
                  width: 180,
                  height: 180,
                  child: TweenAnimationBuilder<double>(
                    duration: const Duration(milliseconds: 800),
                    curve: Curves.easeOutCubic,
                    tween: Tween(begin: 0, end: doneCount / steps.length),
                    builder: (ctx, value, _) => CircularProgressIndicator(
                      value: value,
                      strokeWidth: 6,
                      strokeCap: StrokeCap.round,
                      backgroundColor: _kPrimary.withValues(alpha: 0.08),
                      color: _kAccent,
                    ),
                  ),
                ),
                // Sürekli dönen tarama arkı — belirleyici halka beklerken bile
                // döner, analiz sırasında ekran "canlı" kalır (kullanıcı isteği).
                // İÇ halkada döner: dıştaki gerçek-ilerleme halkasıyla (180)
                // ÇAKIŞMASIN diye belirgin şekilde küçük + ince.
                const ScanningArc(size: 138, strokeWidth: 5, color: _kAccent),
                // Pulsing inner orb
                AnimatedBuilder(
                  animation: _pulseController,
                  builder: (ctx, _) {
                    return Container(
                      width: 130 + _pulseController.value * 8,
                      height: 130 + _pulseController.value * 8,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        gradient: RadialGradient(
                          colors: [
                            _kPrimary.withValues(
                              alpha: 0.25 + _pulseController.value * 0.15,
                            ),
                            _kPrimary.withValues(alpha: 0.0),
                          ],
                        ),
                      ),
                    );
                  },
                ),
                // Inner core with icon
                Container(
                  width: 100,
                  height: 100,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    gradient: const LinearGradient(
                      colors: [_kPrimary, _kDeep],
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                    ),
                    boxShadow: [
                      BoxShadow(
                        color: _kPrimary.withValues(alpha: 0.4),
                        blurRadius: 24,
                        offset: const Offset(0, 8),
                      ),
                    ],
                  ),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(activeStep.icon, color: Colors.white, size: 30)
                          .animate(onPlay: (c) => c.repeat(reverse: true))
                          .scale(
                            begin: const Offset(1, 1),
                            end: const Offset(1.1, 1.1),
                            duration: 1200.ms,
                            curve: Curves.easeInOut,
                          ),
                      const SizedBox(height: 4),
                      Text(
                        '$percent%',
                        style: GoogleFonts.plusJakartaSans(
                          fontWeight: FontWeight.w900,
                          fontSize: 18,
                          color: Colors.white,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 20),
        // ── Live status label ──
        Center(
          child: AnimatedSwitcher(
            duration: const Duration(milliseconds: 300),
            child: Column(
              key: ValueKey(activeStep.label),
              children: [
                Text(
                  activeStep.label,
                  textAlign: TextAlign.center,
                  style: GoogleFonts.plusJakartaSans(
                    fontWeight: FontWeight.w800,
                    fontSize: 18,
                    color: context.textPrimary,
                    letterSpacing: -0.3,
                  ),
                ),
                const SizedBox(height: 6),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 20),
                  child: Text(
                    activeStep.detail,
                    textAlign: TextAlign.center,
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 13,
                      color: context.textSecondary,
                      height: 1.5,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 24),
        // ── Step list: all steps visible, shows full flow ──
        Container(
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(
            color: context.isDarkMode
                ? Colors.white.withValues(alpha: 0.03)
                : Colors.white.withValues(alpha: 0.85),
            borderRadius: BorderRadius.circular(22),
            border: Border.all(
              color: _kPrimary.withValues(
                alpha: context.isDarkMode ? 0.15 : 0.12,
              ),
              width: 0.8,
            ),
            boxShadow: context.isDarkMode ? null : AppTheme.cardShadowLight,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: steps.asMap().entries.map((entry) {
              final i = entry.key;
              final step = entry.value;
              return _buildTimelineStep(step, i == steps.length - 1);
            }).toList(),
          ),
        ),
        const SizedBox(height: 16),
        // ── Sources row: credibility boost ──
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          decoration: BoxDecoration(
            color: _kAccent.withValues(alpha: context.isDarkMode ? 0.06 : 0.05),
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: _kAccent.withValues(
                alpha: context.isDarkMode ? 0.2 : 0.15,
              ),
              width: 0.8,
            ),
          ),
          child: Row(
            children: [
              const Icon(Icons.verified_rounded, color: _kAccent, size: 16),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  Localizations.localeOf(context).languageCode == 'tr'
                      ? 'Kaynaklar: Reddit · Trustpilot · Forum · X · YouTube · Resmi site'
                      : 'Sources: Reddit · Trustpilot · Forums · X · YouTube · Official',
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: context.textSecondary,
                    letterSpacing: 0.1,
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    ).animate().fadeIn(duration: 400.ms);
  }

  Widget _buildTimelineStep(_PhaseStep step, bool isLast) {
    final inactiveColor = context.isDarkMode
        ? AppTheme.slate700
        : AppTheme.slate200;
    final inactiveText = context.isDarkMode
        ? AppTheme.slate400
        : AppTheme.slate500;

    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 32,
            child: Column(
              children: [
                step.isDone
                    ? AnimatedContainer(
                        duration: const Duration(milliseconds: 400),
                        width: 28,
                        height: 28,
                        decoration: const BoxDecoration(
                          shape: BoxShape.circle,
                          gradient: LinearGradient(
                            colors: [AppTheme.success, AppTheme.scoreExcellent],
                          ),
                        ),
                        child: const Center(
                          child: Icon(
                            Icons.check_rounded,
                            size: 15,
                            color: Colors.white,
                          ),
                        ),
                      ).animate().scale(
                        begin: const Offset(0.5, 0.5),
                        end: const Offset(1, 1),
                        duration: 400.ms,
                        curve: Curves.elasticOut,
                      )
                    : step.isActive
                    ? AnimatedBuilder(
                        animation: _pulseController,
                        builder: (context, child) {
                          return Container(
                            width: 28,
                            height: 28,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              gradient: const LinearGradient(
                                colors: [_kPrimary, _kDeep],
                              ),
                              boxShadow: [
                                BoxShadow(
                                  color: _kPrimary.withValues(
                                    alpha: 0.3 + _pulseController.value * 0.3,
                                  ),
                                  blurRadius: 6 + _pulseController.value * 6,
                                  spreadRadius: _pulseController.value * 2,
                                ),
                              ],
                            ),
                            child: const Center(
                              child: SizedBox(
                                width: 14,
                                height: 14,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: Colors.white,
                                ),
                              ),
                            ),
                          );
                        },
                      )
                    : Container(
                        width: 28,
                        height: 28,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: inactiveColor,
                        ),
                        child: Center(
                          child: Icon(step.icon, size: 13, color: inactiveText),
                        ),
                      ),
                if (!isLast)
                  Expanded(
                    child: Container(
                      width: 2,
                      margin: const EdgeInsets.symmetric(vertical: 4),
                      decoration: BoxDecoration(
                        color: step.isDone
                            ? AppTheme.success.withValues(alpha: 0.4)
                            : inactiveColor,
                        borderRadius: BorderRadius.circular(1),
                      ),
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Padding(
              padding: EdgeInsets.only(bottom: isLast ? 0 : 14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    step.label,
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 13.5,
                      fontWeight: step.isActive
                          ? FontWeight.w800
                          : FontWeight.w600,
                      color: step.isDone
                          ? AppTheme.success
                          : step.isActive
                          ? _kPrimary
                          : context.textPrimary.withValues(alpha: 0.6),
                      letterSpacing: -0.2,
                    ),
                  ),
                  if (step.detail.isNotEmpty) ...[
                    const SizedBox(height: 3),
                    Text(
                      step.detail,
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 11.5,
                        fontWeight: FontWeight.w400,
                        color: step.isDone || step.isActive
                            ? context.textSecondary
                            : context.textTertiaryColor,
                        height: 1.4,
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  // ── Progress Steps (compact bar) ───────────────────────────────────────────

  // ignore: unused_element
  Widget _buildProgressSteps(SubFlowPhase phase) {
    final steps = [
      context.l10n?.typeLabel ?? 'Type',
      context.l10n?.quickQuiz ?? 'Quiz',
      context.l10n?.analyze ?? 'Analyze',
      context.l10n?.resultLabel ?? 'Result',
    ];
    final activeIndex = switch (phase) {
      SubFlowPhase.quizLoading => 0,
      SubFlowPhase.quiz => 1,
      SubFlowPhase.analyzing => 2,
      SubFlowPhase.result => 3,
      _ => -1,
    };
    return Padding(
      padding: const EdgeInsets.only(bottom: 20),
      child: GlassContainer(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
        child: Row(
          children: List.generate(steps.length, (i) {
            final done = i < activeIndex;
            final active = i == activeIndex;
            return Expanded(
              child: Row(
                children: [
                  AnimatedContainer(
                    duration: const Duration(milliseconds: 400),
                    width: 26,
                    height: 26,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      gradient: done
                          ? const LinearGradient(
                              colors: [
                                AppTheme.success,
                                AppTheme.scoreExcellent,
                              ],
                            )
                          : active
                          ? const LinearGradient(colors: [_kPrimary, _kDeep])
                          : null,
                      color: (!done && !active)
                          ? context.surfaceVariantColor
                          : null,
                      boxShadow: active
                          ? [
                              BoxShadow(
                                color: _kPrimary.withValues(alpha: 0.3),
                                blurRadius: 8,
                                spreadRadius: 1,
                              ),
                            ]
                          : null,
                    ),
                    child: Center(
                      child: done
                          ? Icon(
                              Icons.check_rounded,
                              size: 13,
                              color: context.surfaceVariantColor,
                            )
                          : Text(
                              '${i + 1}',
                              style: GoogleFonts.plusJakartaSans(
                                fontSize: 10,
                                fontWeight: FontWeight.w700,
                                color: active
                                    ? Colors.white
                                    : AppTheme.slate400,
                              ),
                            ),
                    ),
                  ),
                  const SizedBox(width: 4),
                  Flexible(
                    child: Text(
                      steps[i],
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 10,
                        fontWeight: active ? FontWeight.w700 : FontWeight.w500,
                        color: done
                            ? AppTheme.success
                            : active
                            ? _kPrimary
                            : AppTheme.slate400,
                      ),
                      overflow: TextOverflow.ellipsis,
                      maxLines: 1,
                    ),
                  ),
                  if (i < steps.length - 1)
                    Expanded(
                      child: Container(
                        height: 2,
                        margin: const EdgeInsets.symmetric(horizontal: 4),
                        decoration: BoxDecoration(
                          gradient: done
                              ? const LinearGradient(
                                  colors: [
                                    AppTheme.success,
                                    AppTheme.scoreExcellent,
                                  ],
                                )
                              : null,
                          color: done ? null : AppTheme.slate700,
                          borderRadius: BorderRadius.circular(1),
                        ),
                      ),
                    ),
                ],
              ),
            );
          }),
        ),
      ),
    );
  }

  // ── Usage Badge ────────────────────────────────────────────────────────────

  // ignore: unused_element
  Widget _buildUsageBadge() {
    final sub = ref.watch(subscriptionServiceProvider);
    if (sub.isPremium) return const SizedBox.shrink();

    final remaining = sub.qBalance;
    final total = remaining;
    final progress = remaining <= 0 ? 0.0 : 1.0;
    final isLow = remaining <= 2;
    final barColor = isLow ? AppTheme.error : _kAccent;
    final barColorAi = isLow ? AppTheme.error : _kPrimary;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: context.surfaceElevatedColor,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: isLow
              ? AppTheme.error.withValues(alpha: 0.3)
              : _kPrimary.withValues(alpha: 0.15),
        ),
      ),
      child: Column(
        children: [
          _UsageMeter(
            icon: Icons.analytics_outlined,
            label:
                context.l10n?.subscriptionIntelligence ??
                _copy('subscriptionAnalysis'),
            remaining: remaining,
            total: total,
            period: ' ${AppConstants.qorCurrencyName}',
            progress: progress,
            color: barColor,
          ),
          const SizedBox(height: 8),
          _UsageMeter(
            icon: Icons.auto_awesome,
            label: context.l10n?.aiChat ?? 'AI Chat',
            remaining: remaining,
            total: total,
            period: ' ${AppConstants.qorCurrencyName}',
            progress: progress,
            color: barColorAi,
          ),
          const SizedBox(height: 8),
          GestureDetector(
            onTap: () => showPaywallSheet(context, source: 'subscriptions'),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(Icons.auto_awesome, size: 13, color: _kAccent),
                const SizedBox(width: 4),
                Text(
                  _copy('unlockUnlimitedQWithPremium'),
                  style: GoogleFonts.inter(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: _kAccent,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    ).animate().fadeIn(duration: 400.ms).slideY(begin: -0.1);
  }

  // ── Input Card ─────────────────────────────────────────────────────────────

  Widget _buildInputCard(bool isWorking) {
    final sub = ref.watch(subscriptionServiceProvider);
    final analysisCreditCost = sub.creditCostForFeature('subscription_analysis');
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Animated gradient border input
        AnimatedGradientInputShell(
          topContent: _chips.isNotEmpty
              ? Padding(
                  padding: const EdgeInsets.only(left: 14, right: 14, top: 10),
                  child: Wrap(
                    spacing: 8,
                    runSpacing: 6,
                    children: _chips.map((chip) {
                      return Chip(
                        label: Text(
                          chip.displayName,
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                            color: _kPrimary,
                          ),
                        ),
                        deleteIcon: const Icon(
                          Icons.close_rounded,
                          size: 16,
                          color: _kPrimary,
                        ),
                        onDeleted: () => _removeChip(chip.displayName),
                        backgroundColor: _kPrimary.withValues(alpha: 0.08),
                        side: BorderSide(
                          color: _kPrimary.withValues(alpha: 0.3),
                        ),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(10),
                        ),
                      );
                    }).toList(),
                  ),
                )
              : null,
          child: Stack(
            alignment: Alignment.center,
            children: [
              ValueListenableBuilder<TextEditingValue>(
                valueListenable: _inputCtrl,
                builder: (context, value, _) {
                  return TextField(
                    controller: _inputCtrl,
                    focusNode: _inputFocus,
                    enabled: !_validatingChip && _chips.length < _kMaxChips,
                    style: GoogleFonts.inter(
                      color: _validatingChip
                          ? Colors.transparent
                          : context.textPrimary,
                      fontSize: 13,
                      fontWeight: FontWeight.w500,
                    ),
                    decoration: InputDecoration(
                      hintText: _chips.isEmpty
                          ? (context.l10n?.subscriptionInputHint ??
                                'Type a subscription (e.g. Netflix)')
                          : (context.l10n?.addAnotherSubscription ??
                                'Add another…'),
                      hintStyle: GoogleFonts.inter(
                        color: _validatingChip
                            ? Colors.transparent
                            : context.textTertiaryColor.withValues(alpha: 0.6),
                        fontWeight: FontWeight.w400,
                        fontSize: 13,
                      ),
                      prefixIcon: Padding(
                        padding: const EdgeInsets.only(left: 14, right: 8),
                        child: Icon(
                          Icons.subscriptions_rounded,
                          color: _kPrimary.withValues(alpha: 0.7),
                          size: 18,
                        ),
                      ),
                      prefixIconConstraints: const BoxConstraints(
                        minWidth: 0,
                        minHeight: 0,
                      ),
                      suffixIcon: !_validatingChip &&
                              value.text.isNotEmpty &&
                              _chips.length < _kMaxChips
                          ? GestureDetector(
                              onTap: () => _addChipAsync(_inputCtrl.text),
                              child: Container(
                                margin: const EdgeInsets.only(right: 8),
                                padding: const EdgeInsets.all(6),
                                decoration: BoxDecoration(
                                  color: _kPrimary.withValues(alpha: 0.1),
                                  borderRadius: BorderRadius.circular(10),
                                ),
                                child: const Icon(
                                  Icons.add_rounded,
                                  color: _kPrimary,
                                  size: 16,
                                ),
                              ),
                            )
                          : null,
                      suffixIconConstraints: const BoxConstraints(
                        maxWidth: 44,
                        maxHeight: 44,
                      ),
                      border: InputBorder.none,
                      filled: false,
                      contentPadding: const EdgeInsets.symmetric(
                        horizontal: 0,
                        vertical: 12,
                      ),
                    ),
                    onSubmitted: (v) {
                      if (v.trim().isNotEmpty) _addChipAsync(v);
                    },
                    textInputAction: TextInputAction.done,
                  );
                },
              ),
              // Centered spinner overlay while validating
              if (_validatingChip)
                IgnorePointer(
                  child: Center(
                    child: SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: _kPrimary.withValues(alpha: 0.85),
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),

        const SizedBox(height: 14),

        // Suggestion chips
        SizedBox(
          height: 36,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            itemCount: _suggestions.length,
            separatorBuilder: (_, index) => const SizedBox(width: 8),
            itemBuilder: (context, i) {
              final name = _suggestions[i];
              final isAdded = _chips.any((c) => c.displayName == name);
              return GestureDetector(
                onTap: isAdded ? null : () => _addChipAsync(name),
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 14,
                    vertical: 8,
                  ),
                  decoration: BoxDecoration(
                    color: isAdded
                        ? _kPrimary.withValues(alpha: 0.15)
                        : context.surfaceElevatedColor,
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(
                      color: isAdded
                          ? _kPrimary
                          : context.textTertiaryColor.withValues(alpha: 0.2),
                    ),
                  ),
                  child: Text(
                    name,
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 12,
                      fontWeight: isAdded ? FontWeight.w700 : FontWeight.w500,
                      color: isAdded ? _kPrimary : context.textSecondary,
                    ),
                  ),
                ),
              );
            },
          ),
        ),

        const SizedBox(height: 16),

        // Analyze button
        isWorking
            ? _buildPulsingButton()
            : GestureDetector(
                onTap: _startAnalysis,
                child: Container(
                  width: double.infinity,
                  height: 56,
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(
                      colors: [_kPrimary, _kDeep, _kSecondary],
                    ),
                    borderRadius: BorderRadius.circular(16),
                    boxShadow: [
                      BoxShadow(
                        color: _kPrimary.withValues(alpha: 0.4),
                        blurRadius: 20,
                        offset: const Offset(0, 6),
                      ),
                    ],
                  ),
                  child: Stack(
                    alignment: Alignment.center,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          const Icon(
                            Icons.auto_awesome,
                            color: Colors.white,
                            size: 20,
                          ),
                          const SizedBox(width: 10),
                          Text(
                            context.l10n?.startAnalysis ?? 'Start Analysis',
                            style: GoogleFonts.plusJakartaSans(
                              fontWeight: FontWeight.w700,
                              fontSize: 16,
                              color: Colors.white,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
        if (!sub.isPremium) ...[
          const SizedBox(height: 8),
          Align(
            alignment: Alignment.centerRight,
            child: QorAmountBadge(
              amount: analysisCreditCost,
              unlimited: false,
              color: _kPrimary,
              fontSize: 10,
              padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
            ),
          ),
        ],
      ],
    );
  }

  Widget _buildPulsingButton() {
    return AnimatedBuilder(
      animation: _pulseController,
      builder: (context, _) {
        return Container(
          width: double.infinity,
          height: 56,
          decoration: BoxDecoration(
            gradient: LinearGradient(
              colors: [
                _kPrimary.withValues(alpha: 0.6 + _pulseController.value * 0.4),
                _kDeep.withValues(alpha: 0.6 + _pulseController.value * 0.4),
              ],
            ),
            borderRadius: BorderRadius.circular(16),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              SizedBox(
                width: 18,
                height: 18,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: context.surfaceVariantColor,
                ),
              ),
              const SizedBox(width: 12),
              Text(
                context.l10n?.aiIsAnalyzing ?? 'AI is analyzing...',
                style: GoogleFonts.plusJakartaSans(
                  fontWeight: FontWeight.w600,
                  fontSize: 15,
                  color: Colors.white.withValues(alpha: 0.9),
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildError(String msg) {
    return GlassContainer(
      padding: const EdgeInsets.all(16),
      child: Row(
        children: [
          const Icon(
            Icons.error_outline_rounded,
            color: AppTheme.error,
            size: 20,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              msg,
              style: GoogleFonts.plusJakartaSans(
                fontSize: 13,
                color: AppTheme.error,
              ),
            ),
          ),
        ],
      ),
    ).animate().fadeIn(duration: 300.ms).shake(delay: 100.ms);
  }

  static const _kWarning = Color(0xFFFBBF24); // amber-400

  Widget _buildChipWarning(String msg) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: _kWarning.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: _kWarning.withValues(alpha: 0.35), width: 1),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.warning_amber_rounded, color: _kWarning, size: 18),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              msg,
              style: GoogleFonts.plusJakartaSans(
                fontSize: 13,
                fontWeight: FontWeight.w500,
                color: _kWarning,
                height: 1.45,
              ),
            ),
          ),
        ],
      ),
    ).animate().fadeIn(duration: 250.ms).slideY(begin: -0.05);
  }

  // ── Previous Comparisons (idle) ─────────────────────────────────────────

  Widget _buildInfoCards() {
    final items = [
      _InfoItem(
        icon: Icons.forum_rounded,
        gradient: const [_kPrimary, _kDeep],
        title: _copy('communityVoice'),
        subtitle: _copy('communityVoiceSubtitle'),
      ),
      _InfoItem(
        icon: Icons.quiz_rounded,
        gradient: const [_kSecondary, _kAccent],
        title: _copy('personalQuiz'),
        subtitle: _copy('personalQuizSubtitle'),
      ),
      _InfoItem(
        icon: Icons.auto_awesome_rounded,
        gradient: const [_kAccent, AppTheme.success],
        title: _copy('smartMatch'),
        subtitle: _copy('smartMatchSubtitle'),
      ),
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(left: 4, bottom: 12),
          child: Row(
            children: [
              Container(
                width: 4,
                height: 16,
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    colors: [_kPrimary, _kAccent],
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                  ),
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              const SizedBox(width: 10),
              Text(
                context.l10n?.howItWorks ?? 'How It Works',
                style: GoogleFonts.plusJakartaSans(
                  fontWeight: FontWeight.w800,
                  fontSize: 16,
                  color: context.textPrimary,
                  letterSpacing: -0.3,
                ),
              ),
            ],
          ),
        ),
        ...items.asMap().entries.map((entry) {
          final i = entry.key;
          final item = entry.value;
          return Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: context.isDarkMode
                        ? Colors.white.withValues(alpha: 0.04)
                        : Colors.white.withValues(alpha: 0.85),
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(
                      color: item.gradient.first.withValues(
                        alpha: context.isDarkMode ? 0.18 : 0.15,
                      ),
                      width: 0.8,
                    ),
                    boxShadow: context.isDarkMode
                        ? null
                        : AppTheme.cardShadowLight,
                  ),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.center,
                    children: [
                      // Step number
                      SizedBox(
                        width: 28,
                        child: Text(
                          '0${i + 1}',
                          style: GoogleFonts.plusJakartaSans(
                            fontWeight: FontWeight.w900,
                            fontSize: 13,
                            color: item.gradient.first.withValues(alpha: 0.4),
                            letterSpacing: -0.5,
                          ),
                        ),
                      ),
                      // Icon pill
                      Container(
                        width: 42,
                        height: 42,
                        decoration: BoxDecoration(
                          gradient: LinearGradient(
                            colors: item.gradient,
                            begin: Alignment.topLeft,
                            end: Alignment.bottomRight,
                          ),
                          borderRadius: BorderRadius.circular(12),
                          boxShadow: [
                            BoxShadow(
                              color: item.gradient.first.withValues(alpha: 0.3),
                              blurRadius: 10,
                              offset: const Offset(0, 4),
                            ),
                          ],
                        ),
                        child: Center(
                          child: Icon(item.icon, color: Colors.white, size: 20),
                        ),
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              item.title,
                              style: GoogleFonts.plusJakartaSans(
                                fontWeight: FontWeight.w700,
                                fontSize: 14,
                                color: context.textPrimary,
                                letterSpacing: -0.2,
                              ),
                            ),
                            const SizedBox(height: 3),
                            Text(
                              item.subtitle,
                              style: GoogleFonts.plusJakartaSans(
                                fontSize: 12,
                                color: context.textSecondary,
                                height: 1.4,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              )
              .animate(delay: (i * 100).ms)
              .fadeIn(duration: 400.ms)
              .slideX(begin: 0.05);
        }),
      ],
    );
  }
}

// ─── Phase Step Data ─────────────────────────────────────────────────────────

class _PhaseStep {
  final String label;
  final String detail;
  final IconData icon;
  final bool isDone;
  final bool isActive;
  const _PhaseStep({
    required this.label,
    this.detail = '',
    required this.icon,
    required this.isDone,
    required this.isActive,
  });
}

class _InfoItem {
  final IconData icon;
  final List<Color> gradient;
  final String title;
  final String subtitle;
  const _InfoItem({
    required this.icon,
    required this.gradient,
    required this.title,
    required this.subtitle,
  });
}

class _UsageMeter extends StatelessWidget {
  final IconData icon;
  final String label;
  final num remaining;
  final num total;
  final String period;
  final double progress;
  final Color color;

  const _UsageMeter({
    required this.icon,
    required this.label,
    required this.remaining,
    required this.total,
    required this.period,
    required this.progress,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    final langCode = Localizations.localeOf(context).languageCode.toLowerCase();
    return Row(
      children: [
        Icon(icon, size: 16, color: color),
        const SizedBox(width: 8),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    label,
                    style: GoogleFonts.inter(
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      color: context.textPrimary,
                    ),
                  ),
                  Text(
                    '${AppConstants.formatQorAmount(remaining, languageCode: langCode)}/${AppConstants.formatQorAmount(total, languageCode: langCode)}$period',
                    style: GoogleFonts.inter(
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      color: color,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 4),
              ClipRRect(
                borderRadius: BorderRadius.circular(4),
                child: LinearProgressIndicator(
                  value: progress.clamp(0.0, 1.0),
                  minHeight: 4,
                  backgroundColor: color.withValues(alpha: 0.12),
                  valueColor: AlwaysStoppedAnimation<Color>(color),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

// ─── Sub Quiz View ───────────────────────────────────────────────────────────

class _SubQuizView extends StatefulWidget {
  final ProductQuiz quiz;
  final List<String> subscriptionNames;
  final List<QuizQuestion> answeredQuestions;
  final int currentIndex;
  final void Function(int, String) onAnswer;
  final VoidCallback onSubmit;
  final VoidCallback onSkip;

  const _SubQuizView({
    required this.quiz,
    required this.subscriptionNames,
    required this.answeredQuestions,
    required this.currentIndex,
    required this.onAnswer,
    required this.onSubmit,
    required this.onSkip,
  });

  @override
  State<_SubQuizView> createState() => _SubQuizViewState();
}

class _SubQuizViewState extends State<_SubQuizView> {
  bool _isSubmitting = false;

  bool get _allAnswered =>
      widget.answeredQuestions.every((q) => q.selectedOption != null);

  void _handleSubmit() {
    if (_isSubmitting) return;
    setState(() => _isSubmitting = true);
    widget.onSubmit();
  }

  @override
  Widget build(BuildContext context) {
    final answeredCount = widget.answeredQuestions
        .where((q) => q.selectedOption != null)
        .length;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Subscription names mini-card
        GlassContainer(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: _kPrimary.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Center(
                  child: Image.asset(
                    'assets/logo/qor_ai_logo.png',
                    width: 28,
                    height: 28,
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      widget.subscriptionNames.join(' vs '),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: GoogleFonts.plusJakartaSans(
                        fontWeight: FontWeight.w600,
                        fontSize: 14,
                        color: context.textPrimary,
                      ),
                    ),
                    Text(
                      context.l10n?.subscriptionIntelligence ??
                          'Subscription Intelligence',
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 12,
                        color: context.textTertiaryColor,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),

        // Progress bar
        Row(
          children: [
            Expanded(
              child: ClipRRect(
                borderRadius: BorderRadius.circular(4),
                child: LinearProgressIndicator(
                  value: answeredCount / widget.answeredQuestions.length,
                  backgroundColor: AppTheme.slate700,
                  color: _kPrimary,
                  minHeight: 6,
                ),
              ),
            ),
            const SizedBox(width: 12),
            Text(
              '$answeredCount/${widget.answeredQuestions.length}',
              style: GoogleFonts.plusJakartaSans(
                fontWeight: FontWeight.w600,
                fontSize: 13,
                color: AppTheme.slate500,
              ),
            ),
          ],
        ),
        const SizedBox(height: 20),

        // Question cards — shown instantly (no AnimatedSize) to avoid questions
        // appearing "missing" when the screen is recreated on tab switch.
        for (final entry in widget.answeredQuestions.asMap().entries)
          if (entry.key <= widget.currentIndex)
            Padding(
              key: ValueKey(entry.key),
              padding: const EdgeInsets.only(bottom: 12),
              child: _SubQuestionCard(
                question: entry.value,
                index: entry.key,
                isActive: entry.key == widget.currentIndex,
                isAnswered: entry.value.selectedOption != null,
                onAnswer: (answer) => widget.onAnswer(entry.key, answer),
              ),
            ),

        const SizedBox(height: 16),
        if (_allAnswered)
          // Ortada, tam genişlik, modern gradient, BEYAZ yazı.
          SizedBox(
            width: double.infinity,
            child: GradientButton(
              height: 52,
              borderRadius: BorderRadius.circular(16),
              gradient: LinearGradient(
                colors: _isSubmitting
                    ? [AppTheme.slate500, AppTheme.slate600]
                    : const [_kPrimary, _kDeep, _kPrimary],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              onPressed: _isSubmitting ? () {} : _handleSubmit,
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  if (_isSubmitting)
                    const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  else
                    const Icon(
                      Icons.auto_awesome_rounded,
                      color: Colors.white,
                      size: 18,
                    ),
                  const SizedBox(width: 8),
                  Text(
                    _isSubmitting
                        ? (context.l10n?.aiIsAnalyzing ?? 'Analyzing...')
                        : (context.l10n?.startAnalysis ?? 'Start Analysis'),
                    style: GoogleFonts.plusJakartaSans(
                      fontWeight: FontWeight.w800,
                      fontSize: 15,
                      color: Colors.white,
                      letterSpacing: 0.2,
                    ),
                  ),
                ],
              ),
            ),
          )
        else
          Center(
            child: TextButton.icon(
              onPressed: widget.onSkip,
              icon: const Icon(
                Icons.skip_next_rounded,
                color: AppTheme.slate500,
                size: 18,
              ),
              label: Text(
                context.l10n?.skipQuizShowBasic ??
                    'Skip quiz & show basic result',
                style: GoogleFonts.plusJakartaSans(
                  color: AppTheme.slate500,
                  fontSize: 13,
                ),
              ),
            ),
          ),
      ],
    );
  }
}

// ── Question Card ────────────────────────────────────────────────────────────

class _SubQuestionCard extends StatelessWidget {
  final QuizQuestion question;
  final int index;
  final bool isActive;
  final bool isAnswered;
  final void Function(String) onAnswer;

  const _SubQuestionCard({
    required this.question,
    required this.index,
    required this.isActive,
    required this.isAnswered,
    required this.onAnswer,
  });

  @override
  Widget build(BuildContext context) {
    return GlassContainer(
      padding: const EdgeInsets.all(20),
      usePrimaryTint: isActive,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 28,
                height: 28,
                decoration: BoxDecoration(
                  color: isAnswered
                      ? AppTheme.success
                      : _kPrimary.withValues(alpha: 0.1),
                  shape: BoxShape.circle,
                ),
                child: Center(
                  child: isAnswered
                      ? Icon(
                          Icons.check,
                          color: context.surfaceVariantColor,
                          size: 16,
                        )
                      : Text(
                          '${index + 1}',
                          style: GoogleFonts.plusJakartaSans(
                            fontWeight: FontWeight.w700,
                            fontSize: 13,
                            color: _kPrimary,
                          ),
                        ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  question.text,
                  style: GoogleFonts.plusJakartaSans(
                    fontWeight: FontWeight.w600,
                    fontSize: 15,
                    color: context.textPrimary,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          ...question.options.map((option) {
            final isSelected = question.selectedOption == option;
            return Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Material(
                color: Colors.transparent,
                child: InkWell(
                  onTap: () => onAnswer(option),
                  borderRadius: BorderRadius.circular(12),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 200),
                    padding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 14,
                    ),
                    decoration: BoxDecoration(
                      color: isSelected
                          ? _kPrimary.withValues(alpha: 0.08)
                          : context.textPrimary.withValues(alpha: 0.03),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: isSelected ? _kPrimary : AppTheme.slate700,
                        width: isSelected ? 2 : 1,
                      ),
                    ),
                    child: Row(
                      children: [
                        AnimatedContainer(
                          duration: const Duration(milliseconds: 200),
                          width: 20,
                          height: 20,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: isSelected ? _kPrimary : Colors.transparent,
                            border: Border.all(
                              color: isSelected ? _kPrimary : AppTheme.slate400,
                              width: 2,
                            ),
                          ),
                          child: isSelected
                              ? Icon(
                                  Icons.check,
                                  color: context.surfaceVariantColor,
                                  size: 14,
                                )
                              : null,
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Text(
                            option,
                            style: GoogleFonts.plusJakartaSans(
                              fontWeight: isSelected
                                  ? FontWeight.w600
                                  : FontWeight.w500,
                              fontSize: 14,
                              color: isSelected
                                  ? _kPrimary
                                  : context.textPrimary,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            );
          }),
        ],
      ),
    );
  }
}

// ─── Result View ─────────────────────────────────────────────────────────────

class _SubResultView extends StatelessWidget {
  final String analysisText;
  final Map<String, double> scores;
  final List<String> subscriptionNames;
  final Map<String, dynamic>? structured;
  final String countryCode;

  const _SubResultView({
    required this.analysisText,
    required this.scores,
    required this.subscriptionNames,
    this.structured,
    this.countryCode = 'US',
  });

  bool _isTr(BuildContext context) =>
      Localizations.localeOf(context).languageCode.toLowerCase() == 'tr';

  String _txt(BuildContext context, {required String tr, required String en}) {
    return _isTr(context) ? tr : en;
  }

  /// Build readable text from structured data — NEVER show raw JSON.
  String _readableAnalysis(
    BuildContext context,
    String raw,
    Map<String, dynamic> subs,
    Map<String, dynamic> winner,
  ) {
    // If text looks like JSON, never show it raw
    if (raw.trim().startsWith('{') || raw.trim().startsWith('[')) {
      // Structured data available – generate readable summary from it
      if (subs.isNotEmpty) {
        final buf = StringBuffer();
        for (final entry in subs.entries) {
          final d = entry.value as Map<String, dynamic>? ?? {};
          buf.writeln('${entry.key} (${d['compatibility_score'] ?? '?'}%)');
          if (d['compatibility_explanation'] != null) {
            buf.writeln(d['compatibility_explanation']);
          }
          final pros = (d['pros'] as List?)?.cast<String>() ?? [];
          if (pros.isNotEmpty) buf.writeln('\n✅ ${pros.join('\n✅ ')}');
          final cons = (d['cons'] as List?)?.cast<String>() ?? [];
          if (cons.isNotEmpty) buf.writeln('\n❌ ${cons.join('\n❌ ')}');
          buf.writeln();
        }
        if (winner['recommendation'] != null) {
          buf.writeln(winner['recommendation']);
        }
        return buf.toString().trim();
      }
      // No structured data but text is JSON — try to extract readable fields
      try {
        var clean = raw.trim();
        if (clean.startsWith('```')) {
          clean = clean
              .replaceFirst(RegExp(r'^```\w*\n?'), '')
              .replaceFirst(RegExp(r'\n?```$'), '');
        }
        final parsed = jsonDecode(clean) as Map<String, dynamic>?;
        if (parsed != null) {
          return parsed['analysis'] as String? ??
              parsed['summary'] as String? ??
              parsed['recommendation'] as String? ??
              _txt(
                context,
                tr: 'Analiz tamamlandi. Ayrintili sonucu yukaridan inceleyin.',
                en: 'Analysis complete. See the detailed results above.',
              );
        }
      } catch (_) {}
      // Absolute fallback — never show JSON
      return _txt(
        context,
        tr: 'Analiz tamamlandi. Ayrintili sonucu yukaridan inceleyin.',
        en: 'Analysis complete. See the detailed results above.',
      );
    }
    return raw;
  }

  @override
  Widget build(BuildContext context) {
    var subs = (structured?['subscriptions'] as Map<String, dynamic>?) ?? {};
    var winner = (structured?['winner'] as Map<String, dynamic>?) ?? {};

    // If structured is null but analysisText looks like JSON, try to parse it
    if (subs.isEmpty && analysisText.trim().startsWith('{')) {
      try {
        var clean = analysisText.trim();
        if (clean.startsWith('```')) {
          clean = clean
              .replaceFirst(RegExp(r'^```\w*\n?'), '')
              .replaceFirst(RegExp(r'\n?```$'), '');
        }
        final parsed = jsonDecode(clean) as Map<String, dynamic>?;
        if (parsed != null) {
          subs = (parsed['subscriptions'] as Map<String, dynamic>?) ?? {};
          winner = (parsed['winner'] as Map<String, dynamic>?) ?? {};
        }
      } catch (_) {}
    }

    // ── TEK RAPOR SABLONU ──────────────────────────────────────────────
    // Buradaki ~215 satirlik cok panelli duzen (kazanan afisi, skor halkalari,
    // servis kartlari, arti/eksi, topluluk, tavsiye, detayli karsilastirma)
    // KALDIRILDI. Web'de dort AI akisi da TEK bilesenle ciziliyor; uygulamada
    // urun + karsilastirma zaten `_UnifiedBody` kullaniyordu, abonelik eski
    // duzende kalmisti.
    //
    // `subscriptionResultToUnified` motorun `{subscriptions, winner,
    // detailed_comparison}` ciktisini tek servis icin `product_full_report`,
    // birden fazla servis icin `compare_full_report` sekline cevirir → bolum
    // sirasi diger akislarla BIREBIR ayni olur.
    final lang = Localizations.localeOf(context).languageCode;
    final unified = subscriptionResultToUnified(
      structured ?? (subs.isEmpty ? null : {'subscriptions': subs, 'winner': winner}),
      lang,
    );
    if (unified != null) {
      return AiReportView(
        kind: unified['type'] == 'compare_full_report'
            ? 'compareFull'
            : 'productFull',
        data: unified,
        lang: lang,
      );
    }
    // Yapisal veri yoksa (eski kayit / bozuk yanit) okunabilir metne dus —
    // ham JSON ASLA gosterilmez.
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        GlassContainer(
          padding: const EdgeInsets.all(20),
          child: Text(
            _readableAnalysis(context, analysisText, subs, winner),
            style: GoogleFonts.plusJakartaSans(
              fontSize: 14,
              height: 1.55,
              color: context.textSecondary,
            ),
          ),
        ),
        const SizedBox(height: 16),
      ],
    );
  }

}

// ── Comparison Section Helper ────────────────────────────────────────────────

// ── Score Ring Widget ────────────────────────────────────────────────────────

