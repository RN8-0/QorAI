/// Qor AI - Connectivity Service
/// Blueprint Section 7.5
///
/// Monitors internet connection status
/// Shows offline banner
/// Uses connectivity_plus package
library;

import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Connection status
enum ConnectivityStatus {
  online,
  offline,
}

/// Connectivity stream provider - realtime connection monitoring
final connectivityProvider = StreamProvider<ConnectivityStatus>((ref) {
  return Connectivity()
      .onConnectivityChanged
      .map((results) {
    // connectivity_plus 6.x returns List<ConnectivityResult>
    if (results.contains(ConnectivityResult.none) || results.isEmpty) {
      return ConnectivityStatus.offline;
    }
    return ConnectivityStatus.online;
  });
});

/// Quickly check connection status (one-time)
Future<bool> isOnline() async {
  try {
    final result = await Connectivity().checkConnectivity();
    return !result.contains(ConnectivityResult.none) && result.isNotEmpty;
  } catch (e) {
    debugPrint('⚠️ Connectivity check failed: $e');
    return true; // Default: assume online
  }
}
