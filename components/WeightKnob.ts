/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { LitElement, css, html, svg } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { styleMap } from 'lit/directives/style-map.js';

/** Maps prompt weight to halo size. */
const MIN_HALO_SCALE = 1;
const MAX_HALO_SCALE = 2;

/** The amount of scale to add to the halo based on audio level. */
const HALO_LEVEL_MODIFIER = 0.1;

// Old smoothing factors (commented out as per previous step)
// const DEFAULT_ANIMATION_SMOOTHING_FACTOR = 0.2;
// const BACKGROUND_EFFECT_SMOOTHING_FACTOR = 0.01;

const DOT_SMOOTHING_FACTOR = 0.2;
const ARC_AUTO_SMOOTHING_FACTOR = 0.02;
const HALO_AUTO_SMOOTHING_FACTOR = 0.01;
const ARC_DRAG_SMOOTHING_FACTOR = 0.05;
const HALO_DRAG_SMOOTHING_FACTOR = 0.01;

/** A knob for adjusting and visualizing prompt weight. */
@customElement('weight-knob')
export class WeightKnob extends LitElement {
  static override styles = css`
    :host {
      cursor: grab;
      position: relative;
      width: 100%;
      aspect-ratio: 1;
      flex-shrink: 0;
      touch-action: none;
    }
    svg {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
    }
    #halo {
      position: absolute;
      z-index: -1;
      top: 50%;
      left: 50%;
      width: 66.67px; /* 1.5x smaller than 100px base */
      height: 66.67px;
      border-radius: 50%;
      mix-blend-mode: lighten;
      transform: translate(-50%, -50%); /* Centering using transform */
      will-change: transform;
      opacity: 0.5; /* Added for semi-transparency */
    }
  `;

  private _value = 0;

  @property({ type: Number })
  get value(): number {
    return this._value;
  }

  set value(newVal: number) {
    const oldVal = this._value;
    const clampedNewVal = Math.max(0, Math.min(2, newVal));

    this._value = clampedNewVal; // Keep track of the "true" value

    // Set context for drag/direct manipulation
    this._currentAnimationContext = 'drag';

    // Update target and start animation for DOT
    // (Setter for _targetValue, not _currentValue, as _currentValue is the animated property)
    if (this._targetValue !== clampedNewVal) {
      this._targetValue = clampedNewVal;
      if (this._dotAnimationId === null) {
        this._animateDot();
      }
    }

    // Update target and start animation for ARC
    if (this._targetArcDisplayValue !== clampedNewVal) {
      this._targetArcDisplayValue = clampedNewVal;
      if (this._arcAnimationId === null) {
        this._animateArc();
      }
    }

    // Update target and start animation for HALO
    const newTargetHaloAlpha = clampedNewVal > 0.001 ? 1.0 : 0.0;
    if (this._targetBackgroundEffectAlpha !== newTargetHaloAlpha) {
      this._targetBackgroundEffectAlpha = newTargetHaloAlpha;
      if (this._haloAnimationId === null) {
        this._animateHalo();
      }
    }

    this.requestUpdate('value', oldVal);
  }

  @property({ type: String }) color = '#000';
  @property({ type: Number }) audioLevel = 0;
  @property({ type: String }) displayValue = '';

  // Properties for dot animation
  private _currentValue = 0;
  private _targetValue = 0;
  private _dotAnimationId: number | null = null;

  // Properties for arc animation
  private _arcDisplayValue = 0;
  private _targetArcDisplayValue = 0;
  private _arcAnimationId: number | null = null;

  // Properties for halo (background effect) animation
  private _backgroundEffectAlpha = 0;
  private _targetBackgroundEffectAlpha = 0;
  private _haloAnimationId: number | null = null;

  private _currentAnimationContext: 'drag' | 'auto' = 'drag';

  private dragStartPos = 0;
  private dragStartValue = 0;

  constructor() {
    super();
    this._currentValue = this.value;
    this._targetValue = this.value;
    this._arcDisplayValue = this.value;
    this._targetArcDisplayValue = this.value;
    this._backgroundEffectAlpha = this.value > 0.001 ? 1.0 : 0.0;
    this._targetBackgroundEffectAlpha = this._backgroundEffectAlpha;

    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handlePointerUp = this.handlePointerUp.bind(this);
  }

