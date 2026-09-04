import { TizenAdapter, type RemoteKey } from './tizen/TizenAdapter';
import { getScreenSize } from './render/ScreenInfo';
import { getOrCreateDeviceId } from './device/DeviceId';
import { MemoriesApiClient } from './api/MemoriesApiClient';
import { PairingScreen } from './pairing/PairingScreen';
import { PlaybackController } from './playback/PlaybackController';
import { ConfigSocket, wsUrlFor } from './realtime/ConfigSocket';
import type { RemoteCommand } from './api/types';

const HEARTBEAT_INTERVAL_MS = 30_000;
const COMMAND_POLL_INTERVAL_MS = 5_000;
const PAIRING_RETRY_MS = 4_000;

const stage = document.getElementById('stage')!;
const deviceId = getOrCreateDeviceId();
const apiBaseUrl = (import.meta.env.VITE_MEMORIES_API_URL as string | undefined) ?? 'http://localhost:4000';
const api = new MemoriesApiClient(apiBaseUrl);
const screenSize = getScreenSize();

console.log(`Device ${deviceId} — screen ${screenSize.width}x${screenSize.height} — API ${apiBaseUrl}`);

const remote = new TizenAdapter();
remote.init();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForPairing(): Promise<void> {
  const pairingScreen = new PairingScreen(stage);

  for (;;) {
    try {
      const result = await api.requestPairing(deviceId);
      if (result.paired) {
        pairingScreen.remove();
        return;
      }
      if (result.pairingCode) {
        pairingScreen.setCode(result.pairingCode);
      }
    } catch (err) {
      console.error('Pairing request failed', err);
    }
    await sleep(PAIRING_RETRY_MS);
  }
}

function applyCommand(controller: PlaybackController, command: RemoteCommand): void {
  switch (command.type) {
    case 'NEXT':
      controller.next();
      break;
    case 'PREVIOUS':
      controller.previous();
      break;
    case 'PAUSE':
      controller.pause();
      break;
    case 'RESUME':
      controller.resume();
      break;
  }
}

async function main(): Promise<void> {
  await waitForPairing();

  const controller = new PlaybackController(api, deviceId, stage);
  await controller.start();

  remote.onKey((key: RemoteKey) => {
    switch (key) {
      case 'Left':
      case 'Previous':
        controller.previous();
        break;
      case 'Right':
      case 'Next':
        controller.next();
        break;
      case 'PlayPause':
        if (controller.isPaused) controller.resume();
        else controller.pause();
        break;
      default:
        break;
    }
  });

  // Push channel (Phase 7, PROJECT.md §5.10) — near-instant notification of
  // a config change. Purely an optimization: the heartbeat below is the
  // guaranteed fallback, so a Tizen firmware without WebSocket support (or
  // a socket that just can't stay connected) still catches up within one
  // heartbeat interval.
  const configSocket = new ConfigSocket({
    url: wsUrlFor(apiBaseUrl, deviceId),
    onConfigChanged: (version) => controller.onPushedConfigChanged(version),
  });
  configSocket.connect();

  // The heartbeat response is the guaranteed way of learning about a
  // config change (and, by succeeding at all, "we're reconnected") — see
  // PlaybackController.applyServerStatus.
  setInterval(async () => {
    const status = await api.sendHeartbeat(deviceId, controller.currentStatus ?? undefined);
    controller.applyServerStatus(status);
  }, HEARTBEAT_INTERVAL_MS);

  setInterval(async () => {
    const commands = await api.pollCommands(deviceId);
    for (const command of commands) applyCommand(controller, command);
  }, COMMAND_POLL_INTERVAL_MS);
}

main().catch((err) => console.error('Fatal error', err));
