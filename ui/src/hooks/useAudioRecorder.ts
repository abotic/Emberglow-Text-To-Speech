import { useCallback, useEffect, useRef, useState } from 'react';
import { convertBlobToWav } from '../utils/audio';

type RecorderMime = 'audio/webm' | 'audio/mp4';

interface UseAudioRecorderReturn {
  isRecording: boolean;
  recordingTime: number;
  recordingUrl: string | null;
  start: () => Promise<void>;
  stop: () => void;
  reset: () => void;
  getWavFile: () => Promise<File | null>;
}

export const useAudioRecorder = (): UseAudioRecorderReturn => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const intervalRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const clearTimer = () => {
    if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const start = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { sampleRate: 44100, channelCount: 1, echoCancellation: true, noiseSuppression: true },
    });
    streamRef.current = stream;

    const mimeType: RecorderMime = (MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4');
    const recorder = new MediaRecorder(stream, { mimeType });

    mediaRecorderRef.current = recorder;
    chunksRef.current = [];
    setRecordingTime(0);

    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    recorder.onstop = async () => {
      const originalBlob = new Blob(chunksRef.current, { type: mimeType });
      const wavBlob = await convertBlobToWav(originalBlob);
      const url = URL.createObjectURL(wavBlob);
      setRecordingUrl(url);
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };

    intervalRef.current = window.setInterval(() => setRecordingTime((t) => t + 1), 1000);
    recorder.start();
    setIsRecording(true);
  }, []);

  const stop = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      clearTimer();
    }
  }, [isRecording]);

  const reset = useCallback(() => {
    if (recordingUrl) URL.revokeObjectURL(recordingUrl);
    setRecordingUrl(null);
    setRecordingTime(0);
    chunksRef.current = [];
  }, [recordingUrl]);

  const getWavFile = useCallback(async (): Promise<File | null> => {
    if (!chunksRef.current.length) return null;
    const mime = mediaRecorderRef.current?.mimeType || 'audio/webm';
    const originalBlob = new Blob(chunksRef.current, { type: mime });
    const wavBlob = await convertBlobToWav(originalBlob);
    return new File([wavBlob], 'recorded-voice.wav', { type: 'audio/wav' });
  }, []);

  useEffect(() => () => {
    clearTimer();
    if (recordingUrl) URL.revokeObjectURL(recordingUrl);
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
  }, [recordingUrl]);

  return { isRecording, recordingTime, recordingUrl, start, stop, reset, getWavFile };
};