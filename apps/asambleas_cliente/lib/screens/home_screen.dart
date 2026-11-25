import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../state/session_controller.dart';
import '../theme.dart';
import '../widgets.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key, required this.session});
  final SessionController session;

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
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
    final next = session.nextAssembly;
    return RefreshIndicator(
      onRefresh: session.refresh,
      child: ListView(
        controller: _scroll,
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(20),
        children: [
          if (session.refreshing && session.assembliesLoaded) const LinearProgressIndicator(),
          Text('Hola, ${session.displayName}', style: Theme.of(context).textTheme.headlineSmall),
          const SizedBox(height: 4),
          Text(session.activePhName, style: Theme.of(context).textTheme.bodyLarge),
          const SizedBox(height: 20),
          if (!session.assembliesLoaded && session.refreshing) const Center(child: Padding(padding: EdgeInsets.all(32), child: CircularProgressIndicator())),
          if (session.assembliesError != null) ...[
            ErrorPanel(
              message: session.assembliesOffline
                  ? 'Sin conexión. Los datos en pantalla pueden estar desactualizados. ${session.assembliesError}'
                  : session.assembliesError!,
              onRetry: session.refresh,
            ),
            const SizedBox(height: 12),
          ],
          if (session.assembliesLoaded && next == null && session.assembliesError == null)
            const EmptyPanel(
              title: 'No hay una próxima asamblea',
              body: 'Cuando haya una convocatoria para tu cuenta, la verás aquí. El historial está en Asambleas.',
            )
          else if (next != null)
            Card(
              child: Padding(
                padding: const EdgeInsets.all(18),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    StatusChip(label: assemblyStatusLabel(next['status']?.toString())),
                    const SizedBox(height: 12),
                    Text(next['title']?.toString() ?? 'Asamblea', style: Theme.of(context).textTheme.titleLarge),
                    const SizedBox(height: 6),
                    Text(next['propertyHorizontalName']?.toString() ?? '', style: Theme.of(context).textTheme.bodyMedium),
                    const SizedBox(height: 4),
                    Text(formatWhen(next['scheduledAtUtc'], timeZone: next['timeZoneId']?.toString()), style: Theme.of(context).textTheme.bodyLarge),
                    const SizedBox(height: 10),
                    Text(
                      canEnter(next) ? 'La sala ya está disponible.' : 'Aún no puedes entrar. La hora programada no abre la sala.',
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: AsambleasTheme.muted),
                    ),
                    const SizedBox(height: 16),
                    FilledButton(
                      onPressed: () {
                        final id = next['assemblyId']?.toString();
                        if (id == null) return;
                        context.push(canEnter(next) ? '/lobby/$id' : '/assembly/$id');
                      },
                      child: Text(primaryAction(next)),
                    ),
                  ],
                ),
              ),
            ),
          const SizedBox(height: 16),
          TextButton(
            onPressed: () => context.go('/unidades'),
            child: Text('${session.units.length} unidad(es) vinculada(s)'),
          ),
        ],
      ),
    );
  }
}
