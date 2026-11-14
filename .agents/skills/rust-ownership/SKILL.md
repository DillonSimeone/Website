---
name: rust-ownership
description: >-
  Rust ownership, borrowing, and zero-copy architecture guidelines. Activate when
  writing, reviewing, or refactoring Rust code to prevent borrow-checker
  appeasement debt (excessive .clone(), Arc<Mutex<...>>, Rc<RefCell<...>>,
  Box::leak, and unnecessary static mut globals).
---

# Rust Ownership & Zero-Clone Guidelines

## Core Principle
Never silence the borrow checker with `.clone()`, `Rc<RefCell<...>>`, `Box::leak`, or `Arc<Mutex<...>>` when ownership can be moved, borrowed mutably, or partitioned cleanly.

## Patterns to Use Instead of `.clone()`

1. **Move out of `Mutex<State>` with `std::mem::take`**
   - When a background worker needs to process a `Vec` or `HashMap` without holding the lock:
     ```rust
     let (items, states) = {
         let mut guard = self.state.lock().unwrap();
         (std::mem::take(&mut guard.items), std::mem::take(&mut guard.states))
     };
     ```
   - Never clone a multi-thousand-element `Vec` or `HashMap` just to drop a `MutexGuard`.

2. **Pass `&mut` for Incremental State**
   - Pass `&mut HashSet<String>` / `&mut HashMap<K, V>` into incremental scanners instead of cloning the set, inserting new keys, and returning a new set.

3. **Consume & Partition Owned Collections**
   - When retaining/filtering items across pipeline stages, pass `Vec<T>` by value and partition with `for item in items { ... }` or `Vec::retain`, rather than passing `&[T]` and calling `item.clone()` on kept elements.
   - Use `HashMap::remove(&key)` to transfer owned `Vec<T>` per-source into a stage without cloning.

4. **Borrow for Serialization**
   - Define a lightweight `#[derive(Serialize)] struct PayloadRef<'a>` borrowing `&'a [T]` and `&'a HashMap<...>` instead of cloning state into an owned `Payload` just to call `serde_json::to_writer`.

5. **Limit `Arc` & `Mutex` to True Shared Ownership**
   - Use `Arc` only when multiple threads or UI callbacks genuinely outlive a single owner.
   - Use `std::sync::Mutex` / `OnceLock` (never `static mut` or `Box::leak`) for Win32 `WndProc` state, or store per-window state via `SetWindowLongPtrW(hwnd, GWLP_USERDATA, ...)` when multiple instances exist.

## Pre-Commit Self-Check
- Search for `.clone()` inside loops or on large collections (`Vec`, `HashMap`, `HashSet`).
- Verify `0` occurrences of `Rc::new`, `RefCell`, `Box::leak` unless single-threaded interior mutability is strictly required by an external API.
