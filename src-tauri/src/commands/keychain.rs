use keyring_core::Entry;
use std::sync::Once;

use crate::AppResult;

const SERVICE: &str = "com.gy.swarmdrop";

static INIT: Once = Once::new();

/// 初始化平台特定的 keyring store
fn init_keyring_store() {
    INIT.call_once(|| {
        #[cfg(target_os = "macos")]
        {
            let store =
                apple_native_keyring_store::Store::new().expect("Failed to create keychain store");
            keyring_core::set_default_store(store);
        }

        #[cfg(target_os = "ios")]
        {
            let store =
                apple_native_keyring_store::Store::new().expect("Failed to create keychain store");
            keyring_core::set_default_store(store);
        }

        #[cfg(target_os = "windows")]
        {
            let store = windows_native_keyring_store::Store::new()
                .expect("Failed to create credential store");
            keyring_core::set_default_store(store);
        }

        #[cfg(target_os = "linux")]
        {
            let store = dbus_secret_service_keyring_store::Store::new()
                .expect("Failed to create secret service store");
            keyring_core::set_default_store(store);
        }

        #[cfg(target_os = "android")]
        {
            let store = android_native_keyring_store::Store::new()
                .expect("Failed to create android keystore");
            keyring_core::set_default_store(store);
        }
    });
}

/// 设置 keychain 值
#[tauri::command]
pub async fn keychain_set(key: String, value: String) -> AppResult<()> {
    init_keyring_store();
    let entry = Entry::new(SERVICE, &key)?;
    entry.set_password(&value)?;
    Ok(())
}

/// 获取 keychain 值
#[tauri::command]
pub async fn keychain_get(key: String) -> AppResult<Option<String>> {
    init_keyring_store();
    let entry = Entry::new(SERVICE, &key)?;
    match entry.get_password() {
        Ok(pass) => Ok(Some(pass)),
        Err(keyring_core::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.into()),
    }
}

/// 删除 keychain 值
#[tauri::command]
pub async fn keychain_delete(key: String) -> AppResult<()> {
    init_keyring_store();
    let entry = Entry::new(SERVICE, &key)?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring_core::Error::NoEntry) => Ok(()), // 不存在也算成功
        Err(e) => Err(e.into()),
    }
}
