declare module 'react-native-udp' {
  type SocketType = 'udp4' | 'udp6';

  type MessageHandler = (message: any, remoteInfo: {address?: string; port?: number}) => void;
  type ErrorHandler = (error: Error) => void;
  type ListeningHandler = () => void;

  interface SocketLike {
    bind: (port: number, callback?: ListeningHandler) => void;
    close: () => void;
    send: (
      buffer: any,
      offset: number,
      length: number,
      port: number,
      address: string,
      callback?: () => void,
    ) => void;
    setBroadcast: (enabled: boolean) => void;
    on(event: 'message', handler: MessageHandler): void;
    on(event: 'error', handler: ErrorHandler): void;
    on(event: 'listening', handler: ListeningHandler): void;
  }

  const dgram: {
    createSocket: (options: {type: SocketType}) => SocketLike;
  };

  export default dgram;
}
