#![windows_subsystem = "windows"]

use windows::core::PCWSTR;
use windows::Win32::Foundation::{LPARAM, WPARAM};
use windows::Win32::Graphics::Dwm::{DwmSetWindowAttribute, DWMWA_USE_IMMERSIVE_DARK_MODE};
use windows::Win32::Graphics::Gdi::CreateSolidBrush;
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::UI::HiDpi::{
    SetProcessDpiAwarenessContext, DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2,
};
use windows::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DispatchMessageW, GetMessageW, LoadCursorW, RegisterClassW, SendMessageW,
    TranslateMessage, CS_HREDRAW, CS_VREDRAW, CW_USEDEFAULT, ICON_BIG, ICON_SMALL, IDC_ARROW, MSG,
    WINDOW_EX_STYLE, WM_SETICON, WNDCLASSW, WS_OVERLAPPEDWINDOW, WS_VISIBLE,
};

use speech_bridge::icon::create_cyber_icon;
use speech_bridge::ui::{main_wnd_proc, C_BG};
use speech_bridge::win_util::{to_wide, ComGuard};

fn main() {
    unsafe {
        let _ = SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
        let _com = ComGuard::sta();

        let hinstance = GetModuleHandleW(None).unwrap_or_default();
        let class_name = to_wide("GlueSpeechBridgeWindow");
        let title = to_wide("SPEECH_BRIDGE // RTX NEURAL CAPTIONING");

        let icon_big = create_cyber_icon(32);
        let icon_small = create_cyber_icon(16);
        let bg_brush = CreateSolidBrush(C_BG);
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
            1120,
            700,
            None,
            None,
            hinstance,
            None,
        ) {
            if let Some(ic) = icon_big {
                SendMessageW(
                    hwnd,
                    WM_SETICON,
                    WPARAM(ICON_BIG as usize),
                    LPARAM(ic.0 as isize),
                );
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
    }
}
