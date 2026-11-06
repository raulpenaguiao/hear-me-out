"use client";

import { Mic, Pause, Play, RotateCcw, Square } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatDuration } from "@/lib/format";
import { Button } from "../ui/button";
import type { AudioSelection } from "./types";

const MIME_CANDIDATES = [
  "audio/mp4", // Safari: AAC in MP4, best podcast-app compatibility
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
];

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") {
    return undefined;
  }
  return MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type));
}

function extensionFor(mime: string): string {
  if (mime.startsWith("audio/mp4")) return "m4a";
  if (mime.startsWith("audio/ogg")) return "ogg";
  return "webm";
}

export function isRecordingSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof MediaRecorder !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    window.isSecureContext
  );
}

type State = "idle" | "requesting" | "recording" | "paused" | "done";

export function Recorder({
  maxDurationSeconds,
  onRecorded,
  onReset,
}: {
  maxDurationSeconds: number;
  onRecorded: (selection: AudioSelection) => void;
  onReset: () => void;
}) {
  const [state, setState] = useState<State>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [level, setLevel] = useState(0);
  const [canPause, setCanPause] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const accumulatedRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);

  const currentElapsed = useCallback(
    () => accumulatedRef.current + (startedAtRef.current ? performance.now() - startedAtRef.current : 0),
    [],
  );

  const cleanup = useCallback(() => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void audioCtxRef.current?.close().catch(() => undefined);
    audioCtxRef.current = null;
    setLevel(0);
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    accumulatedRef.current = currentElapsed();
    startedAtRef.current = 0;
    recorder.stop();
  }, [currentElapsed]);

  async function start() {
    setError(null);
    setState("requesting");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch {
      setState("idle");
      setError("Não foi possível aceder ao microfone. Verifica as permissões do navegador.");
      return;
    }
    streamRef.current = stream;

    const mimeType = pickMimeType();
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 96_000 } : undefined);
    } catch {
      cleanup();
      setState("idle");
      setError("O teu navegador não consegue gravar áudio. Carrega um ficheiro em alternativa.");
      return;
    }
    recorderRef.current = recorder;
    chunksRef.current = [];
    accumulatedRef.current = 0;
    setCanPause(typeof recorder.pause === "function");

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      const type = (recorder.mimeType || mimeType || "audio/webm").split(";")[0]!;
      const blob = new Blob(chunksRef.current, { type });
      const durationSeconds = Math.max(1, Math.round(accumulatedRef.current / 1000));
      cleanup();
      setElapsedMs(accumulatedRef.current);
      setState("done");
      const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
      onRecorded({
        blob,
        mimeType: type,
        fileName: `gravacao-${stamp}.${extensionFor(type)}`,
        durationSeconds,
        source: "recording",
      });
    };

    // Live input level meter.
    try {
      const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let peak = 0;
        for (const v of data) peak = Math.max(peak, Math.abs(v - 128));
        setLevel(Math.min(1, peak / 64));
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      // The meter is cosmetic; ignore failures.
    }

    recorder.start(1000);
    startedAtRef.current = performance.now();
    setElapsedMs(0);
    setState("recording");
    timerRef.current = window.setInterval(() => {
      const ms = currentElapsed();
      setElapsedMs(ms);
      if (ms / 1000 >= maxDurationSeconds) stop();
    }, 250);
  }

  function pause() {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== "recording") return;
    recorder.pause();
    accumulatedRef.current = currentElapsed();
    startedAtRef.current = 0;
    setState("paused");
  }

  function resume() {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== "paused") return;
    recorder.resume();
    startedAtRef.current = performance.now();
    setState("recording");
  }

  function reset() {
    cleanup();
    recorderRef.current = null;
    chunksRef.current = [];
    accumulatedRef.current = 0;
    setElapsedMs(0);
    setState("idle");
    onReset();
  }

  const active = state === "recording" || state === "paused";

  return (
    <div className="flex flex-col items-center gap-5 py-4">
      <div
        className="font-mono text-5xl font-semibold tabular-nums tracking-tight"
        aria-live="off"
        data-testid="recording-timer"
      >
        {formatDuration(elapsedMs / 1000)}
      </div>

      <div className="h-2 w-48 overflow-hidden rounded-full bg-muted" aria-hidden>
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-75"
          style={{ width: `${Math.round((state === "recording" ? level : 0) * 100)}%` }}
        />
      </div>

      <p className="text-sm text-muted-foreground" role="status">
        {state === "idle" && "Carrega no botão para começar a gravar."}
        {state === "requesting" && "A pedir acesso ao microfone…"}
        {state === "recording" && "A gravar…"}
        {state === "paused" && "Em pausa."}
        {state === "done" && "Gravação pronta. Ouve antes de publicar."}
      </p>

      <div className="flex items-center gap-3">
        {(state === "idle" || state === "requesting") && (
          <Button
            size="lg"
            className="size-20 rounded-full p-0 [&_svg]:size-8"
            onClick={start}
            disabled={state === "requesting"}
            aria-label="Começar a gravar"
          >
            <Mic aria-hidden />
          </Button>
        )}
        {active && canPause && (
          <Button
            variant="outline"
            size="icon"
            className="size-14"
            onClick={state === "recording" ? pause : resume}
            aria-label={state === "recording" ? "Pausar" : "Retomar"}
          >
            {state === "recording" ? <Pause aria-hidden /> : <Play aria-hidden />}
          </Button>
        )}
        {active && (
          <Button
            variant="danger"
            className="size-20 rounded-full p-0 [&_svg]:size-7"
            onClick={stop}
            aria-label="Parar gravação"
          >
            <Square aria-hidden />
          </Button>
        )}
        {state === "done" && (
          <Button variant="outline" onClick={reset}>
            <RotateCcw aria-hidden />
            Gravar de novo
          </Button>
        )}
      </div>

      {error ? (
        <p role="alert" className="text-center text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
