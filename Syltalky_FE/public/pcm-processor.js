class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this._buf = []
    this._target = 4096
  }

  process(inputs) {
    const ch = inputs[0]?.[0]
    if (ch) {
      for (let i = 0; i < ch.length; i++) this._buf.push(ch[i])
      if (this._buf.length >= this._target) {
        this.port.postMessage(new Float32Array(this._buf.splice(0, this._target)))
      }
    }
    return true
  }
}

registerProcessor('pcm-processor', PCMProcessor)
