mod identity;
mod pairing;

pub use identity::*;
pub use pairing::*;

use swarm_p2p_core::{libp2p::identity::Keypair, NodeConfig};
use tauri::{ipc::Channel, AppHandle, Manager, State};
use tokio::sync::Mutex;
use tracing::error;

use crate::pairing::manager::PairingManager;
use crate::protocol::{AppNetClient, AppRequest};

/// NodeEvent 使用 AppRequest 泛型
pub type AppNodeEvent = swarm_p2p_core::NodeEvent<AppRequest>;

/// 网络管理器，持有 NetClient 和 PairingManager
pub struct NetManager {
    /// 保留 client 的所有权，drop 时关闭 command channel 通知 runtime 停止
    #[allow(dead_code)]
    client: AppNetClient,
    pairing_manager: PairingManager,
}

impl NetManager {
    pub fn new(client: AppNetClient, peer_id: swarm_p2p_core::libp2p::PeerId) -> Self {
        Self {
            pairing_manager: PairingManager::new(client.clone(), peer_id),
            client,
        }
    }

    pub fn pairing(&self) -> &PairingManager {
        &self.pairing_manager
    }
}

/// NetManager 状态类型
pub type NetManagerState = Mutex<Option<NetManager>>;

#[tauri::command]
pub async fn start(
    app: AppHandle,
    keypair: State<'_, Keypair>,
    channel: Channel<AppNodeEvent>,
) -> crate::AppResult<()> {
    // 构建 agent 版本: swarmdrop/{version}; os={os}; arch={arch}; host={hostname}
    let agent_version = format!(
        "swarmdrop/{}; os={}; arch={}; host={}",
        env!("CARGO_PKG_VERSION"),
        tauri_plugin_os::type_(),
        tauri_plugin_os::arch(),
        tauri_plugin_os::hostname(),
    );

    let config = NodeConfig::new("/swarmdrop/1.0.0", agent_version)
        .with_mdns(true)
        .with_relay_client(true)
        .with_dcutr(true)
        .with_autonat(true);

    let peer_id = keypair.public().to_peer_id();
    let (client, mut receiver) = swarm_p2p_core::start(keypair.inner().clone(), config)?;

    tokio::spawn(async move {
        while let Some(event) = receiver.recv().await {
            if let Err(e) = channel.send(event) {
                error!("Failed to send event: {}", e);
            }
        }
    });

    let manager = NetManager::new(client, peer_id);

    if let Some(state) = app.try_state::<NetManagerState>() {
        *state.lock().await = Some(manager);
    } else {
        app.manage(Mutex::new(Some(manager)));
    }

    Ok(())
}

#[tauri::command]
pub async fn shutdown(app: AppHandle) -> crate::AppResult<()> {
    if let Some(state) = app.try_state::<NetManagerState>() {
        // drop NetManager 会关闭 command channel，通知 runtime 停止
        let _: Option<NetManager> = state.lock().await.take();
    }

    Ok(())
}
