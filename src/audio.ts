import type { Settings } from "./timeline";
// Original synthesized score. No downloaded music or external audio requests.
export function createScore(
  duration: number,
  style: Settings["music"],
): AudioBuffer {
  const sampleRate = 44100;
  const buffer = new AudioBuffer({
    length: Math.ceil(duration * sampleRate),
    numberOfChannels: 2,
    sampleRate,
  });
  if (style === "none") return buffer;
  const notes =
    style === "piano"
      ? [261.63, 329.63, 392, 493.88, 440, 392, 329.63, 293.66]
      : [130.81, 164.81, 196, 146.83];
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < data.length; i++) {
      const t = i / sampleRate;
      const fade = Math.min(1, t / 1.5, (duration - t) / 3);
      let sample = 0;
      if (style === "piano") {
        const beat = 0.85;
        for (let echo = 0; echo < 4; echo++) {
          const number = Math.floor(t / beat) - echo;
          if (number < 0) continue;
          const age = t - number * beat + channel * 0.018;
          const frequency = notes[number % notes.length];
          const envelope = Math.min(1, age * 80) * Math.exp(-age * 2);
          sample +=
            (Math.sin(2 * Math.PI * frequency * age) +
              0.28 * Math.sin(2 * Math.PI * frequency * 2 * age)) *
            envelope *
            0.095;
        }
      } else {
        notes.forEach((frequency, j) => {
          sample +=
            Math.sin(2 * Math.PI * frequency * (1 + channel * 0.0007) * t) *
            (0.75 + 0.25 * Math.sin(t * 0.7 + j)) *
            0.035;
        });
      }
      data[i] = sample * Math.max(0, fade);
    }
  }
  return buffer;
}
