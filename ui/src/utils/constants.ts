export const API_CONFIG = {
    BASE_URL: process.env.VITE_API_URL || 'http://localhost:8000',
    TIMEOUT: 60000,
    MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  };
  
  export const AUDIO_CONFIG = {
    SUPPORTED_FORMATS: ['audio/wav', 'audio/mp3', 'audio/mpeg', 'audio/m4a'],
    DEFAULT_SAMPLE_RATE: 44100,
    DEFAULT_BIT_RATE: 128000,
  };
  
  export const UI_CONFIG = {
    MAX_TEXT_LENGTH: 50000,
    DEBOUNCE_DELAY: 300,
    ANIMATION_DURATION: 200,
  };