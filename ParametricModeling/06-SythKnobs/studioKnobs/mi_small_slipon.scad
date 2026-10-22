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
