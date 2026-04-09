part of '../link_paste_screen.dart';

class _PhaseStep {
  final String label;
  final IconData icon;
  final bool isDone;
  final bool isActive;

  const _PhaseStep({
    required this.label,
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
    final answeredCount =
        answeredQuestions.where((q) => q.selectedOption != null).length;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Product mini-card
        GlassContainer(
          padding: const EdgeInsets.all(16),
          child: Row(children: [
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
                      child: Image.network(baseResult.metadata.image!,
                          fit: BoxFit.cover,
                          errorBuilder: (_, __, ___) => const Icon(
                              Icons.shopping_bag_rounded,
                              color: AppTheme.primaryBlue)),
                    )
                  : const Icon(Icons.shopping_bag_rounded,
                      color: AppTheme.primaryBlue),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(baseResult.metadata.title ?? 'Product',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: GoogleFonts.plusJakartaSans(
                          fontWeight: FontWeight.w600,
                          fontSize: 14,
                          color: context.textPrimary)),
                  if (baseResult.category != null)
                    Text(baseResult.category!,
                        style: GoogleFonts.plusJakartaSans(
                            fontSize: 12,
                            color: context.textTertiaryColor)),
                ],
              ),
            ),
            Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                color: AppTheme.primaryBlue.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(20),
              ),
              child: Text(
                  '${baseResult.aiScore.toStringAsFixed(0)}%',
                  style: GoogleFonts.plusJakartaSans(
                      fontWeight: FontWeight.w700,
                      fontSize: 13,
                      color: AppTheme.primaryBlue)),
            ),
          ]),
        ),
        const SizedBox(height: 16),

        // Progress bar
        Row(children: [
          Expanded(
            child: ClipRRect(
              borderRadius: BorderRadius.circular(4),
              child: LinearProgressIndicator(
                value: answeredCount / answeredQuestions.length,
                backgroundColor: AppTheme.slate700,
                color: AppTheme.primaryBlue,
                minHeight: 6,
              ),
            ),
          ),
          const SizedBox(width: 12),
          Text('$answeredCount/${answeredQuestions.length}',
              style: GoogleFonts.plusJakartaSans(
                  fontWeight: FontWeight.w600,
                  fontSize: 13,
                  color: AppTheme.slate500)),
        ]),
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
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(24),
                  ),
                  elevation: 2,
                ),
                icon: const Icon(Icons.insights_rounded, size: 16),
                label: Text(context.l10n?.seeMyMatchScore ?? 'See My Match Score',
                    style: GoogleFonts.plusJakartaSans(
                        fontWeight: FontWeight.w700,
                        fontSize: 12)),
              ),
            ),
          )
        else
          Center(
            child: TextButton.icon(
              onPressed: onSkip,
              icon: const Icon(Icons.skip_next_rounded,
                  color: AppTheme.slate500, size: 18),
              label: Text(context.l10n?.skipQuizShowBasic ?? 'Skip quiz & show basic result',
                  style: GoogleFonts.plusJakartaSans(
                      color: AppTheme.slate500, fontSize: 13)),
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
    return GlassContainer(
      padding: const EdgeInsets.all(20),
      usePrimaryTint: isActive,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Container(
              width: 28,
              height: 28,
              decoration: BoxDecoration(
                color: isAnswered
                    ? AppTheme.success
                    : AppTheme.primaryBlue.withValues(alpha: 0.1),
                shape: BoxShape.circle,
              ),
              child: Center(
                child: isAnswered
                    ? Icon(Icons.check, color: context.surfaceVariantColor, size: 16)
                    : Text('${index + 1}',
                        style: GoogleFonts.plusJakartaSans(
                            fontWeight: FontWeight.w700,
                            fontSize: 13,
                            color: AppTheme.primaryBlue)),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Text(question.text,
                  style: GoogleFonts.plusJakartaSans(
                      fontWeight: FontWeight.w600,
                      fontSize: 15,
                      color: context.textPrimary)),
            ),
          ]),
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
                        horizontal: 16, vertical: 14),
                    decoration: BoxDecoration(
                      color: isSelected
                          ? AppTheme.primaryBlue.withValues(alpha: 0.08)
                          : context.textPrimary.withValues(alpha: 0.6),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: isSelected
                            ? AppTheme.primaryBlue
                            : AppTheme.slate700,
                        width: isSelected ? 2 : 1,
                      ),
                    ),
                    child: Row(children: [
                      AnimatedContainer(
                        duration: const Duration(milliseconds: 200),
                        width: 20,
                        height: 20,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: isSelected
                              ? AppTheme.primaryBlue
                              : Colors.transparent,
                          border: Border.all(
                            color: isSelected
                                ? AppTheme.primaryBlue
                                : AppTheme.slate400,
                            width: 2,
                          ),
                        ),
                        child: isSelected
                            ? Icon(Icons.check,
                                color: context.surfaceVariantColor, size: 14)
                            : null,
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Text(option,
                            style: GoogleFonts.plusJakartaSans(
                                fontWeight: isSelected
                                    ? FontWeight.w600
                                    : FontWeight.w500,
                                fontSize: 14,
                                color: isSelected
                                    ? AppTheme.primaryBlue
                                    : context.textPrimary)),
                      ),
                    ]),
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