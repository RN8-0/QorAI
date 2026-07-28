import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:qor_ai/core/theme.dart';
import 'package:qor_ai/core/user_profile_resolver.dart';
import 'package:qor_ai/routing/router.dart' show AppRoutes;

/// AI özellikleri (ürün/karşılaştırma/link/abonelik analizi) kayıt-sonrası
/// profil quiz'inin tamamlanmasını gerektirir. Kullanıcı quizi atladıysa
/// (quizCompleted=false) modern, kibar bir alt-sayfa uyarısı gösterir; iki
/// buton sunar: "Daha Sonra" (kapat) ve "Şimdi Tamamla" (quize yönlendir).
/// Quiz tamamlandıktan SONRA Q Coin bakiyesi izin verdiği sürece tüm AI
/// özellikleri kullanılabilir. Tüm desteklenen dillerde (en/tr/de/es/fr/pt/ru).
///
/// true  → akış devam edebilir (quiz tamam ya da gerek yok: anonim/giriş yok)
/// false → engellendi (kullanıcı uyarıyı gördü, quize yönlendirildi ya da kapattı)
Future<bool> ensureOnboardingQuizGate(
  BuildContext context,
  WidgetRef ref, {
  // Geriye dönük uyumluluk için tutuldu; dil artık context'ten çözülüyor.
  bool? isTr,
}) async {
  // Profil stream'i auth yüklenirken null yayınlıyor → `valueOrNull` tek başına
  // "quiz yapılmamış" yanılgısı üretiyordu. resolveUserProfile yalnızca gerçekten
  // oturum yoksa null döner.
  final user = await resolveUserProfile(ref);
  // Giriş yok / anonim misafir / zaten tamamlamış → engelleme yok.
  if (user == null || user.quizCompleted) return true;
  if (!context.mounted) return false;
  final go = await showModalBottomSheet<bool>(
    context: context,
    backgroundColor: Colors.transparent,
    isScrollControlled: true,
    // Kök navigator → yüzen alt nav bar'ın ÜSTÜNDE çiz; aksi halde "Daha Sonra"
    // butonu nav bar'ın altında kalıp görünmüyordu.
    useRootNavigator: true,
    builder: (ctx) => const _QuizGateSheet(),
  );
  if (go == true && context.mounted) {
    context.push(AppRoutes.quiz);
  }
  return false;
}

class _QuizGateStrings {
  final String title;
  final String body;
  final String complete;
  final String later;
  const _QuizGateStrings({
    required this.title,
    required this.body,
    required this.complete,
    required this.later,
  });
}

const _gateStringsByLang = <String, _QuizGateStrings>{
  'en': _QuizGateStrings(
    title: 'Complete your quick profile first',
    body:
        'To make Qor AI analyses personal to you, complete the short profile quiz first. '
        'Just a few questions — then you can use all AI features as your Q Coin balance allows.',
    complete: 'Complete now',
    later: 'Later',
  ),
  'tr': _QuizGateStrings(
    title: 'Önce kısa profilini tamamla',
    body:
        'Qor AI analizleri sana özel olsun diye önce kısa profil quizini çöz. '
        'Sadece birkaç soru — sonra Q Coin bakiyen el verdiğince tüm AI özelliklerini kullanabilirsin.',
    complete: 'Şimdi Tamamla',
    later: 'Daha Sonra',
  ),
  'de': _QuizGateStrings(
    title: 'Vervollständige zuerst dein kurzes Profil',
    body:
        'Damit die Qor-AI-Analysen auf dich zugeschnitten sind, fülle zuerst das kurze Profil-Quiz aus. '
        'Nur ein paar Fragen — danach kannst du alle KI-Funktionen nutzen, soweit dein Q-Coin-Guthaben reicht.',
    complete: 'Jetzt abschließen',
    later: 'Später',
  ),
  'es': _QuizGateStrings(
    title: 'Primero completa tu perfil rápido',
    body:
        'Para que los análisis de Qor AI sean personales, completa primero el breve cuestionario de perfil. '
        'Solo unas preguntas — luego podrás usar todas las funciones de IA según tu saldo de Q Coin.',
    complete: 'Completar ahora',
    later: 'Más tarde',
  ),
  'fr': _QuizGateStrings(
    title: 'Complète d\'abord ton profil rapide',
    body:
        'Pour que les analyses Qor AI te soient personnalisées, complète d\'abord le court quiz de profil. '
        'Quelques questions — ensuite tu peux utiliser toutes les fonctions IA selon ton solde de Q Coin.',
    complete: 'Compléter maintenant',
    later: 'Plus tard',
  ),
  'pt': _QuizGateStrings(
    title: 'Primeiro completa o teu perfil rápido',
    body:
        'Para que as análises da Qor AI sejam personalizadas, completa primeiro o breve quiz de perfil. '
        'Apenas algumas perguntas — depois podes usar todas as funções de IA conforme o teu saldo de Q Coin.',
    complete: 'Completar agora',
    later: 'Mais tarde',
  ),
  'ru': _QuizGateStrings(
    title: 'Сначала заполните короткий профиль',
    body:
        'Чтобы анализы Qor AI были персональными, сначала пройдите короткий профильный опрос. '
        'Всего несколько вопросов — затем вы сможете пользоваться всеми ИИ-функциями в пределах баланса Q Coin.',
    complete: 'Завершить сейчас',
    later: 'Позже',
  ),
};

