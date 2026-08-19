// Small procedural audio engine — no audio files, everything is synthesized with the Web
// Audio API. A single persistent AudioContext is reused for the whole round so the ambient
// music loop and one-shot effects (coin/boost/crash) can share the same audio graph.

type ToneOptions = {
  type?: OscillatorType
  attack?: number
  decay?: number
  peak?: number
  delay?: number
  sweepTo?: number
}

export type AudioEngine = ReturnType<typeof createAudioEngine>

export function createAudioEngine() {
  let ctx: AudioContext | null = null
  let muted = false
  let musicGain: GainNode | null = null
  let musicNodes: OscillatorNode[] = []
  let twinkleTimer: number | null = null
  let musicRunning = false
  const MUSIC_VOLUME = 0.05

  function ensureContext(): AudioContext {
    if (!ctx) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      ctx = new Ctor()
    }
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  }

  function tone(freq: number, opts: ToneOptions = {}) {
    if (muted) return
    const ac = ensureContext()
    const { type = 'sine', attack = 0.01, decay = 0.18, peak = 0.22, delay = 0, sweepTo } = opts
    const t0 = ac.currentTime + delay
    const osc = ac.createOscillator()
    osc.type = type
    osc.frequency.setValueAtTime(freq, t0)
    if (sweepTo) osc.frequency.exponentialRampToValueAtTime(sweepTo, t0 + attack + decay)
    const gain = ac.createGain()
    gain.gain.setValueAtTime(0.0001, t0)
    gain.gain.linearRampToValueAtTime(peak, t0 + attack)
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay)
    osc.connect(gain)
    gain.connect(ac.destination)
    osc.start(t0)
    osc.stop(t0 + attack + decay + 0.05)
  }

  // Soft, spacious drone (three detuned low oscillators through a slowly sweeping lowpass
  // filter) with the occasional high "twinkle" note — a lightweight stand-in for an ambient
  // galaxy soundtrack that loops for free and never needs an asset file.
  function startMusic() {
    if (musicRunning) return
    musicRunning = true
    const ac = ensureContext()

    const filter = ac.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 900

    const gain = ac.createGain()
    gain.gain.value = 0
    filter.connect(gain)
    gain.connect(ac.destination)
    gain.gain.linearRampToValueAtTime(muted ? 0 : MUSIC_VOLUME, ac.currentTime + 1.5)
    musicGain = gain

    const droneFreqs = [55, 82.5, 110]
    droneFreqs.forEach((f, i) => {
      const osc = ac.createOscillator()
      osc.type = i === 1 ? 'triangle' : 'sine'
      osc.frequency.value = f
      osc.detune.value = (i - 1) * 5
      osc.connect(filter)
      osc.start()
      musicNodes.push(osc)
    })

    const lfo = ac.createOscillator()
    lfo.frequency.value = 0.045
    const lfoGain = ac.createGain()
    lfoGain.gain.value = 420
    lfo.connect(lfoGain)
    lfoGain.connect(filter.frequency)
    lfo.start()
    musicNodes.push(lfo)

    const twinkle = () => {
      if (!musicRunning || !musicGain) return
      const ac2 = ensureContext()
      const notes = [659.3, 880, 987.8, 1318.5]
      const f = notes[Math.floor(Math.random() * notes.length)]!
      const t0 = ac2.currentTime
      const g = ac2.createGain()
      g.gain.setValueAtTime(0, t0)
      g.gain.linearRampToValueAtTime(0.032, t0 + 0.7)
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 3.2)
      const o = ac2.createOscillator()
      o.type = 'sine'
      o.frequency.value = f
      o.connect(g)
      g.connect(musicGain)
      o.start(t0)
      o.stop(t0 + 3.4)
      twinkleTimer = window.setTimeout(twinkle, 2600 + Math.random() * 3400)
    }
    twinkleTimer = window.setTimeout(twinkle, 1600)
  }

  function stopMusic() {
    if (!musicRunning) return
    musicRunning = false
    if (twinkleTimer) { window.clearTimeout(twinkleTimer); twinkleTimer = null }
    if (musicGain && ctx) {
      const ac = ctx
      const g = musicGain
      g.gain.cancelScheduledValues(ac.currentTime)
      g.gain.setValueAtTime(g.gain.value, ac.currentTime)
      g.gain.linearRampToValueAtTime(0, ac.currentTime + 0.4)
    }
    const nodes = musicNodes
    musicNodes = []
    window.setTimeout(() => { nodes.forEach((o) => { try { o.stop() } catch { /* already stopped */ } }) }, 450)
  }

  return {
    playCoin() {
      // two quick ascending square-wave chimes, classic "coin" cadence
      tone(880, { type: 'square', attack: 0.004, decay: 0.09, peak: 0.16 })
      tone(1318.5, { type: 'square', attack: 0.004, decay: 0.16, peak: 0.14, delay: 0.05 })
    },
    playGem() {
      // sparkling 3-note ascending arpeggio — a bigger, brighter cousin of playCoin for the
      // rare gem pickup, so it reads as a jackpot moment rather than another coin
      tone(1046.5, { type: 'triangle', attack: 0.003, decay: 0.14, peak: 0.18 })
      tone(1318.5, { type: 'triangle', attack: 0.003, decay: 0.14, peak: 0.18, delay: 0.07 })
      tone(1568, { type: 'triangle', attack: 0.003, decay: 0.28, peak: 0.2, delay: 0.14 })
    },
    playBoost() {
      // rising sawtooth through a sweeping bandpass filter — a quick power-up "whoosh"
      if (muted) return
      const ac = ensureContext()
      const t0 = ac.currentTime
      const osc = ac.createOscillator()
      osc.type = 'sawtooth'
      osc.frequency.setValueAtTime(180, t0)
      osc.frequency.exponentialRampToValueAtTime(1500, t0 + 0.3)
      const filter = ac.createBiquadFilter()
      filter.type = 'bandpass'
      filter.Q.value = 0.7
      filter.frequency.setValueAtTime(300, t0)
      filter.frequency.exponentialRampToValueAtTime(2800, t0 + 0.3)
      const gain = ac.createGain()
      gain.gain.setValueAtTime(0.0001, t0)
      gain.gain.linearRampToValueAtTime(0.2, t0 + 0.04)
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.38)
      osc.connect(filter)
      filter.connect(gain)
      gain.connect(ac.destination)
      osc.start(t0)
      osc.stop(t0 + 0.4)
    },
    playCrash() {
      tone(150, { type: 'sawtooth', attack: 0.005, decay: 0.35, peak: 0.26, sweepTo: 55 })
    },
    startMusic,
    stopMusic,
    setMuted(value: boolean) {
      muted = value
      if (musicGain && ctx && musicRunning) {
        const ac = ctx
        musicGain.gain.cancelScheduledValues(ac.currentTime)
        musicGain.gain.setValueAtTime(musicGain.gain.value, ac.currentTime)
        musicGain.gain.linearRampToValueAtTime(muted ? 0 : MUSIC_VOLUME, ac.currentTime + 0.3)
      }
    },
  }
}
