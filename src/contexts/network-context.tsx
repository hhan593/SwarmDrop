/**
 * Network Context
 * 管理 P2P 网络节点状态
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  shutdown,
  start,
  type Multiaddr,
  type NodeEvent,
  type PeerId,
} from "@/commands/network";
import { useSecretStore } from "@/stores/secret-store";

export type NodeStatus = "stopped" | "starting" | "running" | "error";

interface NetworkState {
  status: NodeStatus;
  listeningAddrs: Multiaddr[];
  connectedPeers: Set<PeerId>;
  discoveredPeers: Map<PeerId, Multiaddr>;
  error: string | null;
}

interface NetworkContextValue extends NetworkState {
  startNode: () => Promise<void>;
  stopNode: () => Promise<void>;
}

const NetworkContext = createContext<NetworkContextValue | null>(null);

export function NetworkProvider({ children }: { children: ReactNode }) {
  // 使用函数形式的懒初始化，避免每次渲染时重新创建 Set/Map 对象
  const [state, setState] = useState<NetworkState>(() => ({
    status: "stopped",
    listeningAddrs: [],
    connectedPeers: new Set(),
    discoveredPeers: new Map(),
    error: null,
  }));

  const handleNodeEvent = useCallback((event: NodeEvent) => {
    console.log("Network event:", event);
    switch (event.type) {
      case "listening":
        setState((prev) => ({
          ...prev,
          status: "running",
          listeningAddrs: [...prev.listeningAddrs, event.addr],
        }));
        break;

      case "peersDiscovered":
        setState((prev) => {
          const newDiscovered = new Map(prev.discoveredPeers);
          for (const [peerId, addr] of event.peers) {
            newDiscovered.set(peerId, addr);
          }
          return { ...prev, discoveredPeers: newDiscovered };
        });
        break;

      case "peerConnected":
        setState((prev) => {
          const newConnected = new Set(prev.connectedPeers);
          newConnected.add(event.peerId);
          return { ...prev, connectedPeers: newConnected };
        });
        break;

      case "peerDisconnected":
        setState((prev) => {
          const newConnected = new Set(prev.connectedPeers);
          newConnected.delete(event.peerId);
          return { ...prev, connectedPeers: newConnected };
        });
        break;

      case "identifyReceived":
        // 可以在这里处理节点身份信息
        break;
    }
  }, []);

  const startNode = useCallback(async () => {
    // Use functional setState to check status without depending on it
    let shouldStart = false;
    setState((prev) => {
      if (prev.status === "running" || prev.status === "starting") {
        return prev; // No state change
      }
      shouldStart = true;
      return {
        ...prev,
        status: "starting",
        error: null,
        listeningAddrs: [],
        connectedPeers: new Set(),
        discoveredPeers: new Map(),
      };
    });

    if (!shouldStart) return;

    try {
      const { deviceId } = useSecretStore.getState();
      if (!deviceId) {
        throw new Error("Keypair not initialized");
      }
      await start(handleNodeEvent);
    } catch (err) {
      setState((prev) => ({
        ...prev,
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  }, [handleNodeEvent]);

  const stopNode = useCallback(async () => {
    // Use functional setState to check status without depending on it
    let shouldStop = false;
    setState((prev) => {
      if (prev.status !== "running") {
        return prev; // No state change
      }
      shouldStop = true;
      return {
        status: "stopped",
        listeningAddrs: [],
        connectedPeers: new Set(),
        discoveredPeers: new Map(),
        error: null,
      };
    });

    if (!shouldStop) return;

    try {
      await shutdown();
    } catch (err) {
      console.error("Failed to shutdown node:", err);
    }
  }, []);

  const value = useMemo<NetworkContextValue>(
    () => ({
      status: state.status,
      listeningAddrs: state.listeningAddrs,
      connectedPeers: state.connectedPeers,
      discoveredPeers: state.discoveredPeers,
      error: state.error,
      startNode,
      stopNode,
    }),
    [
      state.status,
      state.listeningAddrs,
      state.connectedPeers,
      state.discoveredPeers,
      state.error,
      startNode,
      stopNode,
    ]
  );

  return (
    <NetworkContext.Provider value={value}>{children}</NetworkContext.Provider>
  );
}

export function useNetwork() {
  const context = useContext(NetworkContext);
  if (!context) {
    throw new Error("useNetwork must be used within a NetworkProvider");
  }
  return context;
}
