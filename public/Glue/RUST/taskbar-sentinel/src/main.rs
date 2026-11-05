#![windows_subsystem = "windows"]

mod eco;
mod menu;
mod power;
mod telemetry;
mod window;

fn main() {
    eco::init_eco_state();
    window::run_app();
}
