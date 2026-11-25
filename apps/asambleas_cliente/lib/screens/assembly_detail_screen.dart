import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../api/api_client.dart';
import '../api/api_exception.dart';
import '../theme.dart';
import '../widgets.dart';

class AssemblyDetailScreen extends StatefulWidget {
  const AssemblyDetailScreen({super.key, required this.api, required this.assemblyId});
  final ApiClient api;
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

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final event = await widget.api.getJson('/api/calendar/events/${widget.assemblyId}');
      final agenda = await widget.api.getList('/api/assemblies/${widget.assemblyId}/agenda');
      List<dynamic> motions = [];
      try {
        motions = await widget.api.getList('/api/assemblies/${widget.assemblyId}/motions');
      } on ApiException {
        motions = [];
      }
      if (!mounted) return;
      setState(() {
        _event = event;
        _agenda = agenda;
        _motions = motions;
        _loading = false;
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
                    Text(event?['propertyHorizontalName']?.toString() ?? ''),
                    Text(formatWhen(event?['scheduledAtUtc'], timeZone: event?['timeZoneId']?.toString())),
                    Text('${event?['modality'] ?? ''} · ${assemblyStatusLabel(event?['status']?.toString())}'),
                    const SizedBox(height: 8),
                    Text('Convocatoria: ${_convocationLabel(event?['convocationStatus']?.toString())}'),
                    const SizedBox(height: 12),
                    if (canEnter(event))
                      FilledButton(onPressed: () => context.push('/lobby/${widget.assemblyId}'), child: const Text('Entrar a la sala'))
                    else
                      const Text('El servidor todavía no autoriza el ingreso. No se abre solo porque llegó la hora.'),
                    const SizedBox(height: 20),
                    Text('Agenda', style: Theme.of(context).textTheme.titleMedium),
                    if (_agenda.isEmpty) const Text('La agenda todavía no tiene puntos visibles.'),
                    for (final item in _agenda)
                      if (item is Map)
                        ListTile(
                          title: Text(item['title']?.toString() ?? 'Punto'),
                          subtitle: Text(item['code']?.toString() ?? ''),
                        ),
                    const SizedBox(height: 12),
                    Text('Preguntas', style: Theme.of(context).textTheme.titleMedium),
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
