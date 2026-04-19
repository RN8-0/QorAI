import 'dart:math';

import 'package:flutter/material.dart';
import 'package:compair/core/theme.dart';

class AnimatedGradientInputShell extends StatefulWidget {
  final Widget child;
  final Widget? topContent;
  final EdgeInsetsGeometry outerPadding;
  final BorderRadius outerBorderRadius;
  final BorderRadius innerBorderRadius;

  const AnimatedGradientInputShell({
    super.key,
    required this.child,
    this.topContent,
    this.outerPadding = const EdgeInsets.all(2),
    this.outerBorderRadius = const BorderRadius.all(Radius.circular(20)),
    this.innerBorderRadius = const BorderRadius.all(Radius.circular(18)),
  });

  @override
  State<AnimatedGradientInputShell> createState() =>
      _AnimatedGradientInputShellState();
}

class _AnimatedGradientInputShellState extends State<AnimatedGradientInputShell>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 4),
    )..repeat();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, child) {
        return Container(
          padding: widget.outerPadding,
          decoration: BoxDecoration(
            borderRadius: widget.outerBorderRadius,
            gradient: SweepGradient(
              colors: const [
                AppTheme.brandBlue,
                AppTheme.brandSkyBlue,
                AppTheme.brandCyan,
                AppTheme.brandDeepBlue,
                AppTheme.brandBlue,
              ],
              transform: GradientRotation(_controller.value * 2 * pi),
            ),
          ),
          child: child,
        );
      },
      child: Container(
        decoration: BoxDecoration(
          color: context.surfaceElevatedColor,
          borderRadius: widget.innerBorderRadius,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (widget.topContent != null) widget.topContent!,
            widget.child,
          ],
        ),
      ),
    );
  }
}
