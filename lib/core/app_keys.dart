import 'package:flutter/material.dart';

/// Global scaffold key — shared between MainShell and any widget
/// that needs to open the drawer (e.g. AIChatScreen floating overlay).
final mainShellScaffoldKey = GlobalKey<ScaffoldState>();
