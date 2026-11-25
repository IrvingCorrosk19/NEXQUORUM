import 'dart:async';

import 'package:flutter/material.dart';
import 'package:livekit_client/livekit_client.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:signalr_netcore/ihub_protocol.dart';
import 'package:signalr_netcore/signalr_client.dart';

import '../api/api_client.dart';
import '../api/api_exception.dart';
import '../config.dart';
import '../theme.dart';
import 'vote_sheet.dart';

class RoomScreen extends StatefulWidget {
  const RoomScreen({
    super.key,
    required this.api,
    required this.assemblyId,
    required this.camera,
    required this.mic,
  });

  final ApiClient api;
  final String assemblyId;
  final bool camera;
  final bool mic;

  @override
  State<RoomScreen> createState() => _RoomScreenState();
}

class _RoomScreenState extends State<RoomScreen> with WidgetsBindingObserver {
  HubConnection? _hub;
  Room? _room;
  Map<String, dynamic>? _quorum;
  Map<String, dynamic>? _openVote;
  List<Map<String, dynamic>> _people = [];
  List<Map<String, dynamic>> _chat = [];
  String? _error;
  String _section = 'sala';
  var _voteOpen = false;
  var _unread = 0;
  var _connected = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _enter();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    unawaited(_stop(leave: false));
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      unawaited(_refresh());
    }
  }

  Future<void> _enter() async {
    try {
      await widget.api.postJson('/api/assemblies/${widget.assemblyId}/attendance/presence');
      await _connectHub();
      await _connectMedia();
      await _refresh();
    } on ApiException catch (error) {
      setState(() => _error = error.message);
    } catch (error) {
      setState(() => _error = 'No se pudo entrar a la sala. ${error.toString()}');
    }
  }

  Future<void> _connectHub() async {
    final header = await widget.api.jar.cookieHeader(Uri.parse(AppConfig.baseUrl));
    final headers = MessageHeaders()..setHeaderValue('Cookie', header);
    final hub = HubConnectionBuilder()
        .withUrl(
          '${AppConfig.baseUrl}/hubs/assembly',
          options: HttpConnectionOptions(headers: headers),
        )
        .withAutomaticReconnect(retryDelays: [0, 2000, 5000, 10000])
        .build();
    hub.on('votingOpened', (_) => unawaited(_refresh(showVote: true)));
    hub.on('votingClosed', (_) => unawaited(_refresh()));
    hub.on('quorumUpdated', (_) => unawaited(_refresh()));
    hub.on('participantUpdated', (_) => unawaited(_refresh()));
    hub.on('chatMessageAppended', (args) {
      if (args == null || args.isEmpty || args.first is! Map) return;
      final row = (args.first as Map).map((key, value) => MapEntry(key.toString(), value));
      setState(() {
        _chat.add(row);
        if (_section != 'chat') _unread++;
      });
    });
    hub.onreconnected(({connectionId}) => unawaited(_rejoin()));
    await hub.start();
    await hub.invoke('JoinAssembly', args: [widget.assemblyId, false]);
    _hub = hub;
    setState(() => _connected = true);
  }

  Future<void> _rejoin() async {
    await _hub?.invoke('JoinAssembly', args: [widget.assemblyId, false]);
    await _refresh();
  }

  Future<void> _connectMedia() async {
    if (widget.camera) await Permission.camera.request();
    if (widget.mic) await Permission.microphone.request();
    final token = await widget.api.postJson('/api/assemblies/${widget.assemblyId}/meeting/join-token');
    final room = Room();
    await room.connect(token['serverUrl'].toString(), token['token'].toString());
    if (widget.mic) await room.localParticipant?.setMicrophoneEnabled(true);
    if (widget.camera) await room.localParticipant?.setCameraEnabled(true);
    _room = room;
  }

  Future<void> _refresh({bool showVote = false}) async {
    try {
      final quorum = await widget.api.getJson('/api/assemblies/${widget.assemblyId}/quorum');
      final people = await widget.api.getList('/api/assemblies/${widget.assemblyId}/attendance/participants');
      Map<String, dynamic>? vote;
      try {
        final open = await widget.api.getJson('/api/assemblies/${widget.assemblyId}/voting/open');
        if (open.isNotEmpty && open['status'] != 'Closed') vote = open;
      } on ApiException {
        vote = null;
      }
      final chat = await widget.api.getList('/api/assemblies/${widget.assemblyId}/chat');
      if (!mounted) return;
      setState(() {
        _quorum = quorum;
        _people = [for (final row in people) if (row is Map) row.map((k, v) => MapEntry(k.toString(), v))];
        _openVote = vote;
        _chat = [for (final row in chat) if (row is Map) row.map((k, v) => MapEntry(k.toString(), v))];
        if (showVote && vote != null) _voteOpen = true;
      });
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    }
  }

  Future<void> _toggle(bool camera) async {
    final participant = _room?.localParticipant;
    if (participant == null) return;
    if (camera) {
      final enabled = participant.isCameraEnabled();
      await participant.setCameraEnabled(!enabled);
    } else {
      final enabled = participant.isMicrophoneEnabled();
      await participant.setMicrophoneEnabled(!enabled);
    }
    setState(() {});
  }

  Future<void> _hand() async {
    try {
      await widget.api.postJson('/api/assemblies/${widget.assemblyId}/speakers/request', body: {});
      if (mounted) setState(() => _error = null);
    } on ApiException catch (error) {
      setState(() => _error = error.message);
    }
  }

  Future<void> _send(String text) async {
    if (text.trim().isEmpty) return;
    await widget.api.postJson('/api/assemblies/${widget.assemblyId}/chat', body: {'body': text.trim(), 'asAnnouncement': false});
  }

  Future<void> _leave() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Salir de la sala'),
        content: const Text('Esto registra tu salida. No finaliza la asamblea. Una caída breve de la conexión no es una salida.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancelar')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Salir')),
        ],
      ),
    );
    if (ok != true) return;
    await _stop(leave: true);
    if (mounted) Navigator.of(context).pop();
  }

  Future<void> _stop({required bool leave}) async {
    try {
      if (leave) await _hub?.invoke('LeaveAssembly', args: [widget.assemblyId]);
    } catch (_) {}
    await _hub?.stop();
    await _room?.disconnect();
    _hub = null;
    _room = null;
  }

  @override
  Widget build(BuildContext context) {
    final quorum = _quorum;
    return Theme(
      data: AsambleasTheme.room(),
      child: PopScope(
        canPop: false,
        onPopInvokedWithResult: (didPop, result) {
          if (!didPop) unawaited(_leave());
        },
        child: Scaffold(
          appBar: AppBar(
            title: const Text('Sala'),
            actions: [
              IconButton(onPressed: _leave, icon: const Icon(Icons.logout), tooltip: 'Salir de la sala'),
            ],
          ),
          body: SafeArea(
            child: Column(
              children: [
                if (!_connected) const LinearProgressIndicator(),
                if (_error != null) Material(color: const Color(0xFF7F1D1D), child: Padding(padding: const EdgeInsets.all(8), child: Text(_error!))),
                Padding(
                  padding: const EdgeInsets.all(12),
                  child: Text(
                    'Quórum ${quorum?['currentCoefficient'] ?? '—'} % · mínimo ${quorum?['requiredPercent'] ?? '—'} % · ${quorum?['contributingParticipants'] ?? 0} personas. El audio no acredita.',
                  ),
                ),
                if (_openVote != null && !_voteOpen)
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                    child: FilledButton(onPressed: () => setState(() => _voteOpen = true), child: const Text('Hay una votación activa')),
                  ),
                Expanded(child: _body()),
                if (_voteOpen && _openVote != null)
                  Padding(
                    padding: const EdgeInsets.all(12),
                    child: VoteSheet(api: widget.api, assemblyId: widget.assemblyId, session: _openVote!),
                  ),
                _controls(),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _body() {
    if (_section == 'personas') {
      return ListView(
        children: [
          for (final person in _people)
            ListTile(
              title: Text(person['displayName']?.toString() ?? 'Participante'),
              subtitle: Text('${person['attendanceStatus'] ?? ''} · coeficiente ${person['coefficientPercent'] ?? person['effectiveCoefficientPercent'] ?? 0}'),
            ),
        ],
      );
    }
    if (_section == 'chat') {
      final input = TextEditingController();
      return Column(
        children: [
          Expanded(
            child: ListView(
              children: [
                for (final message in _chat)
                  ListTile(
                    title: Text(message['body']?.toString() ?? ''),
                    subtitle: Text(message['authorName']?.toString() ?? ''),
                  ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(8),
            child: Row(
              children: [
                Expanded(child: TextField(controller: input, decoration: const InputDecoration(hintText: 'Mensaje'))),
                IconButton(
                  onPressed: () {
                    final text = input.text;
                    input.clear();
                    unawaited(_send(text));
                  },
                  icon: const Icon(Icons.send),
                ),
              ],
            ),
          ),
        ],
      );
    }
    return const Center(child: Text('La sala está conectada al servidor. El video de los demás aparece cuando publican.'));
  }

  Widget _controls() {
    final local = _room?.localParticipant;
    return Padding(
      padding: const EdgeInsets.all(8),
      child: Wrap(
        alignment: WrapAlignment.center,
        spacing: 8,
        children: [
          IconButton(onPressed: () => _toggle(false), icon: Icon(local?.isMicrophoneEnabled() == true ? Icons.mic : Icons.mic_off), tooltip: 'Micrófono'),
          IconButton(onPressed: () => _toggle(true), icon: Icon(local?.isCameraEnabled() == true ? Icons.videocam : Icons.videocam_off), tooltip: 'Cámara'),
          IconButton(onPressed: _hand, icon: const Icon(Icons.back_hand), tooltip: 'Pedir la palabra'),
          IconButton(onPressed: () => setState(() => _section = 'personas'), icon: const Icon(Icons.people), tooltip: 'Participantes'),
          Badge(
            isLabelVisible: _unread > 0,
            label: Text('$_unread'),
            child: IconButton(
              onPressed: () => setState(() {
                _section = 'chat';
                _unread = 0;
              }),
              icon: const Icon(Icons.chat),
              tooltip: 'Chat',
            ),
          ),
          IconButton(onPressed: () => setState(() => _section = 'sala'), icon: const Icon(Icons.video_camera_front), tooltip: 'Sala'),
        ],
      ),
    );
  }
}
