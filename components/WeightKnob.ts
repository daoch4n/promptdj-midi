/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { css, html, LitElement, svg } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { styleMap } from 'lit/directives/style-map.js';

/** Maps prompt weight to halo size. */
const MIN_HALO_SCALE = 1;
const MAX_HALO_SCALE = 2;

/** The amount of scale to add to the halo based on audio level. */
const HALO_LEVEL_MODIFIER = 1;

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
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      border-radius: 50%;
      mix-blend-mode: lighten;
      transform: scale(2); /* Default large scale */
      will-change: transform;
      opacity: 0.5; /* Added for semi-transparency */
    }
  `;

  @property({ type: Number }) value = 0;
  @property({ type: String }) color = '#000'; // Color for halo
  @property({ type: Number }) audioLevel = 0; // Used for halo effect

  private dragStartPos = 0;
  private dragStartValue = 0;

  constructor() {
    super();
    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handlePointerUp = this.handlePointerUp.bind(this);
  }

  private handlePointerDown(e: PointerEvent) {
    this.dragStartPos = e.clientY;
    this.dragStartValue = this.value;
    document.body.classList.add('dragging');
    window.addEventListener('pointermove', this.handlePointerMove);
    window.addEventListener('pointerup', this.handlePointerUp);
  }

  private handlePointerMove(e: PointerEvent) {
    const delta = this.dragStartPos - e.clientY;
    this.value = this.dragStartValue + delta * 0.01;
    this.value = Math.max(0, Math.min(2, this.value));
    this.dispatchEvent(new CustomEvent<number>('input', { detail: this.value }));
  }

  private handlePointerUp(e: PointerEvent) {
    window.removeEventListener('pointermove', this.handlePointerMove);
    window.removeEventListener('pointerup', this.handlePointerUp);
    document.body.classList.remove('dragging');
  }

  private handleWheel(e: WheelEvent) {
    const delta = e.deltaY;
    this.value = this.value + delta * -0.0025;
    this.value = Math.max(0, Math.min(2, this.value));
    this.dispatchEvent(new CustomEvent<number>('input', { detail: this.value }));
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
    const rot = minRot + (this.value / 2) * (maxRot - minRot);
    const dotStyle = styleMap({
      // The indicator is placed relative to the knob's center (40,40)
      transform: `translate(40px, 40px) rotate(${rot}rad)`,
    });

    const isAutoValue = Math.abs(this.value - 1.0) < 0.001; // Check if value is at the "auto" mark (1.0)
    const indicatorColor = isAutoValue ? '#00FFFF' : '#FFFFFF'; // Cyan for auto, White otherwise
    const indicatorStrokeWidth = isAutoValue ? 3.5 : 3; // Thicker for auto

    let scale = (this.value / 2) * (MAX_HALO_SCALE - MIN_HALO_SCALE);
    scale += MIN_HALO_SCALE;
    scale += this.audioLevel * HALO_LEVEL_MODIFIER;

    const haloStyle = styleMap({
      display: this.value > 0 ? 'block' : 'none',
      background: this.color,
      transform: `scale(${scale})`,
    });

    return html`
      <div id="halo" style=${haloStyle}></div>
      <!-- Static SVG elements -->
      ${this.renderStaticSvg()}
      <!-- SVG elements that move, separated to limit redraws -->
      <svg
        viewBox="0 0 80 80"
        @pointerdown=${this.handlePointerDown}
        @wheel=${this.handleWheel}>
        <g style=${dotStyle}>
          <!-- Indicator line: longer and styled -->
          <line x1="5" y1="0" x2="25" y2="0" stroke="${indicatorColor}" stroke-width="${indicatorStrokeWidth}" stroke-linecap="round" />
        </g>
        <!-- Path for the track -->
        <path
          d=${this.describeArc(40, 40, minRot, maxRot, 34.5)}
          fill="none"
          stroke="#4A4A4A" /* Darker, subtle track for the knob range */
          stroke-opacity="0.7"
          stroke-width="2.5"
          stroke-linecap="round" />
        <!-- Path for the value fill - styled with this.color -->
        <path
          d=${this.describeArc(40, 40, minRot, rot, 34.5)}
          fill="none"
          stroke=${this.color || '#707070'} /* Use halo color or default grey */
          stroke-width="3" /* Slightly thicker value arc */
          stroke-linecap="round"
          opacity="0.8" />
      </svg>
    `;
  }
  
  private renderStaticSvg() {
    // Simplified static SVG for a more DJ-like knob
    // ViewBox is 0 0 80 80. Knob centered at (40,40).
    const knobBodyColor = "#282828"; // Dark grey for knob "side"
    const knobTopColorBase = "#303030"; // Base color for the knob top
    const knobTopHighlight = "#383838"; // Subtle highlight for the center of the knob top
    const tickColor = "#666"; // Color for tick marks
    const numTicks = 5;
    const tickLength = 3; // Length of the tick mark
    const tickRadius = 28; // Radius at which ticks are placed (center of tick)

    const rotationRange = Math.PI * 2 * 0.75;
    const minRot = -rotationRange / 2 - Math.PI / 2; // Start angle for ticks
    // const maxRot = rotationRange / 2 - Math.PI / 2; // End angle for ticks (not strictly needed for loop)

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

        <!-- Knob body (cylinder side illusion) -->
        <circle cx="40" cy="41.5" r="25" fill="${knobBodyColor}" filter="url(#knob-shadow)" />

        <!-- Knob top surface -->
        <circle cx="40" cy="40" r="25" fill="url(#knobTopGradient)" />

        <!-- Static Tick Marks -->
        ${svg`${ticksHtml}`}
      </svg>`
  }

}

declare global {
  interface HTMLElementTagNameMap {
    'weight-knob': WeightKnob;
  }
}
