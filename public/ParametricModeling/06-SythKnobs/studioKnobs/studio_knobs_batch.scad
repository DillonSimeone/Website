// Studio Knobs Collection OpenSCAD Export
// Generated 2026-08-05T16:21:05.868Z

// --- Elektron Machinedrum / Monomachine Master & Vol Knob (12.3mm) ---
translate([0, 0, 0])
// ACCESS KNOB — Elektron Machinedrum / Monomachine Master & Vol Knob
// Generated via CLI for Studio Knobs
module access_knob_elektron_master() {
  outer_d = 12.3;
  height = 13;
  taper = 0.95;
  bore_d = 6;
  slot_h = 8;
  tex_depth = 0.8;
  tex_scale = 1.2;
  tex_count = 16;

  difference() {
    cylinder(h=height, d1=outer_d, d2=outer_d*taper, $fn=32);
    translate([0,0,-0.1]) cylinder(h=slot_h+0.2, d=bore_d + 0.3, $fn=32);
    for(i=[0:tex_count-1]) {
      rotate([0,0,i*(360/tex_count)])
        translate([outer_d/2-tex_depth/2, 0, height/2])
          cylinder(h=height*1.1, d=tex_scale, center=true, $fn=16);
    }
  }
}
access_knob_elektron_master();


// --- Elektron Machinedrum Tempo Knob (12.2mm) ---
translate([35, 0, 0])
// ACCESS KNOB — Elektron Machinedrum Tempo Knob
// Generated via CLI for Studio Knobs
module access_knob_elektron_tempo() {
  outer_d = 12.2;
  height = 13;
  taper = 0.95;
  bore_d = 6;
  slot_h = 8;
  tex_depth = 0.8;
  tex_scale = 1.2;
  tex_count = 16;

  difference() {
    cylinder(h=height, d1=outer_d, d2=outer_d*taper, $fn=32);
    translate([0,0,-0.1]) cylinder(h=slot_h+0.2, d=bore_d + 0.3, $fn=32);
    for(i=[0:tex_count-1]) {
      rotate([0,0,i*(360/tex_count)])
        translate([outer_d/2-tex_depth/2, 0, height/2])
          cylinder(h=height*1.1, d=tex_scale, center=true, $fn=16);
    }
  }
}
access_knob_elektron_tempo();


// --- ARP / Modular Synth Slider Knob (15.1mm) ---
translate([70, 0, 0])
// ACCESS KNOB — ARP / Modular Synth Slider Knob
// Generated via CLI for Studio Knobs
module access_knob_arp_slider_knob() {
  outer_d = 15.1;
  height = 16;
  taper = 0.85;
  bore_d = 6;
  slot_h = 9;
  tex_depth = 1;
  tex_scale = 1.5;
  tex_count = 12;

  difference() {
    cylinder(h=height, d1=outer_d, d2=outer_d*taper, $fn=32);
    translate([0,0,-0.1]) cylinder(h=slot_h+0.2, d=bore_d + 0.3, $fn=32);
    for(i=[0:tex_count-1]) {
      rotate([0,0,i*(360/tex_count)])
        translate([outer_d/2-tex_depth/2, 0, height/2])
          cylinder(h=height*1.1, d=tex_scale, center=true, $fn=16);
    }
  }
}
access_knob_arp_slider_knob();


// --- Make Noise Eurorack Module Knob (10.5mm) ---
translate([105, 0, 0])
// ACCESS KNOB — Make Noise Eurorack Module Knob
// Generated via CLI for Studio Knobs
module access_knob_makenoise_euro() {
  outer_d = 10.5;
  height = 14;
  taper = 0.9;
  bore_d = 6;
  slot_h = 8;
  tex_depth = 0.6;
  tex_scale = 1;
  tex_count = 12;

  difference() {
    cylinder(h=height, d1=outer_d, d2=outer_d*taper, $fn=32);
    translate([0,0,-0.1]) cylinder(h=slot_h+0.2, d=bore_d + 0.3, $fn=32);
    for(i=[0:tex_count-1]) {
      rotate([0,0,i*(360/tex_count)])
        translate([outer_d/2-tex_depth/2, 0, height/2])
          cylinder(h=height*1.1, d=tex_scale, center=true, $fn=16);
    }
  }
}
access_knob_makenoise_euro();


