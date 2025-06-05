import { LitElement, html, css, PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

@customElement('dsp-overload-indicator')
export class DSPOverloadIndicator extends LitElement {
  @property({ type: Number }) currentPromptAverage = 0;
  @property({ type: Number }) currentKnobAverageExtremeness = 0;

  // _visible state might not be strictly needed if we query classList, but can be useful for clarity
  @state() private _visible = false;

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
      --glow-color: yellow; /* Default glow color */
      --blink-duration: 2s; /* Default blink duration */
    }

    :host(.is-visible) {
      display: block;
    }

    :host([animating].is-visible) { /* Ensure it's also visible to animate */
      box-shadow: 0 0 5px var(--glow-color), 0 0 10px var(--glow-color);
      animation: blink var(--blink-duration) infinite;
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
  `;

  updated(changedProperties: PropertyValues) {
    super.updated(changedProperties);

    if (
      changedProperties.has('currentPromptAverage') ||
      changedProperties.has('currentKnobAverageExtremeness')
    ) {
      this._visible =
        this.currentPromptAverage > 1.0 ||
        this.currentKnobAverageExtremeness > 0.5;

      if (this._visible) {
        this.classList.add('is-visible');

        if (this.currentPromptAverage > 1.0) {
          this.setAttribute('animating', ''); // Enable animations

          let promptIntensity = Math.max(0, this.currentPromptAverage - 1.0); // Range 0-1 (how much > 1.0)

          // Knob extremeness adds to the animation intensity.
          // Max contribution from knob is 0.5 to the factor.
          // Total animationIntensityFactor can go from 0 up to 1.5 (1 from prompt, 0.5 from knob).
          let animationIntensityFactor =
            promptIntensity + this.currentKnobAverageExtremeness * 0.5;
          animationIntensityFactor = Math.min(animationIntensityFactor, 1.5); // Cap at 1.5

          // Progress is normalized from 0 to 1 based on this capped factor.
          const progress = animationIntensityFactor / 1.5;

          const hue = 60 * (1 - progress); // 60 for yellow (progress=0), 0 for red (progress=1)
          this.style.setProperty('--glow-color', `hsl(${hue}, 100%, 50%)`);

          const blinkDuration = Math.max(0.5, 2 - 1.5 * progress); // 2s (progress=0) down to 0.5s (progress=1)
          this.style.setProperty('--blink-duration', `${blinkDuration}s`);
        } else {
          // Visible (due to knob extremeness > 0.5) but not animating (because currentPromptAverage <= 1.0)
          this.removeAttribute('animating');
          // Reset to default glow color and blink duration if needed, though they won't apply without 'animating'
          this.style.setProperty('--glow-color', 'yellow');
          this.style.setProperty('--blink-duration', '2s');
        }
      } else {
        // Not visible
        this.classList.remove('is-visible');
        this.removeAttribute('animating');
        // Reset to default glow color and blink duration
        this.style.setProperty('--glow-color', 'yellow');
        this.style.setProperty('--blink-duration', '2s');
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
