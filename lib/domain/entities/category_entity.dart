/// Compair - Category Entity (Domain Layer)
/// Blueprint Section 4.4
library;

import 'package:equatable/equatable.dart';

class CategoryEntity extends Equatable {
  final String id;
  final String name;
  final String icon;
  final String? emoji;
  final int order;
  final bool isActive;
  final List<String> subcategories;
  final int productCount;

  const CategoryEntity({
    required this.id,
    required this.name,
    required this.icon,
    this.emoji,
    this.order = 0,
    this.isActive = true,
    this.subcategories = const [],
    this.productCount = 0,
  });

  @override
  List<Object?> get props => [id, name];
}
