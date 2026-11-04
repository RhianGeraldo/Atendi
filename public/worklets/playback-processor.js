const RING_SIZE = 16000 * 2; // 2 segundos de buffer circular
const JITTER_BUFFER_TARGET = 800; // 50ms de pré-buffer para eliminar picotes / voz travada
const MAX_LATENCY_SAMPLES = 6400; // 400ms de latência máxima para manter tempo real

class PlaybackProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ring = new Float32Array(RING_SIZE);
    this.read = 0;
    this.write = 0;
    this.available = 0;
    this.buffering = true;

    this.port.onmessage = (e) => {
      const data = e.data;
      if (!data || !data.length) return;

      // Se a fila passar de 400ms por lentidão na rede, avança para manter tempo real
      if (this.available > MAX_LATENCY_SAMPLES) {
        const drop = this.available - MAX_LATENCY_SAMPLES;
        this.read = (this.read + drop) % RING_SIZE;
        this.available = MAX_LATENCY_SAMPLES;
      }

      for (let i = 0; i < data.length; i += 1) {
        this.ring[this.write] = data[i];
        this.write = (this.write + 1) % RING_SIZE;
        if (this.available < RING_SIZE) {
          this.available += 1;
        } else {
          this.read = (this.read + 1) % RING_SIZE;
        }
      }

      if (this.buffering && this.available >= JITTER_BUFFER_TARGET) {
        this.buffering = false;
      }
    };
  }

  process(_inputs, outputs) {
    const output = outputs[0];
    if (!output || output.length === 0) return true;
    const channelCount = output.length;
    const frameCount = output[0].length;

    if (this.buffering || this.available === 0) {
      if (this.available === 0) {
        this.buffering = true;
      }
      for (let ch = 0; ch < channelCount; ch += 1) {
        output[ch].fill(0);
      }
      return true;
    }

    for (let i = 0; i < frameCount; i += 1) {
      let sample = 0;
      if (this.available > 0) {
        sample = this.ring[this.read];
        this.read = (this.read + 1) % RING_SIZE;
        this.available -= 1;
      } else {
        this.buffering = true;
        sample = 0;
      }
      for (let ch = 0; ch < channelCount; ch += 1) {
        output[ch][i] = sample;
      }
    }
    return true;
  }
}

registerProcessor("playback-processor", PlaybackProcessor);
