import { IPCAPI } from '../shared/ipc-types';

declare global {
  interface Window {
    api: IPCAPI;
  }
}
