class ApiException implements Exception {
  ApiException(this.message, {this.status, this.code, this.uncertain = false});

  final String message;
  final int? status;
  final String? code;
  final bool uncertain;

  @override
  String toString() => message;
}