// --- Mutable Instruments Small Module Knob (11.2mm) ---
translate([140, 0, 0])
// ACCESS KNOB — Mutable Instruments Small Module Knob
// Generated via CLI for Studio Knobs
module access_knob_mi_small() {
  outer_d = 11.2;
  height = 13;
  taper = 0.92;
  bore_d = 6;
  slot_h = 8;
  tex_depth = 0.7;
  tex_scale = 1;
  tex_count = 14;

  difference() {
    cylinder(h=height, d1=outer_d, d2=outer_d*taper, $fn=32);
    translate([0,0,-0.1]) cylinder(h=slot_h+0.2, d=bore_d + 0.3, $fn=32);
    for(i=[0:tex_count-1]) {
      rotate([0,0,i*(360/tex_count)])
        translate([outer_d/2-tex_depth/2, 0, height/2])
          cylinder(h=height*1.1, d=tex_scale, center=true, $fn=16);
    }
  }
}
access_knob_mi_small();


// --- Intellijel Eurorack Micro Knob (9.4mm) ---
translate([175, 0, 0])
// ACCESS KNOB — Intellijel Eurorack Micro Knob
// Generated via CLI for Studio Knobs
module access_knob_intellijel_micro() {
  outer_d = 9.4;
  height = 12;
  taper = 0.88;
  bore_d = 6;
  slot_h = 7;
  tex_depth = 0.5;
  tex_scale = 0.8;
  tex_count = 6;

  difference() {
    cylinder(h=height, d1=outer_d, d2=outer_d*taper, $fn=6);
    translate([0,0,-0.1]) cylinder(h=slot_h+0.2, d=bore_d + 0.3, $fn=32);
    for(i=[0:tex_count-1]) {
      rotate([0,0,i*(360/tex_count)])
        translate([outer_d/2-tex_depth/2, 0, height/2])
          cylinder(h=height*1.1, d=tex_scale, center=true, $fn=16);
    }
  }
}
access_knob_intellijel_micro();


// --- Standard Eurorack Module Knob (12.5mm) ---
translate([210, 0, 0])
// ACCESS KNOB — Standard Eurorack Module Knob
// Generated via CLI for Studio Knobs
module access_knob_eurorack_std() {
  outer_d = 12.5;
  height = 15;
  taper = 0.9;
  bore_d = 6;
  slot_h = 8;
  tex_depth = 0.8;
  tex_scale = 1.2;
  tex_count = 10;

  difference() {
    cylinder(h=height, d1=outer_d, d2=outer_d*taper, $fn=6);
    translate([0,0,-0.1]) cylinder(h=slot_h+0.2, d=bore_d + 0.3, $fn=32);
    for(i=[0:tex_count-1]) {
      rotate([0,0,i*(360/tex_count)])
        translate([outer_d/2-tex_depth/2, 0, height/2])
          cylinder(h=height*1.1, d=tex_scale, center=true, $fn=16);
    }
  }
}
access_knob_eurorack_std();


// --- Mutable Instruments Frames Large Center Knob (28.9mm) ---
translate([245, 0, 0])
// ACCESS KNOB — Mutable Instruments Frames Large Center Knob
// Generated via CLI for Studio Knobs
module access_knob_mi_frames_center() {
  outer_d = 28.9;
  height = 18;
  taper = 0.85;
  bore_d = 6;
  slot_h = 10;
  tex_depth = 2.2;
  tex_scale = 3.5;
  tex_count = 8;

  difference() {
    cylinder(h=height, d1=outer_d, d2=outer_d*taper, $fn=32);
    translate([0,0,-0.1]) cylinder(h=slot_h+0.2, d=bore_d + 0.3, $fn=32);
    for(i=[0:tex_count-1]) {
      rotate([0,0,i*(360/tex_count)])
        translate([outer_d/2-tex_depth/2, 0, height/2])
          cylinder(h=height*1.1, d=tex_scale, center=true, $fn=16);
    }
  }
}
access_knob_mi_frames_center();


