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
  bool _isEditing = false;
  bool _savingEdit = false;
  final TextEditingController _replyCtrl = TextEditingController();
  late TextEditingController _editCtrl;
  late String _localText;
  bool _submitting = false;

  late List<String> _likedBy;
  late List<String> _dislikedBy;
  bool _likeLoading = false;
  bool _dislikeLoading = false;

  @override
  void initState() {
    super.initState();
    _likedBy = List<String>.from(widget.data['likedBy'] as List? ?? []);
    _dislikedBy = List<String>.from(widget.data['dislikedBy'] as List? ?? []);
    _localText = widget.data['reviewText'] as String? ?? '';
    _editCtrl = TextEditingController(text: _localText);
  }

  @override
  void didUpdateWidget(covariant _CompareReviewCard oldWidget) {
    super.didUpdateWidget(oldWidget);
    final newText = widget.data['reviewText'] as String? ?? '';
    if (!_isEditing && newText != _localText) {
      _localText = newText;
      _editCtrl.text = newText;
    }
  }

  @override
  void dispose() {
    _replyCtrl.dispose();
    _editCtrl.dispose();
    super.dispose();
  }

  Future<void> _saveEdit() async {
    final text = _editCtrl.text.trim();
    if (text.isEmpty || text == _localText) {
      setState(() => _isEditing = false);
      return;
    }
    setState(() => _savingEdit = true);
    try {
      await ref.read(pbDataSourceProvider).updateComparisonReview(
            widget.docId,
            text,
          );
      if (!mounted) return;
      setState(() {
        _localText = text;
        _isEditing = false;
        _savingEdit = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _savingEdit = false);
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text('$e')));
    }
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
    final reviewText = _localText;
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
                      Row(
                        children: [
                          Text(
                            _formatTime(timestamp),
                            style: GoogleFonts.plusJakartaSans(
                              fontSize: 11,
                              color: context.textTertiaryColor,
                            ),
                          ),

                        ],
                      ),
                    ],
                  ),
                ),
                if (isOwner && !_isEditing)
                  GestureDetector(
                    onTap: () => setState(() {
                      _isEditing = true;
                      _editCtrl.text = _localText;
                    }),
                    child: Padding(
                      padding: const EdgeInsets.only(left: 8, top: 2),
                      child: Icon(
                        Icons.edit_outlined,
                        size: 18,
                        color: AppTheme.brandBlue.withValues(alpha: 0.7),
                      ),
                    ),
                  ),
                if (isOwner && !_isEditing)
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

          // ── Review text (collapsible) or edit field ──
          if (_isEditing)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  TextField(
                    controller: _editCtrl,
                    maxLines: 5,
                    minLines: 2,
                    autofocus: true,
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 14,
                      height: 1.6,
                      color: context.textPrimary,
                    ),
                    decoration: InputDecoration(
                      filled: true,
                      fillColor: context.surfaceVariantColor,
                      contentPadding: const EdgeInsets.all(12),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: BorderSide.none,
                      ),
                      focusedBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: BorderSide(
                          color: AppTheme.brandBlue.withValues(alpha: 0.5),
                          width: 1.5,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 8),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.end,
                    children: [
                      TextButton(
                        onPressed: _savingEdit
                            ? null
                            : () => setState(() => _isEditing = false),
                        child: Text(
                          'İptal',
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 13,
                            color: context.textTertiaryColor,
                          ),
                        ),
                      ),
                      const SizedBox(width: 4),
                      ElevatedButton(
                        onPressed: _savingEdit ? null : _saveEdit,
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppTheme.brandBlue,
                          foregroundColor: Colors.white,
                          elevation: 0,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(10),
                          ),
                          padding: const EdgeInsets.symmetric(
                              horizontal: 16, vertical: 8),
                        ),
                        child: _savingEdit
                            ? const SizedBox(
                                width: 14,
                                height: 14,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: Colors.white,
                                ),
                              )
                            : Text(
                                'Kaydet',
                                style: GoogleFonts.plusJakartaSans(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                      ),
                    ],
                  ),
                ],
              ),
            )
          else if (reviewText.isNotEmpty)
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

          // ── Translate button ──
          if (!_isEditing && reviewText.isNotEmpty)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 6, 16, 0),
              child: _CompareTranslateButton(text: reviewText),
            ),

          // ── Action bar: Like / Dislike / Reply ──
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
            child: Row(
              children: [
                // Like button
                _LikeDislikeButton(
                  icon: Icons.thumb_up_rounded,
                  count: _likedBy.length,
                  active: currentUserId != null && _likedBy.contains(currentUserId),
                  loading: _likeLoading,
                  onTap: currentUserId == null ? null : () => _toggleLike(currentUserId),
                ),
                const SizedBox(width: 8),
                // Dislike button
                _LikeDislikeButton(
                  icon: Icons.thumb_down_rounded,
                  count: _dislikedBy.length,
                  active: currentUserId != null && _dislikedBy.contains(currentUserId),
                  loading: _dislikeLoading,
                  isDislike: true,
                  onTap: currentUserId == null ? null : () => _toggleDislike(currentUserId),
                ),
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
      // Notify review owner
      final reviewOwnerId = widget.data['userId'] as String? ?? '';
      if (reviewOwnerId.isNotEmpty &&
          reviewOwnerId != uid &&
          reviewOwnerId != 'anonymous') {
        ref.read(pbDataSourceProvider).createNotification(
          recipientId: reviewOwnerId,
          senderId: uid,
          senderName: displayName,
          type: 'compare_reply',
          title: 'Yorumunuza yanıt geldi',
          body: text.length > 100 ? '${text.substring(0, 100)}...' : text,
          referenceId: widget.docId,
        );
      }
      _replyCtrl.clear();
      setState(() {
        _replyInputVisible = false;
        _repliesExpanded = true;
      });
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _toggleLike(String currentUserId) async {
    if (_likeLoading || _dislikeLoading) return;
    HapticFeedback.lightImpact();
    setState(() => _likeLoading = true);
    final wasLiked = _likedBy.contains(currentUserId);
    // Optimistic update
    setState(() {
      if (wasLiked) {
        _likedBy.remove(currentUserId);
      } else {
        _likedBy.add(currentUserId);
        _dislikedBy.remove(currentUserId);
      }
    });
    try {
      await ref
          .read(pbDataSourceProvider)
          .toggleComparisonReviewLike(widget.docId, currentUserId);
    } catch (_) {
      // Revert on error
      if (mounted) {
        setState(() {
          if (wasLiked) {
            _likedBy.add(currentUserId);
          } else {
            _likedBy.remove(currentUserId);
          }
        });
      }
    } finally {
      if (mounted) setState(() => _likeLoading = false);
    }
  }

  Future<void> _toggleDislike(String currentUserId) async {
    if (_likeLoading || _dislikeLoading) return;
    HapticFeedback.lightImpact();
    setState(() => _dislikeLoading = true);
    final wasDisliked = _dislikedBy.contains(currentUserId);
    // Optimistic update
    setState(() {
      if (wasDisliked) {
        _dislikedBy.remove(currentUserId);
      } else {
        _dislikedBy.add(currentUserId);
        _likedBy.remove(currentUserId);
      }
    });
    try {
      await ref
          .read(pbDataSourceProvider)
          .toggleComparisonReviewDislike(widget.docId, currentUserId);
    } catch (_) {
      // Revert on error
      if (mounted) {
        setState(() {
          if (wasDisliked) {
            _dislikedBy.add(currentUserId);
          } else {
            _dislikedBy.remove(currentUserId);
          }
        });
      }
    } finally {
      if (mounted) setState(() => _dislikeLoading = false);
    }
  }
}

class _LikeDislikeButton extends StatelessWidget {
  final IconData icon;
  final int count;
  final bool active;
  final bool loading;
  final bool isDislike;
  final VoidCallback? onTap;

  const _LikeDislikeButton({
    required this.icon,
    required this.count,
    required this.active,
    required this.loading,
    this.isDislike = false,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final activeColor = isDislike ? AppTheme.error : AppTheme.brandBlue;
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
          color: active
              ? activeColor.withValues(alpha: 0.12)
              : Colors.transparent,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: active
                ? activeColor.withValues(alpha: 0.4)
                : context.dividerColor,
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (loading)
              SizedBox(
                width: 13,
                height: 13,
                child: CircularProgressIndicator(
                  strokeWidth: 1.5,
                  color: active ? activeColor : context.textTertiaryColor,
                ),
              )
            else
              Icon(
                icon,
                size: 13,
                color: active ? activeColor : context.textTertiaryColor,
              ),
            if (count > 0) ...[
              const SizedBox(width: 4),
              Text(
                '$count',
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  color: active ? activeColor : context.textTertiaryColor,
                ),
              ),
            ],
          ],
        ),
      ),
    );
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
                    return _CompareReplyItem(
                      key: ValueKey('compare-reply-${reply['id']}'),
                      reply: reply,
                      reviewId: widget.reviewId,
                      currentUserId: widget.currentUserId,
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

// ─── Compare Reply Item with Like/Dislike/Edit/Delete ──────────────────────

class _CompareReplyItem extends ConsumerStatefulWidget {
  final Map<String, dynamic> reply;
  final String reviewId;
  final String? currentUserId;

  const _CompareReplyItem({
    super.key,
    required this.reply,
    required this.reviewId,
    required this.currentUserId,
  });

  @override
  ConsumerState<_CompareReplyItem> createState() => _CompareReplyItemState();
}

class _CompareReplyItemState extends ConsumerState<_CompareReplyItem> {
  bool _isEditing = false;
  bool _saving = false;
  late TextEditingController _editCtrl;
  late List<String> _likedBy;
  late List<String> _dislikedBy;
  late String _localText;

  @override
  void initState() {
    super.initState();
    _localText = widget.reply['text'] as String? ?? '';
    _editCtrl = TextEditingController(text: _localText);
    _likedBy = List<String>.from(widget.reply['likedBy'] as List? ?? []);
    _dislikedBy = List<String>.from(widget.reply['dislikedBy'] as List? ?? []);
  }

  @override
  void didUpdateWidget(covariant _CompareReplyItem oldWidget) {
    super.didUpdateWidget(oldWidget);
    final newText = widget.reply['text'] as String? ?? '';
    if (!_isEditing && newText != _localText) {
      _localText = newText;
      _editCtrl.text = newText;
    }
    _likedBy = List<String>.from(widget.reply['likedBy'] as List? ?? []);
    _dislikedBy = List<String>.from(widget.reply['dislikedBy'] as List? ?? []);
  }

  @override
  void dispose() {
    _editCtrl.dispose();
    super.dispose();
  }

  Future<void> _toggleLike() async {
    final uid = widget.currentUserId;
    if (uid == null) return;
    HapticFeedback.lightImpact();
    setState(() {
      if (_likedBy.contains(uid)) {
        _likedBy.remove(uid);
      } else {
        _likedBy.add(uid);
        _dislikedBy.remove(uid);
      }
    });
    await ref
        .read(pbDataSourceProvider)
        .toggleReplyLike(widget.reply['id'] as String, uid);
  }

  Future<void> _toggleDislike() async {
    final uid = widget.currentUserId;
    if (uid == null) return;
    HapticFeedback.lightImpact();
    setState(() {
      if (_dislikedBy.contains(uid)) {
        _dislikedBy.remove(uid);
      } else {
        _dislikedBy.add(uid);
        _likedBy.remove(uid);
      }
    });
    await ref
        .read(pbDataSourceProvider)
        .toggleReplyDislike(widget.reply['id'] as String, uid);
  }

  Future<void> _saveEdit() async {
    final text = _editCtrl.text.trim();
    if (text.isEmpty || text == _localText) {
      setState(() => _isEditing = false);
      return;
    }
    setState(() => _saving = true);
    try {
      await ref.read(pbDataSourceProvider).updateReviewReply(
            replyId: widget.reply['id'] as String,
            text: text,
          );
      if (!mounted) return;
      setState(() {
        _localText = text;
        _isEditing = false;
        _saving = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _saving = false);
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text('$e')));
    }
  }

  Future<void> _confirmDelete() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: context.surfaceColor,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: Text(
          'Yanıtı Sil',
          style: GoogleFonts.plusJakartaSans(
              fontSize: 16, fontWeight: FontWeight.w700),
        ),
        content: Text(
          'Bu yanıtı silmek istediğinizden emin misiniz?',
          style: GoogleFonts.plusJakartaSans(fontSize: 14),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('İptal'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: Text(
              'Sil',
              style: TextStyle(
                fontWeight: FontWeight.w700,
                color: AppTheme.error,
              ),
            ),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    await ref.read(pbDataSourceProvider).deleteReviewReply(
          collection: 'comparison_reviews',
          reviewId: widget.reviewId,
          replyId: widget.reply['id'] as String,
        );
  }

  @override
  Widget build(BuildContext context) {
    final replyUserId = widget.reply['userId'] as String? ?? '';
    final replyName = widget.reply['displayName'] as String? ?? 'User';
    final replyTs = DateTime.tryParse(
            widget.reply['createdAt']?.toString() ?? '') ??
        DateTime.now();
    final diff = DateTime.now().difference(replyTs);
    final timeStr = diff.inDays > 0
        ? '${diff.inDays}g'
        : diff.inHours > 0
            ? '${diff.inHours}s'
            : '${diff.inMinutes}d';
    final isOwner =
        widget.currentUserId != null && widget.currentUserId == replyUserId;

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
            backgroundColor: AppTheme.brandBlue.withValues(alpha: 0.1),
            child: Text(
              replyName.isNotEmpty ? replyName[0].toUpperCase() : '?',
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
                    if (isOwner && !_isEditing) ...[
                      const SizedBox(width: 8),
                      GestureDetector(
                        onTap: () => setState(() {
                          _isEditing = true;
                          _editCtrl.text = _localText;
                        }),
                        child: Icon(
                          Icons.edit_outlined,
                          size: 14,
                          color: AppTheme.brandBlue.withValues(alpha: 0.7),
                        ),
                      ),
                      const SizedBox(width: 8),
                      GestureDetector(
                        onTap: _confirmDelete,
                        child: Icon(
                          Icons.close_rounded,
                          size: 14,
                          color: AppTheme.error.withValues(alpha: 0.6),
                        ),
                      ),
                    ],
                  ],
                ),
                const SizedBox(height: 3),
                if (_isEditing)
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      TextField(
                        controller: _editCtrl,
                        maxLines: 4,
                        minLines: 1,
                        autofocus: true,
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 13,
                          height: 1.5,
                          color: context.textPrimary,
                        ),
                        decoration: InputDecoration(
                          isDense: true,
                          filled: true,
                          fillColor: context.surfaceColor,
                          contentPadding: const EdgeInsets.symmetric(
                            horizontal: 10,
                            vertical: 8,
                          ),
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(10),
                            borderSide: BorderSide.none,
                          ),
                          focusedBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(10),
                            borderSide: BorderSide(
                              color: AppTheme.brandBlue.withValues(alpha: 0.5),
                              width: 1.5,
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(height: 6),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.end,
                        children: [
                          GestureDetector(
                            onTap: _saving
                                ? null
                                : () => setState(() => _isEditing = false),
                            child: Padding(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 10, vertical: 4),
                              child: Text(
                                'İptal',
                                style: GoogleFonts.plusJakartaSans(
                                  fontSize: 12,
                                  color: context.textTertiaryColor,
                                ),
                              ),
                            ),
                          ),
                          const SizedBox(width: 4),
                          GestureDetector(
                            onTap: _saving ? null : _saveEdit,
                            child: Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 12, vertical: 6),
                              decoration: BoxDecoration(
                                color: AppTheme.brandBlue,
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: _saving
                                  ? const SizedBox(
                                      width: 12,
                                      height: 12,
                                      child: CircularProgressIndicator(
                                        strokeWidth: 1.5,
                                        color: Colors.white,
                                      ),
                                    )
                                  : Text(
                                      'Kaydet',
                                      style: GoogleFonts.plusJakartaSans(
                                        fontSize: 12,
                                        fontWeight: FontWeight.w700,
                                        color: Colors.white,
                                      ),
                                    ),
                            ),
                          ),
                        ],
                      ),
                    ],
                  )
                else ...[
                  Text(
                    _localText,
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 13,
                      height: 1.5,
                      color: context.textSecondary,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Row(
                    children: [
                      _LikeDislikeButton(
                        icon: Icons.thumb_up_rounded,
                        count: _likedBy.length,
                        active: widget.currentUserId != null &&
                            _likedBy.contains(widget.currentUserId),
                        loading: false,
                        onTap: widget.currentUserId == null ? null : _toggleLike,
                      ),
                      const SizedBox(width: 6),
                      _LikeDislikeButton(
                        icon: Icons.thumb_down_rounded,
                        count: _dislikedBy.length,
                        active: widget.currentUserId != null &&
                            _dislikedBy.contains(widget.currentUserId),
                        loading: false,
                        isDislike: true,
                        onTap:
                            widget.currentUserId == null ? null : _toggleDislike,
                      ),
                    ],
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Sort Chip ───────────────────────────────────────────────────────────────

// ─── Translate Button ────────────────────────────────────────────────────────

class _CompareTranslateButton extends ConsumerStatefulWidget {
  final String text;
  const _CompareTranslateButton({required this.text});

  @override
  ConsumerState<_CompareTranslateButton> createState() =>
      _CompareTranslateButtonState();
}

class _CompareTranslateButtonState
    extends ConsumerState<_CompareTranslateButton> {
  String? _translated;
  bool _loading = false;
  bool _showOriginal = false;

  Future<void> _translate() async {
    if (_translated != null) {
      setState(() => _showOriginal = !_showOriginal);
      return;
    }
    setState(() => _loading = true);
    try {
      final targetLang = Localizations.localeOf(context).languageCode;
      final dio = ref.read(dioProvider);
      final response = await dio.get(
        'https://translate.googleapis.com/translate_a/single',
        queryParameters: {
          'client': 'gtx',
          'sl': 'auto',
          'tl': targetLang,
          'dt': 't',
          'q': widget.text,
        },
        options: Options(
          receiveTimeout: const Duration(seconds: 15),
          sendTimeout: const Duration(seconds: 10),
        ),
      );
      final data = response.data;
      final buffer = StringBuffer();
      if (data is List && data.isNotEmpty && data[0] is List) {
        for (final part in data[0] as List) {
          if (part is List && part.isNotEmpty && part[0] is String) {
            buffer.write(part[0] as String);
          }
        }
      }
      final translated = buffer.toString().trim();
      if (mounted && translated.isNotEmpty) {
        setState(() {
          _translated = translated;
          _showOriginal = false;
          _loading = false;
        });
      } else if (mounted) {
        setState(() => _loading = false);
      }
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isTr = Localizations.localeOf(context).languageCode == 'tr';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        GestureDetector(
          onTap: _loading ? null : _translate,
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (_loading)
                const SizedBox(
                  width: 12,
                  height: 12,
                  child: CircularProgressIndicator(strokeWidth: 1.5),
                )
              else
                Icon(
                  Icons.translate_rounded,
                  size: 14,
                  color: AppTheme.primaryBlue,
                ),
              const SizedBox(width: 4),
              Text(
                _translated != null
                    ? (_showOriginal
                        ? (isTr ? 'Çeviriyi Gör' : 'See Translation')
                        : (isTr ? 'Orijinali Gör' : 'See Original'))
                    : (isTr ? 'Çeviriyi Gör' : 'See Translation'),
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: AppTheme.primaryBlue,
                ),
              ),
            ],
          ),
        ),
        if (_translated != null && !_showOriginal) ...[
          const SizedBox(height: 6),
          Text(
            _translated!,
            style: GoogleFonts.plusJakartaSans(
              fontSize: 14,
              height: 1.5,
              color: context.textPrimary,
            ),
          ),
        ],
      ],
    );
  }
}

