use std::net::{SocketAddr, TcpStream};
use std::time::Duration;
use windows_sys::Win32::Foundation::ERROR_BUFFER_OVERFLOW;
use windows_sys::Win32::NetworkManagement::IpHelper::{
    GetAdaptersAddresses, GAA_FLAG_INCLUDE_ALL_INTERFACES, IP_ADAPTER_ADDRESSES_LH,
};
use windows_sys::Win32::Networking::WinSock::{AF_INET, AF_UNSPEC, SOCKADDR_IN};

#[derive(Debug, Clone)]
pub struct AdapterInfo {
    pub name: String,
    pub description: String,
    pub status: i32,
    pub status_str: &'static str,
    pub link_speed_mbps: u64,
    pub ipv4: Vec<String>,
    pub is_usb_tether: bool,
}

pub fn get_network_adapters() -> Vec<AdapterInfo> {
    let mut adapters = Vec::new();
    let mut buffer_size: u32 = 15000;
    let mut buffer: Vec<u8> = vec![0u8; buffer_size as usize];

    let flags = GAA_FLAG_INCLUDE_ALL_INTERFACES;
    let family = AF_UNSPEC as u32;

    let ret = unsafe {
        GetAdaptersAddresses(
            family,
            flags,
            std::ptr::null(),
            buffer.as_mut_ptr() as *mut IP_ADAPTER_ADDRESSES_LH,
            &mut buffer_size,
        )
    };

    if ret == ERROR_BUFFER_OVERFLOW {
        buffer.resize(buffer_size as usize, 0);
        let ret2 = unsafe {
            GetAdaptersAddresses(
                family,
                flags,
                std::ptr::null(),
                buffer.as_mut_ptr() as *mut IP_ADAPTER_ADDRESSES_LH,
                &mut buffer_size,
            )
        };
        if ret2 != 0 {
            return adapters;
        }
    } else if ret != 0 {
        return adapters;
    }

    let mut curr = buffer.as_ptr() as *const IP_ADAPTER_ADDRESSES_LH;
    while !curr.is_null() {
        let adapter = unsafe { &*curr };

        let name = if !adapter.FriendlyName.is_null() {
            let mut len = 0;
            while unsafe { *adapter.FriendlyName.add(len) } != 0 {
                len += 1;
            }
            let slice = unsafe { std::slice::from_raw_parts(adapter.FriendlyName, len) };
            String::from_utf16_lossy(slice)
        } else {
            String::new()
        };

        let description = if !adapter.Description.is_null() {
            let mut len = 0;
            while unsafe { *adapter.Description.add(len) } != 0 {
                len += 1;
            }
            let slice = unsafe { std::slice::from_raw_parts(adapter.Description, len) };
            String::from_utf16_lossy(slice)
        } else {
            String::new()
        };

        // Filter out virtual lightweight filter drivers and sub-interfaces
        let is_filter = name.contains("Filter")
            || description.contains("Filter")
            || name.contains("Packet Scheduler")
            || description.contains("Packet Scheduler");

        if !is_filter {
            let status_str = match adapter.OperStatus {
                1 => "Up",
                2 => "Down",
                3 => "Testing",
                4 => "Unknown",
                5 => "Dormant",
                6 => "NotPresent",
                7 => "LowerLayerDown",
                _ => "Unknown",
            };

            let speed_mbps = adapter.TransmitLinkSpeed / 1_000_000;

            let mut ipv4_list = Vec::new();
            let mut unicast = adapter.FirstUnicastAddress;
            while !unicast.is_null() {
                let u = unsafe { &*unicast };
                if !u.Address.lpSockaddr.is_null() {
                    let sockaddr = unsafe { &*u.Address.lpSockaddr };
                    if sockaddr.sa_family == AF_INET {
                        let sin = unsafe { &*(u.Address.lpSockaddr as *const SOCKADDR_IN) };
                        let s_addr = unsafe { sin.sin_addr.S_un.S_addr };
                        let bytes = s_addr.to_ne_bytes();
                        ipv4_list.push(format!("{}.{}.{}.{}", bytes[0], bytes[1], bytes[2], bytes[3]));
                    }
                }
                unicast = u.Next;
            }

            let desc_l = description.to_lowercase();
            let name_l = name.to_lowercase();
            let is_usb_tether = desc_l.contains("usbncm")
                || desc_l.contains("rndis")
                || desc_l.contains("remote ndis")
                || desc_l.contains("usb ethernet")
                || desc_l.contains("tether")
                || desc_l.contains("pdanet")
                || name_l.contains("usbncm")
                || name_l.contains("rndis")
                || name_l.contains("pdanet");

            adapters.push(AdapterInfo {
                name,
                description,
                status: adapter.OperStatus,
                status_str,
                link_speed_mbps: speed_mbps,
                ipv4: ipv4_list,
                is_usb_tether,
            });
        }

        curr = adapter.Next;
    }

    adapters
}

pub fn find_tether_adapter() -> Option<AdapterInfo> {
    let adapters = get_network_adapters();
    // Prioritize an Up tether adapter
    if let Some(a) = adapters.iter().find(|a| a.is_usb_tether && a.status == 1) {
        return Some(a.clone());
    }
    // Next, any tether adapter
    if let Some(a) = adapters.iter().find(|a| a.is_usb_tether) {
        return Some(a.clone());
    }
    None
}

pub fn check_internet_connectivity(timeout_ms: u64) -> bool {
    let timeout = Duration::from_millis(timeout_ms);
    let targets: [SocketAddr; 2] = [
        SocketAddr::from(([1, 1, 1, 1], 53)),
        SocketAddr::from(([8, 8, 8, 8], 53)),
    ];

    for target in &targets {
        if TcpStream::connect_timeout(target, timeout).is_ok() {
            return true;
        }
    }
    false
}
