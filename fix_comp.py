import sys
path = 'lib/presentation/screens/compare/widgets/compare_review_widgets.dart'
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

old_block = '''                                    if (isOwner) ...[
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
                              ],'''
new_block = '''                                    if (isOwner) ...[
                                      const SizedBox(width: 6),
                                      GestureDetector(
                                        onTap: () async {
                                          final confirmed = await showDialog<bool>(
                                              context: context,
                                              builder: (ctx) => AlertDialog(
                                                backgroundColor: context.surfaceColor,
                                                shape: RoundedRectangleBorder(
                                                  borderRadius: BorderRadius.circular(16),
                                                ),
                                                title: Text(
                                                  context.l10n?.deleteReview ?? 'Delete Reply',
                                                  style: GoogleFonts.plusJakartaSans(
                                                    fontSize: 16,
                                                    fontWeight: FontWeight.w700,
                                                  ),
                                                ),
                                                content: Text(
                                                  context.l10n?.deleteReviewConfirm ?? 'Are you sure you want to delete this reply?',
                                                  style: GoogleFonts.plusJakartaSans(fontSize: 14),
                                                ),
                                                actions: [
                                                  TextButton(
                                                    onPressed: () => Navigator.pop(ctx, false),
                                                    child: Text(context.l10n?.cancel ?? 'Cancel'),
                                                  ),
                                                  TextButton(
                                                    onPressed: () => Navigator.pop(ctx, true),
                                                    child: Text(
                                                      context.l10n?.delete ?? 'Delete',
                                                      style: TextStyle(fontWeight: FontWeight.w700, color: AppTheme.error),
                                                    ),
                                                  ),
                                                ],
                                              ),
                                            );
                                            if (confirmed != true) return;
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
                                const SizedBox(height: 6),
                                Row(
                                  children: [
                                    _LikeDislikeButton(
                                      isLike: true,
                                      count: (reply['likedBy'] as List?)?.length ?? 0,
                                      isActive: widget.currentUserId != null &&
                                          (reply['likedBy'] as List?)?.contains(widget.currentUserId) == true,
                                      onTap: widget.currentUserId == null
                                          ? null
                                          : () => ref.read(pbDataSourceProvider).toggleReplyLike(replyId, widget.currentUserId!),
                                    ),
                                  ],
                                ),
                              ],'''

text = text.replace(old_block, new_block)
with open(path, 'w', encoding='utf-8') as f:
    f.write(text)
"print('Done')"
