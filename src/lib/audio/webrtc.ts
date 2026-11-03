import { float32ToInt16LE, int16LEToFloat32 } from "./pcm";

export const SAMPLE_RATE = 16000;
export const PCM_CHANNEL_LABEL = "pcm";
export const CAPTURE_WORKLET_URL = "/worklets/capture-processor.js";
export const PLAYBACK_WORKLET_URL = "/worklets/playback-processor.js";
export const CAPTURE_PROCESSOR_NAME = "capture-processor";
export const PLAYBACK_PROCESSOR_NAME = "playback-processor";

export interface AtendiCallsWebRTCConnection {
  pc: RTCPeerConnection;
  dc: RTCDataChannel;
  micStream: MediaStream;
  remoteStream: MediaStream;
  audioCtx: AudioContext;
  remoteAudio: HTMLAudioElement;
  close: () => void;
  mute: () => void;
  unmute: () => void;
  isMuted: () => boolean;
}

/**
 * Abre conexão de áudio bidirecional WebRTC com o motor AtendiCalls.
 * Permite ao atendente humano falar pelo microfone do computador e ouvir
 * o áudio da chamada do WhatsApp do cliente com baixíssima latência via DataChannel PCM.
 */
export async function openAtendiCallsWebRTC(params: {
  sdpAnswerCallback: (sdpOffer: string) => Promise<string>;
  micDeviceId?: string | null;
}): Promise<AtendiCallsWebRTCConnection> {
  const micStream = await navigator.mediaDevices.getUserMedia({
    audio: params.micDeviceId ? { deviceId: { exact: params.micDeviceId } } : true,
  });

  const pc = new RTCPeerConnection({ iceServers: [] });
  const dc = pc.createDataChannel(PCM_CHANNEL_LABEL, { ordered: true });
  dc.binaryType = "arraybuffer";

  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  const audioCtx = new AudioContextClass({ sampleRate: SAMPLE_RATE });

  await audioCtx.audioWorklet.addModule(CAPTURE_WORKLET_URL);
  await audioCtx.audioWorklet.addModule(PLAYBACK_WORKLET_URL);
  await audioCtx.resume();

  let isMuted = false;

  // 1. Captura do microfone -> Envia para o WhatsApp do cliente
  const micSource = audioCtx.createMediaStreamSource(micStream);
  const captureNode = new AudioWorkletNode(audioCtx, CAPTURE_PROCESSOR_NAME);
  captureNode.port.onmessage = (e: MessageEvent<Float32Array>) => {
    if (!isMuted && dc.readyState === "open") {
      dc.send(float32ToInt16LE(e.data));
    }
  };
  micSource.connect(captureNode);
  // Conectar através de ganho zero para manter o nó ativo no scheduler sem causar retorno de eco no fone do operador
  const zeroGain = audioCtx.createGain();
  zeroGain.gain.value = 0;
  captureNode.connect(zeroGain);
  zeroGain.connect(audioCtx.destination);

  // 2. Recepção do WhatsApp do cliente -> Toca nos fones/caixa do atendente
  const playbackNode = new AudioWorkletNode(audioCtx, PLAYBACK_PROCESSOR_NAME);
  const streamDest = audioCtx.createMediaStreamDestination();
  playbackNode.connect(streamDest);
  playbackNode.connect(audioCtx.destination);
  dc.onmessage = (e: MessageEvent<ArrayBuffer>) => {
    playbackNode.port.postMessage(int16LEToFloat32(e.data));
  };

  // Cria elemento de áudio no navegador e vincula ao stream recebido para reprodução
  const remoteAudio = new Audio();
  remoteAudio.srcObject = streamDest.stream;
  remoteAudio.autoplay = true;
  remoteAudio.play().catch((err) => {
    console.warn("[AtendiCalls WebRTC] Autoplay aguardando interação:", err);
  });

  // 3. Negociação SDP Offer / Answer
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  await new Promise<void>((resolve) => {
    if (pc.iceGatheringState === "complete") {
      resolve();
    } else {
      const checkIce = () => {
        if (pc.iceGatheringState === "complete") {
          pc.removeEventListener("icegatheringstatechange", checkIce);
          resolve();
        }
      };
      pc.addEventListener("icegatheringstatechange", checkIce);
      setTimeout(resolve, 2000);
    }
  });

  const sdpOffer = pc.localDescription?.sdp || "";
  const sdpAnswer = await params.sdpAnswerCallback(sdpOffer);

  await pc.setRemoteDescription({ type: "answer", sdp: sdpAnswer });
  console.log("[AtendiCalls WebRTC] Áudio bidirecional conectado com sucesso!");

  return {
    pc,
    dc,
    micStream,
    remoteStream: streamDest.stream,
    audioCtx,
    remoteAudio,
    mute: () => {
      isMuted = true;
      micStream.getAudioTracks().forEach((t) => (t.enabled = false));
    },
    unmute: () => {
      isMuted = false;
      micStream.getAudioTracks().forEach((t) => (t.enabled = true));
    },
    isMuted: () => isMuted,
    close: () => {
      try {
        remoteAudio.pause();
        remoteAudio.srcObject = null;
      } catch {}
      try {
        micStream.getTracks().forEach((t) => t.stop());
      } catch {}
      try {
        if (dc.readyState === "open" || dc.readyState === "connecting") {
          dc.close();
        }
      } catch {}
      try {
        if (audioCtx.state !== "closed") {
          audioCtx.close();
        }
      } catch {}
      try {
        pc.close();
      } catch {}
    },
  };
}
