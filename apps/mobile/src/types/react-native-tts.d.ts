declare module 'react-native-tts' {
  export interface TtsModule {
    getInitStatus(): Promise<void>;
    setDefaultLanguage(language: string): Promise<void>;
    setDefaultRate(rate: number): void;
    setDefaultPitch(pitch: number): void;
    stop(): Promise<void>;
    speak(text: string): void;
  }

  const Tts: TtsModule;
  export default Tts;
}
