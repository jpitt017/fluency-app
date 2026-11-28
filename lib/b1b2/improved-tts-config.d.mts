export declare const DAILY_TTS_LIMIT: 5;
export declare const IMPROVED_TTS_ENDPOINT: '/api/speaking/improved-tts';
export declare const ELEVEN_TTS_MODEL_ID: 'eleven_multilingual_v2';
export declare const B1_TTS_SPEED: number;
export declare const DEFAULT_APPROVED_BRITISH_VOICE_ID: string;
export declare const APPROVED_BRITISH_VOICE_IDS: readonly string[];
export declare const APPROVED_BRITISH_VOICES: Readonly<
  Record<
    string,
    Readonly<{
      voice: string;
      name: string;
      accent: string;
      settings: Readonly<{ stability?: number; style?: number; speed?: number }>;
    }>
  >
>;

export interface ResolvedBritishVoice {
  voiceId: string;
  name: string;
  accent: string;
  voiceSettings: {
    stability: number;
    similarity_boost: number;
    style: number;
    use_speaker_boost: boolean;
    speed: number;
  };
}

export declare function resolveApprovedBritishVoice(rawOverride?: string | null): ResolvedBritishVoice;
export declare function madridDayStartIso(now?: Date): string;
