import 'dart:async';

import 'package:signalr_netcore/ihub_protocol.dart';
import 'package:signalr_netcore/signalr_client.dart';

import '../config.dart';
import 'session_controller.dart';

class CalendarSync {
  CalendarSync(this.session);

  final SessionController session;
  HubConnection? _hub;
  String? _phId;
  var _starting = false;

  Future<void> start(String? propertyHorizontalId) async {
    if (propertyHorizontalId == null || propertyHorizontalId.isEmpty) return;
    if (_hub != null && _phId == propertyHorizontalId) return;
    if (_starting) return;
    _starting = true;
    try {
      await stop();
      final header = await session.api.jar.cookieHeader(Uri.parse(AppConfig.baseUrl));
      final headers = MessageHeaders()..setHeaderValue('Cookie', header);
      final hub = HubConnectionBuilder()
          .withUrl(
            '${AppConfig.baseUrl}/hubs/assembly',
            options: HttpConnectionOptions(headers: headers),
          )
          .withAutomaticReconnect(retryDelays: [0, 2000, 5000, 10000])
          .build();
      hub.on('calendarInvalidated', (_) {
        unawaited(session.ensureFresh(force: true));
      });
      hub.onreconnected(({connectionId}) async {
        final ph = _phId;
        if (ph != null) {
          await hub.invoke('WatchCalendar', args: [ph]);
        }
        await session.ensureFresh(force: true);
      });
      await hub.start();
      await hub.invoke('WatchCalendar', args: [propertyHorizontalId]);
      _hub = hub;
      _phId = propertyHorizontalId;
    } catch (_) {
      await stop();
    } finally {
      _starting = false;
    }
  }

  Future<void> stop() async {
    final hub = _hub;
    _hub = null;
    _phId = null;
    if (hub != null) {
      await hub.stop();
    }
  }
}
