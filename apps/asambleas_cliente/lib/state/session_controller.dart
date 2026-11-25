import 'package:flutter/foundation.dart';

import '../api/api_client.dart';
import '../api/api_exception.dart';

class SessionController extends ChangeNotifier {
  SessionController(this.api);

  final ApiClient api;
  Map<String, dynamic>? me;
  Map<String, dynamic>? profile;
  Map<String, dynamic>? nextAssembly;
  List<Map<String, dynamic>> events = [];
  List<Map<String, dynamic>> portal = [];
  bool ready = false;
  bool busy = false;
  String? error;
  int generation = 0;
  String? pendingRoute;

  bool get signedIn => me != null;

  String get displayName => me?['displayName']?.toString() ?? 'Participante';

  String get activePhName {
    final properties = profile?['properties'];
    if (properties is List) {
      for (final row in properties) {
        if (row is Map && row['isCurrent'] == true) return row['name']?.toString() ?? 'Propiedad';
      }
      if (properties.isNotEmpty && properties.first is Map) {
        return properties.first['name']?.toString() ?? 'Propiedad';
      }
    }
    return 'Sin propiedad seleccionada';
  }

  List<Map<String, dynamic>> get units {
    final rows = profile?['units'];
    if (rows is! List) return [];
    return [for (final row in rows) if (row is Map) row.map((k, v) => MapEntry(k.toString(), v))];
  }

  List<Map<String, dynamic>> get properties {
    final rows = profile?['properties'];
    if (rows is! List) return [];
    return [for (final row in rows) if (row is Map) row.map((k, v) => MapEntry(k.toString(), v))];
  }

  Future<void> bootstrap() async {
    try {
      me = await api.getJson('/api/auth/me');
      await refresh();
    } on ApiException {
      me = null;
    } finally {
      ready = true;
      notifyListeners();
    }
  }

  Future<void> login(String email, String password) async {
    await _guard(() async {
      await api.postJson('/api/auth/login', body: {'email': email.trim(), 'password': password}, auth: false);
      me = await api.getJson('/api/auth/me');
      await refresh();
    });
  }

  Future<String> requestOtp(String email) async {
    final result = await api.postJson('/api/auth/email-otp/request', body: {'email': email.trim()}, auth: false);
    return result['message']?.toString() ??
        'Si el correo puede recibir un código, la solicitud fue aceptada. Eso no confirma que el mensaje ya llegó.';
  }

  Future<void> verifyOtp(String email, String code) async {
    await _guard(() async {
      final result = await api.postJson(
        '/api/auth/email-otp/verify',
        body: {'email': email.trim(), 'code': code.trim()},
        auth: false,
      );
      if (result['succeeded'] == false) {
        throw ApiException(result['message']?.toString() ?? 'El código no es válido.');
      }
      me = await api.getJson('/api/auth/me');
      await refresh();
    });
  }

  Future<String> forgot(String email) async {
    final result = await api.postJson('/api/auth/forgot-password', body: {'email': email.trim()}, auth: false);
    return result['message']?.toString() ??
        'Si la cuenta existe, la solicitud de recuperación fue aceptada.';
  }

  Future<void> refresh() async {
    final ticket = generation;
    profile = await api.getJson('/api/ph/me/owner-profile');
    if (ticket != generation) return;
    final next = await api.getJson('/api/calendar/next');
    if (ticket != generation) return;
    nextAssembly = next['next'] is Map ? (next['next'] as Map).map((k, v) => MapEntry(k.toString(), v)) : null;
    final now = DateTime.now().toUtc();
    final eventsResponse = await api.getJson('/api/calendar/events', query: {
      'from': now.subtract(const Duration(days: 120)).toIso8601String(),
      'to': now.add(const Duration(days: 180)).toIso8601String(),
    });
    if (ticket != generation) return;
    final rows = eventsResponse['events'];
    events = rows is List
        ? [for (final row in rows) if (row is Map) row.map((k, v) => MapEntry(k.toString(), v))]
        : [];
    try {
      final notes = await api.getList('/api/communications/portal/me');
      if (ticket != generation) return;
      portal = [for (final row in notes) if (row is Map) row.map((k, v) => MapEntry(k.toString(), v))];
    } on ApiException {
      portal = [];
    }
    error = null;
    notifyListeners();
  }

  Future<void> switchPh(String propertyHorizontalId) async {
    generation++;
    nextAssembly = null;
    events = [];
    portal = [];
    notifyListeners();
    await _guard(() async {
      await api.postJson('/api/ph/switch', body: {'propertyHorizontalId': propertyHorizontalId});
      me = await api.getJson('/api/auth/me');
      await refresh();
    });
  }

  Future<void> logout() async {
    try {
      await api.postJson('/api/auth/logout');
    } catch (_) {}
    await api.jar.deleteAll();
    me = null;
    profile = null;
    nextAssembly = null;
    events = [];
    portal = [];
    generation++;
    notifyListeners();
  }

  Future<void> _guard(Future<void> Function() action) async {
    busy = true;
    error = null;
    notifyListeners();
    try {
      await action();
    } on ApiException catch (exception) {
      error = exception.message;
      rethrow;
    } finally {
      busy = false;
      notifyListeners();
    }
  }
}
