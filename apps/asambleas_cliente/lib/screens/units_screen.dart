import 'package:flutter/material.dart';

import '../state/session_controller.dart';
import '../widgets.dart';

class UnitsScreen extends StatelessWidget {
  const UnitsScreen({super.key, required this.session});
  final SessionController session;

  @override
  Widget build(BuildContext context) {
    final units = session.units;
    if (units.isEmpty) {
      return const EmptyPanel(
        title: 'No hay unidades vinculadas',
        body: 'Solo aparecen las unidades que el servidor asocia a tu cuenta. Esta consulta es de solo lectura.',
      );
    }
    return ListView.separated(
      padding: const EdgeInsets.all(16),
      itemCount: units.length,
      separatorBuilder: (_, __) => const SizedBox(height: 8),
      itemBuilder: (context, index) {
        final unit = units[index];
        return Card(
          child: ListTile(
            title: Text(unit['unitCode']?.toString() ?? 'Unidad'),
            subtitle: Text(
              '${unit['propertyHorizontalName'] ?? ''}\n'
              'Relación: participación de la unidad\n'
              'Coeficiente del PH: ${unit['unitCoefficientPercent'] ?? '—'} %\n'
              'Porcentaje de titularidad de la unidad: ${unit['sharePercent'] ?? '—'} %',
            ),
            isThreeLine: true,
          ),
        );
      },
    );
  }
}
