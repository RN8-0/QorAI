import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:qor_ai/core/theme.dart';
import 'package:qor_ai/presentation/providers/providers.dart';
import 'package:qor_ai/routing/router.dart' show AppRoutes;

/// AI özellikleri (ürün/karşılaştırma/link/abonelik analizi) kayıt-sonrası
/// profil quiz'inin tamamlanmasını gerektirir. Kullanıcı quizi atladıysa
/// (quizCompleted=false) güzel bir alt-sayfa uyarısı gösterir ve quize
/// yönlendirir. Quiz tamamlandıktan SONRA Q Coin bakiyesi izin verdiği sürece
/// tüm AI özellikleri kullanılabilir.
///
/// true  → akış devam edebilir (quiz tamam ya da gerek yok: anonim/giriş yok)
/// false → engellendi (kullanıcı uyarıyı gördü, quize yönlendirildi ya da kapattı)
Future<bool> ensureOnboardingQuizGate(
  BuildContext context,
  WidgetRef ref, {
  required bool isTr,
}) async {
  final user = ref.read(userProfileProvider).valueOrNull;
  // Giriş yok / anonim misafir / zaten tamamlamış → engelleme yok.
  if (user == null || user.quizCompleted) return true;
  if (!context.mounted) return false;
  final go = await showModalBottomSheet<bool>(
    context: context,
    backgroundColor: Colors.transparent,
    isScrollControlled: true,
    builder: (ctx) => _QuizGateSheet(isTr: isTr),
  );
  if (go == true && context.mounted) {
    context.push(AppRoutes.quiz);
  }
  return false;
}

class _QuizGateSheet extends StatelessWidget {
  final bool isTr;
  const _QuizGateSheet({required this.isTr});

  @override
  Widget build(BuildContext ctx) {
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
            ),
            child: const Icon(
              Icons.auto_awesome_rounded,
              color: Colors.white,
              size: 30,
            ),
          ),
          const SizedBox(height: 16),
          Text(
            isTr
                ? 'Önce kısa profilini tamamla'
                : 'Complete your quick profile first',
            textAlign: TextAlign.center,
            style: GoogleFonts.plusJakartaSans(
              fontSize: 19,
              fontWeight: FontWeight.w800,
              color: ctx.textPrimary,
            ),
          ),
          const SizedBox(height: 10),
          Text(
            isTr
                ? 'Qor AI analizleri sana özel olsun diye önce kısa profil quizini çözmen gerekiyor. Birkaç soru — sonra Q Coin bakiyen el verdiğince tüm AI özelliklerini kullanabilirsin.'
                : 'To make Qor AI analyses personal to you, complete the short profile quiz first. Just a few questions — then you can use all AI features as your Q Coin balance allows.',
            textAlign: TextAlign.center,
            style: GoogleFonts.inter(
              fontSize: 13.5,
              height: 1.5,
              color: ctx.textSecondary,
            ),
          ),
          const SizedBox(height: 22),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: () => Navigator.of(ctx).pop(true),
              style: ElevatedButton.styleFrom(
                backgroundColor: AppTheme.brandCyan,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                ),
              ),
              child: Text(
                isTr ? 'Quizi Çöz' : 'Take the quiz',
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 15,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ),
          const SizedBox(height: 8),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: Text(
              isTr ? 'Daha sonra' : 'Later',
              style: GoogleFonts.plusJakartaSans(
                fontSize: 13.5,
                fontWeight: FontWeight.w600,
                color: ctx.textTertiaryColor,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
