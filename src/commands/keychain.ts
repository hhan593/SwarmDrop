/**
 * Keychain commands
 * 系统密钥链相关命令（用于安全存储密码）
 */

import { invoke } from "@tauri-apps/api/core";

/**
 * 存储值到系统密钥链
 * @param key - 键名
 * @param value - 值
 */
export async function keychainSet(key: string, value: string): Promise<void> {
  return await invoke("keychain_set", { key, value });
}

/**
 * 从系统密钥链获取值
 * @param key - 键名
 * @returns 值，如果不存在返回 null
 */
export async function keychainGet(key: string): Promise<string | null> {
  return await invoke("keychain_get", { key });
}

/**
 * 从系统密钥链删除值
 * @param key - 键名
 */
export async function keychainDelete(key: string): Promise<void> {
  return await invoke("keychain_delete", { key });
}
