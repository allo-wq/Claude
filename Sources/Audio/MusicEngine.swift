import AVFoundation

// Procedural chiptune engine. Synthesizes a beat-synced track from the
// level's BPM at runtime (kick on every beat, hats on offbeats, bassline
// following a per-level chord pattern), so no licensed audio assets are
// needed and the music is sample-accurately aligned with the beat grid
// that levels are authored on.
final class MusicEngine {

    static let shared = MusicEngine()

    private let engine = AVAudioEngine()
    private var sourceNode: AVAudioSourceNode?
    private var sampleRate: Double = 44100
    private var frameCounter: Int64 = 0
    private var bpm: Double = 120
    private var pattern: [Double] = [0, 0, 7, 5]   // semitone offsets per bar
    private var running = false

    var muted: Bool {
        get { UserDefaults.standard.bool(forKey: "muted") }
        set { UserDefaults.standard.set(newValue, forKey: "muted") }
    }

    // Time since start(), in seconds, derived from the sample clock so beat
    // FX in the scene stay locked to the audio.
    var currentTime: Double {
        Double(frameCounter) / sampleRate
    }

    func start(bpm: Double, patternSeed: Int) {
        stop()
        guard !muted else { frameCounter = 0; running = true; return }

        self.bpm = bpm
        let patterns: [[Double]] = [
            [0, 0, 7, 5], [0, 3, 5, 7], [0, -2, 3, 5], [0, 5, 3, 7], [0, 7, 10, 5],
        ]
        pattern = patterns[abs(patternSeed) % patterns.count]
        frameCounter = 0

        try? AVAudioSession.sharedInstance().setCategory(.ambient)
        try? AVAudioSession.sharedInstance().setActive(true)

        let format = engine.outputNode.outputFormat(forBus: 0)
        sampleRate = format.sampleRate

        let node = AVAudioSourceNode { [weak self] _, _, frameCount, audioBufferList -> OSStatus in
            guard let self = self else { return noErr }
            let ablPointer = UnsafeMutableAudioBufferListPointer(audioBufferList)
            let spb = 60.0 / self.bpm * self.sampleRate          // samples per beat
            for frame in 0..<Int(frameCount) {
                let n = Double(self.frameCounter + Int64(frame))
                let beatPos = n.truncatingRemainder(dividingBy: spb) / spb
                let beatIndex = Int(n / spb)
                let t = n / self.sampleRate

                // kick: pitch-swept sine with fast decay on every beat
                let kickEnv = exp(-beatPos * 18)
                let kick = sin(2 * .pi * (140 - beatPos * 90) * (beatPos * spb / self.sampleRate)) * kickEnv * 0.7

                // hat: noise burst on the offbeat
                let offPos = (beatPos + 0.5).truncatingRemainder(dividingBy: 1)
                let hat = (Double.random(in: -1...1)) * exp(-offPos * 40) * 0.12

                // bass: square wave, note from the bar pattern
                let bar = (beatIndex / 4) % self.pattern.count
                let freq = 55.0 * pow(2, self.pattern[bar] / 12.0)
                let square: Double = sin(2 * .pi * freq * t) > 0 ? 1 : -1
                let bassEnv = 0.5 + 0.5 * exp(-beatPos * 4)
                let bass = square * 0.10 * bassEnv

                // lead arp on 16ths, two octaves up
                let sixteenth = Int(n / (spb / 4)) % 8
                let arpOffsets: [Double] = [0, 7, 12, 7, 0, 7, 15, 12]
                let leadFreq = 220.0 * pow(2, (self.pattern[bar] + arpOffsets[sixteenth]) / 12.0)
                let sixteenthPos = n.truncatingRemainder(dividingBy: spb / 4) / (spb / 4)
                let lead = sin(2 * .pi * leadFreq * t) * exp(-sixteenthPos * 6) * 0.08

                let sample = Float(kick + hat + bass + lead)
                for buffer in ablPointer {
                    let buf = UnsafeMutableBufferPointer<Float>(buffer)
                    buf[frame] = sample
                }
            }
            self.frameCounter += Int64(frameCount)
            return noErr
        }

        engine.attach(node)
        engine.connect(node, to: engine.mainMixerNode, format: format)
        engine.mainMixerNode.outputVolume = 0.8
        sourceNode = node
        try? engine.start()
        running = true
    }

    func stop() {
        if let node = sourceNode {
            engine.detach(node)
            sourceNode = nil
        }
        if engine.isRunning { engine.stop() }
        running = false
    }
}
