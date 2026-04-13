/// Compair - Custom Error Classes
library;
/// Base app error
abstract class AppException implements Exception {
  final String message;
  final String? code;
  final dynamic originalError;

  const AppException({
    required this.message,
    this.code,
    this.originalError,
  });

  @override
  String toString() => 'AppException($code): $message';
}

/// Server errors
class ServerException extends AppException {
  final int? statusCode;

  const ServerException({
    required super.message,
    this.statusCode,
    super.code,
    super.originalError,
  });
}

/// AI Service errors - Section 7.5
class AIServiceException extends AppException {
  final bool isTimeout;
  final bool isRateLimited;
  final int retryCount;

  const AIServiceException({
    required super.message,
    this.isTimeout = false,
    this.isRateLimited = false,
    this.retryCount = 0,
    super.code,
    super.originalError,
  });
}

/// Network errors
class NetworkException extends AppException {
  const NetworkException({
    super.message = 'No internet connection found',
    super.code = 'NETWORK_ERROR',
    super.originalError,
  });
}

/// Cache errors
class CacheException extends AppException {
  const CacheException({
    required super.message,
    super.code = 'CACHE_ERROR',
    super.originalError,
  });
}

/// Authentication errors
class AuthException extends AppException {
  const AuthException({
    required super.message,
    super.code = 'AUTH_ERROR',
    super.originalError,
  });
}

/// @deprecated Use ServerException instead
@Deprecated('Use ServerException instead')
class FirestoreException extends AppException {
  const FirestoreException({
    required super.message,
    super.code = 'FIRESTORE_ERROR',
    super.originalError,
  });
}

/// Validation errors
class ValidationException extends AppException {
  const ValidationException({
    required super.message,
    super.code = 'VALIDATION_ERROR',
  });
}

/// Usage limit exceeded errors - Section 12.2
class UsageLimitException extends AppException {
  final String featureName;
  final int currentUsage;
  final int limit;

  const UsageLimitException({
    required this.featureName,
    required this.currentUsage,
    required this.limit,
    super.message = 'Daily usage limit reached',
    super.code = 'USAGE_LIMIT',
  });
}

/// Result type (Either pattern)
sealed class Result<T> {
  const Result();
}

class Success<T> extends Result<T> {
  final T data;
  const Success(this.data);
}

class Failure<T> extends Result<T> {
  final AppException error;
  const Failure(this.error);
}

/// Result extension methods
extension ResultExtensions<T> on Result<T> {
  bool get isSuccess => this is Success<T>;
  bool get isFailure => this is Failure<T>;

  T? get dataOrNull => this is Success<T> ? (this as Success<T>).data : null;
  AppException? get errorOrNull =>
      this is Failure<T> ? (this as Failure<T>).error : null;

  R when<R>({
    required R Function(T data) success,
    required R Function(AppException error) failure,
  }) {
    return switch (this) {
      Success<T>(data: final data) => success(data),
      Failure<T>(error: final error) => failure(error),
    };
  }
}
