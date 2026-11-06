/** Generates a small, valid 16-bit mono PCM WAV file (a sine tone). */
export function makeWav(seconds = 1, sampleRate = 8000, frequency = 440): Uint8Array {
  const samples = Math.floor(seconds * sampleRate);
  const dataBytes = samples * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);
  const writeAscii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeAscii(36, "data");
  view.setUint32(40, dataBytes, true);
  for (let i = 0; i < samples; i++) {
    const value = Math.sin((2 * Math.PI * frequency * i) / sampleRate) * 0.3;
    view.setInt16(44 + i * 2, Math.round(value * 32767), true);
  }
  return new Uint8Array(buffer);
}

/** Bytes that start like an MP3 file with an ID3v2 tag. */
export function fakeMp3(size = 2048): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes.set([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
  bytes.set([0xff, 0xfb, 0x90, 0x64], 10);
  return bytes;
}
