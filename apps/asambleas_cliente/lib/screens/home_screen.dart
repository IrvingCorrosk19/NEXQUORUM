import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../state/session_controller.dart';
import '../theme.dart';
import '../widgets.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key, required this.session});
  final SessionController session;

  @override
  Widget build(BuildContext context) {
    final next = session.nextAssembly;
    return RefreshIndicator(
      onRefresh: session.refresh,
      child: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Text('Hola, ${session.displayName}', style: Theme.of(context).textTheme.headlineSmall),
          const SizedBox(height: 4),
          Text(session.activePhName),
          const SizedBox(height: 8),
          Text('${session.units.length} unidad(es) vinculada(s)'),
          const SizedBox(height: 20),
          if (session.error != null) ErrorPanel(message: session.error!, onRetry: session.refresh),
          if (next == null)
            const EmptyPanel(
              title: 'No hay una próxima asamblea',
              body: 'Cuando exista una convocatoria autorizada aparecerá aquí. Puedes revisar el historial en Asambleas.',
            )
          else
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(next['title']?.toString() ?? 'Asamblea', style: Theme.of(context).textTheme.titleLarge),
                    const SizedBox(height: 8),
                    Text(next['propertyHorizontalName']?.toString() ?? ''),
                    Text(formatWhen(next['scheduledAtUtc'], timeZone: next['timeZoneId']?.toString())),
                    Text(assemblyStatusLabel(next['status']?.toString())),
                    const SizedBox(height: 8),
                    Text(canEnter(next)
                        ? 'Ya puedes entrar a la sala.'
                        : 'Todavía no puedes entrar. La hora programada no abre la sala por sí sola.'),
                    const SizedBox(height: 12),
                    FilledButton(
                      onPressed: () {
                        final id = next['assemblyId']?.toString();
                        if (id == null) return;
                        if (canEnter(next)) {
                          context.push('/lobby/$id');
                        } else {
                          context.push('/assembly/$id');
                        }
                      },
                      child: Text(primaryAction(next)),
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}
