part of '../product_detail_screen.dart';

// ═══════════════════════════════════════════════════════════
// REVIEW + YOUTUBE BOTTOM SHEETS
// Triggered from the top action bar (round buttons next to share).
// ═══════════════════════════════════════════════════════════

void showReviewsBottomSheet(
  BuildContext context, {
  required ProductEntity product,
}) {
  showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    useSafeArea: true,
    builder: (ctx) => _ReviewsBottomSheet(product: product),
  );
}

void showYouTubeBottomSheet(
  BuildContext context, {
  required ProductEntity product,
}) async {
  // Sheet returns the picked video (or null if dismissed without selection).
  // We open the PiP player AFTER the sheet is gone so it lives on the page
  // overlay, never on the (now-disposed) sheet's overlay.
  final picked = await showModalBottomSheet<_PickedYouTubeVideo>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    useSafeArea: true,
    builder: (ctx) => _YouTubeBottomSheet(product: product),
  );
  if (picked == null) return;
  if (!context.mounted) return;

  // Non-YouTube link fallback (rare): open externally.
  final ytRegex = RegExp(r'(?:youtube\.com/watch\?v=|youtu\.be/)([\w-]+)');
  final match = ytRegex.firstMatch(picked.url);
  if (match == null) {
    final uri = Uri.tryParse(picked.url);
    if (uri == null) return;
    try {
      await launchUrl(uri, mode: LaunchMode.inAppBrowserView);
    } catch (_) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
    return;
  }
  final videoId = match.group(1)!;
  late OverlayEntry entry;
  entry = OverlayEntry(
    builder: (_) => _FloatingYouTubePlayer(
      videoId: videoId,
      title: picked.title,
      thumbnailUrl: picked.thumbnailUrl.isNotEmpty
          ? picked.thumbnailUrl
          : 'https://img.youtube.com/vi/$videoId/hqdefault.jpg',
      onClose: () {
        if (entry.mounted) entry.remove();
      },
    ),
  );
  Overlay.of(context, rootOverlay: true).insert(entry);
}

/// Lightweight payload returned when the user taps a video in the sheet.
class _PickedYouTubeVideo {
  final String url;
  final String title;
  final String thumbnailUrl;
  const _PickedYouTubeVideo({
    required this.url,
    required this.title,
    required this.thumbnailUrl,
  });
}

// ─── Reviews bottom sheet (YouTube-style: list + sticky composer) ───────────
class _ReviewsBottomSheet extends ConsumerStatefulWidget {
  final ProductEntity product;
  const _ReviewsBottomSheet({required this.product});

  @override
  ConsumerState<_ReviewsBottomSheet> createState() =>
      _ReviewsBottomSheetState();
}

class _ReviewsBottomSheetState extends ConsumerState<_ReviewsBottomSheet> {
  final TextEditingController _composerCtrl = TextEditingController();
  final FocusNode _focusNode = FocusNode();
  bool _submitting = false;
  bool _composerFocused = false;

  @override
  void initState() {
    super.initState();
    _focusNode.addListener(() {
      if (mounted) {
        setState(() => _composerFocused = _focusNode.hasFocus);
      }
    });
  }

