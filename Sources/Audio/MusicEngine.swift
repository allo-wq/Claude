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
            self?.render(frameCount: frameCount, audioBufferList: audioBufferList)
            return noErr
        }

        engine.attach(node)
        engine.connect(node, to: engine.mainMixerNode, format: format)
        engine.mainMixerNode.outputVolume = 0.8
        sourceNode = node
        try? engine.start()
        running = true
    }

    private func render(frameCount: AVAudioFrameCount, audioBufferList: UnsafeMutablePointer<AudioBufferList>) {
        let ablPointer = UnsafeMutableAudioBufferListPointer(audioBufferList)
        let spb: Double = 60.0 / bpm * sampleRate          // samples per beat
        for frame in 0..<Int(frameCount) {
            let n: Double = Double(frameCounter + Int64(frame))
            let value: Float = sample(n: n, spb: spb)
            for buffer in ablPointer {
                let buf = UnsafeMutableBufferPointer<Float>(buffer)
                buf[frame] = value
            }
        }
        frameCounter += Int64(frameCount)
    }

    private func sample(n: Double, spb: Double) -> Float {
        let beatPos: Double = n.truncatingRemainder(dividingBy: spb) / spb
        let beatIndex: Int = Int(n / spb)
        let t: Double = n / sampleRate
        let twoPi: Double = 2.0 * Double.pi

        // kick: pitch-swept sine with fast decay on every beat
        let kickEnv: Double = exp(-beatPos * 18.0)
        let kickFreq: Double = 140.0 - beatPos * 90.0
        let kickPhase: Double = twoPi * kickFreq * (beatPos * spb / sampleRate)
        let kick: Double = sin(kickPhase) * kickEnv * 0.7

        // hat: noise burst on the offbeat
        let offPos: Double = (beatPos + 0.5).truncatingRemainder(dividingBy: 1.0)
        let hat: Double = Double.random(in: -1.0...1.0) * exp(-offPos * 40.0) * 0.12

        // bass: square wave, note from the bar pattern
        let bar: Int = (beatIndex / 4) % pattern.count
        let bassFreq: Double = 55.0 * pow(2.0, pattern[bar] / 12.0)
        let square: Double = sin(twoPi * bassFreq * t) > 0.0 ? 1.0 : -1.0
        let bassEnv: Double = 0.5 + 0.5 * exp(-beatPos * 4.0)
        let bass: Double = square * 0.10 * bassEnv

        // lead arp on 16ths, two octaves up
        let sixteenth: Int = Int(n / (spb / 4.0)) % 8
        let arpOffsets: [Double] = [0, 7, 12, 7, 0, 7, 15, 12]
        let leadNote: Double = pattern[bar] + arpOffsets[sixteenth]
        let leadFreq: Double = 220.0 * pow(2.0, leadNote / 12.0)
        let sixteenthPos: Double = n.truncatingRemainder(dividingBy: spb / 4.0) / (spb / 4.0)
        let lead: Double = sin(twoPi * leadFreq * t) * exp(-sixteenthPos * 6.0) * 0.08

        return Float(kick + hat + bass + lead)
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