// --- Synthesis Technology / XOR Electronics Knob (15.2mm) ---
translate([280, 0, 0])
// ACCESS KNOB — Synthesis Technology / XOR Electronics Knob
// Generated via CLI for Studio Knobs
module access_knob_xor_synth() {
  outer_d = 15.2;
  height = 16;
  taper = 0.9;
  bore_d = 6;
  slot_h = 9;
  tex_depth = 1.2;
  tex_scale = 1.5;
  tex_count = 16;

  difference() {
    cylinder(h=height, d1=outer_d, d2=outer_d*taper, $fn=32);
    translate([0,0,-0.1]) cylinder(h=slot_h+0.2, d=bore_d + 0.3, $fn=32);
    for(i=[0:tex_count-1]) {
      rotate([0,0,i*(360/tex_count)])
        translate([outer_d/2-tex_depth/2, 0, height/2])
          cylinder(h=height*1.1, d=tex_scale, center=true, $fn=16);
    }
  }
}
access_knob_xor_synth();


// --- Shruthi XT Hybrid Monosynth Knob (11.2mm) ---
translate([315, 0, 0])
// ACCESS KNOB — Shruthi XT Hybrid Monosynth Knob
// Generated via CLI for Studio Knobs
module access_knob_shruthi_xt() {
  outer_d = 11.2;
  height = 13;
  taper = 0.9;
  bore_d = 6;
  slot_h = 8;
  tex_depth = 0.7;
  tex_scale = 1;
  tex_count = 14;

  difference() {
    cylinder(h=height, d1=outer_d, d2=outer_d*taper, $fn=32);
    translate([0,0,-0.1]) cylinder(h=slot_h+0.2, d=bore_d + 0.3, $fn=32);
    for(i=[0:tex_count-1]) {
      rotate([0,0,i*(360/tex_count)])
        translate([outer_d/2-tex_depth/2, 0, height/2])
          cylinder(h=height*1.1, d=tex_scale, center=true, $fn=16);
    }
  }
}
access_knob_shruthi_xt();


// --- Din Sync RE-303 Volume / Power Knob (10.5mm) ---
translate([350, 0, 0])
// ACCESS KNOB — Din Sync RE-303 Volume / Power Knob
// Generated via CLI for Studio Knobs
module access_knob_re303_vol() {
  outer_d = 10.5;
  height = 12;
  taper = 0.95;
  bore_d = 6;
  slot_h = 7;
  tex_depth = 0.6;
  tex_scale = 1;
  tex_count = 12;

  difference() {
    cylinder(h=height, d1=outer_d, d2=outer_d*taper, $fn=32);
    translate([0,0,-0.1]) cylinder(h=slot_h+0.2, d=bore_d + 0.3, $fn=32);
    for(i=[0:tex_count-1]) {
      rotate([0,0,i*(360/tex_count)])
        translate([outer_d/2-tex_depth/2, 0, height/2])
          cylinder(h=height*1.1, d=tex_scale, center=true, $fn=16);
    }
  }
}
access_knob_re303_vol();


// --- Din Sync RE-303 Parameter Knob (12.6mm) ---
translate([385, 0, 0])
// ACCESS KNOB — Din Sync RE-303 Parameter Knob
// Generated via CLI for Studio Knobs
module access_knob_re303_param() {
  outer_d = 12.6;
  height = 13;
  taper = 0.92;
  bore_d = 6;
  slot_h = 8;
  tex_depth = 0.8;
  tex_scale = 1.2;
  tex_count = 16;

  difference() {
    cylinder(h=height, d1=outer_d, d2=outer_d*taper, $fn=32);
    translate([0,0,-0.1]) cylinder(h=slot_h+0.2, d=bore_d + 0.3, $fn=32);
    for(i=[0:tex_count-1]) {
      rotate([0,0,i*(360/tex_count)])
        translate([outer_d/2-tex_depth/2, 0, height/2])
          cylinder(h=height*1.1, d=tex_scale, center=true, $fn=16);
    }
  }
}
access_knob_re303_param();


