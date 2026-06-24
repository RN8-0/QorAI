import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:qor_ai/core/theme.dart';

/// Tekli ürün VE karşılaştırma analizinde AYNI başlangıç ekranı: sayfanın
/// ortasında, yaratıcı animasyonlu AI hero (pulsing gradient orb + dönen
/// kıvılcımlar) + "Analizi Başlat" butonu. Butona basınca normal akış
/// (quiz → rapor) devam eder.
///
/// Not: AI'a özel hazır bir Lottie asseti gelirse `assets/lottie/ai_*.json`
/// olarak eklenip orb yerine kullanılabilir; şimdilik bağımlılıksız, her
/// cihazda akıcı çalışan native animasyon tercih edildi.
class AiAnalysisStartCard extends StatefulWidget {
  final VoidCallback onStart;
  final bool isTr;
  final bool isError;
  final String? titleOverride;
  final String? subtitleOverride;

  const AiAnalysisStartCard({
    super.key,
    required this.onStart,
    required this.isTr,
    this.isError = false,
    this.titleOverride,
    this.subtitleOverride,
  });

  @override
  State<AiAnalysisStartCard> createState() => _AiAnalysisStartCardState();
}

class _AiAnalysisStartCardState extends State<AiAnalysisStartCard>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: const Duration(seconds: 3),
  )..repeat();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isTr = widget.isTr;
    return ConstrainedBox(
      constraints: const BoxConstraints(minHeight: 440),
      child: Center(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              SizedBox(
                width: 140,
                height: 140,
                child: AnimatedBuilder(
                  animation: _c,
                  builder: (context, _) {
                    final t = _c.value;
                    final pulse = 0.5 + 0.5 * math.sin(t * 2 * math.pi);
                    return Stack(
                      alignment: Alignment.center,
                      children: [
                        // Pulsing dış halkalar
                        for (var i = 0; i < 3; i++)
                          Container(
                            width: 82 + i * 18 + pulse * 10,
                            height: 82 + i * 18 + pulse * 10,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              border: Border.all(
                                color: AppTheme.brandCyan.withValues(
                                  alpha:
                                      (0.26 - i * 0.07) * (0.55 + 0.45 * pulse),
                                ),
                                width: 1.4,
                              ),
                            ),
                          ),
                        // Çekirdek gradient orb
                        Container(
                          width: 78,
                          height: 78,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            gradient: const LinearGradient(
                              colors: [
                                AppTheme.premiumPurple,
                                AppTheme.primaryBlue,
                              ],
                              begin: Alignment.topLeft,
                              end: Alignment.bottomRight,
                            ),
                            boxShadow: [
                              BoxShadow(
                                color: AppTheme.primaryBlue.withValues(
                                  alpha: 0.35 + 0.25 * pulse,
                                ),
                                blurRadius: 22 + pulse * 14,
                                spreadRadius: 2,
                              ),
                            ],
                          ),
                          child: const Icon(
                            Icons.auto_awesome_rounded,
                            color: Colors.white,
                            size: 34,
                          ),
                        ),
                        // Dönen kıvılcımlar
                        for (var i = 0; i < 3; i++)
                          Transform.translate(
                            offset: Offset.fromDirection(
                              t * 2 * math.pi + i * 2 * math.pi / 3,
                              54,
                            ),
                            child: Icon(
                              Icons.auto_awesome,
                              size: i == 0 ? 14 : 10,
                              color: AppTheme.brandCyan.withValues(
                                alpha: 0.45 + 0.45 * pulse,
                              ),
                            ),
                          ),
                      ],
                    );
                  },
                ),
              ),
              const SizedBox(height: 22),
              Text(
                widget.titleOverride ?? (isTr ? 'AI Analizi' : 'AI Analysis'),
                textAlign: TextAlign.center,
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 20,
                  fontWeight: FontWeight.w800,
                  color: context.textPrimary,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                widget.subtitleOverride ??
                    (isTr
                        ? 'Yorumlar, teknik analiz, tavsiye ve fiyat tahmini — sana özel.'
                        : 'Reviews, specs, advice and price prediction — personalized.'),
                textAlign: TextAlign.center,
                style: GoogleFonts.inter(
                  fontSize: 13.5,
                  height: 1.45,
                  color: context.textSecondary,
                ),
              ),
              if (widget.isError) ...[
                const SizedBox(height: 10),
                Text(
                  isTr
                      ? 'AI analizi tamamlanamadı. Lütfen tekrar dene.'
                      : 'AI analysis could not be completed. Please try again.',
                  textAlign: TextAlign.center,
                  style: GoogleFonts.inter(fontSize: 12, color: AppTheme.error),
                ),
              ],
              const SizedBox(height: 24),
              SizedBox(
                width: double.infinity,
                child: FilledButton.icon(
                  onPressed: widget.onStart,
                  style: FilledButton.styleFrom(
                    backgroundColor: AppTheme.brandBlue,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 15),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(16),
                    ),
                  ),
                  icon: const Icon(Icons.auto_awesome_rounded, size: 19),
                  label: Text(
                    widget.isError
                        ? (isTr ? 'Tekrar Dene' : 'Try Again')
                        : (isTr ? 'Analizi Başlat' : 'Start Analysis'),
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 15,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
