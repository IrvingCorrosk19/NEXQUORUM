import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:permission_handler/permission_handler.dart';

import '../api/api_client.dart';
import '../api/api_exception.dart';
import '../theme.dart';
import '../widgets.dart';

class LobbyScreen extends StatefulWidget {
  const LobbyScreen({super.key, required this.api, required this.assemblyId});
  final ApiClient api;
  final String assemblyId;

  @override
  State<LobbyScreen> createState() => _LobbyScreenState();
}

class _LobbyScreenState extends State<LobbyScreen> {
  Map<String, dynamic>? _event;
  CameraController? _camera;
  String? _error;
  String? _deviceNote;
  var _cameraOn = false;
  var _micOn = false;
  var _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _camera?.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final event = await widget.api.getJson('/api/calendar/events/${widget.assemblyId}');
      if (!mounted) return;
      setState(() {
        _event = event;
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

  Future<void> _preview(bool enabled) async {
    if (!enabled) {
      await _camera?.dispose();
      setState(() {
        _camera = null;
        _cameraOn = false;
      });
      return;
    }
    final status = await Permission.camera.request();
    if (!status.isGranted) {
      setState(() => _deviceNote = 'La cámara se usa solo para que te vean en la sala. Puedes entrar sin ella.');
      return;
    }
    final cameras = await availableCameras();
    if (cameras.isEmpty) {
      setState(() => _deviceNote = 'Este teléfono no tiene una cámara disponible.');
      return;
    }
    final controller = CameraController(cameras.first, ResolutionPreset.medium, enableAudio: false);
    await controller.initialize();
    if (!mounted) return;
    setState(() {
      _camera = controller;
      _cameraOn = true;
      _deviceNote = null;
    });
  }

  Future<void> _mic(bool enabled) async {
    if (!enabled) {
      setState(() => _micOn = false);
      return;
    }
    final status = await Permission.microphone.request();
    setState(() {
      _micOn = status.isGranted;
      _deviceNote = status.isGranted ? null : 'El micrófono se usa para hablar en la sala. Puedes entrar sin él.';
    });
  }

  @override
  Widget build(BuildContext context) {
    final event = _event;
    final allowed = canEnter(event);
    return Scaffold(
      appBar: AppBar(title: const Text('Antesala')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? ErrorPanel(message: _error!, onRetry: _load)
              : ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    Text(event?['title']?.toString() ?? 'Asamblea', style: Theme.of(context).textTheme.titleLarge),
                    Text(event?['propertyHorizontalName']?.toString() ?? ''),
                    Text(assemblyStatusLabel(event?['status']?.toString())),
                    const SizedBox(height: 12),
                    AspectRatio(
                      aspectRatio: 3 / 4,
                      child: DecoratedBox(
                        decoration: BoxDecoration(color: Colors.black, borderRadius: BorderRadius.circular(12)),
                        child: _camera?.value.isInitialized == true ? CameraPreview(_camera!) : const Center(child: Text('Cámara apagada', style: TextStyle(color: Colors.white))),
                      ),
                    ),
                    if (_deviceNote != null) Padding(padding: const EdgeInsets.only(top: 8), child: Text(_deviceNote!)),
                    SwitchListTile(value: _cameraOn, onChanged: (value) => _preview(value), title: const Text('Cámara')),
                    SwitchListTile(value: _micOn, onChanged: (value) => _mic(value), title: const Text('Micrófono')),
                    const SizedBox(height: 8),
                    const Text('Apagar la cámara o el micrófono no cambia tu acreditación.'),
                    const SizedBox(height: 12),
                    FilledButton(
                      onPressed: allowed
                          ? () async {
                              await _camera?.dispose();
                              _camera = null;
                              if (!context.mounted) return;
                              context.push('/room/${widget.assemblyId}?camera=$_cameraOn&mic=$_micOn');
                            }
                          : null,
                      child: Text(allowed ? 'Entrar' : 'El ingreso todavía no está autorizado'),
                    ),
                  ],
                ),
    );
  }
}