  @override
  void dispose() {
    _composerCtrl.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  bool _isGeneratedAvatarUrl(String? photoUrl) {
    final value = (photoUrl ?? '').trim().toLowerCase();
    if (value.isEmpty) return false;
    return value.contains('ui-avatars.com') ||
        value.contains('/assets/images/robot') ||
        value.contains('/assets/images/bot') ||
        value.contains('default_avatar');
  }

  Future<void> _submitReview() async {
    final text = _composerCtrl.text.trim();
    if (text.isEmpty || _submitting) return;
    final user = ref.read(userProfileProvider).valueOrNull;
    final authState = ref.read(authStateProvider);
    final userId = authState.valueOrNull;
    if (userId == null) {
      context.go(AppRoutes.login);
      return;
    }
    setState(() => _submitting = true);

    final authRecord = pb.authStore.record;
    String snapshotName = (user?.displayName ?? '').trim().isNotEmpty
        ? user!.displayName.trim()
        : (authRecord?.getStringValue('displayName').trim().isNotEmpty == true
              ? authRecord!.getStringValue('displayName').trim()
              : (authRecord?.getStringValue('name').trim() ?? ''));
    if (snapshotName.isEmpty) {
      final email = (user?.email ?? authRecord?.getStringValue('email') ?? '')
          .trim();
      if (email.contains('@')) snapshotName = email.split('@').first;
    }
    final userPhoto = (user?.photoURL ?? '').trim();
    final authPhoto = (authRecord?.getStringValue('photoURL').trim() ?? '');
    final snapshotPhoto =
        userPhoto.isNotEmpty && !_isGeneratedAvatarUrl(userPhoto)
        ? userPhoto
        : (authPhoto.isNotEmpty && !_isGeneratedAvatarUrl(authPhoto)
              ? authPhoto
              : '');

    final review = ReviewModel(
      id: '',
      userId: userId,
      productId: widget.product.id,
      rating: 0.0,
      text: text,
      createdAt: DateTime.now(),
      authorDisplayName: snapshotName,
      authorPhotoURL: snapshotPhoto,
    );

    try {
      final repo = ref.read(productRepositoryProvider);
      final result = await repo.addReview(review);
      result.when(
        success: (_) {
          if (!mounted) return;
          _composerCtrl.clear();
          _focusNode.unfocus();
          ref.invalidate(productReviewsProvider(widget.product.id));
        },
        failure: (e) {
          if (!mounted) return;
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('$e')),
          );
        },
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('$e')),
      );
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final product = widget.product;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final user = ref.watch(userProfileProvider).valueOrNull;
    final isLoggedIn = ref.watch(authStateProvider).valueOrNull != null;
    final isTr = Localizations.localeOf(context).languageCode == 'tr';
    final reviewsAsync = ref.watch(productReviewsProvider(product.id));
    final reviewCount = reviewsAsync.valueOrNull?.length ?? 0;

    final photoUrl = (user?.photoURL ?? '').trim();
    final hasPhoto = photoUrl.isNotEmpty && !_isGeneratedAvatarUrl(photoUrl);
    final displayName = (user?.displayName ?? '').trim();
    final avatarChar = displayName.isNotEmpty
        ? displayName[0].toUpperCase()
        : '?';

