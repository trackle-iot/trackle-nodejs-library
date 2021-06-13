/// <reference types="node" />
import { EventEmitter } from 'events';
declare type EventType = 'PRIVATE' | 'PUBLIC';
declare type EventFlags = 'WITH_ACK' | 'NO_ACK';
declare type FunctionFlags = 'OWNER_ONLY';
declare type SubscriptionType = 'ALL_DEVICES' | 'MY_DEVICES';
export interface ICloudOptions {
    address?: string;
    publicKeyPEM?: string;
    port?: number;
}
declare class Trackle extends EventEmitter {
    cloud: ICloudOptions;
    private cipherStream;
    private decipherStream;
    private deviceID;
    private forceTcp;
    private otaUpdateEnabled;
    private otaUpdatePending;
    private otaUpdateForced;
    private helloTimeout;
    private host;
    private isInitialized;
    private isConnected;
    private isConnecting;
    private isDisconnected;
    private messageID;
    private owners;
    private pingInterval;
    private platformID;
    private productFirmwareVersion;
    private productID;
    private port;
    private privateKey;
    private serverKey;
    private socket;
    private state;
    private filesMap;
    private functionsMap;
    private subscriptionsMap;
    private variablesMap;
    private sentPacketCounterMap;
    private wasOtaUpgradeSuccessful;
    private keepalive;
    private claimCode;
    constructor(cloudOptions?: ICloudOptions);
    forceTcpProtocol: () => boolean;
    begin: (deviceID: string, privateKeyPEM: string, productID?: number, productFirmwareVersion?: number, platformID?: number) => Promise<void>;
    connect: () => Promise<void>;
    connected: () => boolean;
    setKeepalive: (keepalive: number) => void;
    setClaimCode: (claimCode: string) => void;
    file: (fileName: string, mimeType: string, retrieveFileCallback: (fileName: string) => Promise<Buffer>) => void;
    post: (name: string, callFunctionCallback: (args: string) => number | Promise<number>, functionFlags?: FunctionFlags) => boolean;
    get: (name: string, type: string, retrieveValueCallback: (varName: string) => any | Promise<any>) => boolean;
    disconnect: () => void;
    subscribe: (eventName: string, callback: (event: string, data: string) => void, subscriptionType?: SubscriptionType) => boolean;
    unsubscribe: (eventName: string) => void;
    publish: (eventName: string, data?: string, eventType?: EventType, eventFlags?: EventFlags, messageID?: string) => Promise<void>;
    enableUpdates: () => void;
    disableUpdates: () => void;
    updatesEnabled: () => boolean;
    updatesPending: () => boolean;
    private getDiagnostic;
    private getDescription;
    private resolvePromise;
    private emitWithPrefix;
    private sendSubscribe;
    private disconnectInternal;
    private reconnect;
    private onReadData;
    private finalizeHandshake;
    private handleSystemEvent;
    private onNewCoapMessage;
    private prepareDevicePublicKey;
    private nextMessageID;
    private sendHello;
    private sendTimeRequest;
    private sendDescribe;
    private sendSignalStartReturn;
    private sendPingAck;
    private receiveFile;
    private validateFirmwareFile;
    private sendFile;
    private listenFor;
    private pingServer;
    private writeError;
    private sendFunctionResult;
    private sendVariable;
    private writeCoapData;
    private writeData;
    private sendEvent;
}
declare const _default: Trackle;
export default _default;