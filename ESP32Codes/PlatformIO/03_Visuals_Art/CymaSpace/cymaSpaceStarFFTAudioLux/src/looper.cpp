#include "looper.h"

namespace pixl {

Looper* Looper::looper_ = 0;

void Looper::addAnimation(Animation* animation) {

  animations_[num_anim_++] = animation;
}

void Looper::addInput(Input* input) {

  inputs_[num_input_++] = input;
}

void Looper::addVisualization(Visualization* visualization) {
  visualizations_[num_viz_++] = visualization;
}

void Looper::clearAll() {
  num_anim_ = 0;
  num_input_ = 0;
  num_viz_ = 0;
}

void Looper::clearVisualizations() {
  num_viz_ = 0;
}

void Looper::loop() {

  unsigned long current_time = millis();

  if (current_time > next_update_tick_) {
    next_update_tick_ = current_time + update_millis_per_tick_;
    update_();
  }

  if (current_time > next_draw_tick_) {
    next_draw_tick_ = current_time + draw_millis_per_tick_;
    draw_(draw_millis_per_tick_);
  }

  FastLED.show();
}

void Looper::setUpdatesPerSecond(int updates) {
  update_millis_per_tick_ = 1000.0 / updates;
}

void Looper::setFramesPerSecond(int frames) {
  draw_millis_per_tick_ = 1000.0 / frames;
}

void Looper::update_() {

  for (int i = 0; i < num_anim_; i++) {
    animations_[i]->update();
  }

  for (int i = 0; i < num_input_; i++) {
    inputs_[i]->update();
  }

  for (int i = 0; i < num_viz_; i++) {
    visualizations_[i]->update();
  }
}

void Looper::draw_(float interp) {

  for (int i = 0; i < num_anim_; i++) {
    animations_[i]->draw(interp);
  }
}

} // end namespace pixl
