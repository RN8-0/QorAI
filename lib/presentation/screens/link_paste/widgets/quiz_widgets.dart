part of '../link_paste_screen.dart';

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

// ---------------------------------------------------------------
// QUIZ VIEW
// ---------------------------------------------------------------

class _QuizView extends StatelessWidget {
  final ProductQuiz quiz;
  final List<QuizQuestion> answeredQuestions;
  final int currentIndex;
  final LinkAnalysisResult baseResult;
  final void Function(int, String) onAnswer;
  final VoidCallback onSubmit;
  final VoidCallback onSkip;

  const _QuizView({
    required this.quiz,
    required this.answeredQuestions,
    required this.currentIndex,
    required this.baseResult,
    required this.onAnswer,
    required this.onSubmit,
    required this.onSkip,
  });

  bool get _allAnswered =>
      answeredQuestions.every((q) => q.selectedOption != null);

  @override
  Widget build(BuildContext context) {
    final answeredCount = answeredQuestions
        .where((q) => q.selectedOption != null)
        .length;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Product mini-card
        GlassContainer(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: AppTheme.primaryBlue.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: baseResult.metadata.image != null
                    ? ClipRRect(
                        borderRadius: BorderRadius.circular(12),
                        child: Image.network(
                          baseResult.metadata.image!,
                          fit: BoxFit.cover,
                          errorBuilder: (_, __, ___) => const Icon(
                            Icons.shopping_bag_rounded,
                            color: AppTheme.primaryBlue,
                          ),
                        ),
                      )
                    : const Icon(
                        Icons.shopping_bag_rounded,
                        color: AppTheme.primaryBlue,
                      ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      baseResult.metadata.title ??
                          (context.l10n?.productLabel ?? 'Product'),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: GoogleFonts.plusJakartaSans(
                        fontWeight: FontWeight.w600,
                        fontSize: 14,
                        color: context.textPrimary,
                      ),
                    ),
                    if (baseResult.category != null)
                      Text(
                        baseResult.category!,
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 12,
                          color: context.textTertiaryColor,
                        ),
                      ),
                  ],
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 10,
                  vertical: 4,
                ),
                decoration: BoxDecoration(
                  color: AppTheme.primaryBlue.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(
                  '${baseResult.aiScore.toStringAsFixed(0)}%',
                  style: GoogleFonts.plusJakartaSans(
                    fontWeight: FontWeight.w700,
                    fontSize: 13,
                    color: AppTheme.primaryBlue,
                  ),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),

        // Progress bar
        Builder(
          builder: (ctx) {
            final progress = answeredCount / answeredQuestions.length;
            final pct = (progress * 100).round();
            return Row(
              children: [
                Expanded(
                  child: Stack(
                    children: [
                      Container(
                        height: 8,
                        decoration: BoxDecoration(
                          color: ctx.isDarkMode
                              ? Colors.white.withValues(alpha: 0.06)
                              : AppTheme.brandBlue.withValues(alpha: 0.08),
                          borderRadius: BorderRadius.circular(6),
                        ),
                      ),
                      AnimatedFractionallySizedBox(
                        duration: const Duration(milliseconds: 400),
                        curve: Curves.easeOut,
                        widthFactor: progress,
                        child: Container(
                          height: 8,
                          decoration: BoxDecoration(
                            gradient: const LinearGradient(
                              colors: [
                                AppTheme.brandBlue,
                                AppTheme.brandCyan,
                              ],
                            ),
                            borderRadius: BorderRadius.circular(6),
                            boxShadow: [
                              BoxShadow(
                                color: AppTheme.brandBlue.withValues(
                                  alpha: 0.3,
                                ),
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
                  padding: const EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: 4,
                  ),
                  decoration: BoxDecoration(
                    color: AppTheme.brandBlue.withValues(
                      alpha: ctx.isDarkMode ? 0.14 : 0.08,
                    ),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                      color: AppTheme.brandBlue.withValues(alpha: 0.2),
                    ),
                  ),
                  child: Text(
                    '$answeredCount/${answeredQuestions.length}  ·  $pct%',
                    style: GoogleFonts.plusJakartaSans(
                      fontWeight: FontWeight.w800,
                      fontSize: 11.5,
                      color: AppTheme.brandBlue,
                      letterSpacing: -0.2,
                    ),
                  ),
                ),
              ],
            );
          },
        ),
        const SizedBox(height: 20),

        // Question cards
        ...answeredQuestions.asMap().entries.map((entry) {
          final idx = entry.key;
          final q = entry.value;
          final isActive = idx == currentIndex;
          final isAnswered = q.selectedOption != null;

          return AnimatedSize(
            duration: const Duration(milliseconds: 300),
            curve: Curves.easeInOut,
            child: idx <= currentIndex
                ? Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: _QuestionCard(
                      question: q,
                      index: idx,
                      isActive: isActive,
                      isAnswered: isAnswered,
                      onAnswer: (answer) => onAnswer(idx, answer),
                    ),
                  )
                : const SizedBox.shrink(),
          );
        }),

        const SizedBox(height: 16),
        if (_allAnswered)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Align(
              alignment: Alignment.centerLeft,
              child: ElevatedButton.icon(
                onPressed: onSubmit,
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppTheme.brandBlue,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(
                    horizontal: 16,
                    vertical: 10,
                  ),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(24),
                  ),
                  elevation: 2,
                ),
                icon: const Icon(Icons.insights_rounded, size: 16),
                label: Text(
                  context.l10n?.seeMyMatchScore ?? 'See My Match Score',
                  style: GoogleFonts.plusJakartaSans(
                    fontWeight: FontWeight.w700,
                    fontSize: 12,
                  ),
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

class _QuestionCard extends StatelessWidget {
  final QuizQuestion question;
  final int index;
  final bool isActive;
  final bool isAnswered;
  final void Function(String) onAnswer;

  const _QuestionCard({
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
        boxShadow: isActive
            ? [
                BoxShadow(
                  color: AppTheme.brandBlue.withValues(
                    alpha: isDark ? 0.2 : 0.12,
                  ),
                  blurRadius: 16,
                  offset: const Offset(0, 6),
                ),
              ]
            : (isDark ? null : AppTheme.cardShadowLight),
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
                          colors: [
                            AppTheme.success,
                            AppTheme.scoreExcellent,
                          ],
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
                  boxShadow: isActive && !isAnswered
                      ? [
                          BoxShadow(
                            color: AppTheme.brandBlue.withValues(alpha: 0.3),
                            blurRadius: 8,
                            offset: const Offset(0, 2),
                          ),
                        ]
                      : null,
                ),
                child: Center(
                  child: isAnswered
                      ? const Icon(
                          Icons.check_rounded,
                          color: Colors.white,
                          size: 18,
                        )
                      : Text(
                          '${index + 1}',
                          style: GoogleFonts.plusJakartaSans(
                            fontWeight: FontWeight.w800,
                            fontSize: 13,
                            color: isActive
                                ? Colors.white
                                : AppTheme.brandBlue,
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
                              ? const Icon(
                                  Icons.check_rounded,
                                  color: Colors.white,
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

// ---------------------------------------------------------------
// ENHANCED RESULT VIEW
// ---------------------------------------------------------------
