import './core/config.js';
import './data/customers.js';
import './features/customers.js';
import './core/utilities.js';
import './ui/dialogs.js';
import './features/shipments.js';
import './features/advice.js';
import './features/register.js';
import './features/dashboard.js';
import './features/printing.js';
import './features/exports.js';
import './core/state.js';
import './data/branding.js';
import './domain/tariffs.js';
import './features/settings.js';
import './data/demo.js';
import './features/handover.js';
import './features/warehouse.js';
import './features/security.js';
import './core/booking-commands.js';
import './features/bookings.js';
import './core/boot.js';
import { app } from './core/runtime.js';
import { startApplication } from './core/boot.js';
import { prepareStorage, installPersistence, finishStorageBoot, showStartupError } from './core/workspace-storage.js';
import './styles/base.css';
import './styles/workspace.css';
import './styles/bookings.css';
import { mountWorkspace } from './ui/shell.js';

try {
  await prepareStorage();
  installPersistence();
  // Compatibility bridge for the existing behavior suite during module migration.
  for (const key of Object.keys(app)) {
    Object.defineProperty(window, key, {configurable: true, get: () => app[key], set: value => {app[key] = value;}});
  }
  startApplication();
  mountWorkspace();
  finishStorageBoot();
  window.SolitAir = app;
  window.__solitairReady = true;
} catch (error) {
  showStartupError(error);
  window.__solitairStartupError = error.message;
}
