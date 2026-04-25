part of '../compare_screen.dart';
/// Data class for a single spec comparison row.
class _CompareSpecRow {
  final String label;
  final List<String> values;
  const _CompareSpecRow({required this.label, required this.values});
}

/// Keeps TabBarView children alive across tab switches.
class _KeepAliveTab extends StatefulWidget {
  final Widget child;
  const _KeepAliveTab({required this.child});
  @override
  State<_KeepAliveTab> createState() => _KeepAliveTabState();
}

class _KeepAliveTabState extends State<_KeepAliveTab>
    with AutomaticKeepAliveClientMixin {
  @override
  bool get wantKeepAlive => true;
  @override
  Widget build(BuildContext context) {
    super.build(context);
    return widget.child;
  }
}

// ─── Tab Bar Delegate ─────────────────────────────────────────────────────────

class _ShimmerBlock extends StatefulWidget {
  final double width;
  final double height;
  const _ShimmerBlock({required this.width, required this.height});
  @override
  State<_ShimmerBlock> createState() => _ShimmerBlockState();
}

class _ShimmerBlockState extends State<_ShimmerBlock>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;
  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1500),
    )..repeat();
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _ctrl,
      builder: (_, __) => Container(
        width: widget.width,
        height: widget.height,
        margin: const EdgeInsets.only(bottom: 2),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(6),
          gradient: LinearGradient(
            begin: Alignment(-1.0 + 2.0 * _ctrl.value, 0),
            end: Alignment(-1.0 + 2.0 * _ctrl.value + 1, 0),
            colors: [
              Colors.grey.withValues(alpha: 0.12),
              Colors.grey.withValues(alpha: 0.24),
              Colors.grey.withValues(alpha: 0.12),
            ],
          ),
        ),
      ),
    );
  }
}

// ─── In-App YouTube Comparison Videos (uses YouTubeService) ───