  override connectedCallback() {
    super.connectedCallback();
    this._currentValue = this.value;
    this._targetValue = this.value;
    this._arcDisplayValue = this.value;
    this._targetArcDisplayValue = this.value;
    this._backgroundEffectAlpha = this.value > 0.001 ? 1.0 : 0.0;
    this._targetBackgroundEffectAlpha = this._backgroundEffectAlpha;

    if (
      this._currentValue !== this._targetValue &&
      this._dotAnimationId === null
    ) {
      this._animateDot();
    }
    this.snapArcAndHaloToCurrentValue();
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    if (this._dotAnimationId !== null) {
      cancelAnimationFrame(this._dotAnimationId);
      this._dotAnimationId = null;
    }
    if (this._arcAnimationId !== null) {
      cancelAnimationFrame(this._arcAnimationId);
      this._arcAnimationId = null;
    }
    if (this._haloAnimationId !== null) {
      cancelAnimationFrame(this._haloAnimationId);
      this._haloAnimationId = null;
    }
  }

  public triggerAutoAnimation(isFadeIn: boolean): void {
    this._currentAnimationContext = 'auto';

    const targetVal = isFadeIn ? 1.0 : 0.0; // This is the knob's value target

    // Ensure dot is also targeting this value.
    if (this._targetValue !== targetVal) {
      this._targetValue = targetVal;
    }

    this._targetArcDisplayValue = targetVal; // Arc targets the same numeric value
    this._targetBackgroundEffectAlpha = isFadeIn ? 1.0 : 0.0; // Alpha is 0 or 1

    // Start animations if they aren't already running towards these targets
    // or to ensure they pick up the 'auto' context for smoothing factors.
    if (
      this._dotAnimationId === null &&
      this._currentValue !== this._targetValue
    ) {
      this._animateDot();
    }
    if (
      this._arcAnimationId === null &&
      this._arcDisplayValue !== this._targetArcDisplayValue
    ) {
      this._animateArc();
    }
    if (
      this._haloAnimationId === null &&
      this._backgroundEffectAlpha !== this._targetBackgroundEffectAlpha
    ) {
      this._animateHalo();
    }
  }

  public snapArcAndHaloToCurrentValue(): void {
    this._currentAnimationContext = 'drag';

    if (this._arcAnimationId !== null) {
      cancelAnimationFrame(this._arcAnimationId);
      this._arcAnimationId = null;
    }
    if (this._haloAnimationId !== null) {
      cancelAnimationFrame(this._haloAnimationId);
      this._haloAnimationId = null;
    }

    const newAlpha = this._currentValue > 0.001 ? 1.0 : 0.0;
    let needsUpdate = false;

    if (this._backgroundEffectAlpha !== newAlpha) {
      this._backgroundEffectAlpha = newAlpha;
      this._targetBackgroundEffectAlpha = newAlpha;
      needsUpdate = true;
    }

    if (this._arcDisplayValue !== this._currentValue) {
      this._arcDisplayValue = this._currentValue;
      this._targetArcDisplayValue = this._currentValue;
      needsUpdate = true;
    }

    if (needsUpdate) {
      this.requestUpdate();
    }
  }

  private _animateDot() {
    const difference = this._targetValue - this._currentValue;

    if (Math.abs(difference) < 0.001) {
      this._currentValue = this._targetValue;
      if (this._dotAnimationId !== null) {
        cancelAnimationFrame(this._dotAnimationId);
        this._dotAnimationId = null;
      }
      this.requestUpdate();
      return;
    }

    this._currentValue += difference * DOT_SMOOTHING_FACTOR;
    this.requestUpdate();

    if (Math.abs(this._currentValue - this._targetValue) < 0.001) {
      this._currentValue = this._targetValue;
      if (this._dotAnimationId !== null) {
        cancelAnimationFrame(this._dotAnimationId);
        this._dotAnimationId = null;
      }
    } else if (this._currentValue !== this._targetValue) {
      this._dotAnimationId = requestAnimationFrame(() => this._animateDot());
    } else {
      if (this._dotAnimationId !== null) {
        cancelAnimationFrame(this._dotAnimationId);
        this._dotAnimationId = null;
      }
    }
  }

  private _animateArc() {
    const difference = this._targetArcDisplayValue - this._arcDisplayValue;
    const factor =
      this._currentAnimationContext === 'auto'
        ? ARC_AUTO_SMOOTHING_FACTOR
        : ARC_DRAG_SMOOTHING_FACTOR;

    if (Math.abs(difference) < 0.001) {
      this._arcDisplayValue = this._targetArcDisplayValue;
      if (this._arcAnimationId !== null) {
        cancelAnimationFrame(this._arcAnimationId);
        this._arcAnimationId = null;
      }
      this.requestUpdate();
      return;
    }

    this._arcDisplayValue += difference * factor;
    this.requestUpdate();

    if (this._arcDisplayValue !== this._targetArcDisplayValue) {
      this._arcAnimationId = requestAnimationFrame(() => this._animateArc());
    } else {
      if (this._arcAnimationId !== null) {
        cancelAnimationFrame(this._arcAnimationId);
        this._arcAnimationId = null;
      }
    }
  }

