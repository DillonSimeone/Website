#![windows_subsystem = "windows"]

mod denoise;
mod icon;
mod live_captions;
mod meter;
mod stt;
mod tts;
mod ui;

use std::ffi::OsStr;
use std::os::windows::ffi::OsStrExt;
use windows::core::PCWSTR;
use windows::Win32::Foundation::{COLORREF, LPARAM, WPARAM};
use windows::Win32::Graphics::Dwm::{DwmSetWindowAttribute, DWMWA_USE_IMMERSIVE_DARK_MODE};
use windows::Win32::Graphics::Gdi::CreateSolidBrush;
use windows::Win32::System::Com::{CoInitializeEx, CoUninitialize, COINIT_APARTMENTTHREADED};
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::UI::HiDpi::{
    SetProcessDpiAwarenessContext, DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2,
};
use windows::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DispatchMessageW, GetMessageW, LoadCursorW, RegisterClassW, SendMessageW,
    TranslateMessage, CS_HREDRAW, CS_VREDRAW, CW_USEDEFAULT, ICON_BIG, ICON_SMALL, IDC_ARROW, MSG,
    WINDOW_EX_STYLE, WM_SETICON, WNDCLASSW, WS_OVERLAPPEDWINDOW, WS_VISIBLE,
};

use crate::icon::create_cyber_icon;
use crate::ui::main_wnd_proc;

fn main() {
    unsafe {
        let _ = SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);

        let hinstance = GetModuleHandleW(None).unwrap_or_default();
        let class_name: Vec<u16> = OsStr::new("GlueSpeechBridgeWindow")
            .encode_wide()
            .chain(Some(0))
            .collect();
        let title: Vec<u16> = OsStr::new("SPEECH_BRIDGE // GLUE_NET")
            .encode_wide()
            .chain(Some(0))
            .collect();

        let icon_big = create_cyber_icon(32);
        let icon_small = create_cyber_icon(16);
        let bg_brush = CreateSolidBrush(COLORREF(0x000E0B07));
        let wc = WNDCLASSW {
            style: CS_HREDRAW | CS_VREDRAW,
            lpfnWndProc: Some(main_wnd_proc),
            hInstance: hinstance.into(),
            hIcon: icon_big.unwrap_or_default(),
            hCursor: LoadCursorW(None, IDC_ARROW).unwrap_or_default(),
            hbrBackground: bg_brush,
            lpszClassName: PCWSTR(class_name.as_ptr()),
            ..Default::default()
        };
        RegisterClassW(&wc);

        if let Ok(hwnd) = CreateWindowExW(
            WINDOW_EX_STYLE::default(),
            PCWSTR(class_name.as_ptr()),
            PCWSTR(title.as_ptr()),
            WS_OVERLAPPEDWINDOW | WS_VISIBLE,
            CW_USEDEFAULT,
            CW_USEDEFAULT,
            980,
            640,
            None,
            None,
            hinstance,
            None,
        ) {
            if let Some(ic) = icon_big {
                SendMessageW(hwnd, WM_SETICON, WPARAM(ICON_BIG as usize), LPARAM(ic.0 as isize));
            }
            if let Some(ic) = icon_small {
                SendMessageW(
                    hwnd,
                    WM_SETICON,
                    WPARAM(ICON_SMALL as usize),
                    LPARAM(ic.0 as isize),
                );
            }
            let dark: i32 = 1;
            let _ = DwmSetWindowAttribute(
                hwnd,
                DWMWA_USE_IMMERSIVE_DARK_MODE,
                &dark as *const i32 as *const core::ffi::c_void,
                std::mem::size_of::<i32>() as u32,
            );
        }

        let mut msg = MSG::default();
        while GetMessageW(&mut msg, None, 0, 0).as_bool() {
            let _ = TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }

        CoUninitialize();
    }
}
