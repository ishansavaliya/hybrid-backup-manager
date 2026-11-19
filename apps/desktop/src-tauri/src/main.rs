#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde_json::Value;

#[tauri::command]
async fn agent_request(request: Value) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || pipe_request(request))
        .await.map_err(|_| "Agent bridge task failed".to_string())?
}

#[tauri::command]
async fn start_service() -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(start_windows_service)
        .await.map_err(|_| "Could not start service task".to_string())?
}

#[cfg(windows)]
fn start_windows_service() -> Result<String, String> {
    use std::process::Command;
    let status = Command::new("powershell")
        .args([
            "-NoProfile",
            "-WindowStyle",
            "Hidden",
            "-Command",
            "Start-Process sc.exe -ArgumentList 'start BakvionService' -Verb RunAs -Wait -WindowStyle Hidden",
        ])
        .status()
        .map_err(|_| "Could not launch administrator prompt to start BakvionService.".to_string())?;
    if !status.success() {
        return Err("Starting BakvionService was cancelled or failed.".to_string());
    }
    std::thread::sleep(std::time::Duration::from_millis(1200));
    Ok("BakvionService start requested.".to_string())
}

#[cfg(not(windows))]
fn start_windows_service() -> Result<String, String> {
    Err("Starting BakvionService is only supported on Windows.".to_string())
}

#[cfg(windows)]
fn pipe_request(request: Value) -> Result<Value, String> {
    use std::{fs::OpenOptions, io::{BufRead, BufReader, Read, Write}, os::windows::io::AsRawHandle};
    use windows_sys::Win32::{System::{Pipes::GetNamedPipeServerProcessId, Services::{OpenSCManagerW, OpenServiceW, QueryServiceStatusEx, CloseServiceHandle, SC_MANAGER_CONNECT, SERVICE_QUERY_STATUS, SC_STATUS_PROCESS_INFO, SERVICE_STATUS_PROCESS}}, Foundation::HANDLE};
    let mut pipe = {
        let mut attempt = 0;
        loop {
            match OpenOptions::new().read(true).write(true).open(r"\\.\pipe\Bakvion.v1") {
                Ok(p) => break p,
                Err(e) if e.raw_os_error() == Some(231) && attempt < 200 => {
                    attempt += 1;
                    std::thread::sleep(std::time::Duration::from_millis(15));
                }
                Err(_) => return Err("BakvionService is unavailable or access was denied. Start the installed service.".to_string()),
            }
        }
    };
    // Reject a squatted pipe: its server must be the SCM-registered service process.
    unsafe {
        let mut server_pid = 0;
        if GetNamedPipeServerProcessId(pipe.as_raw_handle() as HANDLE, &mut server_pid) == 0 { return Err("Cannot authenticate service pipe".into()); }
        let scm = OpenSCManagerW(std::ptr::null(), std::ptr::null(), SC_MANAGER_CONNECT);
        if scm.is_null() { return Err("Cannot query Service Control Manager".into()); }
        let name: Vec<u16> = "BakvionService\0".encode_utf16().collect();
        let service = OpenServiceW(scm, name.as_ptr(), SERVICE_QUERY_STATUS);
        CloseServiceHandle(scm);
        if service.is_null() { return Err("BakvionService is not installed".into()); }
        let mut status: SERVICE_STATUS_PROCESS = std::mem::zeroed();
        let mut needed = 0;
        let ok = QueryServiceStatusEx(service, SC_STATUS_PROCESS_INFO, &mut status as *mut _ as *mut u8, std::mem::size_of::<SERVICE_STATUS_PROCESS>() as u32, &mut needed);
        CloseServiceHandle(service);
        if ok == 0 || status.dwProcessId == 0 || status.dwProcessId != server_pid { return Err("Pipe server does not match the Windows service".into()); }
    }
    let mut encoded = serde_json::to_vec(&request).map_err(|_| "Invalid request".to_string())?;
    if encoded.len() > 1024 * 1024 { return Err("Request exceeds limit".into()); }
    encoded.push(b'\n');
    pipe.write_all(&encoded).map_err(|_| "Cannot send service request".to_string())?;
    let mut response = String::new();
    BufReader::new(pipe).take(32 * 1024 * 1024).read_line(&mut response).map_err(|_| "Cannot read service response".to_string())?;
    serde_json::from_str(&response).map_err(|_| "Invalid or oversized service response".to_string())
}

#[cfg(not(windows))]
fn pipe_request(_: Value) -> Result<Value, String> { Err("The service bridge requires Windows. Offline CLI recovery is available on supported restic platforms.".into()) }

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![agent_request, start_service])
        .run(tauri::generate_context!())
        .expect("Bakvion desktop runtime failed");
}
