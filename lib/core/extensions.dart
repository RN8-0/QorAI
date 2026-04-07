/// Compair - Dart Extension Methods

import 'package:flutter/material.dart';
import 'package:compair/core/theme.dart';

// ─── String Extensions ───
extension StringExtensions on String {
  /// Capitalize first letter
  String get capitalize => isEmpty ? '' : '${this[0].toUpperCase()}${substring(1)}';

  /// Capitalize first letter of each word
  String get titleCase => split(' ').map((word) => word.capitalize).join(' ');

  /// Null-safe conversion of String to double
  double? toDoubleOrNull() => double.tryParse(this);

  /// Get score color
  Color get scoreColor {
    final score = toDoubleOrNull();
    if (score == null) return Colors.grey;
    return AppTheme.getScoreColor(score);
  }
}

// ─── Num Extensions ───
extension NumExtensions on num {
  /// Compatibility percentage badge string
  String get asScoreLabel => '%${toStringAsFixed(0)} compatibility';

  /// Get score color
  Color get scoreColor => AppTheme.getScoreColor(toDouble());

  /// Padding
  SizedBox get heightBox => SizedBox(height: toDouble());
  SizedBox get widthBox => SizedBox(width: toDouble());
}

// ─── Responsive Breakpoints ───
class Breakpoints {
  static const double mobile = 600;
  static const double tablet = 900;
  static const double desktop = 1200;
  static const double wideDesktop = 1600;
}

enum ScreenSize { mobile, tablet, desktop, wideDesktop }

// ─── Context Extensions ───
extension ContextExtensions on BuildContext {
  ThemeData get theme => Theme.of(this);
  TextTheme get textTheme => theme.textTheme;
  ColorScheme get colorScheme => theme.colorScheme;
  MediaQueryData get mediaQuery => MediaQuery.of(this);
  Size get screenSize => mediaQuery.size;
  double get screenWidth => screenSize.width;
  double get screenHeight => screenSize.height;
  bool get isDarkMode => theme.brightness == Brightness.dark;
  EdgeInsets get padding => mediaQuery.padding;

  ScreenSize get screenSizeCategory {
    final w = screenWidth;
    if (w >= Breakpoints.wideDesktop) return ScreenSize.wideDesktop;
    if (w >= Breakpoints.desktop) return ScreenSize.desktop;
    if (w >= Breakpoints.tablet) return ScreenSize.tablet;
    return ScreenSize.mobile;
  }

  bool get isMobile => screenWidth < Breakpoints.mobile;
  bool get isTablet => screenWidth >= Breakpoints.mobile && screenWidth < Breakpoints.desktop;
  bool get isDesktop => screenWidth >= Breakpoints.desktop;

  double get contentMaxWidth {
    if (isDesktop) return 1200;
    if (isTablet) return screenWidth - 80;
    return screenWidth;
  }

  /// Show SnackBar
  void showSnackBar(String message, {bool isError = false}) {
    ScaffoldMessenger.of(this).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: isError ? Colors.red : AppTheme.accentTeal,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppTheme.borderRadiusSmall),
        ),
      ),
    );
  }
}

// ─── DateTime Extensions ───
extension DateTimeExtensions on DateTime {
  /// Date format (by country)
  String format([String pattern = 'dd MMM yyyy']) {
    return toString(); // will be formatted using intl
  }

  /// Is this week?
  bool get isThisWeek {
    final now = DateTime.now();
    final startOfWeek = now.subtract(Duration(days: now.weekday - 1));
    final endOfWeek = startOfWeek.add(const Duration(days: 7));
    return isAfter(startOfWeek) && isBefore(endOfWeek);
  }

  /// Within the last 30 days? (Profile evolution algorithm - Section 10.3)
  bool get isWithinLast30Days {
    return DateTime.now().difference(this).inDays <= 30;
  }
}

// ─── List Extensions ───
extension ListExtensions<T> on List<T> {
  /// Get the first N elements (safe)
  List<T> safeSublist(int count) {
    return length > count ? sublist(0, count) : this;
  }
}

// ─── Widget Extensions ───
extension WidgetExtensions on Widget {
  /// Add padding
  Widget padAll(double padding) => Padding(
        padding: EdgeInsets.all(padding),
        child: this,
      );

  Widget padHorizontal(double padding) => Padding(
        padding: EdgeInsets.symmetric(horizontal: padding),
        child: this,
      );

  Widget padVertical(double padding) => Padding(
        padding: EdgeInsets.symmetric(vertical: padding),
        child: this,
      );

  /// Convert to Sliver
  Widget get asSliver => SliverToBoxAdapter(child: this);
}
