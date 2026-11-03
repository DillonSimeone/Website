use std::ffi::c_void;
use windows_sys::Win32::System::LibraryLoader::{GetProcAddress, LoadLibraryA};

type NvmlReturn = i32;
type NvmlDevice = *mut c_void;

type NvmlInitFn = unsafe extern "C" fn() -> NvmlReturn;
type NvmlShutdownFn = unsafe extern "C" fn() -> NvmlReturn;
type NvmlDeviceGetHandleByIndexFn = unsafe extern "C" fn(u32, *mut NvmlDevice) -> NvmlReturn;
type NvmlDeviceGetPowerUsageFn = unsafe extern "C" fn(NvmlDevice, *mut u32) -> NvmlReturn;

pub struct PowerSampler {
    device: NvmlDevice,
    get_power_fn: Option<NvmlDeviceGetPowerUsageFn>,
    shutdown_fn: Option<NvmlShutdownFn>,
    has_nvml: bool,
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
            }
        }
    }

    fn fallback() -> Self {
        Self {
            device: std::ptr::null_mut(),
            get_power_fn: None,
            shutdown_fn: None,
            has_nvml: false,
        }
    }

    pub fn sample_gpu_watts(&self) -> f32 {
        if self.has_nvml {
            if let Some(get_power) = self.get_power_fn {
                let mut mw: u32 = 0;
                unsafe {
                    if get_power(self.device, &mut mw) == 0 {
                        return (mw as f32) / 1000.0;
                    }
                }
            }
        }
        25.0 // Conservative idle GPU fallback
    }

    pub fn sample_total_wall_watts(&self, cpu_pct: u32) -> (f32, f32) {
        let gpu_watts = self.sample_gpu_watts();

        // AMD Ryzen 5 3600XT dynamic power model:
        // Base SoC / Infinity Fabric: ~16W. Max TDP: ~95W.
        let pct = (cpu_pct.min(100) as f32) / 100.0;
        let cpu_watts = 16.0 + (pct * 79.0);

        // Base system load (Motherboard, DDR4 RAM, NVMe SSDs, fans, cooler): ~28W
        let raw_system = gpu_watts + cpu_watts + 28.0;

        // 80-Plus Gold PSU efficiency curve (~90% at typical loads)
        let total_wall_watts = raw_system / 0.90;

        (total_wall_watts, gpu_watts)
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
