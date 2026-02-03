mod identity;
mod keychain;

pub use identity::*;
pub use keychain::*;

use swarm_p2p_core::{libp2p::identity::Keypair, NetClient, NodeConfig, NodeEvent};
use tauri::{ipc::Channel, AppHandle, Manager, State};
use tokio::sync::Mutex;
use tracing::error;

/// NetClient 状态类型
pub type NetClientState = Mutex<Option<NetClient>>;

#[tauri::command]
pub async fn start(
    app: AppHandle,
    keypair: State<'_, Keypair>,
    channel: Channel<NodeEvent>,
) -> crate::AppResult<()> {
    let (client, mut receiver) = swarm_p2p_core::start(&keypair, NodeConfig::default())?;

    tokio::spawn(async move {
        while let Some(event) = receiver.recv().await {
            if let Err(e) = channel.send(event) {
                error!("Failed to send event: {}", e);
            }
        }
    });

    if let Some(state) = app.try_state::<NetClientState>() {
        *state.lock().await = Some(client);
    } else {
        app.manage(Mutex::new(Some(client)));
    }

    Ok(())
}

#[tauri::command]
pub async fn shutdown(app: AppHandle) -> crate::AppResult<()> {
    if let Some(state) = app.try_state::<NetClientState>() {
        if let Some(client) = state.lock().await.take() {
            client.shutdown();
        }
    }

    Ok(())
}
