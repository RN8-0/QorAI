import 'package:flutter/material.dart';

/// Full-width gradient button with optional child widget.
class GradientButton extends StatelessWidget {
  final Widget child;
  final Gradient gradient;
  final VoidCallback? onPressed;
  final double? height;
  final double? width;
  final BorderRadius? borderRadius;

  const GradientButton({
    super.key,
    required this.child,
    required this.gradient,
    this.onPressed,
    this.height,
    this.width,
    this.borderRadius,
  });

  @override
  Widget build(BuildContext context) {
    final br = borderRadius ?? BorderRadius.circular(12);
    return Container(
      height: height,
      width: width,
      decoration: BoxDecoration(
        gradient: gradient,
        borderRadius: br,
      ),
      child: Material(
        color: Colors.transparent,
        borderRadius: br,
        child: InkWell(
          onTap: onPressed,
          borderRadius: br,
          child: Center(child: child),
        ),
      ),
    );
  }
}
