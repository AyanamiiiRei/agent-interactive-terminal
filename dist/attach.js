import { WebSocket, WebSocketServer } from 'ws';
import { isLocalRequest } from './bridge.js';
/**
 * Answer an upgrade we refuse with a plain HTTP response, then drop the
 * socket. A WebSocket client surfaces this as a failed connection.
 *
 * @param socket - the raw socket the upgrade arrived on.
 * @param status - HTTP status code.
 * @param reason - HTTP reason phrase.
 */
function reject(socket, status, reason) {
    socket.write(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
    socket.destroy();
}
/**
 * Build the attach upgrade handler for one Host.
 *
 * @param deps - the same session resolver the HTTP bridge uses.
 * @returns the upgrade handler and a disposer that closes every socket.
 */
export function createAttachUpgrade(deps) {
    const wss = new WebSocketServer({ noServer: true, perMessageDeflate: false });
    const clients = new Set();
    const cleanups = new Set();
    let disposed = false;
    wss.on('connection', (client) => {
        clients.add(client);
        client.on('close', () => clients.delete(client));
    });
    function attach(client, session) {
        let ready = false;
        let finished = false;
        let tail = '';
        const pending = [];
        let statusTimer;
        let unsubscribeOutput;
        let unsubscribeStatus;
        const send = (message) => {
            if (client.readyState === WebSocket.OPEN)
                client.send(JSON.stringify(message));
        };
        const sendOutput = (data) => {
            if (client.readyState === WebSocket.OPEN)
                client.send(Buffer.from(data, 'utf8'), { binary: true });
        };
        const statusMessage = () => ({
            type: 'status',
            phase: session.phase,
            lease: session.lease,
            cols: session.size.cols,
            rows: session.size.rows,
            revision: session.revision,
            command: session.agentCommand,
            commandAt: session.agentCommandAt,
            agentAt: session.agentAt,
            peekAt: session.peekAt,
            access: session.agentAccess,
        });
        const broadcastStatus = () => {
            if (statusTimer !== undefined)
                return;
            statusTimer = setTimeout(() => {
                statusTimer = undefined;
                send(statusMessage());
            }, 40);
        };
        const cleanup = () => {
            if (statusTimer !== undefined)
                clearTimeout(statusTimer);
            statusTimer = undefined;
            unsubscribeOutput?.();
            unsubscribeOutput = undefined;
            unsubscribeStatus?.();
            unsubscribeStatus = undefined;
            cleanups.delete(cleanup);
            // When the person's view goes away, the keyboard belongs to the agent
            // again. Without this a closed browser would hold the lease forever and
            // every agent write would be refused.
            if (session.phase !== 'exited' && session.lease.holder === 'human') {
                try {
                    session.handBack();
                }
                catch {
                    // The session may have exited between the check and the call.
                }
            }
        };
        const finish = () => {
            if (finished)
                return;
            finished = true;
            send({
                type: 'exited',
                phase: session.phase,
                exitCode: session.exitCode,
                signal: session.exitSignal,
                closedByOwner: session.closedByOwner,
                cols: session.size.cols,
                rows: session.size.rows,
                tail: tail.slice(-2048),
            });
            cleanup();
            if (client.readyState === WebSocket.OPEN)
                client.close();
        };
        // Subscribe before painting: output produced while the snapshot is being
        // serialized is buffered and flushed after it, so no byte is lost or
        // rendered out of order.
        unsubscribeOutput = session.onOutput((data) => {
            tail = (tail + data).slice(-4096);
            if (!ready) {
                pending.push(data);
                return;
            }
            sendOutput(data);
        });
        unsubscribeStatus = session.subscribe(() => {
            if (session.phase === 'exited') {
                finish();
                return;
            }
            broadcastStatus();
        });
        cleanups.add(cleanup);
        send({
            type: 'hello',
            id: session.id,
            name: session.name ?? session.id,
            cols: session.size.cols,
            rows: session.size.rows,
            phase: session.phase,
            lease: session.lease,
            access: session.agentAccess,
            shell: session.statusLine(),
        });
        send({ type: 'snapshot', data: session.serialize() });
        send(statusMessage());
        ready = true;
        for (const chunk of pending.splice(0))
            sendOutput(chunk);
        client.on('message', (raw, isBinary) => {
            if (isBinary)
                return;
            let message;
            try {
                message = JSON.parse(String(raw));
            }
            catch {
                return;
            }
            switch (message.type) {
                case 'write': {
                    if (session.lease.holder !== 'human') {
                        send({ type: 'denied', reason: 'lease is held by the agent; take over first' });
                        return;
                    }
                    const data = typeof message.data === 'string' ? message.data : '';
                    if (data.length > 0) {
                        void session.write(data, { origin: 'human', submit: false }).catch((error) => {
                            send({ type: 'denied', reason: error instanceof Error ? error.message : String(error) });
                        });
                    }
                    return;
                }
                case 'resize': {
                    if (Number.isInteger(message.cols) && Number.isInteger(message.rows) && message.cols >= 2 && message.rows >= 2) {
                        try {
                            session.resize(message.cols, message.rows);
                        }
                        catch {
                            // A session that exited between the message and the resize.
                        }
                    }
                    return;
                }
                case 'takeover': {
                    try {
                        session.takeOver();
                    }
                    catch {
                        // The shell exited while the click was in flight.
                    }
                    return;
                }
                case 'handback': {
                    try {
                        session.handBack();
                    }
                    catch {
                        // The shell exited while the click was in flight.
                    }
                    return;
                }
                case 'access': {
                    const value = message.value;
                    if (value !== 'collaborate' && value !== 'observe' && value !== 'sealed') {
                        send({ type: 'denied', reason: 'unknown access level' });
                        return;
                    }
                    try {
                        session.setAgentAccess(value);
                    }
                    catch (error) {
                        send({ type: 'denied', reason: error instanceof Error ? error.message : String(error) });
                    }
                    return;
                }
                case 'ping': {
                    send({ type: 'pong' });
                    return;
                }
                default:
                    return;
            }
        });
        client.on('close', () => cleanup());
        client.on('error', () => cleanup());
    }
    return {
        handler(req, socket, head) {
            if (disposed)
                return reject(socket, 503, 'Service Unavailable');
            if (!isLocalRequest(req))
                return reject(socket, 403, 'Forbidden');
            let url;
            try {
                url = new URL(req.url ?? '/', 'http://localhost');
            }
            catch {
                return reject(socket, 400, 'Bad Request');
            }
            const sessionId = url.searchParams.get('sessionId') ?? '';
            const id = url.searchParams.get('id') ?? '';
            const target = deps.resolve(sessionId);
            const session = target?.registry.get(id);
            if (session === undefined)
                return reject(socket, 404, 'Not Found');
            try {
                wss.handleUpgrade(req, socket, head, (client) => attach(client, session));
            }
            catch {
                socket.destroy();
            }
        },
        dispose() {
            disposed = true;
            for (const cleanup of [...cleanups])
                cleanup();
            for (const client of [...clients])
                client.close();
            clients.clear();
            wss.close();
        },
    };
}
//# sourceMappingURL=attach.js.map