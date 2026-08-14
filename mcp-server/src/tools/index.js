// ============================================================
// Tool registration — decides which tools exist for this process
// based on the write guards. Reads are always on; writes and
// broadcasts are opt-in (see config.ts).
// ============================================================
import { registerReadTools } from './read.js';
import { registerWriteTools } from './write.js';
import { registerBroadcastTools } from './broadcast.js';
export function registerTools(server, client, config) {
    const enabled = ['read'];
    registerReadTools(server, client);
    if (config.enableWrites) {
        registerWriteTools(server, client);
        enabled.push('write');
    }
    if (config.enableBroadcasts) {
        registerBroadcastTools(server, client);
        enabled.push('broadcast');
    }
    return enabled;
}
