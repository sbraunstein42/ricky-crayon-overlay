// Crayon SVG template — kept separate from drawing logic.
// {{COLOR}}, {{DARK}}, {{LABEL}}, {{NAME}}, {{ID}} are replaced per crayon.
// {{ID}} is a unique slug per crayon so gradient IDs don't clash on the page.

window.CRAYON_TEMPLATE = `
<svg xmlns="http://www.w3.org/2000/svg" width="140" height="32" viewBox="0 0 140 32">
  <defs>
    <linearGradient id="bodyShade-{{ID}}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="white" stop-opacity="0.28"/>
      <stop offset="45%"  stop-color="white" stop-opacity="0"/>
      <stop offset="100%" stop-color="black" stop-opacity="0.20"/>
    </linearGradient>
    <linearGradient id="woodShade-{{ID}}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="white" stop-opacity="0.20"/>
      <stop offset="100%" stop-color="black" stop-opacity="0.15"/>
    </linearGradient>
    <clipPath id="bodyClip-{{ID}}">
      <rect x="22" y="2" width="96" height="28" rx="4"/>
    </clipPath>
  </defs>

  <!-- wax tip: flat-ended trapezoid like a real Crayola -->
  <polygon points="2,14 2,18 14,22 14,10" fill="{{COLOR}}"/>
  <polygon points="2,14 2,16 14,10 14,10" fill="white" opacity="0.18"/>
  <polygon points="2,16 2,18 14,22 14,16" fill="black"  opacity="0.12"/>

  <!-- wood section -->
  <polygon points="14,10 14,22 22,26 22,6" fill="#dba96e"/>
  <polygon points="14,10 14,16 22,6  22,6" fill="#e8c48a" opacity="0.55"/>
  <rect x="14" y="10" width="8" height="12" fill="url(#woodShade-{{ID}})" opacity="0.5"/>

  <!-- body -->
  <rect x="22" y="2" width="96" height="28" rx="4" fill="{{COLOR}}"/>
  <rect x="22" y="2" width="96" height="28" rx="4" fill="url(#bodyShade-{{ID}})"/>

  <!-- paper label band -->
  <rect x="40" y="2" width="46" height="28"
        fill="rgba(255,255,255,0.20)" clip-path="url(#bodyClip-{{ID}})"/>
  <line x1="40" y1="2" x2="40" y2="30" stroke="rgba(255,255,255,0.35)" stroke-width="1"/>
  <line x1="86" y1="2" x2="86" y2="30" stroke="rgba(0,0,0,0.08)"       stroke-width="1"/>
  <text x="63" y="20"
        font-family="'Fredoka One', cursive, sans-serif"
        font-size="9"
        fill="{{LABEL}}" opacity="0.85"
        text-anchor="middle">{{NAME}}</text>

  <!-- highlight streak -->
  <rect x="24" y="4" width="92" height="4" rx="2"
        fill="white" opacity="0.25" clip-path="url(#bodyClip-{{ID}})"/>

  <!-- end cap -->
  <rect x="116" y="2" width="8" height="28"
        fill="{{DARK}}" opacity="0.55"
        rx="0" ry="0"/>
  <rect x="118" y="2" width="6" height="28" rx="0 4 4 0"
        fill="{{DARK}}" opacity="0.3"/>
</svg>`;
