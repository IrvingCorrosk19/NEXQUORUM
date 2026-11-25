import 'package:asambleas_cliente/state/assembly_catalog.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('una respuesta antigua no reemplaza el catálogo de otro PH', () {
    final catalog = AssemblyCatalog();
    final first = catalog.generation;
    catalog.beginPhSwitch();
    final applied = catalog.commit(
      ticket: first,
      events: [
        {'assemblyId': 'vieja', 'title': 'PH anterior'},
      ],
      next: null,
    );
    expect(applied, isFalse);
    expect(catalog.events, isEmpty);
    expect(catalog.showEmpty, isFalse);
  });

  test('un error conserva la lista y no se presenta como vacía', () {
    final catalog = AssemblyCatalog();
    catalog.commit(
      ticket: catalog.generation,
      events: [
        {'assemblyId': '1', 'title': 'Ordinaria', 'status': 'Scheduled'},
      ],
      next: {'assemblyId': '1', 'title': 'Ordinaria'},
    );
    final kept = catalog.fail(ticket: catalog.generation, message: 'No hay conexión con Asambleas.', offline: true);
    expect(kept, isTrue);
    expect(catalog.events, hasLength(1));
    expect(catalog.showEmpty, isFalse);
    expect(catalog.offline, isTrue);
  });

  test('una consulta válida sin filas sí es una lista vacía', () {
    final catalog = AssemblyCatalog();
    catalog.commit(ticket: catalog.generation, events: [], next: null);
    expect(catalog.loaded, isTrue);
    expect(catalog.showEmpty, isTrue);
    expect(catalog.error, isNull);
  });

  test('después de un fallo, una respuesta nueva vuelve a cargar', () {
    final catalog = AssemblyCatalog();
    catalog.fail(ticket: catalog.generation, message: 'Error', offline: false);
    catalog.commit(
      ticket: catalog.generation,
      events: [
        {'assemblyId': '2', 'status': 'CheckIn'},
      ],
      next: {'assemblyId': '2'},
    );
    expect(catalog.error, isNull);
    expect(catalog.loaded, isTrue);
    expect(catalog.events.single['assemblyId'], '2');
  });
}
