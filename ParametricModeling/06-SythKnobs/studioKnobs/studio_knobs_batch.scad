// Studio Knobs Collection OpenSCAD Export (SLIDE MODE)
// Generated 2026-08-16T23:46:04.770Z

// --- Elektron Machinedrum / Monomachine Master & Vol Knob (Slip-On Sleeve) (20.3mm Outer / 12.3mm Inner) ---
translate([0, 0, 0])
// ACCESS KNOB — Elektron Machinedrum / Monomachine Master & Vol Knob (Slip-On Sleeve)
// Generated via CLI for Studio Knobs (Slip-On Sleeve)
module access_knob_elektron_master_slipon() {
  outer_d = 20.3;
  height = 15;
  taper = 0.95;
  bore_d = 12.3;
  slot_h = 13;
  tex_depth = 1.2;
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
access_knob_elektron_master_slipon();


// --- Elektron Machinedrum Tempo Knob (Slip-On Sleeve) (20.2mm Outer / 12.2mm Inner) ---
translate([45, 0, 0])
// ACCESS KNOB — Elektron Machinedrum Tempo Knob (Slip-On Sleeve)
// Generated via CLI for Studio Knobs (Slip-On Sleeve)
module access_knob_elektron_tempo_slipon() {
  outer_d = 20.2;
  height = 15;
  taper = 0.95;
  bore_d = 12.2;
  slot_h = 13;
  tex_depth = 1.2;
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
access_knob_elektron_tempo_slipon();


// --- ARP / Modular Synth Slider Knob (Slip-On Sleeve) (23.1mm Outer / 15.1mm Inner) ---
translate([90, 0, 0])
// ACCESS KNOB — ARP / Modular Synth Slider Knob (Slip-On Sleeve)
// Generated via CLI for Studio Knobs (Slip-On Sleeve)
module access_knob_arp_slider_knob_slipon() {
  outer_d = 23.1;
  height = 18;
  taper = 0.85;
  bore_d = 15.1;
  slot_h = 16;
  tex_depth = 1.5;
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
access_knob_arp_slider_knob_slipon();


// --- Make Noise Eurorack Module Knob (Slip-On Sleeve) (18.5mm Outer / 10.5mm Inner) ---
translate([135, 0, 0])
// ACCESS KNOB — Make Noise Eurorack Module Knob (Slip-On Sleeve)
// Generated via CLI for Studio Knobs (Slip-On Sleeve)
module access_knob_makenoise_euro_slipon() {
  outer_d = 18.5;
  height = 16;
  taper = 0.9;
  bore_d = 10.5;
  slot_h = 14;
  tex_depth = 0.9;
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
access_knob_makenoise_euro_slipon();


// --- Mutable Instruments Small Module Knob (Slip-On Sleeve) (19.2mm Outer / 11.2mm Inner) ---
translate([180, 0, 0])
// ACCESS KNOB — Mutable Instruments Small Module Knob (Slip-On Sleeve)
// Generated via CLI for Studio Knobs (Slip-On Sleeve)
module access_knob_mi_small_slipon() {
  outer_d = 19.2;
  height = 15;
  taper = 0.92;
  bore_d = 11.2;
  slot_h = 13;
  tex_depth = 1;
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
access_knob_mi_small_slipon();


// --- Intellijel Eurorack Micro Knob (Slip-On Sleeve) (17.4mm Outer / 9.4mm Inner) ---
translate([225, 0, 0])
// ACCESS KNOB — Intellijel Eurorack Micro Knob (Slip-On Sleeve)
// Generated via CLI for Studio Knobs (Slip-On Sleeve)
module access_knob_intellijel_micro_slipon() {
  outer_d = 17.4;
  height = 14;
  taper = 0.88;
  bore_d = 9.4;
  slot_h = 12;
  tex_depth = 0.8;
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
access_knob_intellijel_micro_slipon();


// --- Standard Eurorack Module Knob (Slip-On Sleeve) (20.5mm Outer / 12.5mm Inner) ---
translate([270, 0, 0])
// ACCESS KNOB — Standard Eurorack Module Knob (Slip-On Sleeve)
// Generated via CLI for Studio Knobs (Slip-On Sleeve)
module access_knob_eurorack_std_slipon() {
  outer_d = 20.5;
  height = 17;
  taper = 0.9;
  bore_d = 12.5;
  slot_h = 15;
  tex_depth = 1.2;
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
access_knob_eurorack_std_slipon();


// --- Mutable Instruments Frames Large Center Knob (Slip-On Sleeve) (36.9mm Outer / 28.9mm Inner) ---
translate([315, 0, 0])
// ACCESS KNOB — Mutable Instruments Frames Large Center Knob (Slip-On Sleeve)
// Generated via CLI for Studio Knobs (Slip-On Sleeve)
module access_knob_mi_frames_center_slipon() {
  outer_d = 36.9;
  height = 20;
  taper = 0.85;
  bore_d = 28.9;
  slot_h = 18;
  tex_depth = 3.3;
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
access_knob_mi_frames_center_slipon();


// --- Synthesis Technology / XOR Electronics Knob (Slip-On Sleeve) (23.2mm Outer / 15.2mm Inner) ---
translate([360, 0, 0])
// ACCESS KNOB — Synthesis Technology / XOR Electronics Knob (Slip-On Sleeve)
// Generated via CLI for Studio Knobs (Slip-On Sleeve)
module access_knob_xor_synth_slipon() {
  outer_d = 23.2;
  height = 18;
  taper = 0.9;
  bore_d = 15.2;
  slot_h = 16;
  tex_depth = 1.8;
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
access_knob_xor_synth_slipon();


// --- Shruthi XT Hybrid Monosynth Knob (Slip-On Sleeve) (19.2mm Outer / 11.2mm Inner) ---
translate([405, 0, 0])
// ACCESS KNOB — Shruthi XT Hybrid Monosynth Knob (Slip-On Sleeve)
// Generated via CLI for Studio Knobs (Slip-On Sleeve)
module access_knob_shruthi_xt_slipon() {
  outer_d = 19.2;
  height = 15;
  taper = 0.9;
  bore_d = 11.2;
  slot_h = 13;
  tex_depth = 1;
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
access_knob_shruthi_xt_slipon();


// --- Din Sync RE-303 Volume / Power Knob (Slip-On Sleeve) (18.5mm Outer / 10.5mm Inner) ---
translate([450, 0, 0])
// ACCESS KNOB — Din Sync RE-303 Volume / Power Knob (Slip-On Sleeve)
// Generated via CLI for Studio Knobs (Slip-On Sleeve)
module access_knob_re303_vol_slipon() {
  outer_d = 18.5;
  height = 14;
  taper = 0.95;
  bore_d = 10.5;
  slot_h = 12;
  tex_depth = 0.9;
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
access_knob_re303_vol_slipon();


// --- Din Sync RE-303 Parameter Knob (Slip-On Sleeve) (20.6mm Outer / 12.6mm Inner) ---
translate([495, 0, 0])
// ACCESS KNOB — Din Sync RE-303 Parameter Knob (Slip-On Sleeve)
// Generated via CLI for Studio Knobs (Slip-On Sleeve)
module access_knob_re303_param_slipon() {
  outer_d = 20.6;
  height = 15;
  taper = 0.92;
  bore_d = 12.6;
  slot_h = 13;
  tex_depth = 1.2;
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
access_knob_re303_param_slipon();