    return DraggableScrollableSheet(
      initialChildSize: 0.85,
      minChildSize: 0.5,
      maxChildSize: 0.95,
      expand: false,
      builder: (sheetCtx, scrollController) {
        return Container(
          decoration: BoxDecoration(
            color: context.surfaceColor,
            borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
          ),
          child: Column(
            children: [
              const SizedBox(height: 10),
              Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: context.dividerColor,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              const SizedBox(height: 12),
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 0, 12, 12),
                child: Row(
                  children: [
                    Icon(
                      Icons.mode_comment_outlined,
                      size: 20,
                      color: context.textPrimary,
                    ),
                    const SizedBox(width: 10),
                    Text(
                      isTr ? 'Yorumlar' : 'Comments',
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 18,
                        fontWeight: FontWeight.w800,
                        color: context.textPrimary,
                      ),
                    ),
                    if (reviewCount > 0) ...[
                      const SizedBox(width: 8),
                      Text(
                        '$reviewCount',
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                          color: context.textSecondary,
                        ),
                      ),
                    ],
                    const Spacer(),
                    IconButton(
                      icon: Icon(
                        Icons.close_rounded,
                        color: context.textPrimary,
                      ),
                      onPressed: () => Navigator.of(sheetCtx).pop(),
                    ),
                  ],
                ),
              ),
              Divider(height: 1, color: context.dividerColor),
              Expanded(
                child: _UserReviewsListInline(
                  product: product,
                  isDark: isDark,
                  scrollController: scrollController,
                ),
              ),
              // ─── Sticky composer (YouTube-style) ──────────────────────────
              Container(
                decoration: BoxDecoration(
                  color: context.surfaceColor,
                  border: Border(
                    top: BorderSide(color: context.dividerColor),
                  ),
                ),
                padding: EdgeInsets.fromLTRB(
                  12,
                  10,
                  12,
                  MediaQuery.of(context).viewInsets.bottom +
                      MediaQuery.of(context).padding.bottom +
                      10,
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.center,
                  children: [
                    // Avatar
                    Container(
                      width: 36,
                      height: 36,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: AppTheme.brandBlue.withValues(alpha: 0.15),
                      ),
                      clipBehavior: Clip.antiAlias,
                      child: hasPhoto
                          ? CachedNetworkImage(
                              imageUrl: photoUrl,
                              fit: BoxFit.cover,
                              memCacheWidth: 108,
                              errorWidget: (_, _, _) => Center(
                                child: Text(
                                  avatarChar,
                                  style: GoogleFonts.plusJakartaSans(
                                    fontSize: 14,
                                    fontWeight: FontWeight.w800,
                                    color: AppTheme.brandBlue,
                                  ),
                                ),
                              ),
                            )
                          : Center(
                              child: Text(
                                avatarChar,
                                style: GoogleFonts.plusJakartaSans(
                                  fontSize: 14,
                                  fontWeight: FontWeight.w800,
                                  color: AppTheme.brandBlue,
                                ),
                              ),
                            ),
                    ),
                    const SizedBox(width: 10),
                    // Text input
                    Expanded(
                      child: TextField(
                        controller: _composerCtrl,
                        focusNode: _focusNode,
                        enabled: isLoggedIn && !_submitting,
                        minLines: 1,
                        maxLines: 4,
                        textInputAction: TextInputAction.newline,
                        cursorColor: AppTheme.brandBlue,
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 14,
                          color: context.textPrimary,
                        ),
                        onChanged: (_) => setState(() {}),
                        decoration: InputDecoration(
                          isDense: true,
                          hintText: isLoggedIn
                              ? (isTr ? 'Yorum ekle...' : 'Add a comment...')
                              : (isTr
                                  ? 'Yorum yapmak için giriş yap'
                                  : 'Sign in to comment'),
                          hintStyle: GoogleFonts.plusJakartaSans(
                            fontSize: 14,
                            color: context.textTertiaryColor,
                          ),
                          border: InputBorder.none,
                          contentPadding: const EdgeInsets.symmetric(
                            vertical: 8,
                            horizontal: 12,
                          ),
                          filled: true,
                          fillColor: context.surfaceVariantColor,
                          enabledBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(22),
                            borderSide: BorderSide(color: context.dividerColor),
                          ),
                          focusedBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(22),
                            borderSide: BorderSide(
                              color: AppTheme.brandBlue.withValues(alpha: 0.5),
                            ),
                          ),
                          disabledBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(22),
                            borderSide: BorderSide(color: context.dividerColor),
                          ),
                        ),
                        onTap: () {
                          if (!isLoggedIn) context.go(AppRoutes.login);
                        },
                      ),
                    ),
                    const SizedBox(width: 8),
                    // Send button (only when composer focused or has text)
                    if (_composerFocused || _composerCtrl.text.trim().isNotEmpty)
                      GestureDetector(
                        onTap: _submitReview,
                        child: Container(
                          width: 36,
                          height: 36,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            gradient: _composerCtrl.text.trim().isNotEmpty
                                ? const LinearGradient(
                                    colors: [
                                      AppTheme.primaryBlue,
                                      AppTheme.accentTeal,
                                    ],
                                  )
                                : null,
                            color: _composerCtrl.text.trim().isNotEmpty
                                ? null
                                : context.textTertiaryColor.withValues(
                                    alpha: 0.3,
                                  ),
                          ),
                          alignment: Alignment.center,
                          child: _submitting
                              ? const SizedBox(
                                  width: 14,
                                  height: 14,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                    valueColor: AlwaysStoppedAnimation(
                                      Colors.white,
                                    ),
                                  ),
                                )
                              : const Icon(
                                  Icons.send_rounded,
                                  size: 16,
                                  color: Colors.white,
                                ),
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

// ─── Inline reviews list used inside the bottom sheet (no composer) ─────────
class _UserReviewsListInline extends ConsumerStatefulWidget {
  final ProductEntity product;
  final bool isDark;
  final ScrollController scrollController;
  const _UserReviewsListInline({
    required this.product,
    required this.isDark,
    required this.scrollController,
  });

