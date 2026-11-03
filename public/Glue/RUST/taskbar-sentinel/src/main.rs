#![windows_subsystem = "windows"]

mod menu;
mod power;
mod telemetry;
mod window;

fn main() {
    window::run_app();
}
