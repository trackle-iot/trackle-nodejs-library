"use strict";
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updatePropertiesErrors = void 0;
const buffer_crc32_1 = __importDefault(require("buffer-crc32"));
const coap_packet_1 = __importDefault(require("coap-packet"));
const dns_1 = __importDefault(require("dns"));
const events_1 = require("events");
const http_1 = __importDefault(require("http"));
const https_1 = __importDefault(require("https"));
const net_1 = require("net");
const node_mbed_dtls_client_1 = __importDefault(require("node-mbed-dtls-client"));
const os_1 = __importDefault(require("os"));
const url_1 = require("url");
const ChunkingStream_1 = __importDefault(require("../lib/ChunkingStream"));
const CoapMessages_1 = __importDefault(require("../lib/CoapMessages"));
const CryptoManager_1 = __importDefault(require("../lib/CryptoManager"));
const CryptoStream_1 = __importDefault(require("../lib/CryptoStream"));
const CoapUriType_1 = __importDefault(require("../types/CoapUriType"));
const COUNTER_MAX = 65536;
const EVENT_NAME_MAX_LENGTH = 64;
const FILES_MAX_NUMBER = 4;
const FUNCTIONS_MAX_NUMBER = 10;
const VARIABLES_MAX_NUMBER = 10;
const SUBSCRIPTIONS_MAX_NUMBER = 4;
const PRODUCT_FIRMWARE_VERSION = 0;
const SOCKET_TIMEOUT = 31000;
const DESCRIBE_METRICS = 1 << 2;
const DESCRIBE_APPLICATION = 1 << 1;
const DESCRIBE_SYSTEM = 1 << 0;
const DESCRIBE_ALL = DESCRIBE_APPLICATION | DESCRIBE_SYSTEM;
const CHUNK_SIZE = 512;
const SEND_EVENT_ACK_TIMEOUT = 5000;
const CLOUD_ADDRESS_TCP = 'device.trackle.io';
const CLOUD_PUBLIC_KEY_TCP = `-----BEGIN PUBLIC KEY-----\n
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA7hEN7ub/klSKC6qBpFmT\n
/qZKQqdu4pS+2Y9/w7xb5BxQ7Ss+e8vKhRKvP1F2VdRy2UFym0qwBIKRQ3ha3Nbs\n
2f7zxEm5HHIpSEMCjrz+vQsSdtviYq4omiNzyUYmkkOxykVcncKrsNlU40psL648\n
DUxp4HL79Z+wudiyTMKpTnBlSt7n2w1Hh7/0t4q334qgSjpT78Xl895wW9wSWR/D\n
TZph/QzCPiHFnAiwCJ76UbnT30p9FheqSEAoFo8VOsTvg8CuLNeDPcuSmefPo2IN\n
J7dsEokhvOOziPovL0ubG4RbhwC6AMJaVU65mEN8yxcgx4vw5vJ4y+ly1ZKMZytK\n
NwIDAQAB\n
-----END PUBLIC KEY-----\n
\n`;
const CLOUD_ADDRESS_UDP = 'udp.device.trackle.io';
const CLOUD_PUBLIC_KEY_UDP = `-----BEGIN PUBLIC KEY-----\n
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEKxmdyfKwLdHxffAr0ezRV9Z0Udec\n
CeFwQ0pbwkDASWc0yKT4tPf7tNA/zK8fqi4ddoLPOhoLQjgUbVRCBdxNJw==\n
-----END PUBLIC KEY-----\n
\n`;
const VERSION = '1.4.2';
const SYSTEM_EVENT_NAMES = ['iotready', 'trackle'];
exports.updatePropertiesErrors = {
    BAD_REQUEST: -1,
    NOT_FOUND: -3,
    NOT_WRITABLE: -2
};
const getPlatformID = () => {
    const platform = os_1.default.platform();
    const arch = os_1.default.arch();
    switch (platform) {
        case 'darwin':
            return 102;
        case 'linux':
            if (arch === 'arm' || arch === 'arm64') {
                return 101;
            }
            return 103;
        case 'win32':
            return 770;
    }
    return 103; // linux default ??
};
events_1.EventEmitter.defaultMaxListeners = 100;
class Trackle extends events_1.EventEmitter {
    constructor(cloudOptions = {}) {
        super();
        this.forceTcp = false;
        this.otaUpdateEnabled = true;
        this.otaUpdatePending = false;
        this.otaUpdateForced = false;
        this.messageID = 0;
        this.keepalive = 30000;
        this.forceTcpProtocol = () => {
            this.forceTcp = true;
            this.keepalive = 15000;
        };
        this.begin = async (deviceID, privateKey, productID, productFirmwareVersion, platformID) => {
            if (deviceID === '') {
                throw new Error(`You must define deviceID`);
            }
            if (deviceID.length !== 24) {
                throw new Error(`Wrong deviceID`);
            }
            this.deviceID = Buffer.from(deviceID, 'hex');
            if (!privateKey) {
                throw new Error(`You must define privateKey in PEM string or DER Buffer`);
            }
            this.privateKey = CryptoManager_1.default.loadPrivateKey(privateKey, this.forceTcp ? 'rsa' : 'ecc');
            let cloudPublicKey = this.forceTcp
                ? CLOUD_PUBLIC_KEY_TCP
                : CLOUD_PUBLIC_KEY_UDP;
            if (this.cloud.publicKeyPEM) {
                cloudPublicKey = this.cloud.publicKeyPEM;
            }
            try {
                CryptoManager_1.default.setServerKey(cloudPublicKey, this.forceTcp ? 'rsa' : 'ecc');
            }
            catch (err) {
                throw new Error('Cloud public key error. Are you using a tcp key without calling forceTcpProtocol()?');
            }
            this.serverKey = CryptoManager_1.default.getServerKey();
            if (this.cloud.address) {
                const index = this.cloud.address.indexOf('://');
                this.host =
                    index >= 0 ? this.cloud.address.substr(index + 3) : this.cloud.address;
            }
            else {
                this.host = this.forceTcp
                    ? CLOUD_ADDRESS_TCP
                    : `${deviceID}.${CLOUD_ADDRESS_UDP}`;
            }
            if (this.host !== 'localhost' && this.host !== '127.0.0.1') {
                try {
                    const addresses = await this.resolvePromise(this.host);
                    if (addresses && addresses.length > 0) {
                        this.host = addresses[0];
                    }
                }
                catch (err) {
                    throw new Error(`Could not resolve host address ${this.host}: ${err.message}`);
                }
            }
            this.port = this.cloud.port || (this.forceTcp ? 5683 : 5684);
            this.platformID = platformID || getPlatformID();
            this.productID = productID || COUNTER_MAX;
            this.productFirmwareVersion =
                productFirmwareVersion || PRODUCT_FIRMWARE_VERSION;
            this.isInitialized = true;
        };
        this.connect = async () => {
            if (this.isConnecting) {
                return;
            }
            if (!this.isInitialized) {
                throw new Error('You must initialize library calling begin before connect');
            }
            this.isConnecting = true;
            this.sentPacketCounterMap = new Map();
            this.emit('connecting', {
                host: this.host,
                port: this.port
            });
            if (!this.forceTcp) {
                const handshakeTimeout = setTimeout(() => {
                    this.reconnect(new Error('handshake timeout'));
                }, 5000);
                this.socket = node_mbed_dtls_client_1.default.connect({
                    debug: (process.env.DEBUG_MBED &&
                        parseInt(process.env.DEBUG_MBED, 10) > 0) ||
                        undefined,
                    host: this.host,
                    key: this.privateKey,
                    peerPublicKey: this.serverKey.toBuffer('spki'),
                    port: this.port
                }, (socket) => {
                    clearTimeout(handshakeTimeout);
                    this.emit('connect', {
                        host: this.host,
                        port: this.port
                    });
                    socket.on('data', this.onNewCoapMessage);
                    socket.on('error', (err) => {
                        this.reconnect(err);
                    });
                    socket.on('close', () => this.reconnect(new Error('dtls socket close')));
                    this.socket = socket;
                    this.decipherStream = socket;
                    this.cipherStream = socket;
                    this.finalizeHandshake();
                });
                this.socket.on('err', (_, msg) => this.reconnect(new Error(msg)));
            }
            else {
                this.state = 'nonce';
                this.socket = new net_1.Socket();
                this.socket.setTimeout(SOCKET_TIMEOUT);
                this.socket.on('data', this.onReadData);
                this.socket.on('error', this.reconnect);
                this.socket.on('close', () => this.reconnect(new Error('socket close')));
                this.socket.on('timeout', (err) => this.reconnect(err));
                this.socket.connect({
                    host: this.host,
                    port: this.port
                }, () => this.emit('connect', {
                    host: this.host,
                    port: this.port
                }));
            }
        };
        this.connected = () => this.isConnected;
        this.setClaimCode = (claimCode) => {
            this.claimCode = claimCode;
        };
        this.file = (fileName, mimeType, retrieveFileCallback) => {
            if (fileName.length > EVENT_NAME_MAX_LENGTH) {
                return false;
            }
            if (this.filesMap.size >= FILES_MAX_NUMBER) {
                return false;
            }
            this.filesMap.set(fileName, [mimeType, retrieveFileCallback]);
            return true;
        };
        this.post = (name, callFunctionCallback, functionFlags) => {
            if (name.length > EVENT_NAME_MAX_LENGTH) {
                return false;
            }
            if (this.functionsMap.size >= FUNCTIONS_MAX_NUMBER) {
                return false;
            }
            this.functionsMap.set(name, [functionFlags || '', callFunctionCallback]);
            return true;
        };
        this.get = (name, type, retrieveValueCallback) => {
            if (name.length > EVENT_NAME_MAX_LENGTH) {
                return false;
            }
            if (this.variablesMap.size >= VARIABLES_MAX_NUMBER) {
                return false;
            }
            this.variablesMap.set(name, [type, retrieveValueCallback]);
            return true;
        };
        this.setUpdatePropertiesCallback = (updatePropertiesCallback
        // propsFlags?: PropertiesFlags
        ) => {
            this.updatePropertiesCallback = updatePropertiesCallback;
            return true;
        };
        this.disconnect = () => {
            this.disconnectInternal();
            this.isDisconnected = true;
            this.emit('disconnect');
        };
        this.subscribe = (eventName, callback, subscriptionType, subscriptionDeviceID) => {
            if (eventName.length > EVENT_NAME_MAX_LENGTH) {
                return false;
            }
            if (this.subscriptionsMap.size >= SUBSCRIPTIONS_MAX_NUMBER) {
                return false;
            }
            if (subscriptionDeviceID && subscriptionDeviceID.length !== 24) {
                return false;
            }
            const handler = (packet) => {
                const uris = packet.options
                    .filter(o => o.name === 'Uri-Path')
                    .map(o => o.value.toString('utf8'));
                uris.shift(); // Remove E or e
                const name = uris.join('/');
                const data = packet.payload.toString('utf8');
                callback(name, data);
            };
            let type = 'ALL_DEVICES';
            if (subscriptionType && subscriptionType === 'MY_DEVICES') {
                type = 'MY_DEVICES';
            }
            this.subscriptionsMap.set(eventName, [handler, type, subscriptionDeviceID]);
            return true;
        };
        this.unsubscribe = (eventName) => {
            if (!this.isConnected) {
                return;
            }
            const subValue = this.subscriptionsMap.get(eventName);
            this.removeListener(eventName, subValue[0]);
        };
        this.sendProperties = async (properties) => {
            if (!this.isConnected) {
                return;
            }
            try {
                /* const props = Array.from(this.propsMap, ([name, [type, value]]) => ({ name, type, value })).filter(({ name }) => properties.includes(name)).reduce((acc, cur) => {
                  acc[cur.name] = cur.type === 'boolean' ? Boolean(cur.value) : cur.type === 'number' ? Number(cur.value) : cur.value;
                  return acc;
                }, {});*/
                JSON.parse(properties);
                return await this.publish('trackle/p', properties, 'PRIVATE');
            }
            catch (err) {
                this.emit('error', new Error('Properties: ' + err.message));
            }
        };
        this.publish = async (eventName, data, eventType, eventFlags, messageID) => {
            if (!this.isConnected) {
                return;
            }
            const nextMessageID = this.nextMessageID();
            const confirmable = this.forceTcp
                ? eventFlags && eventFlags === 'WITH_ACK'
                    ? true
                    : false
                : eventFlags && eventFlags === 'NO_ACK'
                    ? false
                    : true; // default true for udp
            const messageSent = this.sendEvent(eventName, data, nextMessageID, confirmable, eventType);
            // do not emit for internal events
            if (!eventName.startsWith('iotready') && !eventName.startsWith('trackle')) {
                this.emit('publish', {
                    data,
                    eventFlags,
                    eventName,
                    eventType,
                    messageID,
                    messageSent
                });
                if (messageSent && confirmable) {
                    try {
                        await this.listenFor('ACK', null, nextMessageID, SEND_EVENT_ACK_TIMEOUT);
                        this.emit('publishCompleted', { success: true, messageID });
                    }
                    catch (err) {
                        this.emit('publishCompleted', { success: false, messageID });
                    }
                }
            }
        };
        this.enableUpdates = () => {
            if (!this.otaUpdateEnabled) {
                this.otaUpdateEnabled = true;
                if (this.isConnected) {
                    this.publish('trackle/device/updates/enabled', 'true', 'PRIVATE');
                }
            }
        };
        this.disableUpdates = () => {
            if (this.otaUpdateEnabled) {
                this.otaUpdateEnabled = false;
                if (this.isConnected) {
                    this.publish('trackle/device/updates/enabled', 'false', 'PRIVATE');
                }
            }
        };
        this.updatesEnabled = () => this.otaUpdateEnabled;
        this.updatesPending = () => this.otaUpdatePending;
        this.getDiagnostic = () => Buffer.concat([Buffer.alloc(1, 0)]);
        this.getDescription = () => {
            const filesObject = {};
            Array.from(this.filesMap.keys()).forEach((key) => {
                filesObject[key] = this.filesMap.get(key);
            });
            const functions = Array.from(this.functionsMap.keys());
            const variablesObject = {};
            Array.from(this.variablesMap.keys()).forEach((key) => {
                variablesObject[key] = this.variablesMap.get(key)[0];
            });
            const description = JSON.stringify({
                f: functions,
                g: filesObject,
                m: [
                    {},
                    {},
                    {
                        d: [],
                        f: 's',
                        n: '1',
                        v: VERSION
                    },
                    {},
                    {}
                ],
                p: this.platformID,
                v: variablesObject
            });
            return Buffer.from(description);
        };
        this.resolvePromise = (host) => {
            return new Promise((resolve, reject) => {
                dns_1.default.resolve(host, (err, address) => {
                    if (err)
                        reject(err);
                    resolve(address);
                });
            });
        };
        this.emitWithPrefix = (eventName, packet) => this.eventNames()
            .filter((eventNamePrefix) => eventName.startsWith(eventNamePrefix))
            .forEach((eventNamePrefix) => this.emit(eventNamePrefix, packet));
        this.sendSubscribe = async (eventName, handler, subscriptionType, subscriptionDeviceID) => {
            if (!this.isConnected) {
                return;
            }
            this.on(eventName, handler);
            const messageID = this.nextMessageID();
            const options = [
                {
                    name: 'Uri-Path',
                    value: Buffer.from(`${CoapUriType_1.default.Subscribe}/${eventName}`)
                }
            ];
            if (subscriptionType === 'MY_DEVICES') {
                options.push({
                    name: 'Uri-Query',
                    value: Buffer.from('u')
                });
            }
            const packet = {
                code: 'GET',
                confirmable: true,
                messageId: messageID,
                options,
                payload: subscriptionType === 'MY_DEVICES' && subscriptionDeviceID
                    ? Buffer.from(subscriptionDeviceID, 'hex')
                    : undefined
            };
            this.writeCoapData(packet);
            try {
                await this.listenFor('ACK', null, messageID, SEND_EVENT_ACK_TIMEOUT);
                if (!SYSTEM_EVENT_NAMES.includes(eventName)) {
                    this.emit('subscribe', eventName);
                }
            }
            catch (err) {
                this.emit('error', new Error('Subscribe: ' + err.message));
            }
        };
        this.disconnectInternal = () => {
            if (this.isDisconnected) {
                return;
            }
            this.isConnecting = false;
            this.isConnected = false;
            this.state = 'nonce';
            if (this.decipherStream) {
                this.decipherStream.removeAllListeners();
            }
            if (this.socket) {
                this.socket.removeAllListeners();
                this.socket.destroy();
                this.socket = null;
            }
            this.subscriptionsMap.forEach((value, eventName) => {
                this.removeListener(eventName, value[0]);
            });
            if (this.pingInterval) {
                clearInterval(this.pingInterval);
                this.pingInterval = null;
            }
        };
        this.reconnect = (error) => {
            if (error !== undefined) {
                if (error.code === 'ENOTFOUND') {
                    this.emit('connectionError', new Error('No server found at this address!'));
                    if (this.socket) {
                        this.socket.destroy();
                    }
                }
                else if (error.code === 'ECONNREFUSED') {
                    this.emit('connectionError', new Error('Connection refused! Please check the IP.'));
                    if (this.socket) {
                        this.socket.destroy();
                    }
                }
                else {
                    this.emit('connectionError', new Error(error.message));
                }
            }
            this.disconnectInternal();
            setTimeout(() => {
                this.emit('reconnect');
                this.connect();
            }, 5000);
        };
        this.onReadData = (data) => {
            switch (this.state) {
                case 'nonce': {
                    const payload = this.prepareDevicePublicKey(data);
                    if (this.socket) {
                        this.socket.write(this.serverKey.encrypt(payload));
                    }
                    this.state = 'set-session-key';
                    break;
                }
                case 'set-session-key': {
                    const cipherText = data.slice(0, 128);
                    const signedHMAC = data.slice(128);
                    const sessionKey = this.privateKey.decrypt(cipherText);
                    // Server creates a 20-byte HMAC of the ciphertext using SHA1 and the 40
                    // bytes generated in the previous step as the HMAC key.
                    const hash = CryptoManager_1.default.createHmacDigest(cipherText, sessionKey);
                    const decryptedHMAC = this.serverKey.decryptPublic(signedHMAC);
                    if (hash.compare(decryptedHMAC) === -1) {
                        throw new Error('HMAC did not match');
                    }
                    // The random session key has everything we need to create the crypto
                    // streams
                    const key = sessionKey.slice(0, 16);
                    const iv = sessionKey.slice(16, 32);
                    // const salt = sessionKey.slice(32); // not sure what this is for...
                    this.messageID = (sessionKey[32] << 8) | sessionKey[33];
                    // Create the crypto streams
                    this.decipherStream = new CryptoStream_1.default({
                        iv,
                        key,
                        streamType: 'decrypt'
                    });
                    this.cipherStream = new CryptoStream_1.default({
                        iv,
                        key,
                        streamType: 'encrypt'
                    });
                    const chunkingIn = new ChunkingStream_1.default({ outgoing: false });
                    const chunkingOut = new ChunkingStream_1.default({ outgoing: true });
                    // What I receive gets broken into message chunks, and goes into the
                    // decrypter
                    this.socket.pipe(chunkingIn).pipe(this.decipherStream);
                    // What I send goes into the encrypter, and then gets broken into message
                    // chunks
                    this.cipherStream.pipe(chunkingOut).pipe(this.socket);
                    this.socket.removeListener('data', this.onReadData);
                    this.decipherStream.on('data', this.onNewCoapMessage);
                    // send also for udp
                    this.finalizeHandshake();
                    break;
                }
                default: {
                    this.emit('error', new Error('Handshake error'));
                }
            }
        };
        this.finalizeHandshake = async () => {
            var e_1, _a;
            this.sendHello();
            if (this.forceTcp) {
                this.helloTimeout = setTimeout(() => this.reconnect(new Error('Did not get hello response in 2 seconds')), 2000);
            }
            this.state = 'next';
            // Ping every 15 or 30 seconds
            this.pingInterval = setInterval(() => this.pingServer(), this.keepalive);
            this.isConnected = true;
            this.emit('connected');
            this.sendDescribe(DESCRIBE_ALL);
            this.subscribe('trackle', this.handleSystemEvent);
            try {
                for (var _b = __asyncValues(this.subscriptionsMap.entries()), _c; _c = await _b.next(), !_c.done;) {
                    const sub = _c.value;
                    this.sendSubscribe(sub[0], sub[1][0], sub[1][1], sub[1][2]);
                }
            }
            catch (e_1_1) { e_1 = { error: e_1_1 }; }
            finally {
                try {
                    if (_c && !_c.done && (_a = _b.return)) await _a.call(_b);
                }
                finally { if (e_1) throw e_1.error; }
            }
            // send getTime
            this.sendTimeRequest();
            // claimCode
            if (this.claimCode &&
                this.claimCode.length > 0 &&
                this.claimCode.length < 70) {
                this.publish('trackle/device/claim/code', this.claimCode, 'PRIVATE');
            }
            this.publish('trackle/hardware/ota_chunk_size', CHUNK_SIZE.toString(), 'PRIVATE');
            if (this.otaUpdateEnabled) {
                this.publish('trackle/device/updates/enabled', 'true', 'PRIVATE');
            }
            else {
                this.publish('trackle/device/updates/enabled', 'false', 'PRIVATE');
            }
            if (this.otaUpdateForced) {
                this.publish('trackle/device/updates/forced', 'true', 'PRIVATE');
            }
            else {
                this.publish('trackle/device/updates/forced', 'false', 'PRIVATE');
            }
        };
        this.handleSystemEvent = async (eventName, data) => {
            switch (eventName) {
                case 'trackle/device/reset':
                    switch (data) {
                        case 'dfu':
                            this.emit('dfu');
                            break;
                        case 'safe mode':
                            this.emit('safemode');
                            break;
                        case 'reboot':
                            this.emit('reboot');
                            break;
                    }
                    break;
                case 'trackle/device/updates/forced':
                    const newUpdateForcedData = data === 'true';
                    if (this.otaUpdateForced !== newUpdateForcedData) {
                        this.otaUpdateForced = newUpdateForcedData;
                        this.emit('firmwareUpdateForced', newUpdateForcedData);
                        this.publish('trackle/device/updates/forced', newUpdateForcedData.toString(), 'PRIVATE');
                    }
                    break;
                case 'trackle/device/updates/pending':
                    const newUpdatePendingData = data === 'true';
                    if (this.otaUpdatePending !== newUpdatePendingData) {
                        this.otaUpdatePending = newUpdatePendingData;
                        if (newUpdatePendingData) {
                            // true
                            this.emit('firmwareUpdatePending');
                            this.publish('trackle/device/updates/pending', '', 'PRIVATE');
                        }
                    }
                    break;
                case 'trackle/device/owners':
                    this.owners = data.split(',');
                    break;
                case 'trackle/device/update':
                    if (!this.otaUpdateEnabled && !this.otaUpdateForced) {
                        this.publish('trackle/device/ota_result', 'Updates are not enabled', 'PRIVATE');
                        this.emit('error', new Error('Updates are not enabled'));
                        return;
                    }
                    try {
                        const { crc, url } = JSON.parse(data);
                        const fileURL = new url_1.URL(url);
                        const protocol = fileURL.protocol === 'https:' ? https_1.default : http_1.default;
                        const fileBuffer = await new Promise((resolve, reject) => {
                            protocol
                                .get(url, res => {
                                const fileData = [];
                                res
                                    .on('data', chunk => {
                                    fileData.push(chunk);
                                })
                                    .on('end', () => {
                                    const bufferInt = Buffer.concat(fileData);
                                    resolve(bufferInt);
                                });
                            })
                                .on('error', err => {
                                reject(err);
                            });
                        });
                        const filename = url.substring(url.lastIndexOf('/') + 1);
                        // check if the firmware is the one defined in Cloud
                        if (!filename || !filename.endsWith('.bin')) {
                            throw new Error('Firmware validation failed: not a bin file');
                        }
                        // check if the firmware is the one defined in Cloud
                        if (crc && buffer_crc32_1.default(fileBuffer).toString('hex') !== crc) {
                            throw new Error('Firmware validation failed: crc not valid');
                        }
                        this.emit('otaRequest', {
                            fileContentBuffer: fileBuffer,
                            fileSize: fileBuffer.length
                        });
                    }
                    catch (err) {
                        this.publish('trackle/device/ota_result', err.message, 'PRIVATE');
                        this.emit('error', err);
                    }
                    break;
                case 'trackle/device/pin_code':
                    this.emit('pinCode', data);
                    break;
            }
        };
        this.onNewCoapMessage = async (data) => {
            const packet = coap_packet_1.default.parse(data);
            if (packet.ack) {
                this.emit('COMPLETE', packet);
            }
            if (packet.code === '0.00' && packet.ack) {
                this.emit('ACK', packet);
            }
            if (packet.code === '0.00' && packet.confirmable) {
                this.emit('ping');
                this.sendPingAck(packet);
            }
            if (packet.code === '4.00' && packet.ack) {
                this.emit('error', new Error(packet.payload.toString('utf8')));
            }
            if (packet.code === '5.00' && packet.ack) {
                this.emit('error', new Error('server error'));
            }
            const uriOption = packet.options.find(option => option.name === 'Uri-Path');
            if (!uriOption) {
                return;
            }
            const coapPath = uriOption.value.toString('utf8');
            const messageType = coapPath.substring(0, coapPath.indexOf('/')) || coapPath;
            switch (messageType) {
                case CoapUriType_1.default.GetTime: {
                    this.emit('time', parseInt(packet.payload.toString('hex'), 16));
                    break;
                }
                case CoapUriType_1.default.Describe: {
                    const uriQuery = packet.options.find(option => option.name === 'Uri-Query');
                    const descriptionFlags = parseInt(uriQuery.value.toString('hex'), 16);
                    if (descriptionFlags === DESCRIBE_ALL ||
                        descriptionFlags === DESCRIBE_METRICS) {
                        this.sendDescribe(descriptionFlags, packet);
                    }
                    else {
                        this.emit('error', new Error(`Invalid DESCRIBE flags ${descriptionFlags}`));
                    }
                    break;
                }
                case CoapUriType_1.default.Function: {
                    const uris = packet.options
                        .filter(o => o.name === 'Uri-Path')
                        .map(o => o.value.toString('utf8'));
                    uris.shift(); // Remove f
                    const functionName = uris.join('/');
                    const args = packet.options
                        .filter(o => o.name === 'Uri-Query')
                        .map(o => o.value.toString('utf8'));
                    this.sendFunctionResult(functionName, args[0], args[1], packet);
                    break;
                }
                case CoapUriType_1.default.Hello: {
                    clearTimeout(this.helloTimeout);
                    this.helloTimeout = null;
                    break;
                }
                case CoapUriType_1.default.PrivateEvent:
                case CoapUriType_1.default.PublicEvent: {
                    const uris = packet.options
                        .filter(o => o.name === 'Uri-Path')
                        .map(o => o.value.toString('utf8'));
                    uris.shift(); // Remove E or e
                    this.emitWithPrefix(uris.join('/'), packet);
                    break;
                }
                case CoapUriType_1.default.Variable: {
                    const uris = packet.options
                        .filter(o => o.name === 'Uri-Path')
                        .map(o => o.value.toString('utf8'));
                    uris.shift(); // Remove v
                    const varName = uris.join('/');
                    const args = packet.options
                        .filter(o => o.name === 'Uri-Query')
                        .map(o => o.value.toString('utf8'));
                    this.sendVariable(varName, args[0], packet);
                    break;
                }
                case CoapUriType_1.default.UpdateBegin:
                case CoapUriType_1.default.UpdateDone:
                case CoapUriType_1.default.UpdateReady: {
                    if (packet.code === '0.02') {
                        this.receiveFile(packet);
                    }
                    else if (packet.code === '0.03') {
                        this.emit('UpdateDone', packet);
                    }
                    else if (packet.code === '2.04') {
                        this.emit('UpdateReady', packet);
                    }
                    break;
                }
                case CoapUriType_1.default.Chunk: {
                    this.emit('Chunk', packet);
                    break;
                }
                case CoapUriType_1.default.FileRequest: {
                    const uris = packet.options
                        .filter(o => o.name === 'Uri-Path')
                        .map(o => o.value.toString('utf8'));
                    uris.shift(); // Remove g
                    const fileName = uris.join('/');
                    this.sendFile(fileName, packet);
                    break;
                }
                case CoapUriType_1.default.SignalStart: {
                    const args = packet.options
                        .filter(o => o.name === 'Uri-Query')
                        .map(o => o.value.toString('hex'));
                    this.emit('signal', parseInt(args[0], 16) === 1);
                    this.sendSignalStartReturn(packet);
                    break;
                }
                case CoapUriType_1.default.UpdateProperty: {
                    const uris = packet.options
                        .filter(o => o.name === 'Uri-Path')
                        .map(o => o.value.toString('utf8'));
                    uris.shift(); // Remove p
                    const propName = uris.join('/');
                    const args = packet.options
                        .filter(o => o.name === 'Uri-Query')
                        .map(o => o.value.toString('utf8'));
                    this.sendUpdatePropResult(propName, args[0], args[1], packet);
                    break;
                }
                default: {
                    this.emit('error', new Error(`Coap URI ${coapPath} is not supported: ${packet}`));
                }
            }
        };
        this.prepareDevicePublicKey = (nonce) => 
        // Concat a bunch of data that we will send over encrypted with the
        // server public key.
        Buffer.concat([
            nonce,
            this.deviceID,
            this.privateKey.exportKey('pkcs8-public-der')
        ]);
        this.nextMessageID = () => {
            this.messageID += 1;
            if (this.messageID >= COUNTER_MAX) {
                this.messageID = 0;
            }
            return this.messageID;
        };
        this.sendHello = () => {
            const data = [
                this.productID >> 8,
                this.productID & 0xff,
                this.productFirmwareVersion >> 8,
                this.productFirmwareVersion & 0xff,
                0,
                0,
                this.platformID >> 8,
                this.platformID & 0xff,
                this.deviceID.length >> 8,
                this.deviceID.length & 0xff
            ];
            this.deviceID.forEach(bit => data.push(bit));
            const packet = {
                code: 'POST',
                messageId: this.nextMessageID(),
                options: [
                    {
                        name: 'Uri-Path',
                        value: Buffer.from(CoapUriType_1.default.Hello)
                    }
                ],
                payload: Buffer.from(data)
            };
            this.writeCoapData(packet);
        };
        this.sendTimeRequest = () => {
            const packet = {
                // ack: false,
                code: 'GET',
                confirmable: true,
                messageId: this.nextMessageID(),
                options: [
                    {
                        name: 'Uri-Path',
                        value: Buffer.from(CoapUriType_1.default.GetTime)
                    }
                ]
            };
            this.writeCoapData(packet);
        };
        this.sendDescribe = (descriptionFlags, serverPacket) => {
            const payload = descriptionFlags === DESCRIBE_ALL
                ? this.getDescription()
                : this.getDiagnostic();
            const packet = {
                ack: serverPacket ? true : false,
                code: serverPacket ? '2.05' : '0.02',
                confirmable: !serverPacket ? true : false,
                messageId: serverPacket ? this.messageID : this.nextMessageID(),
                options: !serverPacket
                    ? [
                        { name: 'Uri-Path', value: Buffer.from(CoapUriType_1.default.Describe) },
                        {
                            name: 'Uri-Query',
                            value: CoapMessages_1.default.toBinary(DESCRIBE_ALL, 'uint8')
                        }
                    ]
                    : undefined,
                payload,
                token: serverPacket ? serverPacket.token : undefined
            };
            this.writeCoapData(packet);
        };
        this.sendSignalStartReturn = async (serverPacket) => {
            const packet = {
                ack: true,
                code: '2.04',
                messageId: this.nextMessageID(),
                token: serverPacket.token
            };
            this.writeCoapData(packet);
        };
        this.sendPingAck = async (serverPacket) => {
            const packet = {
                ack: true,
                code: '0.00',
                messageId: serverPacket.messageId
            };
            this.writeCoapData(packet);
        };
        this.receiveFile = async (packet) => {
            // 1- get file info
            let chunksSize = packet.payload.readUInt16BE(1);
            if (!chunksSize || chunksSize === 0) {
                chunksSize = CHUNK_SIZE;
            }
            const fileSize = packet.payload.readInt32BE(3);
            const fileNameLength = packet.payload[12];
            const fileName = packet.payload.toString('utf8', 13, 13 + fileNameLength);
            /******************************/
            /* if (
              packet.payload.length === 12 &&
              !this.otaUpdateEnabled &&
              !this.otaUpdateForced
            ) {
              // Send ack with Service Unavailable
              const ackPacket = {
                ack: true,
                code: '5.03', // Service Unavailable
                messageId: this.messageID,
                token: packet.token
              };
              this.writeCoapData(ackPacket);
              this.emit('error', new Error(`Updates are not enabled`));
              return;
            } */
            if ( /* packet.payload.length === 12 ||*/this.filesMap.has(fileName)) {
                // 2- listen Chunk packet and fill fileContentBuffer
                const fileContentBuffer = Buffer.allocUnsafe(fileSize);
                const chunksNumber = Math.floor((fileSize + chunksSize - 1) / chunksSize);
                let chunksCounter = 0;
                const chunkMissedArray = [];
                const chunkHandler = (chunkPacket) => {
                    const chunkPacketOption = chunkPacket.options.filter((option) => option.name === 'Uri-Query');
                    const chunkCrc = chunkPacketOption[0].value.readUInt32BE(0);
                    const lastCrc = buffer_crc32_1.default.unsigned(chunkPacket.payload);
                    const chunkNumber = chunkPacketOption[1].value.readUInt16BE(0);
                    if (chunkCrc === lastCrc) {
                        chunksCounter += 1;
                        let chunkLength = chunksSize;
                        if (fileSize - chunksSize * chunkNumber < chunksSize) {
                            chunkLength = fileSize - chunksSize * chunkNumber;
                        }
                        chunkPacket.payload.copy(fileContentBuffer, chunksSize * chunkNumber, 0, chunkLength);
                    }
                    else {
                        // in fast OTA send only 1 ChunkMissed with messageIds array
                        chunkMissedArray.push(chunkNumber);
                    }
                    if (chunksNumber === chunksCounter) {
                        this.removeListener('Chunk', chunkHandler);
                        // if (fileName && this.filesMap.has(fileName)) {
                        this.emit('fileReceived', {
                            fileContentBuffer,
                            fileName,
                            fileSize
                        });
                        /*}  else {
                          this.emit('otaFinished');
                          // check if is a valid OTA firmware file
                          try {
                            const fileBuffer = this.validateFirmwareFile(fileContentBuffer);
                            this.emit('otaRequest', {
                              fileContentBuffer: fileBuffer,
                              fileSize
                            });
                          } catch (err) {
                            this.publish('trackle/device/ota_result', err.message, 'PRIVATE');
                            this.emit('error', err);
                          }
                        } */
                    }
                };
                this.on('Chunk', chunkHandler);
                /******************************/
                // 3- send UpdateReady packet in order to start receiving chunks
                const responsePacket = {
                    code: '2.04',
                    confirmable: false,
                    messageId: this.nextMessageID(),
                    payload: Buffer.from(CoapUriType_1.default.UpdateReady),
                    token: packet.token
                };
                this.writeCoapData(responsePacket);
                /******************************/
                // 4- wait for UpdateDone packet
                const updateDoneHandler = (updateDonePacket) => {
                    if (chunksNumber !== chunksCounter && chunkMissedArray.length > 0) {
                        // send UpdateDoneAckError
                        const updateDoneAckErrorPacket = {
                            ack: true,
                            code: '4.00',
                            confirmable: false,
                            messageId: this.nextMessageID(),
                            token: updateDonePacket.token
                        };
                        this.writeCoapData(updateDoneAckErrorPacket);
                        // in fast OTA send only 1 ChunkMissed with messageIds array
                        const chunkMissedBuffer = Buffer.allocUnsafe(2 * chunkMissedArray.length);
                        for (let i = 0; i < chunkMissedArray.length; i += 1) {
                            chunkMissedBuffer.writeUInt16BE(chunkMissedArray[i], i * 2);
                        }
                        const chunkMissedPacket = {
                            code: 'GET',
                            confirmable: true,
                            messageId: this.nextMessageID(),
                            options: [
                                { name: 'Uri-Path', value: Buffer.from(CoapUriType_1.default.Chunk) }
                            ],
                            payload: chunkMissedBuffer
                        };
                        this.writeCoapData(chunkMissedPacket);
                        // wait for server retries in sending chunks
                        setTimeout(() => {
                            this.removeListener('Chunk', chunkHandler);
                            this.removeListener('UpdateDone', updateDoneHandler);
                        }, 9000);
                    }
                    else {
                        // send UpdateDoneAck
                        const updateDoneAckPacket = {
                            ack: true,
                            code: '2.04',
                            confirmable: false,
                            messageId: this.nextMessageID(),
                            token: updateDonePacket.token
                        };
                        this.writeCoapData(updateDoneAckPacket);
                        this.removeListener('UpdateDone', updateDoneHandler);
                    }
                };
                this.on('UpdateDone', updateDoneHandler);
                /******************************/
            }
            else {
                // send UpdateAbort packet
                const responsePacket = {
                    code: '4',
                    confirmable: false,
                    messageId: this.nextMessageID(),
                    payload: Buffer.from('26'),
                    token: packet.token
                };
                this.writeCoapData(responsePacket);
                this.emit('error', new Error(`File ${fileName} not found`));
            }
        };
        /* private validateFirmwareFile = (fileContentBuffer: Buffer): Buffer => {
          const fileContentBufferWithoutCrc = fileContentBuffer.slice(
            0,
            fileContentBuffer.length - 4
          );
          const fileContentBufferCrc = fileContentBuffer
            .slice(fileContentBuffer.length - 4, fileContentBuffer.length)
            .toString('hex');
          if (
            crc32(fileContentBufferWithoutCrc).toString('hex') !==
            fileContentBufferCrc
          ) {
            throw new Error('Firmware validation failed: crc not valid');
          }
          return fileContentBuffer.slice(24, fileContentBuffer.length - 44);
        };*/
        this.sendFile = async (fileName, serverPacket) => {
            if (!this.isConnected) {
                return;
            }
            if (this.filesMap.has(fileName)) {
                const [, receiveFileCallback] = this.filesMap.get(fileName);
                let fileBuffer;
                try {
                    fileBuffer = await receiveFileCallback(fileName);
                    if (!fileBuffer || fileBuffer.length === 0) {
                        this.emit('error', new Error('File content error'));
                        return; // error
                    }
                    // 1- Send FileReturn to server
                    const packet = {
                        code: '2.04',
                        messageId: this.nextMessageID(),
                        payload: CoapMessages_1.default.toBinary(1, 'uint8'),
                        token: serverPacket.token
                    };
                    this.writeCoapData(packet);
                    /******************************/
                }
                catch (err) {
                    if (fileBuffer) {
                        this.messageID -= 1;
                    }
                    this.writeError(serverPacket, err.message, err.status || '5.00');
                    this.emit('error', new Error(err.message));
                }
                // 2- Prepare and send UpdateBegin packet
                const flags = 1; // fast ota available
                const chunkSize = CHUNK_SIZE;
                const fileSize = fileBuffer.length;
                const destFlag = 128;
                const destAddr = 0;
                const payloadArray = [
                    CoapMessages_1.default.toBinary(flags, 'uint8'),
                    CoapMessages_1.default.toBinary(chunkSize, 'uint16'),
                    CoapMessages_1.default.toBinary(fileSize, 'uint32'),
                    CoapMessages_1.default.toBinary(destFlag, 'uint8'),
                    CoapMessages_1.default.toBinary(destAddr, 'uint32')
                ];
                // add filename optional payloads for sending file
                if (fileName && fileName.length > 0) {
                    payloadArray.push(CoapMessages_1.default.toBinary(fileName.length, 'uint8'));
                    payloadArray.push(CoapMessages_1.default.toBinary(fileName, 'string'));
                }
                const packetBegin = {
                    code: 'POST',
                    confirmable: true,
                    messageId: this.nextMessageID(),
                    options: [
                        {
                            name: 'Uri-Path',
                            value: Buffer.from(CoapUriType_1.default.UpdateBegin)
                        }
                    ],
                    payload: Buffer.concat(payloadArray)
                };
                this.writeCoapData(packetBegin);
                /******************************/
                // 3- Wait for UpdateReady and send chunked buffer
                const updateReadyMessage = await this.listenFor('UpdateReady');
                if (updateReadyMessage) {
                    // generate buffer chunks
                    const bufferChunks = [];
                    let i = 0;
                    while (i < fileSize) {
                        const buffer = fileBuffer.slice(i, (i += chunkSize));
                        bufferChunks.push(buffer);
                    }
                    // send each chunk
                    let chunkIndex;
                    for (chunkIndex = 0; chunkIndex < bufferChunks.length; chunkIndex += 1) {
                        const buffer = Buffer.alloc(chunkSize);
                        bufferChunks[chunkIndex].copy(buffer, 0, 0, bufferChunks[chunkIndex].length);
                        buffer.fill(0, bufferChunks[chunkIndex].length, chunkSize);
                        const lastCrc = bufferChunks[chunkIndex]
                            ? buffer_crc32_1.default.unsigned(bufferChunks[chunkIndex])
                            : null;
                        // send
                        const options = [
                            {
                                name: 'Uri-Path',
                                value: Buffer.from(CoapUriType_1.default.Chunk)
                            },
                            {
                                name: 'Uri-Query',
                                value: CoapMessages_1.default.toBinary(lastCrc, 'crc')
                            },
                            {
                                name: 'Uri-Query',
                                value: CoapMessages_1.default.toBinary(chunkIndex, 'uint16')
                            }
                        ];
                        const chunkPacket = {
                            code: 'POST',
                            confirmable: true,
                            messageId: this.nextMessageID(),
                            options,
                            payload: buffer
                        };
                        this.writeCoapData(chunkPacket);
                    }
                    /******************************/
                    // 4- send UpdateDone packet
                    const packetDone = {
                        code: 'PUT',
                        confirmable: true,
                        messageId: this.nextMessageID(),
                        options: [
                            {
                                name: 'Uri-Path',
                                value: Buffer.from(CoapUriType_1.default.UpdateDone)
                            }
                        ]
                    };
                    this.writeCoapData(packetDone);
                    /******************************/
                    this.emit('fileSent', fileName);
                }
            }
            else {
                this.writeError(serverPacket, `File ${fileName} not found`, '4.04');
                this.emit('error', new Error(`File ${fileName} not found`));
            }
        };
        this.listenFor = async (eventName, token, messageId, timeoutMs) => {
            const tokenHex = token ? Buffer.from([token]).toString('hex') : null;
            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    cleanUpListeners();
                    reject(new Error(`Request timed out ${eventName}`));
                }, timeoutMs || this.keepalive * 2);
                // adds a one time event
                const handler = (packet) => {
                    clearTimeout(timeout);
                    const packetTokenHex = packet.token.toString('hex');
                    if (tokenHex && tokenHex !== packetTokenHex) {
                        // 'Tokens did not match'
                        return;
                    }
                    if (messageId &&
                        (messageId !== packet.messageId || parseFloat(packet.code) >= 4)) {
                        return;
                    }
                    cleanUpListeners();
                    resolve(packet);
                };
                const disconnectHandler = () => {
                    cleanUpListeners();
                    reject();
                };
                const cleanUpListeners = () => {
                    this.removeListener(eventName, handler);
                    this.removeListener('disconnect', disconnectHandler);
                };
                this.on(eventName, handler);
                this.on('disconnect', disconnectHandler);
            });
        };
        this.pingServer = () => {
            if (!this.isConnected) {
                return;
            }
            if (!this.forceTcp) {
                this.socket.dumbPing();
                return;
            }
            const packet = {
                code: '0',
                confirmable: true,
                messageId: this.nextMessageID()
            };
            this.writeCoapData(packet);
        };
        this.writeError = (serverPacket, message, responseCode) => {
            const packet = {
                ack: true,
                code: responseCode,
                confirmable: false,
                messageId: serverPacket.messageId,
                payload: Buffer.from(message)
            };
            this.writeCoapData(packet);
        };
        this.sendFunctionResult = async (functionName, args, caller, serverPacket) => {
            if (!this.isConnected) {
                return;
            }
            if (args.length > 622) {
                this.writeError(serverPacket, 'Args max length is 622 bytes', '4.00');
                this.emit('error', new Error('Args max length is 622 bytes'));
                return;
            }
            if (this.functionsMap.has(functionName)) {
                const [functionFlags, callFunctionCallback] = this.functionsMap.get(functionName);
                if (functionFlags === 'OWNER_ONLY' &&
                    (!this.owners || !this.owners.includes(caller))) {
                    this.writeError(serverPacket, 'Forbidden: only owners can call this function', '4.03');
                    this.emit('error', new Error('Forbidden'));
                    return;
                }
                let returnValue;
                try {
                    returnValue = await callFunctionCallback(args, caller);
                    const packet = {
                        code: '2.04',
                        messageId: this.nextMessageID(),
                        payload: CoapMessages_1.default.toBinary(returnValue, 'int32'),
                        token: serverPacket.token
                    };
                    this.writeCoapData(packet);
                }
                catch (err) {
                    if (returnValue) {
                        this.messageID -= 1;
                    }
                    this.writeError(serverPacket, err.message, err.status || '5.00');
                    this.emit('error', new Error(err.message));
                }
            }
            else {
                this.writeError(serverPacket, `Function ${functionName} not found`, '4.04');
                this.emit('error', new Error(`Function ${functionName} not found`));
            }
        };
        this.sendVariable = async (varName, args, serverPacket) => {
            if (!this.isConnected) {
                return;
            }
            let hasName = varName;
            if (varName.indexOf('/') >= -1) {
                hasName = varName.split('/')[0];
            }
            if (this.variablesMap.has(hasName)) {
                const [type, retrieveValueCallback] = this.variablesMap.get(hasName);
                let variableValue;
                try {
                    variableValue = await retrieveValueCallback(args);
                    if ((type === 'string' || type === 'json') &&
                        JSON.stringify(variableValue).length > 622) {
                        this.writeError(serverPacket, 'Value max length is 622 bytes', '5.00');
                        this.emit('error', new Error('Value max length is 622 bytes'));
                        return;
                    }
                    const packet = {
                        code: '2.05',
                        messageId: this.nextMessageID(),
                        payload: CoapMessages_1.default.toBinary(variableValue, type),
                        token: serverPacket.token
                    };
                    this.writeCoapData(packet);
                }
                catch (err) {
                    if (variableValue) {
                        this.messageID -= 1;
                    }
                    this.writeError(serverPacket, err.message, err.status || '5.00');
                    this.emit('error', new Error(err.message));
                }
            }
            else {
                this.writeError(serverPacket, `Variable ${varName} not found`, '4.04');
                this.emit('error', new Error(`Variable ${varName} not found`));
            }
        };
        this.sendUpdatePropResult = async (property, value, caller, serverPacket) => {
            if (!this.isConnected) {
                return;
            }
            if (value.length > 622) {
                this.writeError(serverPacket, 'Args max length is 622 bytes', '4.00');
                this.emit('error', new Error('Args max length is 622 bytes'));
                return;
            }
            if (this.updatePropertiesCallback) {
                let returnValue;
                try {
                    returnValue = await this.updatePropertiesCallback(property, value, caller);
                    const packet = {
                        code: '2.04',
                        messageId: this.nextMessageID(),
                        payload: CoapMessages_1.default.toBinary(returnValue, 'int32'),
                        token: serverPacket.token
                    };
                    this.writeCoapData(packet);
                }
                catch (err) {
                    if (returnValue) {
                        this.messageID -= 1;
                    }
                    this.writeError(serverPacket, err.message, err.status || '5.00');
                    this.emit('error', new Error(err.message));
                }
            }
            else {
                this.writeError(serverPacket, 'setUpdatePropertiesCallback not defined', '5.00');
                this.emit('error', new Error('setUpdatePropertiesCallback not defined'));
            }
        };
        this.writeCoapData = (packet) => {
            if (packet.confirmable) {
                let sentPacketCounter = this.sentPacketCounterMap.get(packet.messageId);
                if (!sentPacketCounter) {
                    sentPacketCounter = 1;
                }
                else {
                    sentPacketCounter += 1;
                }
                if (sentPacketCounter <= 3) {
                    this.sentPacketCounterMap.set(packet.messageId, sentPacketCounter);
                    this.listenFor('COMPLETE', null, packet.messageId, 4000 * Math.pow(2, sentPacketCounter - 1)).catch(() => {
                        if (this.isConnected) {
                            this.writeCoapData(packet);
                        }
                    });
                }
                else {
                    this.reconnect(new Error('complete timeout for packet sent'));
                }
            }
            const packetBuffer = coap_packet_1.default.generate(packet);
            return this.writeData(packetBuffer);
        };
        this.writeData = (packet) => {
            try {
                if (this.socket) {
                    return this.cipherStream.write(packet);
                }
                return false;
            }
            catch (ignore) {
                this.emit('error', new Error(`Write data error: ${ignore}`));
                return false;
            }
        };
        this.sendEvent = (name, data = null, nextMessageID, confirmable, eventType) => {
            if (!this.isConnected) {
                return false;
            }
            const payload = data ? Buffer.from(data) : undefined;
            const packet = {
                code: 'POST',
                confirmable,
                messageId: nextMessageID,
                options: [
                    {
                        name: 'Uri-Path',
                        value: Buffer.from(`${eventType && eventType === 'PRIVATE'
                            ? CoapUriType_1.default.PrivateEvent
                            : CoapUriType_1.default.PublicEvent}/${name}`)
                    }
                ],
                payload
            };
            return this.writeCoapData(packet);
        };
        this.filesMap = new Map();
        this.functionsMap = new Map();
        this.subscriptionsMap = new Map();
        this.variablesMap = new Map();
        this.cloud = cloudOptions;
    }
}
exports.default = new Trackle();
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiVHJhY2tsZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9jbGllbnQvVHJhY2tsZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7O0FBQUEsZ0VBQWlDO0FBQ2pDLDhEQUFxQztBQUNyQyw4Q0FBc0I7QUFFdEIsbUNBQXNDO0FBQ3RDLGdEQUF3QjtBQUN4QixrREFBMEI7QUFDMUIsNkJBQTZCO0FBQzdCLGtGQUF5QztBQUV6Qyw0Q0FBb0I7QUFDcEIsNkJBQTBCO0FBRTFCLDJFQUFtRDtBQUNuRCx1RUFBK0M7QUFDL0MseUVBQWlEO0FBQ2pELHVFQUErQztBQUMvQyx1RUFBK0M7QUFFL0MsTUFBTSxXQUFXLEdBQUcsS0FBSyxDQUFDO0FBQzFCLE1BQU0scUJBQXFCLEdBQUcsRUFBRSxDQUFDO0FBQ2pDLE1BQU0sZ0JBQWdCLEdBQUcsQ0FBQyxDQUFDO0FBQzNCLE1BQU0sb0JBQW9CLEdBQUcsRUFBRSxDQUFDO0FBQ2hDLE1BQU0sb0JBQW9CLEdBQUcsRUFBRSxDQUFDO0FBQ2hDLE1BQU0sd0JBQXdCLEdBQUcsQ0FBQyxDQUFDO0FBRW5DLE1BQU0sd0JBQXdCLEdBQUcsQ0FBQyxDQUFDO0FBQ25DLE1BQU0sY0FBYyxHQUFHLEtBQUssQ0FBQztBQUU3QixNQUFNLGdCQUFnQixHQUFHLENBQUMsSUFBSSxDQUFDLENBQUM7QUFDaEMsTUFBTSxvQkFBb0IsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDO0FBQ3BDLE1BQU0sZUFBZSxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUM7QUFDL0IsTUFBTSxZQUFZLEdBQUcsb0JBQW9CLEdBQUcsZUFBZSxDQUFDO0FBRTVELE1BQU0sVUFBVSxHQUFHLEdBQUcsQ0FBQztBQUV2QixNQUFNLHNCQUFzQixHQUFHLElBQUksQ0FBQztBQVFwQyxNQUFNLGlCQUFpQixHQUFHLG1CQUFtQixDQUFDO0FBQzlDLE1BQU0sb0JBQW9CLEdBQUc7Ozs7Ozs7OztHQVMxQixDQUFDO0FBRUos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