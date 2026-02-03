/**
 * Secret Store
 * 使用 Zustand + Stronghold 安全存储密钥对
 */

import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import { getStrongholdStorage, isStrongholdInitialized } from "@/lib/stronghold";
import { generateKeypair, registerKeypair } from "@/commands/identity";

interface SecretState {
  /** protobuf 编码的密钥对 */
  keypair: number[] | null;
  /** 设备 ID (PeerId) */
  deviceId: string | null;
  /** 是否已完成 hydration */
  _hasHydrated: boolean;
  /** 设置 hydration 状态 */
  setHasHydrated: (state: boolean) => void;
  /** 初始化密钥对（生成或加载） */
  init: () => Promise<void>;
}

/**
 * 延迟获取 Stronghold Storage
 * 在 Stronghold 初始化之前，返回一个空的 storage
 */
const lazyStrongholdStorage: StateStorage = {
  getItem: async (name: string) => {
    if (!isStrongholdInitialized()) {
      return null;
    }
    return getStrongholdStorage().getItem(name);
  },
  setItem: async (name: string, value: string) => {
    if (!isStrongholdInitialized()) {
      console.warn("Stronghold not initialized, skipping setItem");
      return;
    }
    return getStrongholdStorage().setItem(name, value);
  },
  removeItem: async (name: string) => {
    if (!isStrongholdInitialized()) {
      console.warn("Stronghold not initialized, skipping removeItem");
      return;
    }
    return getStrongholdStorage().removeItem(name);
  },
};

export const useSecretStore = create(
  persist<SecretState>(
    (set, get) => ({
      keypair: null,
      deviceId: null,
      _hasHydrated: false,

      setHasHydrated: (state) => set({ _hasHydrated: state }),

      async init() {
        const { keypair } = get();

        if (!keypair) {
          // 首次运行：生成新密钥对
          console.log("Generating new keypair...");
          const newKeypair = await generateKeypair();
          const deviceId = await registerKeypair(newKeypair);
          set({ keypair: newKeypair, deviceId });
          console.log("New keypair generated, deviceId:", deviceId);
        } else {
          // 已有密钥：注册到后端
          console.log("Loading existing keypair...");
          const deviceId = await registerKeypair(keypair);
          set({ deviceId });
          console.log("Keypair loaded, deviceId:", deviceId);
        }
      },
    }),
    {
      name: "secret-store",
      storage: createJSONStorage(() => lazyStrongholdStorage),
    }
  )
);

/**
 * 在 Stronghold 解锁后重新 hydrate secret store
 * 应该在 unlock 成功后调用
 */
export async function rehydrateSecretStore() {
  await useSecretStore.persist.rehydrate();
  const state = useSecretStore.getState();
  await state.init();
  state.setHasHydrated(true);
}
