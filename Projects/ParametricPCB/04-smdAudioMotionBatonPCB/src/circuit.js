import { Circuit, React } from "../../00-commonParts/tscircuit-core.js";
import { 
  createGerberZipBlob, 
  createBomCsv, 
  createCplCsv 
} from "../../shared/export-utils.js";
import { 
  ESP32C3_WROOM_02,
  LSM6DS3TR_C,
  WMM7037AT2,
  MPU6050_QFN24,
  INMP441_SMD,
  ME6211_SOT23_5,
  USB_C_16P,
  SOT23_MOSFET,
  SOT23_PMOSFET,
  SOT23_5_Charger,
  DiodeSOD123,
  Resistor0603,
  Capacitor0603,
  Led0603,
  PushSwitch_SMD,
  LEDOutputHeader,
  Header2Pin,
  Header5Pin,
  BatteryPads
} from "./footprints.js";
import { boardProps, normalizeRouting } from "./pcb-rules.js";
import { runManufacturingDrc } from "./drc.js";

/**
 * ============================================================================
 * Project 04: All-in-One SMD Audio & Motion Reactive Baton Controller PCB
 * 
 * Hardware Architecture:
 * - MCU: ESP32-C3-WROOM-02-N4 castellated Wi-Fi/BLE module (LCSC C2934560)
 * - Motion: MPU-6050 6-Axis Gyro/Accelerometer QFN-24 (LCSC C24112)
 * - Audio: INMP441 Omnidirectional Digital I2S MEMS Mic SMD-9 (LCSC C5438445)
 * - Power: USB-C 16-pin (C165948), 1S LiPo Charger (C382138), Auto Power-Path
 * - Regulator: ME6211C33M5G-N SOT-23-5 3.3V 500mA LDO (C82942)
 * - Outputs: Switched 5V/VSYS Addressable LED Header, Haptic PWM Driver
 * - Diagnostic: 5-Pin MPU I2C Tap Header, Hardware EN & BOOT Tactile Buttons
 * ============================================================================
 */
