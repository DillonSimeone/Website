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
