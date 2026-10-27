'use client';

// ============================================================
// Browser-side voice recording for the support chat.
//
// Encodes Ogg/Opus in the browser with the opus-recorder worker already
// vendored into /public for the inbox, so there is no server transcode
// step, no ffmpeg dependency, and the file that lands in S3 is the file
// the browser produced.
//
// Extracted into a hook rather than living in the composer because the
// teardown rules are fiddly and easy to get wrong in a component that is
// also managing text, uploads and replies: an unmounted recorder that was
// never stopped keeps the microphone light on, which users notice and
// (rightly) do not forgive.
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react';

import { SUPPORT_RECORDING_MAX_SECONDS } from '@/lib/support-chat/attachments';

/**
 * The worker that encodes mic input to Ogg/Opus entirely client-side.
 * Vendored from opus-recorder into /public — same path the inbox uses, so
 * there is one copy of the asset.
 */
const OPUS_ENCODER_PATH = '/opus/encoderWorker.min.js';

export interface VoiceRecorderState {
  recording: boolean;
  /** Whole seconds elapsed, for the timer readout. */
  seconds: number;
  /** True while the mic is being requested, before recording starts. */
  starting: boolean;
}

export interface UseVoiceRecorder extends VoiceRecorderState {
  start: () => Promise<void>;
  /** Stop and hand the encoded clip to `onComplete`. */
  stop: () => void;
  /** Stop and throw the clip away. */
  cancel: () => void;
  /** Whether this browser can record at all. */
  supported: boolean;
}

export function useVoiceRecorder(options: {
  /** Receives the finished clip. Not called for a cancelled take. */
  onComplete: (file: File, seconds: number) => void;
  onError: (message: string) => void;
}): UseVoiceRecorder {
  const [recording, setRecording] = useState(false);
  const [starting, setStarting] = useState(false);
  const [seconds, setSeconds] = useState(0);

  const recorderRef = useRef<import('opus-recorder').default | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelledRef = useRef(false);
  /**
   * Elapsed seconds captured at stop time.
   *
   * `ondataavailable` fires after the encoder flushes, by which point the
   * timer has already been cleared and React state may have been reset —
   * so the duration is snapshotted here rather than read from state in
   * the callback.
   */
  const finalSecondsRef = useRef(0);

  // Callbacks held in refs so a parent re-render with fresh closures does
  // not require tearing down a live recording to pick them up.
  const onCompleteRef = useRef(options.onComplete);
  const onErrorRef = useRef(options.onError);
  useEffect(() => {
    onCompleteRef.current = options.onComplete;
    onErrorRef.current = options.onError;
  });

  const [supported, setSupported] = useState(false);
  useEffect(() => {
    // Feature-detected in an effect, not at module scope: this module is
    // imported during SSR where neither global exists.
    setSupported(
      typeof navigator !== 'undefined' &&
        Boolean(navigator.mediaDevices?.getUserMedia) &&
        typeof AudioContext !== 'undefined'
    );
  }, []);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Release the microphone if this unmounts mid-recording. `stop()` is
  // what tears down the media stream and the audio context inside
  // opus-recorder, so skipping it leaves the mic held open.
  useEffect(() => {
    return () => {
      clearTimer();
      cancelledRef.current = true;
      void recorderRef.current?.stop().catch(() => {});
      recorderRef.current = null;
    };
  }, [clearTimer]);

  const start = useCallback(async () => {
    if (recording || starting || !supported) return;

    setStarting(true);
    try {
      // Lazy-loaded (~400 KB worker) only when someone actually records,
      // keeping it out of the Settings bundle for everyone who does not.
      const { default: Recorder } = await import('opus-recorder');
      const recorder = new Recorder({
        encoderPath: OPUS_ENCODER_PATH,
        numberOfChannels: 1,
        // 2048 = OPUS_APPLICATION_VOIP, tuned for speech rather than music.
        encoderApplication: 2048,
        encoderSampleRate: 48000,
        // One callback carrying the complete file on stop, rather than a
        // stream of pages we would have to reassemble.
        streamPages: false,
      });

      cancelledRef.current = false;
      recorder.ondataavailable = (bytes) => {
        if (cancelledRef.current) return;
        // Uint8Array is a valid BlobPart at runtime; the cast sidesteps a
        // lib.dom ArrayBufferLike-vs-ArrayBuffer generic mismatch.
        const file = new File(
          [bytes as unknown as BlobPart],
          `voice-note-${Date.now()}.ogg`,
          { type: 'audio/ogg' }
        );
        if (file.size === 0) return; // empty take
        onCompleteRef.current(file, finalSecondsRef.current);
      };

      recorderRef.current = recorder;
      await recorder.start();
      setRecording(true);
      setSeconds(0);
      finalSecondsRef.current = 0;
      timerRef.current = setInterval(() => {
        setSeconds((s) => {
          const next = s + 1;
          finalSecondsRef.current = next;
          return next;
        });
      }, 1000);
    } catch {
      void recorderRef.current?.stop().catch(() => {});
      recorderRef.current = null;
      setRecording(false);
      onErrorRef.current(
        'Microphone access was denied or is unavailable. Check your browser permissions.'
      );
    } finally {
      setStarting(false);
    }
  }, [recording, starting, supported]);

  const stop = useCallback(() => {
    clearTimer();
    setRecording(false);
    void recorderRef.current?.stop().catch(() => {});
  }, [clearTimer]);

  const cancel = useCallback(() => {
    // Set BEFORE stopping: stop() triggers the encoder flush, and this is
    // the flag `ondataavailable` checks to discard the take.
    cancelledRef.current = true;
    clearTimer();
    setRecording(false);
    setSeconds(0);
    void recorderRef.current?.stop().catch(() => {});
  }, [clearTimer]);

  // Auto-stop at the cap. Stopping (rather than discarding) keeps what was
  // already said — hitting the limit should not throw the recording away.
  useEffect(() => {
    if (recording && seconds >= SUPPORT_RECORDING_MAX_SECONDS) {
      stop();
    }
  }, [recording, seconds, stop]);

  return { recording, starting, seconds, start, stop, cancel, supported };
}

/** `1:07`. Shared by the recorder bar and the playback bubble. */
export function formatClipDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '0:00';
  const whole = Math.floor(totalSeconds);
  const m = Math.floor(whole / 60);
  const s = whole % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