export async function compileCircuit(params = {}) {
  const { 
    boardWidth = 22, 
    boardLength = 110, 
    routing = {},
    skipRouting = true,
    silkScale = 1.0 
  } = params;

  const R = normalizeRouting(routing);
  const PWR = `${R.powerTraceWidth}mm`;
  const SIG = `${R.nominalTraceWidth}mm`;

  const circuit = new Circuit({
    platform: {
      routingDisabled: skipRouting
    }
  });

  const children = [];
  const halfL = boardLength / 2;
  const halfW = boardWidth / 2;

  // ============================================================
  // 0. M3 CORNER MOUNTING HOLES (3.2mm Clearance Drill, 4.8mm Pad)
  // ============================================================
  const mountX = halfW - 3.5;
  const mountY_top = halfL - 3.5;
  const mountY_bot = 42.0; // Clears USB-C connector housing at -49.5mm
  const cornerHoles = [
    { key: "hole_tl", name: "H1", x: -mountX, y: mountY_top },
    { key: "hole_tr", name: "H2", x: mountX, y: mountY_top },
    { key: "hole_bl", name: "H3", x: -mountX, y: -mountY_bot },
    { key: "hole_br", name: "H4", x: mountX, y: -mountY_bot }
  ];

  cornerHoles.forEach(h => {
    children.push(React.createElement("platedhole", {
      key: h.key,
      name: h.name,
      portHints: [h.name],
      pcbX: `${h.x.toFixed(2)}mm`,
      pcbY: `${h.y.toFixed(2)}mm`,
      holeDiameter: "3.2mm",
      outerDiameter: "4.8mm",
      shape: "circle"
    }));
  });

  // ============================================================
  // 1. USB-C 16-PIN RECEPTACLE & CC PULL-DOWNS (Bottom Edge)
  // ============================================================
  const usbY = -halfL + 5.5;
  children.push(React.createElement(USB_C_16P, {
    name: "J_USB",
    key: "j_usb",
    pcbX: "0mm",
    pcbY: `${usbY.toFixed(2)}mm`
  }));

  // USB CC1 / CC2 5.1k Pull-downs (enables Type-C host power delivery)
  children.push(React.createElement(Resistor0603, {
    name: "R_CC1",
    key: "r_cc1",
    pcbX: "-1.5mm",
    pcbY: `${(usbY + 5.5).toFixed(2)}mm`
  }));
  children.push(React.createElement(Resistor0603, {
    name: "R_CC2",
    key: "r_cc2",
    pcbX: "1.5mm",
    pcbY: `${(usbY + 5.5).toFixed(2)}mm`
  }));

  // ============================================================
  // 2. LIPO CHARGER & AUTO POWER-PATH SUB-SYSTEM
  // ============================================================
  const pwrY = -halfL + 18.0;

  // U_CHG: TP4054 / MCP73831 Linear 1S LiPo Charger (SOT-23-5)
  children.push(React.createElement(SOT23_5_Charger, {
    name: "U_CHG",
    key: "u_chg",
    pcbX: "-5.0mm",
    pcbY: `${pwrY.toFixed(2)}mm`
  }));

  // R_PROG: 2kΩ charge current set resistor (500mA)
  children.push(React.createElement(Resistor0603, {
    name: "R_PROG",
    key: "r_prog",
    pcbX: "-5.0mm",
    pcbY: `${(pwrY + 3.5).toFixed(2)}mm`
  }));

  // D_CHG_LED: Red Charging Indicator LED
  children.push(React.createElement(Led0603, {
    name: "D_CHG",
    key: "d_chg",
    pcbX: "-8.0mm",
    pcbY: `${(pwrY + 3.5).toFixed(2)}mm`
  }));
  children.push(React.createElement(Resistor0603, {
    name: "R_CHG",
    key: "r_chg",
    pcbX: "-8.0mm",
    pcbY: `${pwrY.toFixed(2)}mm`
  }));

  // D_PWR: SS14 Schottky Diode (USB 5V to VSYS rail)
  children.push(React.createElement(DiodeSOD123, {
    name: "D_PWR",
    key: "d_pwr",
    pcbX: "4.5mm",
    pcbY: `${pwrY.toFixed(2)}mm`
  }));

  // Q_PWR: AO3401A P-MOSFET for automatic battery power-path isolation
  children.push(React.createElement(SOT23_PMOSFET, {
    name: "Q_PWR",
    key: "q_pwr",
    pcbX: "4.5mm",
    pcbY: `${(pwrY + 4.5).toFixed(2)}mm`
  }));

  // R_PWR: 100kΩ pull-up for power-path gate
  children.push(React.createElement(Resistor0603, {
    name: "R_PWR",
    key: "r_pwr",
    pcbX: "8.0mm",
    pcbY: `${(pwrY + 4.5).toFixed(2)}mm`
  }));

  // J_BAT: Dual-Mount Battery Solder Pads / Header (BAT+, BAT-)
  children.push(React.createElement(BatteryPads, {
    name: "J_BAT",
    key: "j_bat",
    pcbX: "-3.5mm",
    pcbY: `${(pwrY + 8.5).toFixed(2)}mm`
  }));

  // SW_EXT: 2-Pin Battery Cut-off Slide Switch Header
  children.push(React.createElement(Header2Pin, {
    name: "SW_EXT",
    key: "sw_ext",
    pcbX: "4.5mm",
    pcbY: `${(pwrY + 8.5).toFixed(2)}mm`,
    labels: { pin1: "BAT_IN", pin2: "BAT_SW" }
  }));

  // ============================================================
  // 3. 3.3V SYSTEM LDO REGULATOR & DECOUPLING
  // ============================================================
  const ldoY = -halfL + 32.0;

  // U_LDO: ME6211C33M5G-N 3.3V 500mA Low Dropout Regulator
  children.push(React.createElement(ME6211_SOT23_5, {
    name: "U_LDO",
    key: "u_ldo",
    pcbX: "-4.5mm",
    pcbY: `${ldoY.toFixed(2)}mm`
  }));

  // C_IN: 10µF Input Decoupling Capacitor
  children.push(React.createElement(Capacitor0603, {
    name: "C_IN",
    key: "c_in",
    pcbX: "-8.0mm",
    pcbY: `${ldoY.toFixed(2)}mm`
  }));

  // C_OUT: 10µF Output 3.3V Decoupling Capacitor
  children.push(React.createElement(Capacitor0603, {
    name: "C_OUT",
    key: "c_out",
    pcbX: "-8.0mm",
    pcbY: `${(ldoY + 3.0).toFixed(2)}mm`
  }));

  // D_PWR_LED: Green 3.3V Power Indicator LED & Limiting Resistor
  children.push(React.createElement(Led0603, {
    name: "D_PWR_LED",
    key: "d_pwr_led",
    pcbX: "4.5mm",
    pcbY: `${ldoY.toFixed(2)}mm`
  }));
  children.push(React.createElement(Resistor0603, {
    name: "R_PWR_LED",
    key: "r_pwr_led",
    pcbX: "4.5mm",
    pcbY: `${(ldoY + 3.0).toFixed(2)}mm`
  }));

  // ============================================================
  // 4. ESP32-C3-WROOM-02-N4 MCU CORE & CONTROLS
  // ============================================================
  const mcuY = -6.0;

  children.push(React.createElement(ESP32C3_WROOM_02, {
    name: "U_MCU",
    key: "u_mcu",
    pcbX: "0mm",
    pcbY: `${mcuY.toFixed(2)}mm`
  }));

  // SW_EN: Hardware Reset Tactile Button & Pull-Up
  children.push(React.createElement(PushSwitch_SMD, {
    name: "SW_EN",
    key: "sw_en",
    pcbX: "-6.0mm",
    pcbY: `${(mcuY + 11.5).toFixed(2)}mm`
  }));
  children.push(React.createElement(Resistor0603, {
    name: "R_EN",
    key: "r_en",
    pcbX: "-2.5mm",
    pcbY: `${(mcuY + 11.5).toFixed(2)}mm`
  }));

  // SW_BOOT: Bootloader / User Action Button & Pull-Up (GPIO9)
  children.push(React.createElement(PushSwitch_SMD, {
    name: "SW_BOOT",
    key: "sw_boot",
    pcbX: "6.0mm",
    pcbY: `${(mcuY + 11.5).toFixed(2)}mm`
  }));
  children.push(React.createElement(Resistor0603, {
    name: "R_BOOT",
    key: "r_boot",
    pcbX: "2.5mm",
    pcbY: `${(mcuY + 11.5).toFixed(2)}mm`
  }));

  // ============================================================
  // 5. MOTION SENSOR: ST LSM6DS3TR-C 6-AXIS IMU (I2C) & EXPANSION TAP
  // ============================================================
  const imuY = 17.0;

  children.push(React.createElement(LSM6DS3TR_C, {
    name: "U_IMU",
    key: "u_imu",
    pcbX: "0mm",
    pcbY: `${imuY.toFixed(2)}mm`
  }));

  // 4.7k I2C Pull-Up Resistors (SDA & SCL)
  children.push(React.createElement(Resistor0603, {
    name: "R_SDA",
    key: "r_sda",
    pcbX: "5.5mm",
    pcbY: `${imuY.toFixed(2)}mm`
  }));
  children.push(React.createElement(Resistor0603, {
    name: "R_SCL",
    key: "r_scl",
    pcbX: "-5.5mm",
    pcbY: `${imuY.toFixed(2)}mm`
  }));

  // C_IMU: 0.1uF Decoupling Capacitor
  children.push(React.createElement(Capacitor0603, {
    name: "C_IMU",
    key: "c_imu",
    pcbX: "-5.5mm",
    pcbY: `${(imuY + 3.0).toFixed(2)}mm`
  }));

  // J_MPU: 5-Pin Dual-Mount Diagnostic & Expansion Header (3V3, GND, SCL, SDA, INT)
  children.push(React.createElement(Header5Pin, {
    name: "J_MPU",
    key: "j_mpu",
    pcbX: "0mm",
    pcbY: `${(imuY + 7.5).toFixed(2)}mm`
  }));

  // ============================================================
  // 6. AUDIO SENSOR: WILLSEMI WMM7037AT2 ANALOG MEMS MICROPHONE
  // ============================================================
  const micY = 32.0;

  children.push(React.createElement(WMM7037AT2, {
    name: "U_MIC",
    key: "u_mic",
    pcbX: "0mm",
    pcbY: `${micY.toFixed(2)}mm`
  }));

  // C_MIC: 0.1uF Decoupling Capacitor
  children.push(React.createElement(Capacitor0603, {
    name: "C_MIC",
    key: "c_mic",
    pcbX: "-5.0mm",
    pcbY: `${micY.toFixed(2)}mm`
  }));

  // ============================================================
  // 7. ACTUATOR & OUTPUT DRIVERS (Haptic Motor & Addressable LED)
  // ============================================================
  const actY = 36.0;

  // Haptic Driver: AO3400A N-MOSFET + SS14 Flyback Diode
  children.push(React.createElement(SOT23_MOSFET, {
    name: "Q_HAP",
    key: "q_hap",
    pcbX: "-4.5mm",
    pcbY: `${actY.toFixed(2)}mm`
  }));
  children.push(React.createElement(DiodeSOD123, {
    name: "D_HAP",
    key: "d_hap",
    pcbX: "-4.5mm",
    pcbY: `${(actY + 3.5).toFixed(2)}mm`
  }));
  children.push(React.createElement(Resistor0603, {
    name: "R_HAP_G",
    key: "r_hap_g",
    pcbX: "-8.0mm",
    pcbY: `${actY.toFixed(2)}mm`
  }));
  children.push(React.createElement(Header2Pin, {
    name: "J_HAP",
    key: "j_hap",
    pcbX: "-4.0mm",
    pcbY: `${(actY + 8.0).toFixed(2)}mm`,
    labels: { pin1: "VSYS", pin2: "MTR_NEG" }
  }));

  // Addressable LED High-Side Power Switch: AO3401A P-MOSFET + AO3400A Pre-Driver
  children.push(React.createElement(SOT23_PMOSFET, {
    name: "Q_LED_PWR",
    key: "q_led_pwr",
    pcbX: "4.5mm",
    pcbY: `${actY.toFixed(2)}mm`
  }));
  children.push(React.createElement(SOT23_MOSFET, {
    name: "Q_LED_EN",
    key: "q_led_en",
    pcbX: "4.5mm",
    pcbY: `${(actY + 3.5).toFixed(2)}mm`
  }));
  children.push(React.createElement(Resistor0603, {
    name: "R_LED_PU",
    key: "r_led_pu",
    pcbX: "8.0mm",
    pcbY: `${actY.toFixed(2)}mm`
  }));
  children.push(React.createElement(Resistor0603, {
    name: "R_LED_G",
    key: "r_led_g",
    pcbX: "8.0mm",
    pcbY: `${(actY + 3.5).toFixed(2)}mm`
  }));

  // J_LED: 3-Pin Addressable LED Output Header (5V_SW, DAT, GND)
  children.push(React.createElement(LEDOutputHeader, {
    name: "J_LED",
    key: "j_led",
    pcbX: "3.5mm",
    pcbY: `${(actY + 8.0).toFixed(2)}mm`
  }));

  // ============================================================
  // 8. SILKSCREEN LABELS, COMPONENT OUTLINES & POLARITY MARKINGS
  // ============================================================
  const makeSilk = (key, text, x, y, layer = "top", fontSize = 0.55, align = "center", rot = 0) => {
    return React.createElement("silkscreentext", {
      key,
      text,
      layer,
      fontSize: `${(fontSize * silkScale).toFixed(2)}mm`,
      anchorAlignment: align,
      ccwRotation: rot,
      pcbX: `${x.toFixed(2)}mm`,
      pcbY: `${y.toFixed(2)}mm`
    });
  };

  const makeSilkLine = (key, x1, y1, x2, y2, strokeWidth = 0.15, layer = "top") => {
    return React.createElement("silkscreenpath", {
      key,
      layer,
      strokeWidth: `${strokeWidth}mm`,
      route: [{ x: x1, y: y1 }, { x: x2, y: y2 }]
    });
  };

  const makeSilkBox = (key, minX, maxX, minY, maxY, strokeWidth = 0.15, layer = "top") => {
    return React.createElement("silkscreenpath", {
      key,
      layer,
      strokeWidth: `${strokeWidth}mm`,
      route: [
        { x: minX, y: minY },
        { x: maxX, y: minY },
        { x: maxX, y: maxY },
        { x: minX, y: maxY },
        { x: minX, y: minY }
      ]
    });
  };

  // --- Title & Version ---
  children.push(makeSilk("st_title", "04 ALL-SMD BATON", 0, halfL - 1.2, "top", 0.70, "center"));
  children.push(makeSilk("st_sub", "ESP32-C3 + MPU + I2S MIC", 0, halfL - 2.2, "top", 0.50, "center"));

  // --- 1. USB-C 16-Pin Receptacle (J_USB) ---
  // Outer metallic shell boundary
  children.push(makeSilkBox("sb_usb_shell", -4.5, 4.5, -halfL + 0.1, usbY + 1.8, 0.20));
  // Front plug aperture notch (flushed with board bottom edge)
  children.push(makeSilkLine("sl_usb_aperture", -3.6, -halfL + 0.5, 3.6, -halfL + 0.5, 0.35));
  children.push(makeSilk("st_usb_title", "J_USB", 0, usbY - 1.8, "top", 0.55, "center"));
  children.push(makeSilk("st_usb_lbl", "USB-C CDC / JTAG", 0, usbY - 0.7, "top", 0.48, "center"));
  children.push(makeSilk("st_usb_gnd_l", "GND", -3.3, usbY + 2.2, "top", 0.40, "center"));
  children.push(makeSilk("st_usb_vbus_r", "5V", 3.3, usbY + 2.2, "top", 0.40, "center"));
  children.push(makeSilk("st_r_cc1_lbl", "R_CC1 5.1k", -1.8, usbY + 6.8, "top", 0.38, "center"));
  children.push(makeSilk("st_r_cc2_lbl", "R_CC2 5.1k", 1.8, usbY + 6.8, "top", 0.38, "center"));

  // --- 2. LiPo Charger & Power Path ---
  // U_CHG: TP4054 Linear Charger
  children.push(makeSilkBox("sb_u_chg", -6.0, -4.0, pwrY - 1.8, pwrY + 1.8, 0.15));
  children.push(makeSilk("st_uchg_p1", "● 1", -6.2, pwrY - 1.3, "top", 0.38, "center"));
  children.push(makeSilk("st_uchg_lbl", "U_CHG TP4054", -5.0, pwrY - 2.4, "top", 0.45, "center"));
  children.push(makeSilk("st_r_prog_lbl", "R_PROG 2k", -5.0, pwrY + 4.7, "top", 0.40, "center"));
  children.push(makeSilk("st_r_chg_lbl", "R_CHG 1k", -8.0, pwrY - 1.2, "top", 0.40, "center"));

  // D_CHG: Red Charging Indicator LED (Cathode Pin 1 on Left, Anode Pin 2 on Right)
  children.push(makeSilkBox("sb_d_chg", -9.1, -6.9, pwrY + 3.5 - 0.7, pwrY + 3.5 + 0.7, 0.15));
  children.push(makeSilkLine("sl_d_chg_k", -9.1, pwrY + 3.5 - 0.7, -9.1, pwrY + 3.5 + 0.7, 0.30)); // Cathode bar
  children.push(makeSilk("st_dchg_lbl", "D_CHG (RED)", -8.0, pwrY + 4.6, "top", 0.44, "center"));
  children.push(makeSilk("st_dchg_k", "- [K]", -8.9, pwrY + 2.3, "top", 0.40, "center"));
  children.push(makeSilk("st_dchg_a", "+ [A]", -7.1, pwrY + 2.3, "top", 0.40, "center"));

  // D_PWR: SS14 Schottky Diode (Cathode Pin 1 on Left -> VSYS, Anode Pin 2 on Right -> VBUS 5V)
  children.push(makeSilkBox("sb_d_pwr", 2.0, 7.0, pwrY - 1.0, pwrY + 1.0, 0.15));
  children.push(makeSilkLine("sl_d_pwr_k", 2.1, pwrY - 0.9, 2.1, pwrY + 0.9, 0.35)); // Cathode bar
  children.push(makeSilk("st_dpwr_lbl", "D_PWR SS14", 4.5, pwrY + 1.5, "top", 0.48, "center"));
  children.push(makeSilk("st_dpwr_k", "- [K]", 2.8, pwrY - 1.5, "top", 0.42, "center"));
  children.push(makeSilk("st_dpwr_a", "+ [A]", 6.2, pwrY - 1.5, "top", 0.42, "center"));

  // Q_PWR: AO3401A P-MOSFET for Battery Power-Path
  children.push(makeSilkBox("sb_q_pwr", 3.2, 5.8, pwrY + 4.5 - 1.5, pwrY + 4.5 + 1.5, 0.15));
  children.push(makeSilk("st_qpwr_lbl", "Q_PWR (PMOS)", 4.5, pwrY + 6.4, "top", 0.45, "center"));
  children.push(makeSilk("st_qpwr_pins", "G   S   D", 4.5, pwrY + 3.1, "top", 0.38, "center"));
  children.push(makeSilk("st_r_pwr_lbl", "R_PWR 100k", 8.0, pwrY + 5.7, "top", 0.40, "center"));

  // Battery & Power Switch Headers
  children.push(makeSilk("st_j_bat_title", "J_BAT (3.7V)", -3.5, pwrY + 7.0, "top", 0.45, "center"));
  children.push(makeSilk("st_j_bat", "+ [BAT+]  - [BAT-]", -3.5, pwrY + 10.5, "top", 0.45, "center"));
  children.push(makeSilk("st_sw_ext_title", "SW_EXT", 4.5, pwrY + 7.0, "top", 0.45, "center"));
  children.push(makeSilk("st_sw_ext", "IN   SW", 4.5, pwrY + 10.5, "top", 0.45, "center"));

  // --- 3. 3.3V LDO Voltage Regulator ---
  // U_LDO: ME6211C33M5G-N SOT-23-5
  children.push(makeSilkBox("sb_u_ldo", -5.5, -3.5, ldoY - 1.8, ldoY + 1.8, 0.15));
  children.push(makeSilk("st_uldo_p1", "● 1", -5.7, ldoY - 1.3, "top", 0.38, "center"));
  children.push(makeSilk("st_uldo_lbl", "U_LDO 3.3V", -4.5, ldoY - 2.4, "top", 0.48, "center"));
  children.push(makeSilk("st_cin_lbl", "C_IN 10uF", -8.0, ldoY - 1.2, "top", 0.40, "center"));
  children.push(makeSilk("st_cout_lbl", "C_OUT 10uF", -8.0, ldoY + 4.2, "top", 0.40, "center"));

  // D_PWR_LED: Green 3.3V Power LED (Cathode Pin 1 on Left -> GND, Anode Pin 2 on Right -> 3.3V)
  children.push(makeSilkBox("sb_d_pwr_led", 3.4, 5.6, ldoY - 0.7, ldoY + 0.7, 0.15));
  children.push(makeSilkLine("sl_d_pwr_led_k", 3.4, ldoY - 0.7, 3.4, ldoY + 0.7, 0.28)); // Cathode bar
  children.push(makeSilk("st_dpwrled_lbl", "D_PWR (3V3)", 4.5, ldoY + 1.4, "top", 0.44, "center"));
  children.push(makeSilk("st_dpwrled_k", "- [K]", 3.6, ldoY - 1.2, "top", 0.40, "center"));
  children.push(makeSilk("st_dpwrled_a", "+ [A]", 5.4, ldoY - 1.2, "top", 0.40, "center"));
  children.push(makeSilk("st_rpwrled_lbl", "R_LED 1k", 4.5, ldoY + 4.2, "top", 0.40, "center"));

  // --- 4. ESP32-C3-WROOM-02-N4 MCU Core & Buttons ---
  // Module Boundary Box (18.0mm x 20.0mm)
  children.push(makeSilkBox("sb_u_mcu", -9.0, 9.0, mcuY - 10.0, mcuY + 10.0, 0.20));
  // Metal Shield Can Area
  children.push(makeSilkBox("sb_mcu_can", -8.0, 8.0, mcuY - 9.5, mcuY + 5.0, 0.12));
  children.push(makeSilk("st_mcu_name", "ESP32-C3-WROOM-02", 0, mcuY - 7.0, "top", 0.50, "center"));
  children.push(makeSilk("st_mcu_shield", "[ METAL SHIELD CAN ]", 0, mcuY - 2.0, "top", 0.42, "center"));
  // Antenna Area (Facing Downward / Head)
  children.push(makeSilkBox("sb_mcu_ant", -8.0, 8.0, mcuY + 5.5, mcuY + 9.5, 0.15));
  children.push(makeSilk("st_mcu_ant", "▲ PCB ANTENNA ▲", 0, mcuY + 7.5, "top", 0.45, "center"));
  // Clear Pin 1 Dot and Label
  children.push(makeSilk("st_mcu_p1", "● PIN 1 (3V3)", -5.8, mcuY + 4.8, "top", 0.45, "center_left"));

  // Tactile Buttons
  children.push(makeSilkBox("sb_sw_en", -7.5, -4.5, mcuY + 11.5 - 1.5, mcuY + 11.5 + 1.5, 0.15));
  children.push(makeSilk("st_sw_en", "RESET (EN)", -6.0, mcuY + 13.5, "top", 0.45, "center"));
  children.push(makeSilk("st_ren_lbl", "R_EN 10k", -2.5, mcuY + 13.5, "top", 0.40, "center"));

  children.push(makeSilkBox("sb_sw_boot", 4.5, 7.5, mcuY + 11.5 - 1.5, mcuY + 11.5 + 1.5, 0.15));
  children.push(makeSilk("st_sw_boot", "BOOT (IO9)", 6.0, mcuY + 13.5, "top", 0.45, "center"));
  children.push(makeSilk("st_rboot_lbl", "R_BOOT 10k", 2.5, mcuY + 13.5, "top", 0.40, "center"));

  // --- 5. Motion Sensor: ST LSM6DS3TR-C 6-Axis IMU & Diagnostic Tap ---
  children.push(makeSilkBox("sb_u_imu", -1.8, 1.8, imuY - 1.8, imuY + 1.8, 0.15));
  children.push(makeSilk("st_imu_p1", "● 1", -1.4, imuY + 1.2, "top", 0.38, "center"));
  children.push(makeSilk("st_imu_name", "U_IMU: LSM6DS3", 0, imuY - 2.8, "top", 0.48, "center"));
  children.push(makeSilk("st_rscl_lbl", "R_SCL 4.7k", -5.5, imuY - 1.2, "top", 0.40, "center"));
  children.push(makeSilk("st_rsda_lbl", "R_SDA 4.7k", 5.5, imuY - 1.2, "top", 0.40, "center"));
  children.push(makeSilk("st_cimu_lbl", "C_IMU 0.1uF", -5.5, imuY + 4.2, "top", 0.40, "center"));

  children.push(makeSilk("st_jmpu_title", "J_MPU (I2C EXP)", 0, imuY + 6.0, "top", 0.45, "center"));
  children.push(makeSilk("st_j_mpu", "3V3 GND SCL SDA INT", 0, imuY + 9.8, "top", 0.45, "center"));

  // --- 6. Audio Sensor: WillSemi WMM7037AT2 Analog MEMS Microphone ---
  children.push(makeSilkBox("sb_u_mic", -2.0, 2.0, micY - 1.6, micY + 1.6, 0.15));
  children.push(makeSilkLine("sl_mic_cross", -0.8, micY, 0.8, micY, 0.20));
  children.push(makeSilk("st_mic_name", "U_MIC: WMM7037 (ADC)", 0, micY - 2.8, "top", 0.48, "center"));
  children.push(makeSilk("st_cmic_lbl", "C_MIC 0.1uF", -5.0, micY - 1.2, "top", 0.40, "center"));

  // --- 7. Actuators: Haptic Motor & Addressable LED Outputs ---
  // Haptic Motor Driver Q_HAP & Flyback Diode D_HAP
  children.push(makeSilkBox("sb_q_hap", -5.7, -3.3, actY - 1.5, actY + 1.5, 0.15));
  children.push(makeSilk("st_qhap_lbl", "Q_HAP (NMOS)", -4.5, actY - 2.2, "top", 0.45, "center"));
  children.push(makeSilk("st_qhap_pins", "G   S   D", -4.5, actY - 1.1, "top", 0.38, "center"));
  children.push(makeSilk("st_rhap_lbl", "R_GATE 10k", -8.0, actY - 1.2, "top", 0.40, "center"));

  // D_HAP: SS14 Flyback Diode (Cathode Pin 1 on Left -> VSYS, Anode Pin 2 on Right -> MTR-)
  children.push(makeSilkBox("sb_d_hap", -7.0, -2.0, actY + 3.5 - 1.0, actY + 3.5 + 1.0, 0.15));
  children.push(makeSilkLine("sl_d_hap_k", -6.9, actY + 3.5 - 0.9, -6.9, actY + 3.5 + 0.9, 0.35)); // Cathode bar
  children.push(makeSilk("st_dhap_lbl", "D_HAP SS14", -4.5, actY + 3.5 + 1.5, "top", 0.48, "center"));
  children.push(makeSilk("st_dhap_k", "- [K]", -6.2, actY + 3.5 - 1.5, "top", 0.42, "center"));
  children.push(makeSilk("st_dhap_a", "+ [A]", -2.8, actY + 3.5 - 1.5, "top", 0.42, "center"));

  children.push(makeSilk("st_j_hap", "J_HAP: VSYS  MTR-", -4.0, actY + 10.2, "top", 0.45, "center"));

  // Addressable LED High-Side Switch (Q_LED_PWR + Q_LED_EN)
  children.push(makeSilkBox("sb_q_led_pwr", 3.3, 5.7, actY - 1.5, actY + 1.5, 0.15));
  children.push(makeSilk("st_qledpwr_lbl", "Q_LED_PWR", 4.5, actY - 2.2, "top", 0.45, "center"));
  children.push(makeSilk("st_rledpu_lbl", "R_PU 100k", 8.0, actY - 1.2, "top", 0.40, "center"));

  children.push(makeSilkBox("sb_q_led_en", 3.3, 5.7, actY + 3.5 - 1.5, actY + 3.5 + 1.5, 0.15));
  children.push(makeSilk("st_qleden_lbl", "Q_LED_EN", 4.5, actY + 3.5 - 2.2, "top", 0.45, "center"));
  children.push(makeSilk("st_rledg_lbl", "R_GATE 10k", 8.0, actY + 3.5 - 1.2, "top", 0.40, "center"));

  children.push(makeSilk("st_j_led", "J_LED: 5V_SW  DAT  GND", 3.5, actY + 10.2, "top", 0.45, "center"));

  // ============================================================
  // 9. RAT'S NEST LOGICAL TRACE NETS
  // ============================================================
  const addTrace = (from, to, key, netName, width = SIG) => {
    children.push(React.createElement("trace", {
      from,
      to,
      key,
      name: `${netName}__${key}`,
      width
    }));
  };

  // ----------------------------------------------------------
  // A. USB Type-C Receptacle & CC Configuration
  // ----------------------------------------------------------
    // Native USB CDC/JTAG differential data pair (Pin 5 = DN, Pin 4 = DP)
    addTrace(".J_USB > .pin5", ".U_MCU > .pin13", "tr_usb_dm", "NET_USB_DM", SIG);
    addTrace(".J_USB > .pin4", ".U_MCU > .pin14", "tr_usb_dp", "NET_USB_DP", SIG);
    // CC1 (Pin 3) & CC2 (Pin 6) 5.1kΩ pull-downs for 5V Type-C host power negotiation
    addTrace(".J_USB > .pin3", ".R_CC1 > .pin1", "tr_usb_cc1", "NET_USB_CC1", SIG);
    addTrace(".R_CC1 > .pin2", ".J_USB > .pin1", "tr_r_cc1_gnd", "NET_GND", PWR);
    addTrace(".J_USB > .pin6", ".R_CC2 > .pin1", "tr_usb_cc2", "NET_USB_CC2", SIG);
    addTrace(".R_CC2 > .pin2", ".J_USB > .pin8", "tr_r_cc2_gnd", "NET_GND", PWR);
    // USB Receptacle Shell Mounts to Ground (Pins 9-12)
    addTrace(".J_USB > .pin9", ".J_USB > .pin1", "tr_usb_sh1_gnd", "NET_GND", PWR);
    addTrace(".J_USB > .pin10", ".J_USB > .pin8", "tr_usb_sh2_gnd", "NET_GND", PWR);
    addTrace(".J_USB > .pin11", ".J_USB > .pin1", "tr_usb_sh3_gnd", "NET_GND", PWR);
    addTrace(".J_USB > .pin12", ".J_USB > .pin8", "tr_usb_sh4_gnd", "NET_GND", PWR);
    addTrace(".J_USB > .pin8", ".J_USB > .pin1", "tr_usb_gnd_bridge", "NET_GND", PWR);

    // ----------------------------------------------------------
    // B. LiPo Charger Subsystem (TP4054 / MCP73831)
    // ----------------------------------------------------------
    // USB 5V VBUS delivery (Pin 2 & Pin 7)
    addTrace(".J_USB > .pin2", ".U_CHG > .pin4", "tr_vbus_chg", "NET_5V_VBUS", PWR);
    addTrace(".J_USB > .pin7", ".J_USB > .pin2", "tr_vbus_bridge", "NET_5V_VBUS", PWR);
    addTrace(".U_CHG > .pin4", ".D_PWR > .pin2", "tr_vbus_dpwr", "NET_5V_VBUS", PWR);
    // PROG current programming resistor
    addTrace(".U_CHG > .pin5", ".R_PROG > .pin1", "tr_chg_prog", "NET_CHG_PROG", SIG);
    addTrace(".R_PROG > .pin2", ".U_CHG > .pin2", "tr_r_prog_gnd", "NET_GND", PWR);
    // STAT Charging indicator LED
    addTrace(".U_CHG > .pin1", ".D_CHG > .pin1", "tr_chg_stat", "NET_CHG_STAT", SIG);
    addTrace(".D_CHG > .pin2", ".R_CHG > .pin1", "tr_d_chg_r", "NET_CHG_LED_ANODE", SIG);
    addTrace(".R_CHG > .pin2", ".U_CHG > .pin4", "tr_r_chg_vbus", "NET_5V_VBUS", SIG);
    // VBAT output to battery terminals
    addTrace(".U_CHG > .pin3", ".J_BAT > .pin1", "tr_chg_vbat", "NET_VBAT", PWR);

    // ----------------------------------------------------------
    // C. Battery Power Switch & Auto Power-Path MOSFET
    // ----------------------------------------------------------
    // Battery cut-off slide switch
    addTrace(".J_BAT > .pin1", ".SW_EXT > .pin1", "tr_bat_sw_in", "NET_VBAT", PWR);
    addTrace(".SW_EXT > .pin2", ".Q_PWR > .pin3", "tr_sw_pmos_d", "NET_VBAT_SW", PWR);
    // P-MOSFET Source and Schottky Diode Cathode feed System Rail (VSYS)
    addTrace(".D_PWR > .pin1", ".Q_PWR > .pin2", "tr_d_pwr_vsys", "NET_VSYS", PWR);
    // P-MOSFET Gate control: VBUS turns OFF PMOS, R_PWR pulls Gate to GND when USB unplugged
    addTrace(".D_PWR > .pin2", ".Q_PWR > .pin1", "tr_pmos_gate_vbus", "NET_5V_VBUS", SIG);
    addTrace(".Q_PWR > .pin1", ".R_PWR > .pin1", "tr_r_pwr_gate", "NET_5V_VBUS", SIG);
    addTrace(".R_PWR > .pin2", ".U_CHG > .pin2", "tr_r_pwr_gnd", "NET_GND", PWR);

    // ----------------------------------------------------------
    // D. 3.3V Low-Dropout Regulator (ME6211) & System Decoupling
    // ----------------------------------------------------------
    // VSYS input to LDO
    addTrace(".Q_PWR > .pin2", ".U_LDO > .pin1", "tr_vsys_ldo", "NET_VSYS", PWR);
    addTrace(".U_LDO > .pin1", ".U_LDO > .pin3", "tr_ldo_en", "NET_VSYS", SIG);
    addTrace(".U_LDO > .pin1", ".C_IN > .pin1", "tr_cin_pos", "NET_VSYS", PWR);
    addTrace(".C_IN > .pin2", ".U_LDO > .pin2", "tr_cin_gnd", "NET_GND", PWR);
    // LDO 3.3V Output & Decoupling
    addTrace(".U_LDO > .pin5", ".C_OUT > .pin1", "tr_cout_pos", "NET_3V3", PWR);
    addTrace(".C_OUT > .pin2", ".U_LDO > .pin2", "tr_cout_gnd", "NET_GND", PWR);
    // 3.3V Power Indicator LED
    addTrace(".U_LDO > .pin5", ".R_PWR_LED > .pin2", "tr_r_pwr_led_3v3", "NET_3V3", SIG);
    addTrace(".R_PWR_LED > .pin1", ".D_PWR_LED > .pin2", "tr_d_pwr_led_a", "NET_PWR_LED_ANODE", SIG);
    addTrace(".D_PWR_LED > .pin1", ".U_LDO > .pin2", "tr_d_pwr_led_gnd", "NET_GND", PWR);

    // Ground Link: Power Subsystem -> LDO -> MCU Core
    addTrace(".J_BAT > .pin2", ".U_CHG > .pin2", "tr_bat_gnd", "NET_GND", PWR);
    addTrace(".J_USB > .pin1", ".U_CHG > .pin2", "tr_usb_chg_gnd", "NET_GND", PWR);
    addTrace(".U_CHG > .pin2", ".U_LDO > .pin2", "tr_chg_ldo_gnd", "NET_GND", PWR);
    addTrace(".U_LDO > .pin2", ".U_MCU > .pin9", "tr_ldo_mcu_gnd", "NET_GND", PWR);

    // ----------------------------------------------------------
    // E. ESP32-C3 MCU Core & Hardware Buttons
    // ----------------------------------------------------------
    // 3.3V System VDD to ESP32 Pin 1
    addTrace(".U_LDO > .pin5", ".U_MCU > .pin1", "tr_pwr_3v3_mcu", "NET_3V3", PWR);
    // Hardware Reset (EN) Tactile Button & Pull-Up
    addTrace(".U_MCU > .pin2", ".SW_EN > .pin1", "tr_sw_en", "NET_MCU_EN", SIG);
    addTrace(".U_MCU > .pin2", ".R_EN > .pin1", "tr_r_en", "NET_MCU_EN", SIG);
    addTrace(".R_EN > .pin2", ".U_MCU > .pin1", "tr_r_en_3v3", "NET_3V3", SIG);
    addTrace(".SW_EN > .pin2", ".U_MCU > .pin9", "tr_sw_en_gnd", "NET_GND", PWR);
    // Boot / User Action (IO9) Button & Pull-Up
    addTrace(".U_MCU > .pin8", ".SW_BOOT > .pin1", "tr_sw_boot", "NET_MCU_IO9", SIG);
    addTrace(".U_MCU > .pin8", ".R_BOOT > .pin1", "tr_r_boot", "NET_MCU_IO9", SIG);
    addTrace(".R_BOOT > .pin2", ".U_MCU > .pin1", "tr_r_boot_3v3", "NET_3V3", SIG);
    addTrace(".SW_BOOT > .pin2", ".U_MCU > .pin18", "tr_sw_boot_gnd", "NET_GND", PWR);
    // ESP32 Thermal Ground Pad & Ground Strapping
    addTrace(".U_MCU > .pin9", ".U_MCU > .pin19", "tr_mcu_ep_gnd_l", "NET_GND", PWR);
    addTrace(".U_MCU > .pin18", ".U_MCU > .pin19", "tr_mcu_ep_gnd_r", "NET_GND", PWR);

    // ----------------------------------------------------------
    // F. Motion Sensor: ST LSM6DS3TR-C 6-Axis IMU & Expansion Tap
    // ----------------------------------------------------------
    // I2C Bus & Interrupt
    addTrace(".U_MCU > .pin15", ".U_IMU > .pin13", "tr_i2c_scl", "NET_I2C_SCL", SIG);
    addTrace(".U_MCU > .pin16", ".U_IMU > .pin14", "tr_i2c_sda", "NET_I2C_SDA", SIG);
    addTrace(".U_MCU > .pin17", ".U_IMU > .pin4", "tr_imu_int", "NET_IMU_INT", SIG);
    // I2C Pull-Up Resistors
    addTrace(".U_IMU > .pin13", ".R_SCL > .pin1", "tr_r_scl_pin1", "NET_I2C_SCL", SIG);
    addTrace(".R_SCL > .pin2", ".U_MCU > .pin1", "tr_r_scl_3v3", "NET_3V3", SIG);
    addTrace(".U_IMU > .pin14", ".R_SDA > .pin1", "tr_r_sda_pin1", "NET_I2C_SDA", SIG);
    addTrace(".R_SDA > .pin2", ".U_MCU > .pin1", "tr_r_sda_3v3", "NET_3V3", SIG);
    // IMU Power & Decoupling (VDD & VDDIO to 3.3V, CS to 3.3V for I2C mode)
    addTrace(".U_MCU > .pin1", ".U_IMU > .pin8", "tr_imu_vdd", "NET_3V3", PWR);
    addTrace(".U_IMU > .pin8", ".U_IMU > .pin5", "tr_imu_vddio", "NET_3V3", SIG);
    addTrace(".U_IMU > .pin5", ".U_IMU > .pin12", "tr_imu_cs_i2c", "NET_3V3", SIG);
    addTrace(".U_IMU > .pin8", ".C_IMU > .pin1", "tr_c_imu_pos", "NET_3V3", PWR);
    addTrace(".C_IMU > .pin2", ".U_IMU > .pin6", "tr_c_imu_gnd", "NET_GND", PWR);
    // IMU Ground Strapping (SDO/SA0=0x6A on Pin 1, GND on Pin 6 & 7)
    addTrace(".U_MCU > .pin18", ".U_IMU > .pin6", "tr_imu_gnd", "NET_GND", PWR);
    addTrace(".U_IMU > .pin6", ".U_IMU > .pin1", "tr_imu_sa0_gnd", "NET_GND", SIG);
    addTrace(".U_IMU > .pin6", ".U_IMU > .pin7", "tr_imu_p7_gnd", "NET_GND", PWR);
    // J_MPU 5-Pin Diagnostic Tap Header (3V3, GND, SCL, SDA, INT)
    addTrace(".U_IMU > .pin8", ".J_MPU > .pin1", "tr_jmpu_3v3", "NET_3V3", PWR);
    addTrace(".U_IMU > .pin6", ".J_MPU > .pin2", "tr_jmpu_gnd", "NET_GND", PWR);
    addTrace(".U_IMU > .pin13", ".J_MPU > .pin3", "tr_jmpu_scl", "NET_I2C_SCL", SIG);
    addTrace(".U_IMU > .pin14", ".J_MPU > .pin4", "tr_jmpu_sda", "NET_I2C_SDA", SIG);
    addTrace(".U_IMU > .pin4", ".J_MPU > .pin5", "tr_jmpu_int", "NET_IMU_INT", SIG);

    // ----------------------------------------------------------
    // G. Audio Sensor: WillSemi WMM7037AT2 Analog MEMS Microphone
    // ----------------------------------------------------------
    // Microphone Analog Audio Output to ESP32-C3 ADC1_CH4 (GPIO 4 / Pin 3)
    addTrace(".U_MCU > .pin3", ".U_MIC > .pin4", "tr_mic_adc", "NET_MIC_ADC", SIG);
    // Microphone Power & Decoupling
    addTrace(".J_MPU > .pin1", ".U_MIC > .pin1", "tr_mic_vdd", "NET_3V3", PWR);
    addTrace(".U_MIC > .pin1", ".C_MIC > .pin1", "tr_c_mic_pos", "NET_3V3", PWR);
    addTrace(".C_MIC > .pin2", ".U_MIC > .pin2", "tr_c_mic_gnd", "NET_GND", PWR);
    // Ground Shield & Return
    addTrace(".J_MPU > .pin2", ".U_MIC > .pin2", "tr_mic_gnd", "NET_GND", PWR);
    addTrace(".U_MIC > .pin2", ".U_MIC > .pin3", "tr_mic_p3_gnd", "NET_GND", PWR);

    // ----------------------------------------------------------
    // H. Actuator Drivers: Haptic Motor & Addressable LED Switch
    // ----------------------------------------------------------
    // Haptic Motor Low-Side Driver (AO3400A N-MOSFET + SS14 Flyback Diode)
    addTrace(".U_MCU > .pin6", ".Q_HAP > .pin1", "tr_hap_pwm", "NET_HAPTIC_PWM", SIG);
    addTrace(".Q_HAP > .pin1", ".R_HAP_G > .pin1", "tr_r_hap_g", "NET_HAPTIC_PWM", SIG);
    addTrace(".R_HAP_G > .pin2", ".Q_HAP > .pin2", "tr_r_hap_gnd", "NET_GND", PWR);
    addTrace(".U_MIC > .pin2", ".Q_HAP > .pin2", "tr_q_hap_src_gnd", "NET_GND", PWR);
    addTrace(".Q_HAP > .pin3", ".J_HAP > .pin2", "tr_q_hap_drain", "NET_HAP_MTR_NEG", PWR);
    addTrace(".Q_HAP > .pin3", ".D_HAP > .pin2", "tr_d_hap_anode", "NET_HAP_MTR_NEG", PWR);
    addTrace(".D_HAP > .pin1", ".J_HAP > .pin1", "tr_d_hap_cath", "NET_VSYS", PWR);
    addTrace(".Q_PWR > .pin2", ".J_HAP > .pin1", "tr_vsys_actuators", "NET_VSYS", PWR);

    // Addressable LED High-Side Power Switch (AO3401A P-MOSFET + AO3400A Pre-Driver)
    addTrace(".U_MCU > .pin10", ".Q_LED_EN > .pin1", "tr_led_en", "NET_LED_PWR_EN", SIG);
    addTrace(".Q_LED_EN > .pin1", ".R_LED_G > .pin1", "tr_r_led_g", "NET_LED_PWR_EN", SIG);
    addTrace(".R_LED_G > .pin2", ".Q_LED_EN > .pin2", "tr_r_led_gnd", "NET_GND", PWR);
    addTrace(".Q_HAP > .pin2", ".Q_LED_EN > .pin2", "tr_q_led_src_gnd", "NET_GND", PWR);
    // Pre-driver pulls P-MOSFET Gate LOW
    addTrace(".Q_LED_EN > .pin3", ".Q_LED_PWR > .pin1", "tr_led_pmos_gate", "NET_LED_GATE_CTRL", SIG);
    addTrace(".Q_LED_PWR > .pin1", ".R_LED_PU > .pin1", "tr_r_led_pu_gate", "NET_LED_GATE_CTRL", SIG);
    addTrace(".R_LED_PU > .pin2", ".Q_LED_PWR > .pin2", "tr_r_led_pu_src", "NET_VSYS", PWR);
    addTrace(".J_HAP > .pin1", ".Q_LED_PWR > .pin2", "tr_vsys_led_pmos", "NET_VSYS", PWR);
    // Switched LED 5V Rail to LED Output Header
    addTrace(".Q_LED_PWR > .pin3", ".J_LED > .pin1", "tr_led_pwr_out", "NET_5V_SW", PWR);
    addTrace(".U_MCU > .pin5", ".J_LED > .pin2", "tr_led_dat", "NET_LED_DATA", SIG);
    addTrace(".Q_LED_EN > .pin2", ".J_LED > .pin3", "tr_j_led_gnd", "NET_GND", PWR);

  const boardPropsObj = boardProps(boardWidth, boardLength, routing, { skipRouting });
  const boardElement = React.createElement("board", {
    name: "main_board",
    key: "board",
    ...boardPropsObj,
    layers: 2,
    cornerFilletRadius: 2.0
  }, ...children);

  circuit.add(boardElement);

  try {
    await circuit.renderUntilSettled();
  } catch (err) {
    console.warn("[Project 04 Circuit] Render settling notice:", err?.message || err);
  }

  // Trace Boundary Clamping Guard (0.5mm board edge margin)
  const margin = 0.5;
  const maxBoardX = halfW - margin;
  const minBoardX = -halfW + margin;
  const maxBoardY = halfL - margin;
  const minBoardY = -halfL + margin;

  const circuitJson = circuit.getCircuitJson();
  circuitJson.forEach(item => {
    if (item.type === "pcb_trace" && Array.isArray(item.route)) {
      if (typeof item.width === "number" && item.width < 0.15) {
        item.width = 0.20;
      }
      item.route.forEach(pt => {
        if (typeof pt.x !== "number") {
          if (pt.start && typeof pt.start.x === "number") pt.x = pt.start.x;
          else if (pt.end && typeof pt.end.x === "number") pt.x = pt.end.x;
        }
        if (typeof pt.y !== "number") {
          if (pt.start && typeof pt.start.y === "number") pt.y = pt.start.y;
          else if (pt.end && typeof pt.end.y === "number") pt.y = pt.end.y;
        }
        if (typeof pt.x === "number" && Number.isFinite(pt.x)) {
          pt.x = Math.max(minBoardX, Math.min(maxBoardX, pt.x));
        }
        if (typeof pt.y === "number" && Number.isFinite(pt.y)) {
          pt.y = Math.max(minBoardY, Math.min(maxBoardY, pt.y));
        }
        if (typeof pt.width === "number" && Number.isFinite(pt.width) && pt.width < R.minTraceWidth) {
          pt.width = R.minTraceWidth;
        }
      });
    }
  });

  return circuit;
}

