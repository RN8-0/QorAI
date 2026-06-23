/// Shared quiz UI — the SAME visual quiz used by Link & Subscription analysis,
/// reusable from product detail + compare AI flows. Decoupled from
/// LinkAnalysisResult so any caller can show it with plain product display
/// data (title/image/subtitle).
library;

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:qor_ai/core/theme.dart';
import 'package:qor_ai/domain/entities/ai_entities.dart';
import 'package:qor_ai/presentation/widgets/product_image_box.dart';

/// Minimal product display data for the quiz header card(s).
class SharedQuizProduct {
  final String title;
  final String? imageUrl;
  final List<String> fallbackImages;
  final String? subtitle;

  const SharedQuizProduct({
    required this.title,
    this.imageUrl,
    this.fallbackImages = const [],
    this.subtitle,
  });
}

/// The shared quiz view — progress bar + product mini-cards + question cards +
/// submit / skip. Visual parity with the Link/Subscription quiz.
class SharedQuizView extends StatelessWidget {
  final List<SharedQuizProduct> products;
  final List<QuizQuestion> questions;
  final int currentIndex;
  final void Function(int index, String answer) onAnswer;
  final VoidCallback onSubmit;
  final VoidCallback onSkip;
  final String submitLabel;
  final String skipLabel;

  const SharedQuizView({
    super.key,
    required this.products,
    required this.questions,
    required this.currentIndex,
    required this.onAnswer,
    required this.onSubmit,
    required this.onSkip,
    this.submitLabel = 'See Analysis',
    this.skipLabel = 'Skip & analyze',
  });

  bool get _allAnswered =>
      questions.isNotEmpty &&
      questions.every((q) => q.selectedOption != null);

  @override
  Widget build(BuildContext context) {
    final answeredCount =
        questions.where((q) => q.selectedOption != null).length;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (final p in products)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: _QuizProductCard(product: p),
          ),
        const SizedBox(height: 16),

