use std::process::Command;

fn main() {
    // Re-run whenever Rust sources change so an open speech-bridge.exe never blocks linking.
    println!("cargo:rerun-if-changed=src");

    #[cfg(target_os = "windows")]
    {
        for exe in ["speech-bridge.exe", "speech-bench.exe"] {
            let _ = Command::new("taskkill")
                .args(["/F", "/IM", exe])
                .output();
        }
    }
}
