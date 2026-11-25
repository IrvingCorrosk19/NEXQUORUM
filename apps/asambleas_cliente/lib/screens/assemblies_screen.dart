import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../state/session_controller.dart';
import '../theme.dart';
import '../widgets.dart';

class AssembliesScreen extends StatefulWidget {
  const AssembliesScreen({super.key, required this.session});
  final SessionController session;

  @override
  State<AssembliesScreen> createState() => _AssembliesScreenState();
}

class _AssembliesScreenState extends State<AssembliesScreen> {
  final _scroll = ScrollController();

  SessionController get session => widget.session;

  @override
  void initState() {
    super.initState();
    session.ensureFresh();
  }

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: session,
      builder: (context, _) => _body(context),
    );
  }

  Widget _body(BuildContext context) {
    final upcoming = <Map<String, dynamic>>[];
    final past = <Map<String, dynamic>>[];
    final rows = [...session.events];
    final next = session.nextAssembly;
    if (next != null && !rows.any((event) => event['assemblyId']?.toString() == next['assemblyId']?.toString())) {
      rows.insert(0, next);
    }
    for (final event in rows) {
      final status = event['status']?.toString();
      final done = status == 'Completed' || status == 'Cancelled';
      (done ? past : upcoming).add(event);
    }
    if (!session.assembliesLoaded && session.refreshing) {
      return const Center(child: CircularProgressIndicator());
    }
    if (session.assembliesError != null && session.events.isEmpty && session.nextAssembly == null) {
      return ErrorPanel(
        message: session.assembliesOffline
            ? 'Sin conexión. No se pudo actualizar el listado. ${session.assembliesError}'
            : session.assembliesError!,
        onRetry: session.refresh,
      );
    }
    if (session.assembliesEmpty) {
      return const EmptyPanel(title: 'Sin asambleas', body: 'No hay asambleas autorizadas para el PH actual.');
    }
    return RefreshIndicator(
      onRefresh: session.refresh,
      child: ListView(
      controller: _scroll,
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
      children: [
        if (session.refreshing) const LinearProgressIndicator(),
        const SectionLabel('Próximas'),
        if (upcoming.isEmpty) const Text('No hay próximas asambleas.'),
        for (final event in upcoming) _tile(context, event),
        const SectionLabel('Anteriores'),
        if (past.isEmpty) const Text('No hay asambleas anteriores.'),
        for (final event in past) _tile(context, event),
      ],
    ),
    );
  }

  Widget _tile(BuildContext context, Map<String, dynamic> event) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Card(
        child: ListTile(
          contentPadding: const EdgeInsets.all(12),
          title: Text(event['title']?.toString() ?? 'Asamblea', style: Theme.of(context).textTheme.titleMedium),
          subtitle: Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(formatWhen(event['scheduledAtUtc']), style: const TextStyle(fontSize: 16, color: AsambleasTheme.ink)),
                const SizedBox(height: 6),
                StatusChip(label: assemblyStatusLabel(event['status']?.toString())),
              ],
            ),
          ),
          isThreeLine: true,
          onTap: () => context.push('/assembly/${event['assemblyId']}'),
        ),
      ),
    );
  }
}
