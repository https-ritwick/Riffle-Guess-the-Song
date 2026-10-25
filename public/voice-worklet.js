// Riffle voice relay: turns the microphone into 60 ms packets of 16 kHz μ-law audio
// (about 16 KB/s), sent through the room's WebSocket when players can't connect directly.
// Lives in /public so it loads from our own origin (the page's CSP allows only 'self' scripts).

const RATE = 16000
const FRAME = 960 // 60 ms at 16 kHz

function encodeMuLaw(x) {
  const BIAS = 0x84
  const CLIP = 32635
  let s = Math.max(-1, Math.min(1, x)) * 32767
  const sign = s < 0 ? 0x80 : 0
  if (sign) s = -s
  if (s > CLIP) s = CLIP
  s += BIAS
  let exponent = 7
  for (let mask = 0x4000; (s & mask) === 0 && exponent > 0; mask >>= 1) exponent--
  const mantissa = (s >> (exponent + 3)) & 0x0f
  return ~(sign | (exponent << 4) | mantissa) & 0xff
}

class RiffleMic extends AudioWorkletProcessor {
  constructor() {
    super()
    this.ratio = sampleRate / RATE
    this.frame = new Float32Array(FRAME)
    this.n = 0
    this.pos = 0
    this.acc = 0
    this.count = 0
  }

  process(inputs) {
    const ch = inputs[0] && inputs[0][0]
    if (!ch) return true
    // Box-filter down to 16 kHz: average the input samples that fall into each output sample.
    for (let i = 0; i < ch.length; i++) {
      this.acc += ch[i]
      this.count++
      this.pos += 1
      if (this.pos >= this.ratio) {
        this.pos -= this.ratio
        this.frame[this.n++] = this.acc / this.count
        this.acc = 0
        this.count = 0
        if (this.n === FRAME) this.flush()
      }
    }
    return true
  }

  flush() {
    let sum = 0
    const data = new Uint8Array(FRAME)
    for (let i = 0; i < FRAME; i++) {
      const v = this.frame[i]
      sum += v * v
      data[i] = encodeMuLaw(v)
    }
    this.port.postMessage({ rms: Math.sqrt(sum / FRAME), data }, [data.buffer])
    this.n = 0
  }
}

registerProcessor('riffle-mic', RiffleMic)
