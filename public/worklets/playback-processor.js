const RING_SIZE = 16000 * 2;

class PlaybackProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ring = new Float32Array(RING_SIZE);
    this.read = 0;
    this.write = 0;
    this.available = 0;
    this.port.onmessage = (e) => {
      const data = e.data;
      if (!data || !data.length) return;

      // Descarta áudio atrasado se o buffer acumular mais de 150ms (~2400 samples a 16kHz)
      // Isso impede que soluços na rede criem um atraso cumulativo de 5 a 8 segundos
      const MAX_LATENCY_SAMPLES = 2400;
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
    };
  }

  process(_inputs, outputs) {
    const output = outputs[0];
    if (!output || !output[0]) return true;
    const channelCount = output.length;
    const frameCount = output[0].length;

    for (let i = 0; i < frameCount; i += 1) {
      let sample = 0;
      if (this.available > 0) {
        sample = this.ring[this.read];
        this.read = (this.read + 1) % RING_SIZE;
        this.available -= 1;
      }
      for (let ch = 0; ch < channelCount; ch += 1) {
        output[ch][i] = sample;
      }
    }
    return true;
  }
}

registerProcessor("playback-processor", PlaybackProcessor);
