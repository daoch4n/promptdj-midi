import { LitElement, type PropertyValues, css, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

interface OverloadThresholdConfig {
  threshold: number;
  color: string;
  blinkDuration: string; // Can be a fixed string like '1s' or 'dynamic' for RGB cycling
  rgbCycling?: boolean;
  rgbCycleSpeedMin?: number; // Fastest speed (at max overload)
  rgbCycleSpeedMax?: number; // Slowest speed (at min overload for this range)
}

@customElement('dsp-overload-indicator')
export class DSPOverloadIndicator extends LitElement {
  @property({ type: Number }) currentPromptAverage = 0;
  @property({ type: Number }) currentKnobAverageExtremeness = 0;
  @state() private _visible = false;
  @state() private _indicatorColor = 'yellow';
  @state() private _blinkDuration = '2s';
  @state() private _isCyclingRgb = false;
  @state() private _rgbCycleSpeed = 1.0;

  private static readonly OVERLOAD_THRESHOLDS: OverloadThresholdConfig[] = [
    // Ordered from highest threshold to lowest for easy iteration
    { threshold: 1.5, color: 'magenta', blinkDuration: 'dynamic', rgbCycling: true, rgbCycleSpeedMin: 0.2, rgbCycleSpeedMax: 1.0 },
    { threshold: 1.25, color: 'purple', blinkDuration: '0.7s' },
    { threshold: 1.0, color: 'red', blinkDuration: '1s' },
    { threshold: 0.75, color: 'yellow', blinkDuration: '1.5s' },
    { threshold: 0.5, color: 'green', blinkDuration: '2s' },
  ];

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
    }

    :host([animating].is-visible) {
      animation: blink var(--blink-duration) infinite;
    }

    :host([animating].is-visible):not([rgb-cycling]) {
      box-shadow: 0 0 5px var(--indicator-color), 0 0 10px var(--indicator-color);
    }

    :host([rgb-cycling].is-visible) {
      animation: rgb-cycle var(--rgb-cycle-speed) infinite linear,
                 blink var(--blink-duration) infinite;
    }

    @keyframes blink {
      0%,
      100% {
        opacity: 1;
      }
      50% {
        opacity: 0.6;
      }
    }

    @keyframes rgb-cycle {
      0% {
        box-shadow: 0 0 5px red, 0 0 10px red;
      }
      33% {
        box-shadow: 0 0 5px blue, 0 0 10px blue;
      }
      66% {
        box-shadow: 0 0 5px green, 0 0 10px green;
      }
      100% {
        box-shadow: 0 0 5px red, 0 0 10px red;
      }
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
      this._visible = overloadFactor > 0.5;

      let calculatedColor = 'green'; // Default to green when visible
      let calculatedBlinkDuration = '2s';
      let shouldAnimateBlink = false;
      let shouldCycleRgb = false;
      let rgbCycleSpeed = 1.0; // Default speed for RGB cycle

      if (this._visible) {
        shouldAnimateBlink = true; // If visible, it should blink

        for (const config of DSPOverloadIndicator.OVERLOAD_THRESHOLDS) {
          if (overloadFactor > config.threshold) {
            calculatedColor = config.color;
            calculatedBlinkDuration = config.blinkDuration;
            shouldCycleRgb = config.rgbCycling || false;

            if (shouldCycleRgb && config.rgbCycleSpeedMin !== undefined && config.rgbCycleSpeedMax !== undefined) {
              // Calculate speed: faster as overloadFactor goes from config.threshold to 2.0 (max possible)
              const rangeForSpeedCalc = 2.0 - config.threshold;
              const normalizedOverload = Math.min(1, Math.max(0, (overloadFactor - config.threshold) / rangeForSpeedCalc));
              rgbCycleSpeed = config.rgbCycleSpeedMax - (normalizedOverload * (config.rgbCycleSpeedMax - config.rgbCycleSpeedMin));
              calculatedBlinkDuration = `${rgbCycleSpeed}s`; // Blink speed matches RGB cycle speed
            }
            break; // Found the highest applicable threshold, apply its settings and break
          }
        }
      }

      // Apply states and attributes
      if (this._visible) {
        this.classList.add('is-visible');
        if (shouldAnimateBlink) {
          this.setAttribute('animating', '');
        } else {
          this.removeAttribute('animating');
        }
        if (shouldCycleRgb) {
          this.setAttribute('rgb-cycling', '');
        } else {
          this.removeAttribute('rgb-cycling');
        }
        this.style.setProperty('--indicator-color', calculatedColor);
        this.style.setProperty('--blink-duration', calculatedBlinkDuration);
        this.style.setProperty('--rgb-cycle-speed', `${rgbCycleSpeed}s`);
      } else {
        this.classList.remove('is-visible');
        this.removeAttribute('animating');
        this.removeAttribute('rgb-cycling');
        // Reset CSS variables when not visible
        this.style.setProperty('--indicator-color', 'yellow'); // Default reset color
        this.style.setProperty('--blink-duration', '2s'); // Default reset duration
        this.style.setProperty('--rgb-cycle-speed', '1s'); // Default reset speed
      }
    }
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
