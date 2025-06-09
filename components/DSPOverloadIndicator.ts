import { LitElement, type PropertyValues, css, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

@customElement('dsp-overload-indicator')
export class DSPOverloadIndicator extends LitElement {
  @property({ type: Number }) currentPromptAverage = 0;
  @property({ type: Number }) currentKnobAverageExtremeness = 0;
  @state() private _visible = false;
  @state() private _rgbCycleSpeed = 1.0;
  @state() private _blinkDuration = 1.0; // New state for blink animation duration
  @state() private _rgbColor = 'rgb(255, 0, 0)'; // Initial color

  private _rgbCycleAnimationId: number | null = null;
  private _rgbCycleStartTime: number | null = null;

  static styles = css`
    :host {
      position: fixed;
      top: 10px;
      right: 10px;
      z-index: 9999;
      background: rgba(0, 0, 0, 0.6);
      padding: 8px 12px;
      border-radius: 5px;
      border: 1px solid #555;
      color: white;
      display: none; /* Hidden by default */
    }

    :host(.is-visible) {
      display: block;
      box-shadow: 0 0 5px var(--rgb-color), 0 0 10px var(--rgb-color);
    }
  `;

  updated(changedProperties: PropertyValues) {
    super.updated(changedProperties);

    if (
      changedProperties.has('currentPromptAverage') ||
      changedProperties.has('currentKnobAverageExtremeness')
    ) {
      const promptAvg = this.currentPromptAverage;
      const knobExt = this.currentKnobAverageExtremeness;

      // Calculate a combined overload factor
      const overloadFactor = Math.max(promptAvg, knobExt) * 2;

      // Determine visibility based on the combined overload factor
      const shouldBeVisible = overloadFactor > 0.5;

      if (shouldBeVisible && !this._visible) {
        // Transition from hidden to visible
        this._visible = true;
        this.classList.add('is-visible');
        this._startRgbCycle();
      } else if (!shouldBeVisible && this._visible) {
        // Transition from visible to hidden
        this._visible = false;
        this.classList.remove('is-visible');
        this._stopRgbCycle();
        // Reset color when not visible
        this._rgbColor = 'rgb(255, 0, 0)';
      }

      if (this._visible) {
        // Calculate speed: faster as overloadFactor increases from 0.5 to 2.0
        // Min speed (fastest) at overloadFactor = 2.0 (0.2s)
        // Max speed (slowest) at overloadFactor = 0.5 (1.0s)
        const minOverload = 0.5;
        const maxOverload = 2.0;
        const minSpeed = 0.2; // Fastest cycle
        const maxSpeed = 1.0; // Slowest cycle

        // Normalize overloadFactor from [0.5, 2.0] to [0, 1]
        const normalizedOverload = Math.min(1, Math.max(0, (overloadFactor - minOverload) / (maxOverload - minOverload)));

        // Interpolate speed: higher normalizedOverload means faster speed (smaller value)
        this._rgbCycleSpeed = maxSpeed - (normalizedOverload * (maxSpeed - minSpeed));
        this._blinkDuration = this._rgbCycleSpeed; // Blink duration matches color cycle speed

        // Set CSS variables for animation durations
        this.style.setProperty('--rgb-cycle-speed', `${this._rgbCycleSpeed}s`);
        this.style.setProperty('--blink-duration', `${this._blinkDuration}s`);
      }
    }
  }

  override connectedCallback() {
    super.connectedCallback();
    // Ensure animation stops if component is removed from DOM
    this._stopRgbCycle();
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this._stopRgbCycle();
  }

  private _startRgbCycle() {
    if (this._rgbCycleAnimationId === null) {
      this._rgbCycleStartTime = performance.now();
      this._rgbCycleAnimationId = requestAnimationFrame(this._animateRgbCycle.bind(this));
    }
  }

  private _stopRgbCycle() {
    if (this._rgbCycleAnimationId !== null) {
      cancelAnimationFrame(this._rgbCycleAnimationId);
      this._rgbCycleAnimationId = null;
      this._rgbCycleStartTime = null;
    }
  }

  private _animateRgbCycle(currentTime: DOMHighResTimeStamp) {
    if (this._rgbCycleStartTime === null) {
      this._rgbCycleStartTime = currentTime;
    }

    const elapsed = currentTime - this._rgbCycleStartTime;
    // The cycle speed is in seconds, read from CSS variable
    const rgbCycleSpeedSeconds = parseFloat(getComputedStyle(this).getPropertyValue('--rgb-cycle-speed'));
    const cycleDurationMs = rgbCycleSpeedSeconds * 1000;
    const progress = (elapsed % cycleDurationMs) / cycleDurationMs; // Normalized progress [0, 1)

    // RGB cycle: Red -> Green -> Blue -> Red
    let r, g, b;

    if (progress < 1 / 3) {
      // Red to Green (0 to 1/3)
      const p = progress * 3; // Normalized to [0, 1)
      r = 255 * (1 - p);
      g = 255 * p;
      b = 0;
    } else if (progress < 2 / 3) {
      // Green to Blue (1/3 to 2/3)
      const p = (progress - 1 / 3) * 3; // Normalized to [0, 1)
      r = 0;
      g = 255 * (1 - p);
      b = 255 * p;
    } else {
      // Blue to Red (2/3 to 1)
      const p = (progress - 2 / 3) * 3; // Normalized to [0, 1)
      r = 255 * p;
      g = 0;
      b = 255 * (1 - p);
    }

    this._rgbColor = `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
    this.style.setProperty('--rgb-color', this._rgbColor); // Update CSS variable

    this._rgbCycleAnimationId = requestAnimationFrame(this._animateRgbCycle.bind(this));
  }

  render() {
    return html`DSP Overload`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'dsp-overload-indicator': DSPOverloadIndicator;
  }
}
