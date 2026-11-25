import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:go_router/go_router.dart';

import 'api/api_client.dart';
import 'screens/assemblies_screen.dart';
import 'screens/assembly_detail_screen.dart';
import 'screens/home_screen.dart';
import 'screens/lobby_screen.dart';
import 'screens/login_screen.dart';
import 'screens/profile_screen.dart';
import 'screens/room_screen.dart';
import 'screens/units_screen.dart';
import 'state/calendar_sync.dart';
import 'state/session_controller.dart';
import 'theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final api = ApiClient(storage: const FlutterSecureStorage());
  await api.init();
  final session = SessionController(api);
  await session.bootstrap();
  runApp(AsambleasApp(session: session));
}

class AsambleasApp extends StatefulWidget {
  const AsambleasApp({super.key, required this.session});
  final SessionController session;

  @override
  State<AsambleasApp> createState() => _AsambleasAppState();
}

class _AsambleasAppState extends State<AsambleasApp> with WidgetsBindingObserver {
  late final CalendarSync _calendar = CalendarSync(widget.session);

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    widget.session.addListener(_syncCalendar);
    _syncCalendar();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    widget.session.removeListener(_syncCalendar);
    unawaited(_calendar.stop());
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && widget.session.signedIn) {
      unawaited(widget.session.ensureFresh(force: true));
      _syncCalendar();
    }
  }

  void _syncCalendar() {
    if (!widget.session.signedIn) {
      unawaited(_calendar.stop());
      return;
    }
    unawaited(_calendar.start(widget.session.activePropertyHorizontalId));
  }

  late final GoRouter _router = GoRouter(
    initialLocation: '/inicio',
    refreshListenable: widget.session,
    redirect: (context, state) {
      final signedIn = widget.session.signedIn;
      final loggingIn = state.matchedLocation == '/entrar';
      if (!widget.session.ready) return null;
      if (!signedIn && !loggingIn) return '/entrar';
      if (signedIn && loggingIn) return widget.session.pendingRoute ?? '/inicio';
      return null;
    },
    routes: [
      GoRoute(path: '/entrar', builder: (context, state) => LoginScreen(session: widget.session)),
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) => Scaffold(
          body: navigationShell,
          bottomNavigationBar: NavigationBar(
            selectedIndex: navigationShell.currentIndex,
            onDestinationSelected: (index) {
              navigationShell.goBranch(index);
              if (index == 0 || index == 2) unawaited(widget.session.ensureFresh());
            },
            destinations: const [
              NavigationDestination(icon: Icon(Icons.home), label: 'Inicio'),
              NavigationDestination(icon: Icon(Icons.apartment), label: 'Mis unidades'),
              NavigationDestination(icon: Icon(Icons.event), label: 'Asambleas'),
              NavigationDestination(icon: Icon(Icons.person), label: 'Mi perfil'),
            ],
          ),
        ),
        branches: [
          StatefulShellBranch(routes: [GoRoute(path: '/inicio', builder: (context, state) => HomeScreen(session: widget.session))]),
          StatefulShellBranch(routes: [GoRoute(path: '/unidades', builder: (context, state) => UnitsScreen(session: widget.session))]),
          StatefulShellBranch(routes: [GoRoute(path: '/asambleas', builder: (context, state) => AssembliesScreen(session: widget.session))]),
          StatefulShellBranch(routes: [GoRoute(path: '/perfil', builder: (context, state) => ProfileScreen(session: widget.session))]),
        ],
      ),
      GoRoute(
        path: '/assembly/:id',
        builder: (context, state) => AssemblyDetailScreen(session: widget.session, assemblyId: state.pathParameters['id']!),
      ),
      GoRoute(
        path: '/lobby/:id',
        builder: (context, state) => LobbyScreen(api: widget.session.api, assemblyId: state.pathParameters['id']!),
      ),
      GoRoute(
        path: '/room/:id',
        builder: (context, state) => RoomScreen(
          api: widget.session.api,
          assemblyId: state.pathParameters['id']!,
          camera: state.uri.queryParameters['camera'] == 'true',
          mic: state.uri.queryParameters['mic'] == 'true',
        ),
      ),
    ],
  );

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: 'Asambleas',
      theme: AsambleasTheme.light(),
      routerConfig: _router,
    );
  }
}
