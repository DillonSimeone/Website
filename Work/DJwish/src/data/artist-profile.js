/**
 * ArtistProfile - Bio, Research, and Performance Data for Nate Hergert (DJ Deaf Wish)
 * Official Website: https://natehergert.com/
 *
 * The street murals are painted from this data; keep the sr-only copy in index.html in sync.
 */

export const ARTIST_DATA = {
  name: "Nate Hergert",
  alias: "DJ DEAF WISH",
  location: "Portland, Oregon",
  tagline: "Universal Music Design // Deaf Sonic Agency",
  websiteUrl: "https://natehergert.com/",

  bio: `Nate Hergert (DJ Deaf Wish) is a Deaf advocate, researcher, organizer, and electronic musician based in Portland, Oregon. His work transforms acoustic sound into visceral, multi-sensory experiences through sub-bass tactile haptics, synchronized visual telemetry, and modular electronic performance.`,

  mission: `Music is not merely auditory—it is kinetic, spatial, and tactile. By pairing modular synthesis, sub-bass resonance, and live sound-reactive projection rigs, DJ Deaf Wish redefines live club culture for Deaf and hard-of-hearing audiences worldwide.`,

  base: "BASE: PORTLAND, OR // SYNTHESIS & ELECTRONICS",

  riderIntro: "Live setup engineered for maximum visceral chest impact and sensory immersion:",

  techRider: [
    { label: "Tactile Haptics", desc: "Low-frequency sub-bass transducer vests & physical floor exciters." },
    { label: "Visual Telemetry", desc: "Real-time 20Hz-20kHz 7-band synesthetic projection mapping & lasers." },
    { label: "Hardware Rig", desc: "Modular Eurorack, analog sub-bass synths, Pioneer DDJ MIDI control." },
    { label: "WebXR VR Rig", desc: "Interactive 6DOF stereo immersion for Meta Quest & Apple Vision Pro." }
  ],

  demoTracks: [
    {
      id: "808_sub",
      title: "Sub-Bass Resonance (Deaf Sonic Agency)",
      desc: "Deep 28Hz 808 sub drops designed for chest cavity rumble and tactile transducers.",
      tempo: 128
    },
    {
      id: "acid_arp",
      title: "Neon Voltage (Acid Modulations)",
      desc: "Rapid saw-wave arpeggios that ignite neon tube arcing and laser fan spread.",
      tempo: 135
    },
    {
      id: "warehouse_stomp",
      title: "Concrete Stomp (Industrial Beats)",
      desc: "Heavy 4-on-the-floor kick and noise-burst snares triggering paint drip physics.",
      tempo: 130
    }
  ],

  links: [
    { label: "Official Portfolio", url: "https://natehergert.com/" }
  ]
};