class _QuizGateSheet extends StatelessWidget {
  const _QuizGateSheet();

  @override
  Widget build(BuildContext ctx) {
    final lang = Localizations.localeOf(ctx).languageCode.toLowerCase();
    final s = _gateStringsByLang[lang] ?? _gateStringsByLang['en']!;
    return Container(
      padding: EdgeInsets.fromLTRB(
        20,
        10,
        20,
        20 + MediaQuery.of(ctx).padding.bottom,
      ),
      decoration: BoxDecoration(
        color: ctx.surfaceColor,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 40,
            height: 4,
            margin: const EdgeInsets.only(bottom: 18),
            decoration: BoxDecoration(
              color: ctx.dividerColor,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          Container(
            width: 64,
            height: 64,
            decoration: BoxDecoration(
              gradient: AppTheme.primaryGradient,
              borderRadius: BorderRadius.circular(20),
              boxShadow: [
                BoxShadow(
                  color: AppTheme.brandBlue.withValues(alpha: 0.35),
                  blurRadius: 18,
                  offset: const Offset(0, 6),
                ),
              ],
            ),
            child: const Icon(
              Icons.auto_awesome_rounded,
              color: Colors.white,
              size: 30,
            ),
          ),
          const SizedBox(height: 16),
          Text(
            s.title,
            textAlign: TextAlign.center,
            style: GoogleFonts.plusJakartaSans(
              fontSize: 19,
              fontWeight: FontWeight.w800,
              color: ctx.textPrimary,
            ),
          ),
          const SizedBox(height: 10),
          Text(
            s.body,
            textAlign: TextAlign.center,
            style: GoogleFonts.inter(
              fontSize: 13.5,
              height: 1.5,
              color: ctx.textSecondary,
            ),
          ),
          const SizedBox(height: 22),
          // Primary — modern gradient "Complete now"
          SizedBox(
            width: double.infinity,
            child: GestureDetector(
              onTap: () => Navigator.of(ctx).pop(true),
              child: Container(
                padding: const EdgeInsets.symmetric(vertical: 15),
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    colors: [
                      AppTheme.brandBlue,
                      AppTheme.brandDeepBlue,
                      AppTheme.brandBlue,
                    ],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                  borderRadius: BorderRadius.circular(14),
                  boxShadow: [
                    BoxShadow(
                      color: AppTheme.brandDeepBlue.withValues(alpha: 0.4),
                      blurRadius: 14,
                      offset: const Offset(0, 5),
                    ),
                  ],
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Icon(
                      Icons.auto_awesome_rounded,
                      color: Colors.white,
                      size: 17,
                    ),
                    const SizedBox(width: 8),
                    Text(
                      s.complete,
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
          const SizedBox(height: 10),
          // Secondary — "Later"
          SizedBox(
            width: double.infinity,
            child: TextButton(
              onPressed: () => Navigator.of(ctx).pop(false),
              style: TextButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 12),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                ),
              ),
              child: Text(
                s.later,
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                  color: ctx.textTertiaryColor,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