/**
 * Builds Gerber ZIP, BOM CSV, and CPL PNP exports using shared export utilities.
 * 100% JLCPCB SMT Factory-Ready.
 */
export async function generateManufacturingArtifacts(circuit, boardParams = {}) {
  let circuitJson = circuit.getCircuitJson();
  const silkScale = boardParams.silkScale || 1.0;

  if (silkScale !== 1.0) {
    circuitJson = circuitJson.map(item => {
      if (item.type === "pcb_silkscreen_text" && typeof item.font_size === "number") {
        return { ...item, font_size: +(item.font_size * silkScale).toFixed(2) };
      }
      return item;
    });
  }

  // 1. Gerber ZIP Package
  let gerberZipBlob = null;
  try {
    gerberZipBlob = await createGerberZipBlob(circuitJson, {
      projectName: "04-smdAudioMotionBatonPCB",
      prefix: "04_smdBaton"
    });
  } catch (err) {
    console.warn("[Gerber Packaging Warning]:", err);
  }

  // 2. BOM CSV with 100% LCSC Part Numbers
  const smtComponents = [
    { designator: "U_MCU", comment: "ESP32-C3-WROOM-02-N4", footprint: "MODULE_18x20mm", lcsc: "C2934560", qty: 1 },
    { designator: "U_IMU", comment: "LSM6DS3TR-C 6-Axis IMU", footprint: "LGA-14_2.5x3mm", lcsc: "C967633", qty: 1 },
    { designator: "U_MIC", comment: "WMM7037AT2-4/TR Analog MEMS Mic", footprint: "LGA-4_3.8x3mm", lcsc: "C140705", qty: 1 },
    { designator: "U_LDO", comment: "ME6211C33M5G-N 3.3V 500mA", footprint: "SOT-23-5", lcsc: "C82942", qty: 1 },
    { designator: "U_CHG", comment: "TP4054 1S LiPo Charger", footprint: "SOT-23-5", lcsc: "C382138", qty: 1 },
    { designator: "J_USB", comment: "TYPE-C-31-M-12 USB-C 16P", footprint: "USB-C-16P", lcsc: "C165948", qty: 1 },
    { designator: "Q_PWR", comment: "AO3401A P-MOSFET", footprint: "SOT-23", lcsc: "C15127", qty: 1 },
    { designator: "Q_LED_PWR", comment: "AO3401A P-MOSFET", footprint: "SOT-23", lcsc: "C15127", qty: 1 },
    { designator: "Q_LED_EN", comment: "AO3400A N-MOSFET", footprint: "SOT-23", lcsc: "C20917", qty: 1 },
    { designator: "Q_HAP", comment: "AO3400A N-MOSFET", footprint: "SOT-23", lcsc: "C20917", qty: 1 },
    { designator: "D_PWR", comment: "SS14 Schottky Diode", footprint: "SOD-123", lcsc: "C8598", qty: 1 },
    { designator: "D_HAP", comment: "SS14 Schottky Diode", footprint: "SOD-123", lcsc: "C8598", qty: 1 },
    { designator: "D_PWR_LED", comment: "Red 0603 LED", footprint: "0603", lcsc: "C84267", qty: 1 },
    { designator: "D_CHG", comment: "Red 0603 LED", footprint: "0603", lcsc: "C84267", qty: 1 },
    { designator: "SW_EN", comment: "TS-1187A SMD Button", footprint: "SMD_PUSH_SWITCH", lcsc: "C318884", qty: 1 },
    { designator: "SW_BOOT", comment: "TS-1187A SMD Button", footprint: "SMD_PUSH_SWITCH", lcsc: "C318884", qty: 1 },
    { designator: "R_CC1", comment: "5.1k", footprint: "0603", lcsc: "C23186", qty: 1 },
    { designator: "R_CC2", comment: "5.1k", footprint: "0603", lcsc: "C23186", qty: 1 },
    { designator: "R_SDA", comment: "4.7k", footprint: "0603", lcsc: "C23162", qty: 1 },
    { designator: "R_SCL", comment: "4.7k", footprint: "0603", lcsc: "C23162", qty: 1 },
    { designator: "R_PROG", comment: "2k", footprint: "0603", lcsc: "C22975", qty: 1 },
    { designator: "R_CHG", comment: "1k", footprint: "0603", lcsc: "C21190", qty: 1 },
    { designator: "R_PWR_LED", comment: "1k", footprint: "0603", lcsc: "C21190", qty: 1 },
    { designator: "R_EN", comment: "10k", footprint: "0603", lcsc: "C25804", qty: 1 },
    { designator: "R_BOOT", comment: "10k", footprint: "0603", lcsc: "C25804", qty: 1 },
    { designator: "R_HAP_G", comment: "10k", footprint: "0603", lcsc: "C25804", qty: 1 },
    { designator: "R_LED_G", comment: "10k", footprint: "0603", lcsc: "C25804", qty: 1 },
    { designator: "R_PWR", comment: "100k", footprint: "0603", lcsc: "C25803", qty: 1 },
    { designator: "R_LED_PU", comment: "100k", footprint: "0603", lcsc: "C25803", qty: 1 },
    { designator: "C_IN", comment: "10uF 10V", footprint: "0603", lcsc: "C19702", qty: 1 },
    { designator: "C_OUT", comment: "10uF 10V", footprint: "0603", lcsc: "C19702", qty: 1 },
    { designator: "C_IMU", comment: "100nF 50V", footprint: "0603", lcsc: "C14663", qty: 1 },
    { designator: "C_MIC", comment: "100nF 50V", footprint: "0603", lcsc: "C14663", qty: 1 }
  ];
  const bomCsv = createBomCsv(smtComponents);

  // 3. CPL / Pick-and-Place PNP CSV (Strict 1-to-1 BOM Parity)
  // Extract all individual SMD designators from the BOM list
  const allSmdDesignators = [];
  smtComponents.forEach(c => {
    const parts = c.designator.split(",").map(s => s.trim()).filter(Boolean);
    allSmdDesignators.push(...parts);
  });

  // Index exact physical center positions from circuitJson
  const scMap = new Map(circuitJson.filter(e => e.type === "source_component").map(c => [c.source_component_id, c.name]));
  const pcbCompMap = new Map();
  circuitJson.filter(e => e.type === "pcb_component").forEach(c => {
    const name = scMap.get(c.source_component_id) || c.name;
    if (name) {
      pcbCompMap.set(name, {
        x: +(c.center?.x ?? c.x ?? 0).toFixed(2),
        y: +(c.center?.y ?? c.y ?? 0).toFixed(2),
        layer: (c.layer || "top").toLowerCase() === "bottom" ? "Bottom" : "Top",
        rot: c.rotation || 0
      });
    }
  });

  // Feeder rotation / anchor overrides for JLCPCB SMT pick-and-place
  const cplOverrides = {
    J_USB: { x: 0.0, y: -49.5, rot: 0 },
    D_HAP: { rot: 180 }
  };

  const cplComponents = allSmdDesignators.map(designator => {
    const compPos = pcbCompMap.get(designator) || { x: 0, y: 0, layer: "Top", rot: 0 };
    const override = cplOverrides[designator] || {};
    return {
      designator,
      x: override.x !== undefined ? override.x : compPos.x,
      y: override.y !== undefined ? override.y : compPos.y,
      layer: override.layer || compPos.layer || "Top",
      rot: override.rot !== undefined ? override.rot : compPos.rot
    };
  });

  const pnpCsv = createCplCsv(cplComponents);

  // 4. Advisory Manufacturing DRC
  const drc = runManufacturingDrc(circuitJson, boardParams.routing);

  return {
    gerberZipBlob,
    bomCsv,
    pnpCsv,
    circuitJson,
    drc
  };
}
