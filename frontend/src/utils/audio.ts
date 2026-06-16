import { createSpeechAudioUrl } from '../api';

export type RecordingResult = {
  blob: Blob;
  mimeType: string;
};

let activePlayback: Promise<void> | null = null;

export const getSupportedRecordingMimeType = (): string => {
  if (typeof MediaRecorder === 'undefined') {
    return '';
  }

  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
  ];

  return candidates.find(type => MediaRecorder.isTypeSupported(type)) ?? '';
};

export const createMediaRecorder = async (): Promise<{
  recorder: MediaRecorder;
  stream: MediaStream;
  chunks: BlobPart[];
  mimeType: string;
}> => {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Audio recording is not supported in this browser.');
  }
  if (typeof MediaRecorder === 'undefined') {
    throw new Error('Audio recording is not supported in this browser.');
  }

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mimeType = getSupportedRecordingMimeType();
  const recorder = new MediaRecorder(
    stream,
    mimeType ? { mimeType } : undefined,
  );
  const chunks: BlobPart[] = [];

  recorder.ondataavailable = event => {
    if (event.data.size > 0) {
      chunks.push(event.data);
    }
  };

  return { recorder, stream, chunks, mimeType };
};

export const stopMediaStream = (stream: MediaStream | null) => {
  stream?.getTracks().forEach(track => track.stop());
};

export const playSpeech = async (
  text: string,
  options: { voice?: string; style?: string; model?: string; dialect?: string } = {},
): Promise<void> => {
  if (activePlayback) {
    return activePlayback;
  }

  activePlayback = (async () => {
    let audioUrl: string | null = null;
    try {
      audioUrl = await createSpeechAudioUrl(
        text,
        options.voice,
        options.style,
        options.model,
        options.dialect,
      );
      const audio = new Audio(audioUrl);

      await new Promise<void>((resolve, reject) => {
        audio.onended = () => resolve();
        audio.onerror = () => reject(new Error('Audio playback failed.'));
        audio.play().catch(reject);
      });
    } finally {
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
      activePlayback = null;
    }
  })();

  return activePlayback;
};