  private _animateHalo() {
    const difference =
      this._targetBackgroundEffectAlpha - this._backgroundEffectAlpha;
    const factor =
      this._currentAnimationContext === 'auto'
        ? HALO_AUTO_SMOOTHING_FACTOR
        : HALO_DRAG_SMOOTHING_FACTOR;

    if (Math.abs(difference) < 0.001) {
      this._backgroundEffectAlpha = this._targetBackgroundEffectAlpha;
      if (this._haloAnimationId !== null) {
        cancelAnimationFrame(this._haloAnimationId);
        this._haloAnimationId = null;
      }
      this.requestUpdate();
      return;
    }

    this._backgroundEffectAlpha += difference * factor;
    this.requestUpdate();

    if (this._backgroundEffectAlpha !== this._targetBackgroundEffectAlpha) {
      this._haloAnimationId = requestAnimationFrame(() => this._animateHalo());
    } else {
      if (this._haloAnimationId !== null) {
        cancelAnimationFrame(this._haloAnimationId);
        this._haloAnimationId = null;
      }
    }
  }

  private handlePointerDown(e: PointerEvent) {
    this.dragStartPos = e.clientY;
    this.dragStartValue = this.value; // Store the "true" value
    document.body.classList.add('dragging');
    window.addEventListener('pointermove', this.handlePointerMove);
    window.addEventListener('pointerup', this.handlePointerUp);
    // Snap all animated properties to the current true value at drag start
    this._currentValue = this._value;
    this._arcDisplayValue = this._value;
    this._backgroundEffectAlpha = this._value > 0.001 ? 1.0 : 0.0;
    this._targetValue = this._value; // Ensure targets are aligned
    this._targetArcDisplayValue = this._value;
    this._targetBackgroundEffectAlpha = this._backgroundEffectAlpha;

    // Cancel any ongoing animations
    if (this._dotAnimationId) {
      cancelAnimationFrame(this._dotAnimationId);
      this._dotAnimationId = null;
    }
    if (this._arcAnimationId) {
      cancelAnimationFrame(this._arcAnimationId);
      this._arcAnimationId = null;
    }
    if (this._haloAnimationId) {
      cancelAnimationFrame(this._haloAnimationId);
      this._haloAnimationId = null;
    }

    this.requestUpdate();
  }

  private handlePointerMove(e: PointerEvent) {
    const delta = this.dragStartPos - e.clientY;
    // Directly set the public 'value' property. This will trigger the updated setter.
    this.value = this.dragStartValue + delta * 0.01;
    // DO NOT call snapArcAndHaloToCurrentValue() here anymore. The setter handles it.
    this.dispatchEvent(
      new CustomEvent<number>('input', { detail: this._value }),
    );
  }

  private handlePointerUp(e: PointerEvent) {
    window.removeEventListener('pointermove', this.handlePointerMove);
    window.removeEventListener('pointerup', this.handlePointerUp);
    document.body.classList.remove('dragging');

    // The 'value' setter has already set the 'drag' context and started animations.
    // No need to do anything extra here for drag context animations,
    // as the targets were updated during handlePointerMove via the setter.
  }

  private handleWheel(e: WheelEvent) {
    const delta = e.deltaY;
    // Directly set the public 'value' property. This will trigger the updated setter.
    this.value = this._value + delta * -0.0025;
    this.dispatchEvent(
      new CustomEvent<number>('input', { detail: this._value }),
    );
  }

  private describeArc(
    centerX: number,
    centerY: number,
    startAngle: number,
    endAngle: number,
    radius: number,
  ): string {
    const startX = centerX + radius * Math.cos(startAngle);
    const startY = centerY + radius * Math.sin(startAngle);
    const endX = centerX + radius * Math.cos(endAngle);
    const endY = centerY + radius * Math.sin(endAngle);

    const largeArcFlag = endAngle - startAngle <= Math.PI ? '0' : '1';

    return (
      `M ${startX} ${startY}` +
      `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${endX} ${endY}`
    );
  }

