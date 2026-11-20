/**
 * Gigs Data & Booking Configuration for DJ Deaf Wish (Nate Hergert)
 * Data-driven architecture: adding a gig here automatically generates
 * its building face, billboard display, camera orbit stop, and pop-up card.
 */

export const BOOKING_EMAIL = "3phased@gmail.com";
export const BOOKING_SUBJECT = "DJ booking";
export const BOOKING_BODY = `Hi Nate,

I'd like to check your availability for an upcoming DJ booking! Here are our event details:

Event Name: 
Date(s) & Set Time: 
Venue & City: 
Expected Crowd Size & Audience (Deaf / Hearing / Mixed): 
Set Length & Desired Genre / Vibe: 
Equipment Provided (Sound system, DJ decks, projector, subwoofer/haptic exciters): 
Budget / Fee Range: 
Travel & Lodging Covered (Yes / No / Local): 
Contact Name & Phone: 

Looking forward to connecting!`;

export function getBookingMailto() {
  const encSubject = encodeURIComponent(BOOKING_SUBJECT);
  const encBody = encodeURIComponent(BOOKING_BODY);
  return `mailto:${BOOKING_EMAIL}?subject=${encSubject}&body=${encBody}`;
}

export const GIGS_DATA = [
  {
    id: "codafest",
    pageIndex: 1,
    name: "CodaFest 2026",
    subtitle: "The Gathering for CODAs & Deaf Community",
    dates: "September 3–6, 2026",
    venue: "Camp Taloali",
    city: "Stayton, Oregon",
    role: "Headline DJ // Dance Night",
    blurb: "DJ Deaf Wish headlined the signature Saturday dance night for CODAs, Deaf adults, youth, and families. Pairing physical sub-bass rumble with synesthetic light telemetry, the set transformed the venue into an inclusive, high-vibration dancefloor.",
    takeaway: "High-Energy Festival Headliner · 808 Sub-Bass Drops · Real-Time Visual Projection",
    website: "https://codafest.org/",
    domainBadge: "🌐 codafest.org ↗",
    accent: "#ff0055",
    accentGlow: "rgba(255, 0, 85, 0.4)",
    video: {
      mp4: "./assets/video/codafest.mp4",
      webm: "./assets/video/codafest.webm",
      poster: "./assets/video/codafest-poster.jpg"
    },
    photos: [
      {
        full: "./assets/gigs/codafest/photo_1.jpg",
        thumb: "./assets/gigs/codafest/photo_1_thumb.jpg",
        caption: "Camp Taloali festival grounds & outdoor soundstage"
      },
      {
        full: "./assets/gigs/codafest/photo_2.jpg",
        thumb: "./assets/gigs/codafest/photo_2_thumb.jpg",
        caption: "CodaFest community gathering & outdoor pavilion"
      },
      {
        full: "./assets/gigs/codafest/photo_3.jpg",
        thumb: "./assets/gigs/codafest/photo_3_thumb.jpg",
        caption: "Event schedule & performance showcase"
      },
      {
        full: "./assets/gigs/codafest/photo_4.jpg",
        thumb: "./assets/gigs/codafest/photo_4_thumb.jpg",
        caption: "DJ Deaf Wish live on the decks"
      },
      {
        full: "./assets/gigs/codafest/photo_5.jpg",
        thumb: "./assets/gigs/codafest/photo_5_thumb.jpg",
        caption: "Deaf & hearing dancefloor energy"
      }
    ]
  },
  {
    id: "wdt",
    pageIndex: 2,
    name: "World Deaf Timberfest",
    subtitle: "Camp Taloali Annual Benefit & Festival",
    dates: "Annual Summer Gathering",
    venue: "Camp Taloali (111-Acre Camp)",
    city: "Stayton, Oregon",
    role: "Resident DJ",
    blurb: "Resident DJ at Oregon's premier Deaf community outdoor festival. Supporting Camp Taloali's youth recreation and Deaf leadership programs, Nate rocks the evening timber pavilion with high-energy sub-bass sets engineered for physical chest impact.",
    takeaway: "Outdoor Festival Soundstage · Pavilion Dancefloors · Visceral Chest Impact",
    website: "https://www.wdtcamp.org/",
    domainBadge: "🌲 wdtcamp.org ↗",
    accent: "#00f0ff",
    accentGlow: "rgba(0, 240, 255, 0.4)",
    video: null,
    photos: []
  },
  {
    id: "confluence",
    pageIndex: 3,
    name: "Confluence Sound Lab & Tour",
    subtitle: "Multisensory Electronics & University Tour",
    dates: "December 2024 / Ongoing Residency",
    venue: "Confluence Recording Co. / Oregon Universities",
    city: "Troutdale & Statewide Tour, OR",
    role: "Synthesist, Audio Engineer & Workshop Director",
    blurb: "Co-founder of Confluence Recording Company in Troutdale, OR, and touring synthesist with The Confluence ensemble. Demonstrating cutting-edge wearable haptic vests and 'Deaf Jazz' electronic sets across Oregon university campuses (SOU, WOU), backed by the $97k Oregon Community Foundation Creative Heights initiative.",
    takeaway: "University Tours & Sound Labs · Wearable Haptic Vests · $97k OCF Research · RIT Audio Pedigree",
    website: "https://streetroots.org/news/2023/10/18/cymaspace-brings-music-deaf-and-hard-hearing-communities",
    domainBadge: "📰 streetroots.org ↗",
    accent: "#a855f7",
    accentGlow: "rgba(168, 85, 247, 0.4)",
    video: null,
    photos: [],
    channelUrl: "https://www.youtube.com/channel/UCV6CLXrmsoHJ0xMKp-HbPvA",
    videos: [
      {
        id: "Qm_eln3aJEA",
        title: "Nate & Shawn — Music Video",
        tag: "DEAF // HEARING COLLABORATION",
        desc: "Recent collaborative synthesizer production with Shawn Trail (hearing collaborator).",
        url: "https://www.youtube.com/watch?v=Qm_eln3aJEA"
      },
      {
        id: "tQP5jeYHpW4",
        title: "Nate, Shawn & Dillon — Music Video",
        tag: "TRIO // DILLON (COMPLETELY DEAF)",
        desc: "Electronic music video with Shawn Trail and Dillon Simeone (completely deaf collaborator).",
        url: "https://www.youtube.com/watch?v=tQP5jeYHpW4"
      }
    ]
  },
  {
    id: "ada",
    pageIndex: 4,
    name: "ADA Anniversary Showcase",
    subtitle: "City of Hillsboro & CymaSpace Civic Celebration",
    dates: "July 2022 / Annual Celebration",
    venue: "Shute Park Soundstage",
    city: "Hillsboro, Oregon",
    role: "Headline DJ // Certified Accessible Civic Stage",
    blurb: "Headline DJ for the official City of Hillsboro Americans with Disabilities Act (ADA) celebration. Partnering with CymaSpace to provide an accessible dance experience featuring tactile sub-bass dance platforms, live ASL visual integration, and synesthetic light arrays for municipal & civic audiences.",
    takeaway: "Certified Accessible Civic Stages · Municipal Agency Partnerships · ASL Synchronized Integration",
    website: "https://www.hillsboro-oregon.gov/",
    domainBadge: "🏛️ hillsboro-oregon.gov ↗",
    accent: "#ffaa00",
    accentGlow: "rgba(255, 170, 0, 0.4)",
    video: null,
    photos: []
  }
];
