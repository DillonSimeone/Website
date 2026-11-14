use std::os::windows::process::CommandExt;
use std::process::Command;

pub const CREATE_NO_WINDOW: u32 = 0x08000000;

pub const MB_ICONHAND: u32 = 0x00000010;
pub const MB_ICONEXCLAMATION: u32 = 0x00000030;
pub const MB_ICONASTERISK: u32 = 0x00000040;

#[link(name = "user32")]
extern "system" {
    fn MessageBeep(u_type: u32) -> i32;
}

pub fn play_sound_alert() {
    unsafe {
        MessageBeep(MB_ICONHAND);
    }
}

pub fn play_sound_success() {
    unsafe {
        MessageBeep(MB_ICONASTERISK);
    }
}

pub fn play_sound_warning() {
    unsafe {
        MessageBeep(MB_ICONEXCLAMATION);
    }
}

pub fn send_toast(title: &str, message: &str) {
    let title_esc = title.replace('"', "`\"");
    let msg_esc = message.replace('"', "`\"");

    let ps_command = format!(
        r#"[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null; $template = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02); $textNodes = $template.GetElementsByTagName("text"); $textNodes.Item(0).AppendChild($template.CreateTextNode("{}")) > $null; $textNodes.Item(1).AppendChild($template.CreateTextNode("{}")) > $null; $toast = [Windows.UI.Notifications.ToastNotification]::new($template); $notifier = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("Phone 5GHz Sentinel"); $notifier.Show($toast);"#,
        title_esc, msg_esc
    );

    let _ = Command::new("powershell.exe")
        .args(["-NoProfile", "-WindowStyle", "Hidden", "-Command", &ps_command])
        .creation_flags(CREATE_NO_WINDOW)
        .spawn();
}
