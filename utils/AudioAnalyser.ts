/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
/** Simple class for getting the current audio level. */
export class AudioAnalyser {
  readonly node: AnalyserNode;
  private readonly freqData: Uint8Array;
  private readonly _context: AudioContext;
  constructor(context: AudioContext) {
    this.node = context.createAnalyser();
    this.node.smoothingTimeConstant = 0;
    this.freqData = new Uint8Array(this.node.frequencyBinCount);
    this._context = context;
  }
  getCurrentLevel() {
    this.node.getByteFrequencyData(this.freqData);
    // Calculate the index for 10Hz
    const maxFrequency = 10; // Hz
    const frequencyResolution = this._context.sampleRate / this.node.fftSize;
    const maxBinIndex = Math.min(
      Math.floor(maxFrequency / frequencyResolution),
      this.node.frequencyBinCount - 1, // Ensure it doesn't go out of bounds
    );

    // Sum only up to the calculated maxBinIndex
    let sum = 0;
    const numberOfBinsToAverage = maxBinIndex >= 0 ? maxBinIndex + 1 : 0;

    for (let i = 0; i < numberOfBinsToAverage; i++) {
      sum += this.freqData[i];
    }
    const avg = numberOfBinsToAverage > 0 ? sum / numberOfBinsToAverage : 0;
    return (avg / 0xff) * 20;
  }
}
