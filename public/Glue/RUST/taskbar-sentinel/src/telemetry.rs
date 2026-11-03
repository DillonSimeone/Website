use crate::menu::get_kwh_rate;
use crate::power::PowerSampler;
use std::mem::zeroed;
use windows_sys::Win32::Foundation::FILETIME;
use windows_sys::Win32::System::Performance::{
    PdhAddCounterW, PdhCloseQuery, PdhCollectQueryData, PdhGetFormattedCounterValue, PdhOpenQueryW,
    PDH_FMT_COUNTERVALUE, PDH_FMT_DOUBLE,
};
use windows_sys::Win32::System::SystemInformation::{GlobalMemoryStatusEx, MEMORYSTATUSEX};
use windows_sys::Win32::System::Threading::GetSystemTimes;

#[allow(dead_code)]
#[derive(Clone, Copy, Debug)]
pub struct TelemetrySnapshot {
    pub cpu_pct: u32,
    pub ram_pct: u32,
    pub ram_used_gb: f32,
    pub ram_total_gb: f32,
    pub disk_mb_s: f32,
    pub wall_watts: f32,
    pub gpu_watts: f32,
    pub monthly_cost: f32,
}

pub struct TelemetryCollector {
    prev_idle: u64,
    prev_kernel: u64,
    prev_user: u64,
    pdh_query: isize,
    pdh_counter: isize,
    has_pdh: bool,
    power_sampler: PowerSampler,
}

impl TelemetryCollector {
    pub fn new() -> Self {
        let (idle, kernel, user) = unsafe {
            let mut i: FILETIME = zeroed();
            let mut k: FILETIME = zeroed();
            let mut u: FILETIME = zeroed();
            GetSystemTimes(&mut i, &mut k, &mut u);
            (filetime_to_u64(i), filetime_to_u64(k), filetime_to_u64(u))
        };

        // Initialize Windows PDH for Disk Bytes/sec
        let mut pdh_query: isize = 0;
        let mut pdh_counter: isize = 0;
        let mut has_pdh = false;

        unsafe {
            if PdhOpenQueryW(std::ptr::null(), 0, &mut pdh_query) == 0 {
                let counter_path: Vec<u16> =
                    "\\PhysicalDisk(_Total)\\Disk Bytes/sec\0".encode_utf16().collect();
                if PdhAddCounterW(pdh_query, counter_path.as_ptr(), 0, &mut pdh_counter) == 0 {
                    PdhCollectQueryData(pdh_query);
                    has_pdh = true;
                } else {
                    PdhCloseQuery(pdh_query);
                    pdh_query = 0;
                }
            }
        }

        let power_sampler = PowerSampler::new();

        Self {
            prev_idle: idle,
            prev_kernel: kernel,
            prev_user: user,
            pdh_query,
            pdh_counter,
            has_pdh,
            power_sampler,
        }
    }

    pub fn sample(&mut self) -> TelemetrySnapshot {
        // --- CPU ---
        let mut idle_ft: FILETIME = unsafe { zeroed() };
        let mut kernel_ft: FILETIME = unsafe { zeroed() };
        let mut user_ft: FILETIME = unsafe { zeroed() };

        unsafe {
            GetSystemTimes(&mut idle_ft, &mut kernel_ft, &mut user_ft);
        }

        let curr_idle = filetime_to_u64(idle_ft);
        let curr_kernel = filetime_to_u64(kernel_ft);
        let curr_user = filetime_to_u64(user_ft);

        let idle_delta = curr_idle.saturating_sub(self.prev_idle);
        let kernel_delta = curr_kernel.saturating_sub(self.prev_kernel);
        let user_delta = curr_user.saturating_sub(self.prev_user);

        let total_sys = kernel_delta + user_delta;
        let cpu_pct = if total_sys > 0 {
            let active = total_sys.saturating_sub(idle_delta);
            ((active as f64 / total_sys as f64) * 100.0).clamp(0.0, 100.0) as u32
        } else {
            0
        };

        self.prev_idle = curr_idle;
        self.prev_kernel = curr_kernel;
        self.prev_user = curr_user;

        // --- RAM ---
        let mut mem: MEMORYSTATUSEX = unsafe { zeroed() };
        mem.dwLength = std::mem::size_of::<MEMORYSTATUSEX>() as u32;
        unsafe {
            GlobalMemoryStatusEx(&mut mem);
        }

        let ram_pct = mem.dwMemoryLoad;
        let ram_total_gb = mem.ullTotalPhys as f32 / (1024.0 * 1024.0 * 1024.0);
        let ram_used_gb = (mem.ullTotalPhys.saturating_sub(mem.ullAvailPhys)) as f32
            / (1024.0 * 1024.0 * 1024.0);

        // --- Disk ---
        let mut disk_mb_s = 0.0f32;
        if self.has_pdh {
            unsafe {
                if PdhCollectQueryData(self.pdh_query) == 0 {
                    let mut val: PDH_FMT_COUNTERVALUE = zeroed();
                    if PdhGetFormattedCounterValue(
                        self.pdh_counter,
                        PDH_FMT_DOUBLE,
                        std::ptr::null_mut(),
                        &mut val,
                    ) == 0
                    {
                        let bytes_sec = val.Anonymous.doubleValue;
                        if bytes_sec >= 0.0 {
                            disk_mb_s = (bytes_sec / (1024.0 * 1024.0)) as f32;
                        }
                    }
                }
            }
        }

        // --- Wattage & Cost Estimation ---
        let (wall_watts, gpu_watts) = self.power_sampler.sample_total_wall_watts(cpu_pct);
        let kwh_rate = get_kwh_rate();
        // Monthly cost = (Watts / 1000 kW) * ($ / kWh) * 24h * 30 days
        let monthly_cost = (wall_watts / 1000.0) * kwh_rate * 24.0 * 30.0;

        TelemetrySnapshot {
            cpu_pct,
            ram_pct,
            ram_used_gb,
            ram_total_gb,
            disk_mb_s,
            wall_watts,
            gpu_watts,
            monthly_cost,
        }
    }
}

impl Drop for TelemetryCollector {
    fn drop(&mut self) {
        if self.has_pdh && self.pdh_query != 0 {
            unsafe {
                PdhCloseQuery(self.pdh_query);
            }
        }
    }
}

#[inline]
fn filetime_to_u64(ft: FILETIME) -> u64 {
    ((ft.dwHighDateTime as u64) << 32) | (ft.dwLowDateTime as u64)
}
