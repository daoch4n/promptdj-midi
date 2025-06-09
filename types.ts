/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
export const GENRE_COLORS = {
  Ambient: "#20B2AA",         // Light Sea Green - calm/atmospheric
  "Bossa Nova": "#FF69B4",    // Hot Pink - warm/latin
  Chillwave: "#1E90FF",       // Dodger Blue - cool/electronic
  "Drum and Bass": "#8A2BE2", // Blue Violet - energetic
  "Post Punk": "#32CD32",     // Lime Green - edgy
  Shoegaze: "#FFD700",        // Gold - dreamy
  Funk: "#FF4500",            // Orange Red - funky
  "Witch House": "#4B0082",   // Indigo - dark/mysterious
  "Space Bass": "#00CED1",    // Dark Turquoise - cosmic
  "Sparkling Arpeggios": "#FFA500", // Orange - bright/energetic
  "Staccato Rhythms": "#FF6347",   // Tomato - sharp/percussive
  "Punchy Kick": "#DC143C",   // Crimson - powerful
  Dubstep: "#FF0000",         // Red - intense
  Bitpop: "#7CFC00",          // Lawn Green - digital
  "Neo Soul": "#DA70D6",      // Orchid - smooth
  "Trip Hop": "#9370DB",      // Medium Purple - moody
  Thrash: "#B22222",          // Fire Brick - aggressive
  "Lo-fi Hip Hop": "#3CB371", // Medium Sea Green - relaxed
  House: "#4169E1",           // Royal Blue - classic electronic
  Techno: "#FF8C00",          // Dark Orange - industrial
  "Drifting Phonk": "#FF1493",// Deep Pink - drifting/psychedelic
  Reggae: "#228B22",          // Forest Green - earthy
  "Massive Drop": "#C71585",  // Medium Violet Red - impactful
  "Trap Wave": "#00BFFF",     // Deep Sky Blue - modern trap
  "Ethereal Vibes": "#4682B4",// Steel Blue - airy
  Vaporwave: "#00FA9A",       // Medium Spring Green - retro
  "Surf Rock": "#00FF7F",     // Spring Green - beachy
  Darkwave: "#2F4F4F",        // Dark Slate Gray - gothic
  "Nu Disco": "#9932CC",      // Dark Orchid - disco revival
  Synthwave: "#00FFFF",       // Cyan - 80s retro
  Trance: "#1E90FF",          // Dodger Blue (same as Chillwave)
  "Nu Jazz": "#BA55D3",       // Medium Orchid - jazzy
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
