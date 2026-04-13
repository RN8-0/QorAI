const fs = require('fs');

// Read current file
const content = fs.readFileSync('lib/services/profile_algorithm_service.dart', 'utf8');

// Find the ProfileWeights class and everything after it  
const pwIdx = content.indexOf('/// Weight constants for the profile algorithm');
if (pwIdx === -1) {
  console.log('ProfileWeights not found, searching for class...');
  const c2 = content.indexOf('class ProfileWeights');
  console.log('class ProfileWeights at:', c2);
  process.exit(1);
}

// Find GlobalAlgorithmSignals static members that are clean
// Extract from line 152 onwards (after the stub GlobalAlgorithmSignals)
const globalStubEnd = content.indexOf('static Future<GlobalAlgorithmSignals> load() async {\n    // TODO:');
const afterGlobal = content.indexOf('\n}\n\n/// Weight constants', globalStubEnd);

// Build clean file:
const header = content.substring(0, content.indexOf('\n/// Global algorithm aggregates from all users.\nclass GlobalAlgorithmSignals {'));
const globalClass = `
/// Global algorithm aggregates from all users.
class GlobalAlgorithmSignals {
  /// category → total views across all users
  final Map<String, int> categoryPopularity;
  /// Total quiz submissions across all users
  final int totalQuizzes;

  const GlobalAlgorithmSignals({
    this.categoryPopularity = const {},
    this.totalQuizzes = 0,
  });

  static const empty = GlobalAlgorithmSignals();

  static Future<GlobalAlgorithmSignals> load() async {
    // TODO: implement PocketBase global signals aggregation
    return empty;
  }
}
`;

const rest = content.substring(afterGlobal + 5); // skip '\n}\n\n'

const cleaned = header + globalClass + rest;
fs.writeFileSync('lib/services/profile_algorithm_service.dart', cleaned, 'utf8');
console.log('profile_algorithm_service.dart cleaned, length:', cleaned.length);

// Verify no Firestore references
const remaining = (cleaned.match(/FirebaseFirestore|cloud_firestore|QuerySnapshot|DocumentSnapshot/g) || []).length;
console.log('Remaining Firestore refs:', remaining);
