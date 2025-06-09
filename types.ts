/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
export const GENRE_COLORS = {
  // Row 1
  Ambient: "#20B2AA",         // Light Sea Green - calm/atmospheric
  "Lo-fi Hip Hop": "#3CB371", // Medium Sea Green - relaxed
  Chillwave: "#1E90FF",       // Dodger Blue - cool/electronic
  Vaporwave: "#00FA9A",       // Medium Spring Green - retro
  Shoegaze: "#FFD700",        // Gold - dreamy
  "Ethereal Vibes": "#4682B4",// Steel Blue - airy
  "Nu Jazz": "#BA55D3",       // Medium Orchid - jazzy
  "Neo Soul": "#DA70D6",      // Orchid - smooth

  // Row 2
  House: "#4169E1",           // Royal Blue - classic electronic
  "Nu Disco": "#9932CC",      // Dark Orchid - disco revival
  Synthwave: "#00FFFF",       // Cyan - 80s retro
  Trance: "#1E90FF",          // Dodger Blue (same as Chillwave)
  "Sparkling Arpeggios": "#FFA500", // Orange - bright/energetic
  Funk: "#FF4500",            // Orange Red - funky
  "Bossa Nova": "#FF69B4",    // Hot Pink - warm/latin
  Reggae: "#228B22",          // Forest Green - earthy

  // Row 3
  Techno: "#FF8C00",          // Dark Orange - industrial
  "Drum and Bass": "#8A2BE2", // Blue Violet - energetic
  Dubstep: "#FF0000",         // Red - intense
  "Massive Drop": "#C71585",  // Medium Violet Red - impactful
  "Trap Wave": "#00BFFF",     // Deep Sky Blue - modern trap
  "Staccato Rhythms": "#FF6347",   // Tomato - sharp/percussive
  "Punchy Kick": "#DC143C",   // Crimson - powerful
  "Space Bass": "#00CED1",    // Dark Turquoise - cosmic

  // Row 4
  "Post Punk": "#32CD32",     // Lime Green - edgy
  Darkwave: "#2F4F4F",        // Dark Slate Gray - gothic
  "Witch House": "#4B0082",   // Indigo - dark/mysterious
  Thrash: "#B22222",          // Fire Brick - aggressive
  "Drifting Phonk": "#FF1493",// Deep Pink - drifting/psychedelic
  Bitpop: "#7CFC00",          // Lawn Green - digital
  "Surf Rock": "#00FF7F",     // Spring Green - beachy
} as const;


export interface Prompt {
  readonly promptId: string;
  text: string;
  weight: number;
  cc: number;
  color: string;
  isAutoFlowing?: boolean;
  activatedFromZero?: boolean;
  backgroundDisplayWeight?: number;
}

export interface ControlChange {
  channel: number;
  cc: number;
  value: number;
}

export type PlaybackState = 'stopped' | 'playing' | 'loading' | 'paused';
