part of '../compare_screen.dart';
// ─── Compare Review Card with Reply Support ───

class _CompareReviewCard extends ConsumerStatefulWidget {
  final Map<String, dynamic> data;
  final String docId;
  final void Function(String) onConfirmDelete;

  const _CompareReviewCard({
    required this.data,
    required this.docId,
    required this.onConfirmDelete,
  });

  @override
  ConsumerState<_CompareReviewCard> createState() => _CompareReviewCardState();
}

class _CompareReviewCardState extends ConsumerState<_CompareReviewCard> {
  bool _repliesExpanded = false;
  bool _replyInputVisible = false;
  bool _textExpanded = false;
  final TextEditingController _replyCtrl = TextEditingController();
  bool _submitting = false;

  @override
  void dispose() {
    _replyCtrl.dispose();
    super.dispose();
  }

  String _formatTime(DateTime date) {
    final diff = DateTime.now().difference(date);
    if (diff.inDays > 30) return '${(diff.inDays / 30).floor()}mo ago';
    if (diff.inDays > 0) return '${diff.inDays}d ago';
    if (diff.inHours > 0) return '${diff.inHours}h ago';
    return '${diff.inMinutes}m ago';
  }

  @override
  Widget build(BuildContext context) {
    final userId = widget.data['userId'] as String? ?? 'anonymous';
    final displayName = widget.data['displayName'] as String? ?? '';
    final reviewText = widget.data['reviewText'] as String? ?? '';
    final timestamp =
        DateTime.tryParse(widget.data['timestamp']?.toString() ?? '') ??
        DateTime.now();
    final isAnonymous = userId == 'anonymous';

    String resolvedName;
    if (displayName.isNotEmpty) {
      resolvedName = displayName;
    } else if (!isAnonymous && userId.contains('@')) {
      resolvedName = userId.split('@').first;
    } else if (isAnonymous) {
      resolvedName = 'Anonymous';
    } else {
      resolvedName = 'User';
    }
    final displayChar = resolvedName.substring(0, 1).toUpperCase();

    final currentUser = ref.read(userProfileProvider).valueOrNull;
    final currentUserId = currentUser?.uid;
    final isOwner = currentUser != null && currentUser.uid == userId;

    return Container(
      margin: const EdgeInsets.only(bottom: 14),
      decoration: BoxDecoration(
        color: context.surfaceColor,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: context.dividerColor),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.04),
            blurRadius: 12,
            offset: const Offset(0, 3),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // ── Header ──
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                CircleAvatar(
                  radius: 22,
                  backgroundColor: AppTheme.brandBlue.withValues(alpha: 0.15),
                  child: Text(
                    displayChar,
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 15,
                      fontWeight: FontWeight.w800,
                      color: AppTheme.brandBlue,
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        resolvedName,
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                          color: context.textPrimary,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        _formatTime(timestamp),
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 11,
                          color: context.textTertiaryColor,
                        ),
                      ),
                    ],
                  ),
                ),
                if (isOwner)
                  GestureDetector(
                    onTap: () => widget.onConfirmDelete(widget.docId),
                    child: Padding(
                      padding: const EdgeInsets.only(left: 8, top: 2),
                      child: Icon(
                        Icons.delete_outline_rounded,
                        size: 20,
                        color: AppTheme.error.withValues(alpha: 0.6),
                      ),
                    ),
                  ),
              ],
            ),
          ),

          // ── Review text (collapsible) ──
          if (reviewText.isNotEmpty)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
              child: GestureDetector(
                onTap: () => setState(() => _textExpanded = !_textExpanded),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      reviewText,
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 14,
                        height: 1.6,
                        color: context.textPrimary,
                      ),
                      maxLines: _textExpanded ? null : 4,
                      overflow: _textExpanded
                          ? TextOverflow.visible
                          : TextOverflow.ellipsis,
                    ),
                    if (!_textExpanded && reviewText.length > 200)
                      Padding(
                        padding: const EdgeInsets.only(top: 4),
                        child: Text(
                          'Devamını gör',
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 12,
                            color: AppTheme.brandBlue,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ),

          // ── Action bar: Reply ──
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
            child: Row(
              children: [
                const Spacer(),
                if (currentUserId != null)
                  GestureDetector(
                    onTap: () => setState(() {
                      _replyInputVisible = !_replyInputVisible;
                      if (_replyInputVisible) _repliesExpanded = true;
                    }),
                    child: AnimatedContainer(
                      duration: const Duration(milliseconds: 200),
                      padding: const EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 6,
                      ),
                      decoration: BoxDecoration(
                        color: _replyInputVisible
                            ? AppTheme.brandBlue.withValues(alpha: 0.1)
                            : Colors.transparent,
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(
                          color: _replyInputVisible
                              ? AppTheme.brandBlue.withValues(alpha: 0.4)
                              : context.dividerColor,
                        ),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(
                            Icons.reply_rounded,
                            size: 15,
                            color: _replyInputVisible
                                ? AppTheme.brandBlue
                                : context.textTertiaryColor,
                          ),
                          const SizedBox(width: 5),
                          Text(
                            'Yanıtla',
                            style: GoogleFonts.plusJakartaSans(
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                              color: _replyInputVisible
                                  ? AppTheme.brandBlue
                                  : context.textTertiaryColor,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
              ],
            ),
          ),

          // ── Replies ──
          _CompareRepliesSection(
            reviewId: widget.docId,
            currentUserId: currentUserId,
            isExpanded: _repliesExpanded,
            showInput: _replyInputVisible,
            replyController: _replyCtrl,
            submitting: _submitting,
            onToggleExpand: () =>
                setState(() => _repliesExpanded = !_repliesExpanded),
            onSubmitReply: _submitReply,
          ),
        ],
      ),
    );
  }

  Future<void> _submitReply() async {
    final text = _replyCtrl.text.trim();
    if (text.isEmpty) return;
    final user = ref.read(userProfileProvider).valueOrNull;
    final uid = user?.uid;
    if (uid == null) return;
    setState(() => _submitting = true);
    try {
      HapticFeedback.mediumImpact();
      final displayName = user?.displayName.isNotEmpty == true
          ? user!.displayName
          : (user?.email.isNotEmpty == true
                ? user!.email.split('@').first
                : 'User');
      await ref
          .read(pbDataSourceProvider)
          .addReviewReply(
            collection: 'comparison_reviews',
            reviewId: widget.docId,
            userId: uid,
            displayName: displayName,
            text: text,
          );
      _replyCtrl.clear();
      setState(() {
        _replyInputVisible = false;
        _repliesExpanded = true;
      });
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }
}

