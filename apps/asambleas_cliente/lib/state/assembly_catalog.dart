class AssemblyCatalog {
  static const freshFor = Duration(seconds: 20);

  int generation = 0;
  int epoch = 0;
  List<Map<String, dynamic>> events = [];
  Map<String, dynamic>? next;
  String? error;
  bool offline = false;
  bool loaded = false;
  bool refreshing = false;
  DateTime? loadedAt;

  bool get isFresh {
    final at = loadedAt;
    if (!loaded || error != null || at == null) return false;
    return DateTime.now().difference(at) < freshFor;
  }

  bool get showEmpty => loaded && error == null && events.isEmpty && next == null;

  int beginPhSwitch() {
    generation++;
    epoch++;
    events = [];
    next = null;
    error = null;
    offline = false;
    loaded = false;
    loadedAt = null;
    refreshing = false;
    return generation;
  }

  bool commit({
    required int ticket,
    required List<Map<String, dynamic>> events,
    required Map<String, dynamic>? next,
  }) {
    if (ticket != generation) return false;
    this.events = events;
    this.next = next;
    error = null;
    offline = false;
    loaded = true;
    loadedAt = DateTime.now();
    epoch++;
    return true;
  }

  bool fail({
    required int ticket,
    required String message,
    required bool offline,
  }) {
    if (ticket != generation) return false;
    error = message;
    this.offline = offline;
    epoch++;
    return true;
  }
}
