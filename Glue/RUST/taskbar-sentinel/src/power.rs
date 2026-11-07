use std::ffi::c_void;
use windows_sys::Win32::System::LibraryLoader::{GetProcAddress, LoadLibraryA};

type NvmlReturn = i32;
type NvmlDevice = *mut c_void;

type NvmlInitFn = unsafe extern "C" fn() -> NvmlReturn;
type NvmlShutdownFn = unsafe extern "C" fn() -> NvmlReturn;
type NvmlDeviceGetHandleByIndexFn = unsafe extern "C" fn(u32, *mut NvmlDevice) -> NvmlReturn;
type NvmlDeviceGetPowerUsageFn = unsafe extern "C" fn(NvmlDevice, *mut u32) -> NvmlReturn;

#[repr(C)]
#[derive(Copy, Clone, Default)]
pub struct SystemPowerStatus {
    pub ac_line_status: u8,
    pub battery_flag: u8,
    pub battery_life_percent: u8,
    pub system_status_flag: u8,
    pub battery_life_time: u32,
    pub battery_full_life_time: u32,
}

extern "system" {
    fn GetSystemPowerStatus(lp_system_power_status: *mut SystemPowerStatus) -> i32;
}

pub struct PowerSampler {
    device: NvmlDevice,
    get_power_fn: Option<NvmlDeviceGetPowerUsageFn>,
    shutdown_fn: Option<NvmlShutdownFn>,
    has_nvml: bool,
    nvml_counter: u32,
    cached_gpu_watts: f32,
}

unsafe impl Send for PowerSampler {}

impl PowerSampler {
    pub fn new() -> Self {
        unsafe {
            let lib = LoadLibraryA(b"nvml.dll\0".as_ptr());
            if lib.is_null() {
                return Self::fallback();
            }

            let init_ptr = GetProcAddress(lib, b"nvmlInit_v2\0".as_ptr());
            let get_handle_ptr = GetProcAddress(lib, b"nvmlDeviceGetHandleByIndex_v2\0".as_ptr());
            let get_power_ptr = GetProcAddress(lib, b"nvmlDeviceGetPowerUsage\0".as_ptr());
            let shutdown_ptr = GetProcAddress(lib, b"nvmlShutdown\0".as_ptr());

            if init_ptr.is_none() || get_handle_ptr.is_none() || get_power_ptr.is_none() {
                return Self::fallback();
            }

            let init_fn: NvmlInitFn = std::mem::transmute(init_ptr);
            let get_handle_fn: NvmlDeviceGetHandleByIndexFn = std::mem::transmute(get_handle_ptr);
            let get_power_fn: NvmlDeviceGetPowerUsageFn = std::mem::transmute(get_power_ptr);
            let shutdown_fn: Option<NvmlShutdownFn> = shutdown_ptr.map(|p| std::mem::transmute(p));

            if init_fn() != 0 {
                return Self::fallback();
            }

            let mut device: NvmlDevice = std::ptr::null_mut();
            if get_handle_fn(0, &mut device) != 0 || device.is_null() {
                if let Some(s) = shutdown_fn {
                    s();
                }
                return Self::fallback();
            }

            Self {
                device,
                get_power_fn: Some(get_power_fn),
                shutdown_fn,
                has_nvml: true,
                nvml_counter: 0,
                cached_gpu_watts: 0.0,
            }
        }
    }

    fn fallback() -> Self {
        Self {
            device: std::ptr::null_mut(),
            get_power_fn: None,
            shutdown_fn: None,
            has_nvml: false,
            nvml_counter: 0,
            cached_gpu_watts: 0.0,
        }
    }

    pub fn sample_gpu_watts(&mut self) -> f32 {
        if self.has_nvml {
            if let Some(get_power) = self.get_power_fn {
                // Poll NVML every 3 samples to avoid forcing continuous P0 wake locks on Optimus laptops
                self.nvml_counter = (self.nvml_counter + 1) % 3;
                if self.nvml_counter == 1 || self.cached_gpu_watts == 0.0 {
                    let mut mw: u32 = 0;
                    unsafe {
                        if get_power(self.device, &mut mw) == 0 {
                            self.cached_gpu_watts = (mw as f32) / 1000.0;
                        } else {
                            // If dGPU is in D3cold deep sleep, query returns non-zero error; GPU draw is 0W
                            self.cached_gpu_watts = 0.0;
                        }
                    }
                }
                return self.cached_gpu_watts;
            }
        }
        0.0
    }

    pub fn sample_power_telemetry(
        &mut self,
        cpu_pct: u32,
        is_eco: bool,
    ) -> (f32, f32, f32, bool, bool) {
        let mut sps = SystemPowerStatus::default();
        let has_power_status = unsafe { GetSystemPowerStatus(&mut sps) != 0 };

        // BatteryFlag 128 (0x80) means no battery present (Desktop PC)
        let is_laptop =
            has_power_status && (sps.battery_flag & 128 == 0) && (sps.battery_flag != 255);
        let is_charging = has_power_status && (sps.battery_flag & 8 != 0);
        let on_ac = has_power_status && (sps.ac_line_status == 1);

        let gpu_watts = self.sample_gpu_watts();
        let pct = (cpu_pct.min(100) as f32) / 100.0;

        if is_laptop {
            // LAPTOP POWER MODEL (Intel 13th Gen Mobile + iGPU/dGPU + Mobile VRM)
            let (mobile_base, mobile_cpu) = if is_eco {
                // Ultra Eco Mode: Clamped clocks, minimal turbo, idle C-states
                (2.8, 0.8 + (pct * 6.5))
            } else {
                // Normal Mode: Standard Balanced C-states
                (3.8, 1.8 + (pct * 18.0))
            };

            // If dGPU is drawing minimal idle power (<1.5W), consider it near-sleep
            let effective_gpu = if gpu_watts > 1.0 { gpu_watts } else { 0.0 };
            let compute_watts = mobile_base + mobile_cpu + effective_gpu;

            let total_wall_watts = if on_ac {
                if is_charging {
                    // Fast charging battery adds ~35W into battery cells through charging VRM (~88% eff)
                    (compute_watts + 36.0) / 0.88
                } else {
                    compute_watts / 0.90
                }
            } else {
                // Running on battery: direct system discharge rate
                compute_watts
            };

            (total_wall_watts, compute_watts, gpu_watts, true, is_charging)
        } else {
            // DESKTOP RIG POWER MODEL (Ryzen / ATX Workstation)
            let (cpu_base, cpu_scale) = if is_eco {
                (10.0, 45.0)
            } else {
                (16.0, 79.0)
            };

            let cpu_watts = cpu_base + (pct * cpu_scale);
            let raw_system = gpu_watts.max(10.0) + cpu_watts + 28.0;
            let total_wall_watts = raw_system / 0.90;
            let compute_watts = raw_system;

            (total_wall_watts, compute_watts, gpu_watts, false, false)
        }
    }
}

impl Drop for PowerSampler {
    fn drop(&mut self) {
        if self.has_nvml {
            if let Some(shutdown) = self.shutdown_fn {
                unsafe {
                    shutdown();
                }
            }
        }
    }
}
