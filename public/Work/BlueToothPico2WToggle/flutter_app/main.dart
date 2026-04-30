
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_blue_plus/flutter_blue_plus.dart';

void main() {
  FlutterBluePlus.setLogLevel(LogLevel.verbose, color: true);
  runApp(const BioniApp());
}

class BioniApp extends StatelessWidget {
  const BioniApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Bioni Input Switcher',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(seedColor: Colors.blueGrey),
        scaffoldBackgroundColor: const Color(0xFFF3F4F6), // Light gray background
      ),
      home: const SwitcherScreen(),
    );
  }
}

class SwitcherScreen extends StatefulWidget {
  const SwitcherScreen({super.key});

  @override
  State<SwitcherScreen> createState() => _SwitcherScreenState();
}

class _SwitcherScreenState extends State<SwitcherScreen> {
  BluetoothDevice? _bioniDevice;
  BluetoothCharacteristic? _inputCharacteristic;
  bool _isConnecting = false;
  int _activeInput = 0; // 0 = none, 1 = Input 1, 2 = Input 2
  
  // UUIDs matching our hardware C++ code
  final String serviceUuid = "12345678-1234-1234-1234-123456789abc";
  final String charUuid = "87654321-4321-4321-4321-cba987654321";

  StreamSubscription<List<ScanResult>>? _scanSubscription;

  @override
  void initState() {
    super.initState();
    _startScan();
  }

  @override
  void dispose() {
    _scanSubscription?.cancel();
    _bioniDevice?.disconnect();
    super.dispose();
  }

  void _startScan() async {
    setState(() {
      _isConnecting = true;
      _bioniDevice = null;
    });

    // Request permissions implicitly by starting scan
    try {
      await FlutterBluePlus.startScan(timeout: const Duration(seconds: 15));
    } catch (e) {
      print("Scan Error: $e");
    }

    // Listen to scan results
    _scanSubscription = FlutterBluePlus.scanResults.listen((results) {
      for (ScanResult r in results) {
        if (r.device.platformName == "BioniBLE" || r.device.advName == "BioniBLE") {
          FlutterBluePlus.stopScan();
          _connectToDevice(r.device);
          break;
        }
      }
    });
  }

  void _connectToDevice(BluetoothDevice device) async {
    setState(() {
      _bioniDevice = device;
    });

    try {
      await device.connect(autoConnect: false, timeout: Duration(seconds: 15));
      
      // Discover services
      List<BluetoothService> services = await device.discoverServices();
      for (BluetoothService service in services) {
        if (service.uuid.toString() == serviceUuid) {
          for (BluetoothCharacteristic c in service.characteristics) {
            if (c.uuid.toString() == charUuid) {
              _inputCharacteristic = c;
              
              // Set up notify so app updates if the Pico's physical button is clicked
              await c.setNotifyValue(true);
              c.lastValueStream.listen((value) {
                if (value.isNotEmpty) {
                  setState(() {
                    if (value[0] == 0x01) _activeInput = 1;
                    else if (value[0] == 0x02) _activeInput = 2;
                    else if (value[0] == 0xFF) _activeInput = 0;
                  });
                }
              });

              // Read initial state upon connection
              List<int> value = await c.read();
              if (value.isNotEmpty) {
                setState(() {
                  if (value[0] == 0x01) _activeInput = 1;
                  else if (value[0] == 0x02) _activeInput = 2;
                  else if (value[0] == 0xFF) _activeInput = 0;
                });
              }
              
              setState(() {
                _isConnecting = false;
              });
              break;
            }
          }
        }
      }
    } catch (e) {
      print("Error connecting: $e");
      setState(() {
        _isConnecting = false;
        _bioniDevice = null;
      });
    }
  }

  void _sendCommand(int command) async {
    if (_inputCharacteristic != null) {
      try {
        await _inputCharacteristic!.write([command], withoutResponse: false);
      } catch (e) {
        print("Failed to send command: $e");
      }
    }
  }

