import { TizenAdapter, type RemoteKey } from './tizen/TizenAdapter';
import { getScreenSize } from './render/ScreenInfo';
import { getOrCreateDeviceId } from './device/DeviceId';
import { MemoriesApiClient } from './api/MemoriesApiClient';
import { PairingScreen } from './pairing/PairingScreen';
import { PlaybackController } from './playback/PlaybackController';
import { ConfigSocket, wsUrlFor } from './realtime/ConfigSocket';
import { DiagnosticsView } from './diagnostics/DiagnosticsView';
import { startMemorySampling } from './diagnostics/MemorySampler';
import { log } from './log/Logger';
import type { RemoteCommand } from './api/types';

const HEARTBEAT_INTERVAL_MS = 30_000;
const COMMAND_POLL_INTERVAL_MS = 5_000;
const PAIRING_RETRY_MS = 4_000;
// Quiet by design (§9.15) — frequent enough to catch slow growth across a
// multi-day soak, infrequent enough to never be the noisy thing in the log.
const MEMORY_SAMPLE_INTERVAL_MS = 5 * 60_000;
// Hidden diagnostics toggle: N presses of a key nothing else uses during
// normal playback (Up — see the remote.onKey switch below, no case for it)
// within a short window. Not a single press, so it can't be triggered by a
// stray remote bump; not a documented remote button, so it stays "reachable
// but never shown during normal playback" (§6) rather than a normal app
// feature.
const DIAGNOSTICS_CHORD_KEY: RemoteKey = 'Up';
const DIAGNOSTICS_CHORD_COUNT = 3;
const DIAGNOSTICS_CHORD_WINDOW_MS = 2000;

const stage = document.getElementById('stage')!;
const deviceId = getOrCreateDeviceId();
// Which Memories API server this build talks to — baked in at build time
// from tv/.env's VITE_MEMORIES_API_URL (gitignored, local per deployment).
// For a real TV, set this via `npm run deploy [tvIp] <serverUrl>`
// (tv/scripts/deploy.cjs) rather than hand-editing .env — it saves the URL
// there for every future deploy to reuse automatically.
const apiBaseUrl = (import.meta.env.VITE_MEMORIES_API_URL as string | undefined) ?? 'http://localhost:4000';
const api = new MemoriesApiClient(apiBaseUrl);
const screenSize = getScreenSize();

log.info('startup', { deviceId, screen: `${screenSize.width}x${screenSize.height}`, apiBaseUrl });
startMemorySampling(MEMORY_SAMPLE_INTERVAL_MS);

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
      log.warn('pairing request failed', { message: String(err) });
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

  const diagnostics = new DiagnosticsView(stage, {
    deviceId,
    apiBaseUrl,
    getSnapshot: () => controller.diagnosticsSnapshot(),
  });
  let chordPresses: number[] = [];

  remote.onKey((key: RemoteKey) => {
    if (key === DIAGNOSTICS_CHORD_KEY) {
      const now = Date.now();
      chordPresses = [...chordPresses.filter((t) => now - t < DIAGNOSTICS_CHORD_WINDOW_MS), now];
      if (chordPresses.length >= DIAGNOSTICS_CHORD_COUNT) {
        chordPresses = [];
        diagnostics.toggle();
      }
      return;
    }

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

main().catch((err) => log.error('fatal error', { message: String(err) }));