        // Progress bar
        Row(
          children: [
            Expanded(
              child: Stack(
                children: [
                  Container(
                    height: 8,
                    decoration: BoxDecoration(
                      color: context.isDarkMode
                          ? Colors.white.withValues(alpha: 0.06)
                          : AppTheme.brandBlue.withValues(alpha: 0.08),
                      borderRadius: BorderRadius.circular(6),
                    ),
                  ),
                  AnimatedFractionallySizedBox(
                    duration: const Duration(milliseconds: 400),
                    curve: Curves.easeOut,
                    widthFactor: questions.isEmpty
                        ? 0
                        : answeredCount / questions.length,
                    child: Container(
                      height: 8,
                      decoration: BoxDecoration(
                        gradient: const LinearGradient(
                          colors: [AppTheme.brandBlue, AppTheme.brandCyan],
                        ),
                        borderRadius: BorderRadius.circular(6),
                        boxShadow: [
                          BoxShadow(
                            color: AppTheme.brandBlue.withValues(alpha: 0.3),
                            blurRadius: 6,
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 12),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                color: AppTheme.brandBlue.withValues(
                  alpha: context.isDarkMode ? 0.14 : 0.08,
                ),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: AppTheme.brandBlue.withValues(alpha: 0.2),
                ),
              ),
              child: Text(
                '$answeredCount/${questions.length}',
                style: GoogleFonts.plusJakartaSans(
                  fontWeight: FontWeight.w800,
                  fontSize: 11.5,
                  color: AppTheme.brandBlue,
                  letterSpacing: -0.2,
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 20),

        for (final entry in questions.asMap().entries)
          if (entry.key <= currentIndex)
            Padding(
              key: ValueKey('quiz-q-${entry.key}'),
              padding: const EdgeInsets.only(bottom: 12),
              child: _SharedQuestionCard(
                question: entry.value,
                index: entry.key,
                isActive: entry.key == currentIndex,
                isAnswered: entry.value.selectedOption != null,
                onAnswer: (answer) => onAnswer(entry.key, answer),
              ),
            ),

        const SizedBox(height: 12),
        if (_allAnswered)
          Align(
            alignment: Alignment.centerLeft,
            child: ElevatedButton.icon(
              onPressed: onSubmit,
              style: ElevatedButton.styleFrom(
                backgroundColor: AppTheme.brandBlue,
                foregroundColor: Colors.white,
                padding:
                    const EdgeInsets.symmetric(horizontal: 18, vertical: 11),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(24),
                ),
                elevation: 2,
              ),
              icon: const Icon(Icons.auto_awesome_rounded, size: 16),
              label: Text(
                submitLabel,
                style: GoogleFonts.plusJakartaSans(
                  fontWeight: FontWeight.w700,
                  fontSize: 12.5,
                ),
              ),
            ),
          )
        else
          Center(
            child: TextButton.icon(
              onPressed: onSkip,
              icon: const Icon(
                Icons.skip_next_rounded,
                color: AppTheme.slate500,
                size: 18,
              ),
              label: Text(
                skipLabel,
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

class _QuizProductCard extends StatelessWidget {
  final SharedQuizProduct product;
  const _QuizProductCard({required this.product});

  @override
  Widget build(BuildContext context) {
    final isDark = context.isDarkMode;
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: isDark
            ? Colors.white.withValues(alpha: 0.04)
            : Colors.white.withValues(alpha: 0.92),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: isDark
              ? Colors.white.withValues(alpha: 0.08)
              : AppTheme.brandBlue.withValues(alpha: 0.1),
        ),
      ),
      child: Row(
        children: [
          SizedBox(
            width: 48,
            height: 48,
            child: ProductImageBox(
              imageUrl: product.imageUrl,
              fallbackUrls: product.fallbackImages,
              width: 48,
              height: 48,
              borderRadius: BorderRadius.circular(12),
              padding: const EdgeInsets.all(4),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  product.title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: GoogleFonts.plusJakartaSans(
                    fontWeight: FontWeight.w600,
                    fontSize: 14,
                    color: context.textPrimary,
                  ),
                ),
                if (product.subtitle != null && product.subtitle!.isNotEmpty)
                  Text(
                    product.subtitle!,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
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
    );
  }
}

class _SharedQuestionCard extends StatelessWidget {
  final QuizQuestion question;
  final int index;
  final bool isActive;
  final bool isAnswered;
  final void Function(String) onAnswer;

  const _SharedQuestionCard({
    required this.question,
    required this.index,
    required this.isActive,
    required this.isAnswered,
    required this.onAnswer,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = context.isDarkMode;
    return AnimatedContainer(
      duration: const Duration(milliseconds: 300),
      curve: Curves.easeOut,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: isDark
            ? Colors.white.withValues(alpha: isActive ? 0.05 : 0.03)
            : Colors.white.withValues(alpha: 0.92),
        borderRadius: BorderRadius.circular(22),
        border: Border.all(
          color: isActive
              ? AppTheme.brandBlue.withValues(alpha: 0.4)
              : (isDark
                  ? Colors.white.withValues(alpha: 0.08)
                  : AppTheme.brandBlue.withValues(alpha: 0.1)),
          width: isActive ? 1.5 : 1,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 32,
                height: 32,
                decoration: BoxDecoration(
                  gradient: isAnswered
                      ? const LinearGradient(
                          colors: [AppTheme.success, AppTheme.scoreExcellent],
                        )
                      : isActive
                          ? const LinearGradient(
                              colors: [
                                AppTheme.brandBlue,
                                AppTheme.brandDeepBlue,
                              ],
                            )
                          : null,
                  color: !isAnswered && !isActive
                      ? (isDark
                          ? Colors.white.withValues(alpha: 0.06)
                          : AppTheme.brandBlue.withValues(alpha: 0.08))
                      : null,
                  shape: BoxShape.circle,
                ),
                child: Center(
                  child: isAnswered
                      ? const Icon(Icons.check_rounded,
                          color: Colors.white, size: 18)
                      : Text(
                          '${index + 1}',
                          style: GoogleFonts.plusJakartaSans(
                            fontWeight: FontWeight.w800,
                            fontSize: 13,
                            color:
                                isActive ? Colors.white : AppTheme.brandBlue,
                          ),
                        ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  question.text,
                  style: GoogleFonts.plusJakartaSans(
                    fontWeight: FontWeight.w700,
                    fontSize: 15,
                    color: context.textPrimary,
                    letterSpacing: -0.2,
                    height: 1.3,
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
                  borderRadius: BorderRadius.circular(14),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 200),
                    padding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 14,
                    ),
                    decoration: BoxDecoration(
                      color: isSelected
                          ? AppTheme.brandBlue.withValues(
                              alpha: isDark ? 0.14 : 0.08,
                            )
                          : (isDark
                              ? Colors.white.withValues(alpha: 0.03)
                              : AppTheme.brandBlue.withValues(alpha: 0.03)),
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(
                        color: isSelected
                            ? AppTheme.brandBlue
                            : (isDark
                                ? Colors.white.withValues(alpha: 0.08)
                                : AppTheme.brandBlue.withValues(alpha: 0.12)),
                        width: isSelected ? 1.8 : 1,
                      ),
                    ),
                    child: Row(
                      children: [
                        AnimatedContainer(
                          duration: const Duration(milliseconds: 200),
                          width: 22,
                          height: 22,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            gradient: isSelected
                                ? const LinearGradient(
                                    colors: [
                                      AppTheme.brandBlue,
                                      AppTheme.brandDeepBlue,
                                    ],
                                  )
                                : null,
                            color: isSelected ? null : Colors.transparent,
                            border: Border.all(
                              color: isSelected
                                  ? AppTheme.brandBlue
                                  : (isDark
                                      ? Colors.white38
                                      : AppTheme.slate400),
                              width: 2,
                            ),
                          ),
                          child: isSelected
                              ? const Icon(Icons.check_rounded,
                                  color: Colors.white, size: 14)
                              : null,
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Text(
                            option,
                            style: GoogleFonts.plusJakartaSans(
                              fontWeight: isSelected
                                  ? FontWeight.w700
                                  : FontWeight.w600,
                              fontSize: 14,
                              color: isSelected
                                  ? AppTheme.brandBlue
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