  Widget _buildStatusIndicator() {
    if (_isConnecting) {
      return const Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)),
          SizedBox(width: 8),
          Text("Scanning for BioniBLE...", style: TextStyle(color: Colors.grey)),
        ],
      );
    } else if (_bioniDevice != null) {
      return const Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.bluetooth_connected, color: Colors.green, size: 20),
          SizedBox(width: 4),
          Text("Connected", style: TextStyle(color: Colors.green, fontWeight: FontWeight.bold)),
        ],
      );
    } else {
      return Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.bluetooth_disabled, color: Colors.red, size: 20),
          const SizedBox(width: 4),
          const Text("Disconnected", style: TextStyle(color: Colors.red, fontWeight: FontWeight.bold)),
          const SizedBox(width: 8),
          TextButton(
            onPressed: _startScan,
            style: TextButton.styleFrom(visualDensity: VisualDensity.compact),
            child: const Text("Retry Scan"),
          )
        ],
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Bioni Switcher', style: TextStyle(fontWeight: FontWeight.bold)),
        centerTitle: true,
        elevation: 0,
        backgroundColor: Colors.transparent,
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              _buildStatusIndicator(),
              const SizedBox(height: 40),
              
              // INPUT 1 Card
              Expanded(
                child: GestureDetector(
                  onTap: () => _sendCommand(0x01),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 300),
                    decoration: BoxDecoration(
                      color: _activeInput == 1 ? const Color(0xFF1E293B) : Colors.white,
                      borderRadius: BorderRadius.circular(24),
                      border: Border.all(
                        color: _activeInput == 1 ? const Color(0xFF1E293B) : Colors.grey[300]!,
                        width: 4,
                      ),
                      boxShadow: _activeInput == 1 ? [
                        BoxShadow(color: Colors.black.withOpacity(0.3), blurRadius: 15, offset: const Offset(0, 8))
                      ] : [],
                    ),
                    child: Center(
                      child: Text(
                        "INPUT 1",
                        style: TextStyle(
                          fontSize: 36,
                          fontWeight: FontWeight.bold,
                          color: _activeInput == 1 ? Colors.white : Colors.grey[400],
                        ),
                      ),
                    ),
                  ),
                ),
              ),
              
              const SizedBox(height: 24),
              
              // INPUT 2 Card
              Expanded(
                child: GestureDetector(
                  onTap: () => _sendCommand(0x02),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 300),
                    decoration: BoxDecoration(
                      color: _activeInput == 2 ? const Color(0xFFEF4444) : Colors.white,
                      borderRadius: BorderRadius.circular(24),
                      border: Border.all(
                        color: _activeInput == 2 ? const Color(0xFFEF4444) : Colors.grey[300]!,
                        width: 4,
                      ),
                      boxShadow: _activeInput == 2 ? [
                        BoxShadow(color: Colors.red.withOpacity(0.4), blurRadius: 15, offset: const Offset(0, 8))
                      ] : [],
                    ),
                    child: Center(
                      child: Text(
                        "INPUT 2",
                        style: TextStyle(
                          fontSize: 36,
                          fontWeight: FontWeight.bold,
                          color: _activeInput == 2 ? Colors.white : Colors.grey[400],
                        ),
                      ),
                    ),
                  ),
                ),
              ),

              const SizedBox(height: 32),
              
              // Deselect Button
              ElevatedButton.icon(
                 onPressed: () => _sendCommand(0xFF),
                 icon: const Icon(Icons.power_settings_new),
                 label: const Text("DESELECT", style: TextStyle(fontWeight: FontWeight.bold, letterSpacing: 1.2)),
                 style: ElevatedButton.styleFrom(
                   padding: const EdgeInsets.symmetric(vertical: 20),
                   backgroundColor: Colors.grey[300],
                   foregroundColor: Colors.grey[800],
                   elevation: 0,
                   shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                 ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
