import 'package:asambleas_cliente/api/api_client.dart';
import 'package:asambleas_cliente/screens/assemblies_screen.dart';
import 'package:asambleas_cliente/screens/home_screen.dart';
import 'package:asambleas_cliente/screens/login_screen.dart';
import 'package:asambleas_cliente/screens/profile_screen.dart';
import 'package:asambleas_cliente/screens/units_screen.dart';
import 'package:asambleas_cliente/state/session_controller.dart';
import 'package:asambleas_cliente/theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  for (final width in <double>[360, 390, 430]) {
    testWidgets('las pantallas principales caben a $width con texto ampliado', (tester) async {
      tester.view.physicalSize = Size(width, 800);
      tester.view.devicePixelRatio = 1;
      tester.platformDispatcher.textScaleFactorTestValue = 1.3;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);

      final session = SessionController(ApiClient());
      session.me = {
        'displayName': 'Participante',
        'email': 'persona@example.test',
        'hasLocalPassword': true,
      };
      session.profile = {
        'properties': [
          {'name': 'PH de prueba', 'isCurrent': true},
        ],
        'units': [
          {
            'unitCode': '201',
            'propertyHorizontalName': 'PH de prueba',
            'unitCoefficientPercent': 4.1667,
            'sharePercent': 100,
          },
        ],
      };
      session.nextAssembly = {
        'assemblyId': '1',
        'title': 'Asamblea ordinaria de prueba con título largo',
        'status': 'CheckIn',
        'canJoin': true,
        'scheduledAtUtc': '2026-11-16T19:00:00Z',
        'propertyHorizontalName': 'PH de prueba',
      };
      session.events = [
        session.nextAssembly!,
        {
          'assemblyId': '2',
          'title': 'Asamblea anterior',
          'status': 'Completed',
          'scheduledAtUtc': '2026-09-25T19:00:00Z',
        },
      ];

      Future<void> pump(Widget child) async {
        await tester.pumpWidget(
          MaterialApp(
            theme: AsambleasTheme.light(),
            home: Scaffold(body: child),
          ),
        );
        await tester.pump();
      }

      await pump(LoginScreen(session: session));
      expect(find.text('Entra a tu asamblea'), findsOneWidget);
      await pump(HomeScreen(session: session));
      expect(find.text('Entrar a la sala'), findsOneWidget);
      await pump(UnitsScreen(session: session));
      expect(find.text('201'), findsOneWidget);
      await pump(AssembliesScreen(session: session));
      expect(find.text('Próximas'), findsOneWidget);
      expect(find.text('Asamblea ordinaria de prueba con título largo'), findsOneWidget);
      await pump(ProfileScreen(session: session));
      expect(find.text('Cambiar contraseña'), findsOneWidget);
    });
  }
}