  @override
  ConsumerState<_UserReviewsListInline> createState() =>
      _UserReviewsListInlineState();
}

class _UserReviewsListInlineState
    extends ConsumerState<_UserReviewsListInline> {
  _ReviewSort _sort = _ReviewSort.top;

  String _resolveDisplayName(ReviewModel review, String? currentUserId) {
    if (review.isAuthorDeleted) {
      return context.l10n?.deletedAccountName ?? 'Silinen Hesap';
    }
    if (review.userId == currentUserId) {
      final user = ref.read(userProfileProvider).valueOrNull;
      final dn = user?.displayName.trim();
      if (dn != null && dn.isNotEmpty) return dn;
    }
    final snapshot = review.authorDisplayName.trim();
    if (snapshot.isNotEmpty) return snapshot;
    return 'User';
  }

  String? _resolvePhotoUrl(ReviewModel review, String? currentUserId) {
    if (review.isAuthorDeleted) return null;
    if (review.userId == currentUserId) {
      final user = ref.read(userProfileProvider).valueOrNull;
      final photo = (user?.photoURL ?? '').trim();
      if (photo.isNotEmpty && !_isGeneratedAvatarUrl(photo)) return photo;
    }
    final snapshot = review.authorPhotoURL.trim();
    return snapshot.isEmpty || _isGeneratedAvatarUrl(snapshot)
        ? null
        : snapshot;
  }

  bool _isGeneratedAvatarUrl(String? photoUrl) {
    final value = (photoUrl ?? '').trim().toLowerCase();
    if (value.isEmpty) return false;
    return value.contains('ui-avatars.com') ||
        value.contains('/assets/images/robot') ||
        value.contains('/assets/images/bot') ||
        value.contains('default_avatar');
  }

  String _timeAgo(DateTime t) {
    final diff = DateTime.now().difference(t);
    if (diff.inDays > 365) return '${diff.inDays ~/ 365}y ago';
    if (diff.inDays > 30) return '${diff.inDays ~/ 30}mo ago';
    if (diff.inDays > 0) return '${diff.inDays}d ago';
    if (diff.inHours > 0) return '${diff.inHours}h ago';
    if (diff.inMinutes > 0) return '${diff.inMinutes}m ago';
    return 'Just now';
  }

  @override
  Widget build(BuildContext context) {
    final reviewsAsync = ref.watch(productReviewsProvider(widget.product.id));
    final currentUserId = ref.watch(authStateProvider).valueOrNull;

    return reviewsAsync.when(
      loading: () => const Center(
        child: Padding(
          padding: EdgeInsets.all(28),
          child: CircularProgressIndicator(strokeWidth: 2),
        ),
      ),
      error: (_, _) => Center(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Text(
            context.l10n?.couldNotLoadReviews ?? 'Could not load reviews',
          ),
        ),
      ),
      data: (reviews) {
        if (reviews.isEmpty) {
          return Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(
                  Icons.rate_review_outlined,
                  size: 40,
                  color: context.textTertiaryColor,
                ),
                const SizedBox(height: 10),
                Text(
                  context.l10n?.noReviewsYet ?? 'No reviews yet',
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: context.textPrimary,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  Localizations.localeOf(context).languageCode == 'tr'
                      ? 'İlk yorumu sen yap!'
                      : 'Be the first to comment!',
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 12,
                    color: context.textTertiaryColor,
                  ),
                ),
              ],
            ),
          );
        }
        final sorted = List<ReviewModel>.from(reviews);
        if (_sort == _ReviewSort.top) {
          sorted.sort((a, b) {
            final sa = a.likedBy.length - a.dislikedBy.length;
            final sb = b.likedBy.length - b.dislikedBy.length;
            return sb.compareTo(sa);
          });
        } else {
          sorted.sort((a, b) => b.createdAt.compareTo(a.createdAt));
        }
        return ListView(
          controller: widget.scrollController,
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
          children: [
            // Sort selector row
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Row(
                children: [
                  GestureDetector(
                    onTap: () => setState(() {
                      _sort = _sort == _ReviewSort.top
                          ? _ReviewSort.newest
                          : _ReviewSort.top;
                    }),
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 10,
                        vertical: 5,
                      ),
                      decoration: BoxDecoration(
                        color: AppTheme.brandBlue.withValues(alpha: 0.08),
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(
                            _sort == _ReviewSort.top
                                ? Icons.thumb_up_alt_outlined
                                : Icons.access_time_rounded,
                            size: 12,
                            color: AppTheme.brandBlue,
                          ),
                          const SizedBox(width: 4),
                          Text(
                            _sort == _ReviewSort.top
                                ? (context.l10n?.topComments ?? 'Top')
                                : (context.l10n?.newestFirst ?? 'Newest'),
                            style: GoogleFonts.plusJakartaSans(
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                              color: AppTheme.brandBlue,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
            ...sorted.map(
              (review) => _ReviewCard(
                reviewId: review.id,
                productId: widget.product.id,
                firestoreCollection: AppConstants.reviewsCollection,
                userId: review.userId,
                displayName: _resolveDisplayName(review, currentUserId),
                currentUserPhotoUrl: _resolvePhotoUrl(review, currentUserId),
                timeAgo: _timeAgo(review.createdAt),
                text: review.text,
                rating: review.rating,
                likedBy: review.likedBy,
                dislikedBy: review.dislikedBy,
                currentUserId: currentUserId,
                onDelete: review.userId == currentUserId
                    ? () async {
                        await ref
                            .read(productRepositoryProvider)
                            .deleteReview(review.id);
                        ref.invalidate(
                          productReviewsProvider(widget.product.id),
                        );
                      }
                    : null,
              ),
            ),
          ],
        );
      },
    );
  }
}

// ─── YouTube bottom sheet ───────────────────────────────────────────────────
class _YouTubeBottomSheet extends ConsumerStatefulWidget {
  final ProductEntity product;
  const _YouTubeBottomSheet({required this.product});

  @override
  ConsumerState<_YouTubeBottomSheet> createState() =>
      _YouTubeBottomSheetState();
}

class _YouTubeBottomSheetState extends ConsumerState<_YouTubeBottomSheet> {
  /// User picked a video: pop the sheet with the selection so the caller
  /// can open the floating PiP player on the page's overlay.
  void _onVideoTap(String url, String title, String thumbnailUrl) {
    Navigator.of(context).pop(
      _PickedYouTubeVideo(url: url, title: title, thumbnailUrl: thumbnailUrl),
    );
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return DraggableScrollableSheet(
      initialChildSize: 0.85,
      minChildSize: 0.5,
      maxChildSize: 0.95,
      expand: false,
      builder: (sheetCtx, scrollController) {
        return Container(
          decoration: BoxDecoration(
            color: context.surfaceColor,
            borderRadius: const BorderRadius.vertical(
              top: Radius.circular(20),
            ),
          ),
          child: Column(
            children: [
              const SizedBox(height: 10),
              Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: context.dividerColor,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              const SizedBox(height: 12),
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 0, 12, 12),
                child: Row(
                  children: [
                    const Icon(
                      Icons.smart_display_rounded,
                      size: 22,
                      color: Color(0xFFFF0000),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        Localizations.localeOf(context).languageCode == 'tr'
                            ? 'YouTube İncelemeleri'
                            : 'YouTube Reviews',
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 18,
                          fontWeight: FontWeight.w800,
                          color: context.textPrimary,
                        ),
                      ),
                    ),
                    IconButton(
                      icon: Icon(
                        Icons.close_rounded,
                        color: context.textPrimary,
                      ),
                      onPressed: () => Navigator.of(sheetCtx).pop(),
                    ),
                  ],
                ),
              ),
              Divider(height: 1, color: context.dividerColor),
              Expanded(
                child: ListView(
                  controller: scrollController,
                  padding: EdgeInsets.fromLTRB(
                    16,
                    8,
                    16,
                    MediaQuery.of(context).padding.bottom + 16,
                  ),
                  children: [
                    // Auto-loads videos; tapping opens floating PiP player.
                    SharedYouTubeReviewsCard(
                      product: widget.product,
                      isDark: isDark,
                      cardBg: context.surfaceVariantColor,
                      collapsible: false,
                      hideHeader: true,
                      onVideoTap: _onVideoTap,
                    ),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}