// ─── Write Review Dialog ─────────────────────────────────────────────────────

class _WriteReviewDialogContent extends StatefulWidget {
  final TextEditingController textController;
  final List<dynamic> products;
  final LinearGradient accentGradient;
  final Future<void> Function(int rating) onSubmit;
  final VoidCallback onCancel;

  const _WriteReviewDialogContent({
    required this.textController,
    required this.products,
    required this.accentGradient,
    required this.onSubmit,
    required this.onCancel,
  });

  @override
  State<_WriteReviewDialogContent> createState() =>
      _WriteReviewDialogContentState();
}

class _WriteReviewDialogContentState extends State<_WriteReviewDialogContent> {
  bool _submitting = false;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final hasText = widget.textController.text.trim().isNotEmpty;

    return SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Title
          Text(
            'Yorum Yaz',
            style: GoogleFonts.plusJakartaSans(
              fontSize: 18,
              fontWeight: FontWeight.w700,
              color: theme.colorScheme.onSurface,
            ),
          ),
          const SizedBox(height: 6),
          // Subtitle — product names
          Text(
            widget.products.map((p) => (p as dynamic).name as String).join(' vs '),
            textAlign: TextAlign.center,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: GoogleFonts.plusJakartaSans(
              fontSize: 12,
              color: theme.colorScheme.onSurface.withValues(alpha: 0.5),
            ),
          ),
          const SizedBox(height: 18),
          // Text input
          TextField(
            controller: widget.textController,
            maxLines: 4,
            minLines: 2,
            autofocus: true,
            onChanged: (_) => setState(() {}),
            style: GoogleFonts.plusJakartaSans(
              fontSize: 14,
              color: theme.colorScheme.onSurface,
            ),
            decoration: InputDecoration(
              hintText: 'Deneyiminizi paylaşın...',
              hintStyle: GoogleFonts.plusJakartaSans(
                fontSize: 14,
                color: theme.colorScheme.onSurface.withValues(alpha: 0.4),
              ),
              filled: true,
              fillColor: theme.colorScheme.surfaceContainerHighest,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14),
                borderSide: BorderSide.none,
              ),
            ),
          ),
          const SizedBox(height: 20),
          // Buttons row
          Row(
            children: [
              Expanded(
                child: GestureDetector(
                  onTap: widget.onCancel,
                  child: Container(
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    decoration: BoxDecoration(
                      color: theme.colorScheme.surfaceContainerHighest,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Center(
                      child: Text(
                        'İptal',
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                          color: theme.colorScheme.onSurface.withValues(
                            alpha: 0.7,
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: GestureDetector(
                  onTap: (hasText && !_submitting)
                      ? () async {
                          setState(() => _submitting = true);
                          await widget.onSubmit(0);
                          if (mounted) setState(() => _submitting = false);
                        }
                      : null,
                  child: Container(
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    decoration: BoxDecoration(
                      gradient: hasText ? widget.accentGradient : null,
                      color: hasText
                          ? null
                          : theme.colorScheme.onSurface.withValues(alpha: 0.2),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Center(
                      child: _submitting
                          ? const SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: Colors.white,
                              ),
                            )
                          : Text(
                              'Gönder',
                              style: GoogleFonts.plusJakartaSans(
                                fontSize: 14,
                                fontWeight: FontWeight.w700,
                                color: Colors.white,
                              ),
                            ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

