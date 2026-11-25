import 'package:flutter/foundation.dart';

import '../api/api_client.dart';
import '../api/api_exception.dart';
import 'assembly_catalog.dart';

class SessionController extends ChangeNotifier {
  SessionController(this.api);

  final ApiClient api;
  final catalog = AssemblyCatalog();
  Future<void>? _flight;
  var _again = false;
  Map<String, dynamic>? me;
  Map<String, dynamic>? profile;
  Map<String, dynamic>? get nextAssembly => catalog.next;
  List<Map<String, dynamic>> get events => catalog.events;
  bool get refreshing => catalog.refreshing;
  bool get assembliesLoaded => catalog.loaded;
  bool get assembliesOffline => catalog.offline;
  String? get assembliesError => catalog.error;
  bool get assembliesEmpty => catalog.showEmpty;
  int get catalogEpoch => catalog.epoch;
  String? get activePropertyHorizontalId {
    final properties = profile?['properties'];
    if (properties is List) {
      for (final row in properties) {
        if (row is Map && row['isCurrent'] == true) return row['propertyHorizontalId']?.toString();
      }
    }
    return null;
  }
  List<Map<String, dynamic>> portal = [];
  bool ready = false;
  bool busy = false;
  String? error;
  int get generation => catalog.generation;
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
      await ensureFresh(force: true);
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
      await ensureFresh(force: true);
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

  Future<void> refresh() => ensureFresh(force: true);

  Future<void> ensureFresh({bool force = false}) {
    if (_flight != null) {
      if (force) _again = true;
      return _flight!.then((_) {
        if (_again) {
          _again = false;
          return ensureFresh(force: true);
        }
      });
    }
    if (!force && catalog.isFresh) return Future.value();
    final run = _loadAssemblies();
    _flight = run.whenComplete(() => _flight = null);
    return run.then((_) {
      if (_again) {
        _again = false;
        return ensureFresh(force: true);
      }
    });
  }

  Future<void> _loadAssemblies() async {
    final ticket = catalog.generation;
    catalog.refreshing = true;
    notifyListeners();
    try {
      final profileResponse = await api.getJson('/api/ph/me/owner-profile');
      if (ticket != catalog.generation) return;
      profile = profileResponse;
      final next = await api.getJson('/api/calendar/next');
      if (ticket != catalog.generation) return;
      final nextAssembly = next['next'] is Map ? (next['next'] as Map).map((k, v) => MapEntry(k.toString(), v)) : null;
      final now = DateTime.now().toUtc();
      final eventsResponse = await api.getJson('/api/calendar/events', query: {
        'from': now.subtract(const Duration(days: 120)).toIso8601String(),
        'to': now.add(const Duration(days: 180)).toIso8601String(),
      });
      if (ticket != catalog.generation) return;
      final rows = eventsResponse['events'];
      final events = rows is List
          ? [for (final row in rows) if (row is Map) row.map((k, v) => MapEntry(k.toString(), v))]
          : <Map<String, dynamic>>[];
      catalog.commit(ticket: ticket, events: events, next: nextAssembly);
      try {
        final notes = await api.getList('/api/communications/portal/me');
        if (ticket != catalog.generation) return;
        portal = [for (final row in notes) if (row is Map) row.map((k, v) => MapEntry(k.toString(), v))];
      } on ApiException {
        if (ticket == catalog.generation) portal = [];
      }
      error = null;
    } on ApiException catch (exception) {
      if (exception.status == 401) {
        me = null;
        catalog.fail(ticket: ticket, message: 'La sesión expiró. Entra de nuevo.', offline: false);
      } else if (ticket == catalog.generation) {
        catalog.fail(
          ticket: ticket,
          message: exception.message,
          offline: exception.uncertain || exception.status == null,
        );
      }
    } finally {
      if (ticket == catalog.generation) catalog.refreshing = false;
      if (ticket == catalog.generation) notifyListeners();
    }
  }

  Future<void> switchPh(String propertyHorizontalId) async {
    catalog.beginPhSwitch();
    portal = [];
    notifyListeners();
    await _guard(() async {
      await api.postJson('/api/ph/switch', body: {'propertyHorizontalId': propertyHorizontalId});
      me = await api.getJson('/api/auth/me');
      await ensureFresh(force: true);
    });
  }

  Future<void> logout() async {
    try {
      await api.postJson('/api/auth/logout');
    } catch (_) {}
    await api.jar.deleteAll();
    me = null;
    profile = null;
    portal = [];
    catalog.beginPhSwitch();
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
