/**
 * Thresholds — Scene Catalog
 * Cultural sensory motifs, narratives, and media mappings.
 */

const SCENES = [
  {
    id: 'candle',
    culture: 'Japanese Folklore & Buddhist Contemplation',
    title: 'The Extinguished Flame',
    prose: 'A solitary candle is held up into the stillness. The wick flares with warm amber light, wavers in a sudden unfelt draft, and is gently blown out. A thread of silver smoke curls into the darkness, vanishing into boundless quiet.',
    element: 'Fire & Silver Smoke',
    motif: 'Extinction of Breath',
    duration: 18000,
    image: 'assets/candle.jpg',
    video: 'assets/videos/candle.mp4',
    audioMood: 'candle',
    accentColor: '#dfb572'
  },
  {
    id: 'maple',
    culture: 'Japanese Poetics & Edo-Era Lore',
    title: 'The Golden Maple Grove',
    prose: 'Departing through an ancient grove of crimson and golden momiji leaves, never to return. Those who follow in haste watch the traveler’s silhouette dissolve into the falling amber canopy until only the quiet descent of leaves remains.',
    element: 'Foliage & Mountain Mist',
    motif: 'Golden Dissolution',
    duration: 20000,
    image: 'assets/maple.jpg',
    video: 'assets/videos/maple.mp4',
    audioMood: 'maple',
    accentColor: '#d67537'
  },
  {
    id: 'snow',
    culture: 'Northern Folk Tradition & Cinematic Realism',
    title: 'Footprints That Cease in Snow',
    prose: 'A steady line of heavy boot prints trudging across a vast, windswept field of fresh winter powder. The trail advances step by step—until, in the middle of the unbroken white, the impressions simply stop. No struggle, no return. Only pristine silence.',
    element: 'Winter Snow & Cold Twilight',
    motif: 'The Abrupt Cessation',
    duration: 20000,
    image: 'assets/snow.jpg',
    video: 'assets/videos/snow.mp4',
    audioMood: 'snow',
    accentColor: '#a9c4df'
  },
  {
    id: 'wheat',
    culture: 'Agrarian Folklore & American/Slavic Poetics',
    title: 'Stepping Into the High Wheat',
    prose: 'Walking away from the farmhouse under the intense glare of a summer afternoon. The waist-high golden stalks part with a dry whisper, close behind the traveler’s back, and the sun-drenched horizon remains completely still.',
    element: 'Sunlit Grain & Drifting Pollen',
    motif: 'Swallowed by the Horizon',
    duration: 20000,
    image: 'assets/wheat.jpg',
    video: 'assets/videos/wheat.mp4',
    audioMood: 'wheat',
    accentColor: '#dfb76c'
  },
  {
    id: 'river',
    culture: 'West & Central African Traditions',
    title: 'The Plain of Flowers and the Crossing',
    prose: 'After walking across an endless, windblown savannah carpeted in wild twilight blossoms, the wanderer arrives at the banks of the mirrored river. The cool water receives them, and the gentle current carries them out into the evening mist.',
    element: 'Savannah & Mirrored Water',
    motif: 'The Flowing Passage',
    duration: 22000,
    image: 'assets/river.jpg',
    video: 'assets/videos/river.mp4',
    audioMood: 'river',
    accentColor: '#8ea8d9'
  },
  {
    id: 'ferryman',
    culture: 'Greco-Roman & Celtic Underworld Myth',
    title: 'The Fog and the Ferryman’s Coin',
    prose: 'A reed-choked riverbank veiled in low, heavy mist. Cold and transactional: the soul stands at the edge of the dark current with a copper obol held in an open palm, waiting for the silent rhythm of an oar to emerge from the gray.',
    element: 'Stygian Mist & Copper Coin',
    motif: 'The Transactional Crossing',
    duration: 20000,
    image: 'assets/ferryman.jpg',
    video: 'assets/videos/ferryman.mp4',
    audioMood: 'ferryman',
    accentColor: '#6da6a1'
  },
  {
    id: 'watch',
    culture: 'Mechanical Memento Mori',
    title: 'The Stopped Escapement',
    prose: 'Upon a quiet bedside table, an antique pocket watch ticks with relentless precision. Suddenly, a microscopic escapement catches; the brass gears freeze mid-second, plunging the room into a deep, vacuum-like silence where only the rhythm’s absence echoes.',
    element: 'Gilded Brass & Pure Silence',
    motif: 'The Bound Escapement',
    duration: 18000,
    image: 'assets/watch.jpg',
    video: 'assets/videos/watch.mp4',
    audioMood: 'watch',
    accentColor: '#d4ab65'
  },
  {
    id: 'tram',
    culture: 'Modern Urban Folklore & Cinematic Realism',
    title: 'The 3:00 AM Streetcar',
    prose: 'A rain-slicked city platform under flickering sodium-vapor lamps. A single empty tram arrives with a low pneumatic hiss; the doors part, the traveler steps aboard onto worn vinyl, and the car glides into the wet darkness, its amber headlights swallowed by mist.',
    element: 'Sodium Vapor & Midnight Rain',
    motif: 'The Last Departure',
    duration: 22000,
    image: 'assets/tram.jpg',
    video: 'assets/videos/tram.mp4',
    audioMood: 'tram',
    accentColor: '#f2a65a'
  },
  {
    id: 'cage',
    culture: 'Sufi Mysticism & Andalusian Verse',
    title: 'The Unlatched Cage',
    prose: 'Physical life is the narrow enclosure; departure is the long-awaited union. Upon an empty stone terrace, a weathered birdcage door swings open in a warm gust. A single white feather catches the updraft, spiraling into limitless open twilight.',
    element: 'Brass Wire & Limitless Sky',
    motif: 'The Open Threshold',
    duration: 20000,
    image: 'assets/cage.jpg',
    video: 'assets/videos/cage.mp4',
    audioMood: 'cage',
    accentColor: '#b4a5d8'
  },
  {
    id: 'shadow',
    culture: 'Mesoamerican & Nahua Tradition',
    title: 'The Shadow at High Noon',
    prose: 'Not into darkness, but beneath an unblinking, blinding desert sun. The figure stands motionless upon hard-packed earth as their shadow detaches from beneath their heels, stretching outward across the dunes toward Mictlán, leaving the physical form pale and shadowless.',
    element: 'Bleached Sand & Desert Sun',
    motif: 'The Severed Shadow',
    duration: 20000,
    image: 'assets/shadow.jpg',
    video: 'assets/videos/shadow.mp4',
    audioMood: 'shadow',
    accentColor: '#e0a96d'
  },
  {
    id: 'tea',
    culture: 'East Asian / Chinese Underworld Lore',
    title: 'The Scent of Stone-Cold Tea',
    prose: 'At the Naihe Bridge over the River of Forgetfulness, an earthen cup of warm tea is raised and set down empty. The steam curls upward, softening stone and memory into translucent watercolors, until every former grief and name dissolves like ink in still water.',
    element: 'Earthen Bowl & Rising Steam',
    motif: 'The Cup of Forgetfulness',
    duration: 20000,
    image: 'assets/tea.jpg',
    video: 'assets/videos/tea.mp4',
    audioMood: 'tea',
    accentColor: '#96b8a2'
  },
  {
    id: 'loom',
    culture: 'West African / Fon & Yoruba Tradition',
    title: 'The Unraveling Loom',
    prose: 'A rich tapestry mid-weave upon an upright wooden loom. Without warning, the warp tension yields; the vertical threads drop slack, and the woven patterns gently loosen into pure, unspun fiber drifting upon the floor.',
    element: 'Dyed Threads & Slack Warp',
    motif: 'The Released Pattern',
    duration: 19000,
    image: 'assets/loom.jpg',
    video: 'assets/videos/loom.mp4',
    audioMood: 'loom',
    accentColor: '#c97a7e'
  }
];