class _CompareRepliesSection extends ConsumerStatefulWidget {
  final String reviewId;
  final String? currentUserId;
  final bool isExpanded;
  final bool showInput;
  final TextEditingController replyController;
  final bool submitting;
  final VoidCallback onToggleExpand;
  final VoidCallback onSubmitReply;

  const _CompareRepliesSection({
    required this.reviewId,
    required this.currentUserId,
    required this.isExpanded,
    required this.showInput,
    required this.replyController,
    required this.submitting,
    required this.onToggleExpand,
    required this.onSubmitReply,
  });

  @override
  ConsumerState<_CompareRepliesSection> createState() =>
      _CompareRepliesSectionState();
}

class _CompareRepliesSectionState
    extends ConsumerState<_CompareRepliesSection> {
  late Stream<List<Map<String, dynamic>>> _repliesStream;

  @override
  void initState() {
    super.initState();
    _repliesStream = ref
        .read(pbDataSourceProvider)
        .watchReviewReplies('comparison_reviews', widget.reviewId);
  }

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<List<Map<String, dynamic>>>(
      stream: _repliesStream,
      builder: (context, snapshot) {
        final replies = snapshot.data ?? [];
        final replyCount = replies.length;

        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (replyCount > 0)
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                child: GestureDetector(
                  onTap: widget.onToggleExpand,
                  child: Row(
                    children: [
                      Container(
                        width: 2,
                        height: 14,
                        color: AppTheme.brandBlue.withValues(alpha: 0.3),
                        margin: const EdgeInsets.only(right: 8),
                      ),
                      Text(
                        widget.isExpanded
                            ? 'Yanıtları gizle'
                            : '$replyCount yanıt',
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: AppTheme.brandBlue,
                        ),
                      ),
                      const SizedBox(width: 4),
                      Icon(
                        widget.isExpanded
                            ? Icons.keyboard_arrow_up_rounded
                            : Icons.keyboard_arrow_down_rounded,
                        size: 16,
                        color: AppTheme.brandBlue,
                      ),
                    ],
                  ),
                ),
              ),

            if (widget.isExpanded && replyCount > 0)
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                child: Column(
                  children: replies.map((reply) {
                    final replyId = reply['id'] as String? ?? '';
                    final replyUserId = reply['userId'] as String? ?? '';
                    final replyName = reply['displayName'] as String? ?? 'User';
                    final replyText = reply['text'] as String? ?? '';
                    final replyTs =
                        DateTime.tryParse(
                          reply['createdAt']?.toString() ?? '',
                        ) ??
                        DateTime.now();
                    final diff = DateTime.now().difference(replyTs);
                    final timeStr = diff.inDays > 0
                        ? '${diff.inDays}g'
                        : diff.inHours > 0
                        ? '${diff.inHours}s'
                        : '${diff.inMinutes}d';
                    final isOwner = widget.currentUserId == replyUserId;

                    return Container(
                      margin: const EdgeInsets.only(bottom: 8),
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: context.surfaceVariantColor,
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(
                          color: AppTheme.brandBlue.withValues(alpha: 0.08),
                        ),
                      ),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Container(
                            width: 2,
                            height: 36,
                            color: AppTheme.brandBlue.withValues(alpha: 0.25),
                            margin: const EdgeInsets.only(right: 10),
                          ),
                          CircleAvatar(
                            radius: 14,
                            backgroundColor: AppTheme.brandBlue.withValues(
                              alpha: 0.1,
                            ),
                            child: Text(
                              replyName.isNotEmpty
                                  ? replyName[0].toUpperCase()
                                  : '?',
                              style: GoogleFonts.plusJakartaSans(
                                fontSize: 11,
                                fontWeight: FontWeight.w700,
                                color: AppTheme.brandBlue,
                              ),
                            ),
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  children: [
                                    Expanded(
                                      child: Text(
                                        replyName,
                                        style: GoogleFonts.plusJakartaSans(
                                          fontSize: 12,
                                          fontWeight: FontWeight.w700,
                                          color: context.textPrimary,
                                        ),
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                      ),
                                    ),
                                    Text(
                                      timeStr,
                                      style: GoogleFonts.plusJakartaSans(
                                        fontSize: 10,
                                        color: context.textTertiaryColor,
                                      ),
                                    ),
                                    if (isOwner) ...[
                                      const SizedBox(width: 6),
                                      GestureDetector(
                                        onTap: () async {
                                          await ref
                                              .read(pbDataSourceProvider)
                                              .deleteReviewReply(
                                                collection:
                                                    'comparison_reviews',
                                                reviewId: widget.reviewId,
                                                replyId: replyId,
                                              );
                                        },
                                        child: Icon(
                                          Icons.close_rounded,
                                          size: 14,
                                          color: AppTheme.error.withValues(
                                            alpha: 0.6,
                                          ),
                                        ),
                                      ),
                                    ],
                                  ],
                                ),
                                const SizedBox(height: 3),
                                Text(
                                  replyText,
                                  style: GoogleFonts.plusJakartaSans(
                                    fontSize: 13,
                                    height: 1.5,
                                    color: context.textSecondary,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    );
                  }).toList(),
                ),
              ),

            if (widget.showInput)
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 14),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Expanded(
                      child: TextField(
                        controller: widget.replyController,
                        maxLines: 3,
                        minLines: 1,
                        autofocus: true,
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 13,
                          color: context.textPrimary,
                        ),
                        decoration: InputDecoration(
                          hintText: 'Cevabınızı yazın...',
                          hintStyle: GoogleFonts.plusJakartaSans(
                            fontSize: 13,
                            color: context.textTertiaryColor,
                          ),
                          filled: true,
                          fillColor: context.surfaceVariantColor,
                          contentPadding: const EdgeInsets.symmetric(
                            horizontal: 14,
                            vertical: 10,
                          ),
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(14),
                            borderSide: BorderSide.none,
                          ),
                          focusedBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(14),
                            borderSide: BorderSide(
                              color: AppTheme.brandBlue.withValues(alpha: 0.5),
                              width: 1.5,
                            ),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    GestureDetector(
                      onTap: widget.submitting ? null : widget.onSubmitReply,
                      child: AnimatedContainer(
                        duration: const Duration(milliseconds: 200),
                        width: 40,
                        height: 40,
                        decoration: BoxDecoration(
                          gradient: const LinearGradient(
                            colors: [AppTheme.primaryBlue, AppTheme.neonPurple],
                          ),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: widget.submitting
                            ? const Padding(
                                padding: EdgeInsets.all(10),
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: Colors.white,
                                ),
                              )
                            : const Icon(
                                Icons.send_rounded,
                                color: Colors.white,
                                size: 18,
                              ),
                      ),
                    ),
                  ],
                ),
              ),
          ],
        );
      },
    );
  }
}

class _MatchScoreRingPainter extends CustomPainter {
  final double progress;
  final Color color;
  final Color backgroundColor;
  final double strokeWidth;

  const _MatchScoreRingPainter({
    required this.progress,
    required this.color,
    required this.backgroundColor,
    required this.strokeWidth,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final radius = (size.width / 2) - (strokeWidth / 2);
    final backgroundPaint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeWidth
      ..color = backgroundColor;
    final foregroundPaint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeWidth
      ..strokeCap = StrokeCap.round
      ..color = color;

    canvas.drawCircle(center, radius, backgroundPaint);
    canvas.drawArc(
      Rect.fromCircle(center: center, radius: radius),
      -pi / 2,
      2 * pi * progress.clamp(0.0, 1.0),
      false,
      foregroundPaint,
    );
  }

  @override
  bool shouldRepaint(covariant _MatchScoreRingPainter oldDelegate) {
    return oldDelegate.progress != progress ||
        oldDelegate.color != color ||
        oldDelegate.backgroundColor != backgroundColor ||
        oldDelegate.strokeWidth != strokeWidth;
  }
}

