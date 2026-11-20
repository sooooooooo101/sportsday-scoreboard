// Sample scores for eyeballing the display locally.
export const settings = { capMode: 'shared', hideFromOrder: 5, hidden: false }
export const competitions = [
  { id: 'A', name: '借り人競走', order: 1, matchCount: 4, max: 100, capped: true, presets: [7, 5, 4, 3, 1], scores: { 1: { blue: 12, white: 11 }, 2: { blue: 9, white: 14 } } },
  { id: 'B', name: '玉入れ改', order: 2, matchCount: 3, max: 100, capped: false, presets: [], scores: { 1: { blue: 30, white: 20 } } },
  { id: 'D', name: '障害物リレー', order: 3, matchCount: 1, max: 100, capped: true, presets: [40, 30, 20, 10], scores: {} },
  { id: 'C', name: 'ドッジボール', order: 4, matchCount: 2, max: 100, capped: true, presets: [40, 25, 10], scores: {} },
  { id: 'E', name: 'メンターリレー', order: 5, matchCount: 2, max: 100, capped: true, presets: [50, 30], scores: {} },
]
