import WebSocket from 'ws';
import { Logger } from '../../utils/logger.js';
import { Common } from '../../utils/common.js';
import { WSServer } from '../../utils/webSocketServer.js';
export class ECLWebSocketClient {
    constructor() {
        this.logger = Logger;
        this.common = Common;
        this.wsServer = WSServer;
        this.webSocketClients = [];
        this.reconnectTimeOut = null;
        this.waitTime = 0.5;
        this.reconnet = (eclWsClt) => {
            if (this.reconnectTimeOut) {
                return;
            }
            this.waitTime = (this.waitTime >= 64) ? 64 : (this.waitTime * 2);
            this.reconnectTimeOut = setTimeout(() => {
                if (eclWsClt.selectedNode) {
                    this.logger.log({ selectedNode: eclWsClt.selectedNode, level: 'INFO', fileName: 'ECLWebSocket', msg: 'Reconnecting to the Eclair\'s Websocket Server..' });
                    this.connect(eclWsClt.selectedNode);
                }
                this.reconnectTimeOut = null;
            }, this.waitTime * 1000);
        };
        this.connect = (selectedNode) => {
            try {
                const clientExists = this.webSocketClients.find((wsc) => wsc.selectedNode.index === selectedNode.index);
                if (!clientExists) {
                    if (selectedNode.ln_server_url) {
                        const newWebSocketClient = { selectedNode: selectedNode, reConnect: true, webSocketClient: null };
                        this.connectWithClient(newWebSocketClient);
                        this.webSocketClients.push(newWebSocketClient);
                    }
                }
                else {
                    if ((!clientExists.webSocketClient || clientExists.webSocketClient.readyState !== WebSocket.OPEN) && selectedNode.ln_server_url) {
                        clientExists.reConnect = true;
                        this.connectWithClient(clientExists);
                    }
                }
            }
            catch (err) {
                throw new Error(err);
            }
        };
        this.connectWithClient = (eclWsClt) => {
            var _a;
            this.logger.log({ selectedNode: eclWsClt.selectedNode, level: 'INFO', fileName: 'ECLWebSocket', msg: 'Connecting to the Eclair\'s Websocket Server..' });
            const UpdatedLNServerURL = (_a = (eclWsClt.selectedNode.ln_server_url)) === null || _a === void 0 ? void 0 : _a.replace(/^http/, 'ws');
            const firstSubStrIndex = (UpdatedLNServerURL.indexOf('//') + 2);
            const WS_LINK = UpdatedLNServerURL.slice(0, firstSubStrIndex) + ':' + eclWsClt.selectedNode.ln_api_password + '@' + UpdatedLNServerURL.slice(firstSubStrIndex) + '/ws';
            eclWsClt.webSocketClient = new WebSocket(WS_LINK);
            eclWsClt.webSocketClient.onopen = () => {
                this.logger.log({ selectedNode: eclWsClt.selectedNode, level: 'INFO', fileName: 'ECLWebSocket', msg: 'Connected to the Eclair\'s Websocket Server..' });
                this.waitTime = 0.5;
            };
            eclWsClt.webSocketClient.onclose = (e) => {
                if (eclWsClt && eclWsClt.selectedNode && eclWsClt.selectedNode.ln_implementation === 'ECL') {
                    this.logger.log({ selectedNode: eclWsClt.selectedNode, level: 'INFO', fileName: 'ECLWebSocket', msg: 'Web socket disconnected, will reconnect again...' });
                    eclWsClt.webSocketClient.close();
                    if (eclWsClt.reConnect) {
                        this.reconnet(eclWsClt);
                    }
                }
            };
            eclWsClt.webSocketClient.onmessage = (msg) => {
                this.logger.log({ selectedNode: eclWsClt.selectedNode, level: 'DEBUG', fileName: 'ECLWebSocket', msg: 'Received message from the server..', data: msg.data });
                msg = (typeof msg.data === 'string') ? JSON.parse(msg.data) : msg.data;
                msg['source'] = 'ECL';
                const msgStr = JSON.stringify(msg);
                this.wsServer.sendEventsToAllLNClients(msgStr, eclWsClt.selectedNode);
            };
            eclWsClt.webSocketClient.onerror = (err) => {
                if (eclWsClt.selectedNode.ln_version === '' || !eclWsClt.selectedNode.ln_version || this.common.isVersionCompatible(eclWsClt.selectedNode.ln, '0.5.0')) {
                    this.logger.log({ selectedNode: eclWsClt.selectedNode, level: 'ERROR', fileName: 'ECLWebSocket', msg: 'Web socket error', error: err });
                    const errStr = ((typeof err === 'object' && err.message) ? JSON.stringify({ error: err.message }) : (typeof err === 'object') ? JSON.stringify({ error: err }) : ('{ "error": ' + err + ' }'));
                    this.wsServer.sendErrorToAllLNClients(errStr, eclWsClt.selectedNode);
                    eclWsClt.webSocketClient.close();
                    if (eclWsClt.reConnect) {
                        this.reconnet(eclWsClt);
                    }
                }
                else {
                    eclWsClt.reConnect = false;
                }
            };
        };
        this.disconnect = (selectedNode) => {
            const clientExists = this.webSocketClients.find((wsc) => wsc.selectedNode.index === selectedNode.index);
            if (clientExists && clientExists.webSocketClient && clientExists.webSocketClient.readyState === WebSocket.OPEN) {
                this.logger.log({ selectedNode: clientExists.selectedNode, level: 'INFO', fileName: 'ECLWebSocket', msg: 'Disconnecting from the Eclair\'s Websocket Server..' });
                clientExists.reConnect = false;
                clientExists.webSocketClient.close();
                const clientIdx = this.webSocketClients.findIndex((wsc) => wsc.selectedNode.index === selectedNode.index);
                this.webSocketClients.splice(clientIdx, 1);
            }
        };
        this.updateSelectedNode = (newSelectedNode) => {
            const clientIdx = this.webSocketClients.findIndex((wsc) => +wsc.selectedNode.index === +newSelectedNode.index);
            let newClient = this.webSocketClients[clientIdx];
            if (!newClient) {
                newClient = { selectedNode: null, reConnect: true, webSocketClient: null };
            }
            newClient.selectedNode = JSON.parse(JSON.stringify(newSelectedNode));
            this.webSocketClients[clientIdx] = newClient;
        };
        this.wsServer.eventEmitterECL.on('CONNECT', (nodeIndex) => {
            this.connect(this.common.findNode(+nodeIndex));
        });
        this.wsServer.eventEmitterECL.on('DISCONNECT', (nodeIndex) => {
            this.disconnect(this.common.findNode(+nodeIndex));
        });
    }
}
export const ECLWSClient = new ECLWebSocketClient();