  override render() {
    const rotationRange = Math.PI * 2 * 0.75;
    const minRot = -rotationRange / 2 - Math.PI / 2;
    const maxRot = rotationRange / 2 - Math.PI / 2;

    const rotForArc = minRot + (this._arcDisplayValue / 2) * (maxRot - minRot);
    const rotForDot = minRot + (this._currentValue / 2) * (maxRot - minRot);

    const dotStyle = styleMap({
      transform: `translate(40px, 40px) rotate(${rotForDot}rad)`,
    });

    const isAutoValue = Math.abs(this._currentValue - 1.0) < 0.001;
    const indicatorColor = isAutoValue ? '#00FFFF' : '#FFFFFF';
    const indicatorStrokeWidth = isAutoValue ? 3.5 : 3;

    let normalizedDriverForHaloScale: number;
    if (this._currentAnimationContext === 'auto') {
      normalizedDriverForHaloScale = this._backgroundEffectAlpha; // Is already 0-1
    } else {
      // 'drag' context
      // Ensure _currentValue is within 0-2 range for this calculation,
      // though it should be due to clamping in the setter.
      const clampedCurrentValue = Math.max(0, Math.min(2, this._currentValue));
      normalizedDriverForHaloScale = clampedCurrentValue / 2; // Normalize _currentValue (0-2) to 0-1
    }

    let haloBaseScale =
      normalizedDriverForHaloScale * (MAX_HALO_SCALE - MIN_HALO_SCALE);
    haloBaseScale += MIN_HALO_SCALE;

    const haloDisplayScale =
      haloBaseScale + this.audioLevel * HALO_LEVEL_MODIFIER * 0.5;

    const haloStyle = styleMap({
      opacity: (
        this._backgroundEffectAlpha * 0.5 +
        this.audioLevel * HALO_LEVEL_MODIFIER * 0.0025
      ).toString(),
      display: this._backgroundEffectAlpha > 0.001 ? 'block' : 'none',
      background: this.color,
      transform: `translate(-50%, -50%) scale(${haloDisplayScale})`,
      boxShadow: `0 0 7.5px 2.5px var(--knob-color)`,
    });

    return html`
      <div id="halo" style=${haloStyle}></div>
      ${this.renderStaticSvg()}
      <svg
        viewBox="0 0 80 80"
        @pointerdown=${this.handlePointerDown}
        @wheel=${this.handleWheel}>
        <g style=${dotStyle}>
          <line x1="5" y1="0" x2="25" y2="0" stroke="${indicatorColor}" stroke-width="${indicatorStrokeWidth}" stroke-linecap="round" />
        </g>
        <path
          d=${this.describeArc(40, 40, minRot, maxRot, 34.5)}
          fill="none"
          stroke="#4A4A4A"
          stroke-opacity="0.7"
          stroke-width="2.5"
          stroke-linecap="round" />
        <path
          d=${this.describeArc(40, 40, minRot, rotForArc, 34.5)}
          fill="none"
          stroke=${this.color || '#707070'}
          stroke-width="3"
          stroke-linecap="round"
          opacity="0.8" />
      </svg>
    `;
  }

  private renderStaticSvg() {
    const knobBodyColor = '#282828';
    const knobTopColorBase = '#303030';
    const knobTopHighlight = '#383838';
    const tickColor = '#666';
    const numTicks = 5;
    const tickLength = 3;
    const tickRadius = 28;

    const rotationRange = Math.PI * 2 * 0.75;
    const minRot = -rotationRange / 2 - Math.PI / 2;

    let ticksHtml = '';
    for (let i = 0; i < numTicks; i++) {
      const tickAngle = minRot + (i / (numTicks - 1)) * rotationRange;
      const x1 = 40 + (tickRadius - tickLength / 2) * Math.cos(tickAngle);
      const y1 = 40 + (tickRadius - tickLength / 2) * Math.sin(tickAngle);
      const x2 = 40 + (tickRadius + tickLength / 2) * Math.cos(tickAngle);
      const y2 = 40 + (tickRadius + tickLength / 2) * Math.sin(tickAngle);
      ticksHtml += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${tickColor}" stroke-width="1.5" stroke-linecap="round" />`;
    }

    return html`<svg viewBox="0 0 80 80">
        <defs>
          <filter id="knob-shadow" x="-50%" y="-50%" width="200%" height="200%">
            <feOffset result="offOut" in="SourceAlpha" dx="0" dy="1" />
            <feGaussianBlur result="blurOut" in="offOut" stdDeviation="1.5" />
            <feBlend in="SourceGraphic" in2="blurOut" mode="normal" />
          </filter>
          <radialGradient id="knobTopGradient" cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
            <stop offset="0%" style="stop-color:${knobTopHighlight};stop-opacity:1" />
            <stop offset="100%" style="stop-color:${knobTopColorBase};stop-opacity:1" />
          </radialGradient>
        </defs>
        <circle cx="40" cy="41.5" r="25" fill="${knobBodyColor}" filter="url(#knob-shadow)" />
        <circle cx="40" cy="40" r="25" fill="url(#knobTopGradient)" />
        ${svg`${ticksHtml}`}
      </svg>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'weight-knob': WeightKnob;
  }
}
