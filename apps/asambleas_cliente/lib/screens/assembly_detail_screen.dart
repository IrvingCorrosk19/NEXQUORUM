import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../api/api_exception.dart';
import '../state/session_controller.dart';
import '../theme.dart';
import '../widgets.dart';

class AssemblyDetailScreen extends StatefulWidget {
  const AssemblyDetailScreen({super.key, required this.session, required this.assemblyId});
  final SessionController session;
  final String assemblyId;

  @override
  State<AssemblyDetailScreen> createState() => _AssemblyDetailScreenState();
}

class _AssemblyDetailScreenState extends State<AssemblyDetailScreen> {
  Map<String, dynamic>? _event;
  List<dynamic> _agenda = [];
  List<dynamic> _motions = [];
  String? _error;
  var _loading = true;
  var _seenEpoch = -1;

  @override
  void initState() {
    super.initState();
    widget.session.addListener(_onCatalog);
    _load();
  }

  @override
  void dispose() {
    widget.session.removeListener(_onCatalog);
    super.dispose();
  }

  void _onCatalog() {
    if (widget.session.catalogEpoch == _seenEpoch) return;
    _seenEpoch = widget.session.catalogEpoch;
    final match = widget.session.events.where(
      (event) => event['assemblyId']?.toString() == widget.assemblyId,
    );
    if (match.isNotEmpty && mounted) {
      setState(() => _event = match.first);
    }
    _load(quiet: _event != null);
  }

  Future<void> _load({bool quiet = false}) async {
    if (!quiet) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }
    try {
      final event = await widget.session.api.getJson('/api/calendar/events/${widget.assemblyId}');
      final agendaResponse = await widget.session.api.getJson('/api/assemblies/${widget.assemblyId}/agenda');
      final agenda = agendaResponse['items'] is List ? agendaResponse['items'] as List<dynamic> : <dynamic>[];
      List<dynamic> motions = [];
      try {
        motions = await widget.session.api.getList('/api/assemblies/${widget.assemblyId}/motions');
      } on ApiException {
        motions = [];
      }
      if (!mounted) return;
      setState(() {
        _event = event;
        _agenda = agenda;
        _motions = motions;
        _loading = false;
        _seenEpoch = widget.session.catalogEpoch;
      });
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error.message;
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final event = _event;
    return Scaffold(
      appBar: AppBar(title: const Text('Asamblea')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? ErrorPanel(message: _error!, onRetry: _load)
              : ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    Text(event?['title']?.toString() ?? 'Asamblea', style: Theme.of(context).textTheme.headlineSmall),
                    const SizedBox(height: 4),
                    Text(event?['propertyHorizontalName']?.toString() ?? '', style: Theme.of(context).textTheme.bodyLarge),
                    const SizedBox(height: 4),
                    Text(formatWhen(event?['scheduledAtUtc'], timeZone: event?['timeZoneId']?.toString())),
                    const SizedBox(height: 8),
                    StatusChip(label: assemblyStatusLabel(event?['status']?.toString())),
                    const SizedBox(height: 16),
                    const SectionLabel('Convocatoria'),
                    Text(_convocationLabel(event?['convocationStatus']?.toString())),
                    const SizedBox(height: 12),
                    if (canEnter(event))
                      FilledButton(onPressed: () => context.push('/lobby/${widget.assemblyId}'), child: const Text('Entrar a la sala'))
                    else
                      const Text('El servidor todavía no autoriza el ingreso. No se abre solo porque llegó la hora.'),
                    const SizedBox(height: 20),
                    const SectionLabel('Agenda'),
                    if (_agenda.isEmpty) const Text('La agenda todavía no tiene puntos visibles.'),
                    for (final item in _agenda)
                      if (item is Map)
                        ListTile(
                          title: Text(item['title']?.toString() ?? 'Punto'),
                          subtitle: Text(item['code']?.toString() ?? ''),
                        ),
                    const SizedBox(height: 12),
                    const SectionLabel('Preguntas y documentos'),
                    if (_motions.isEmpty) const Text('No hay preguntas visibles para tu cuenta.'),
                    for (final item in _motions)
                      if (item is Map)
                        ListTile(
                          title: Text(item['title']?.toString() ?? item['code']?.toString() ?? 'Pregunta'),
                          subtitle: Text(item['status']?.toString() ?? ''),
                        ),
                  ],
                ),
    );
  }

  String _convocationLabel(String? status) {
    switch (status) {
      case 'Sent':
        return 'Disponible. El envío por correo es distinto de verla aquí.';
      case 'Draft':
        return 'Todavía no está publicada.';
      default:
        return status ?? 'Sin dato de envío. Si aparece en el portal, puedes leerla aquí.';
    }
  }
}
