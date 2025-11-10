/**
 * @file main
 *
 */

/*********************
 * INCLUDES
 *********************/
#define _DEFAULT_SOURCE /* needed for usleep() */
#include <stdlib.h>
#include <unistd.h>
#include <stdio.h>
#define SDL_MAIN_HANDLED /*To fix SDL's "undefined reference to WinMain" issue*/
#include <SDL2/SDL.h>
#include "lvgl.h"
#include "lv_drivers/display/monitor.h"
#include "lv_drivers/indev/mouse.h"
#include "lv_drivers/indev/keyboard.h"
#include "lv_drivers/indev/mousewheel.h"
#include "lv_fs_if.h"

/**********************
 * TYPEDEFS
 **********************/
typedef struct {
    lv_obj_t * test_item;
    lv_obj_t * checkbox;
} test_info_t;

/**********************
 * STATIC VARIABLES
 **********************/
static lv_obj_t * main_container;
static lv_obj_t * left_column;
static lv_obj_t * right_column;
static lv_obj_t * test_items[3];
static lv_obj_t * fail_checkboxes[3];
static lv_obj_t * log_list;
static lv_obj_t * popup_overlay;
static bool is_testing = false;
static bool overall_test_result = true;

/* Global animation objects */
static lv_anim_t a_fade_out_f, a_left_w_f, a_right_w_f, a_gap_f; 
static lv_anim_t a_scr_pad_f; 
static lv_anim_t a_fade_in_r, a_left_w_r, a_right_w_r, a_gap_r; 
static lv_anim_t a_scr_pad_r;

/* Global variables to store initial state */
static lv_coord_t stored_initial_left_col_w; 
static lv_coord_t stored_initial_right_col_w; 
static lv_coord_t stored_initial_flex_gap;
static lv_coord_t stored_initial_left_col_opa;
static lv_coord_t stored_initial_scr_pad;


/**********************
 * FUNCTION PROTOTYPES
 **********************/
static void hal_init(void);
static void create_main_ui(void);
static void setup_animations(void);
static void anim_width_cb(void *var, int32_t v); 
static void anim_height_cb(void *var, int32_t v);
static void anim_opa_cb(void *var, int32_t v);
static void anim_pad_gap_cb(void *var, int32_t v);
static void anim_pad_all_cb(void *var, int32_t v); 
static void run_test(lv_timer_t * timer);
static void popup_event_cb(lv_event_t * e);
static void show_popup(bool is_success);
static void add_log_entry(bool is_success);
static void start_test_animation_event_cb(lv_event_t * e);
static void start_test_animation_phase2_cb(lv_anim_t * anim);
static void reset_ui_animation_cb(lv_timer_t * timer);
static void reset_ui_finished_cb(lv_anim_t * anim);


/**********************
 * STATIC FUNCTIONS (DEFINITIONS BEFORE MAIN)
 **********************/

/**
 * A task to measure the elapsed time for LVGL
 * @param data unused
 * @return never return
 */
static int tick_thread(void *data) {
  (void)data;

  while(1) {
    SDL_Delay(5);
    lv_tick_inc(5); /*Tell LittelvGL that 5 milliseconds were elapsed*/
  }

  return 0;
}

/**
 * Initialize the Hardware Abstraction Layer (HAL) for the LVGL graphics
 * library
 */
static void hal_init(void)
{
  /* Use the 'monitor' driver which creates window on PC's monitor to simulate a display*/
  monitor_init();
  
  /* Set the window title with a revision count */
  SDL_SetWindowTitle(SDL_GL_GetCurrentWindow(), "LVGL Simulator - Rev 10");

  /* Tick init.
   * You have to call 'lv_tick_inc()' in periodically to inform LittelvGL about
   * how much time were elapsed Create an SDL thread to do this*/
  SDL_CreateThread(tick_thread, "tick", NULL);

  /*Create a display buffer*/
  static lv_disp_draw_buf_t disp_buf1;
  static lv_color_t buf1_1[MONITOR_HOR_RES * 100];
  static lv_color_t buf1_2[MONITOR_HOR_RES * 100];
  lv_disp_draw_buf_init(&disp_buf1, buf1_1, buf1_2, MONITOR_HOR_RES * 100);

  /*Create a display*/
  static lv_disp_drv_t disp_drv;
  lv_disp_drv_init(&disp_drv); /*Basic initialization*/
  disp_drv.draw_buf = &disp_buf1;
  disp_drv.flush_cb = monitor_flush;
  disp_drv.hor_res = MONITOR_HOR_RES;
  disp_drv.ver_res = MONITOR_VER_RES;
  disp_drv.antialiasing = 1;

  lv_disp_t * disp = lv_disp_drv_register(&disp_drv);

  lv_theme_t * th = lv_theme_default_init(disp, lv_palette_main(LV_PALETTE_BLUE), lv_palette_main(LV_PALETTE_RED), LV_THEME_DEFAULT_DARK, LV_FONT_DEFAULT);
  lv_disp_set_theme(disp, th);

  lv_group_t * g = lv_group_create();
  lv_group_set_default(g);

  /* Add the mouse as input device
   * Use the 'mouse' driver which reads the PC's mouse*/
  mouse_init();
  static lv_indev_drv_t indev_drv_1;
  lv_indev_drv_init(&indev_drv_1); /*Basic initialization*/
  indev_drv_1.type = LV_INDEV_TYPE_POINTER;

  /*This function will be called periodically (by the library) to get the mouse position and state*/
  indev_drv_1.read_cb = mouse_read;
  lv_indev_t *mouse_indev = lv_indev_drv_register(&indev_drv_1);
  (void)mouse_indev; 

  keyboard_init();
  static lv_indev_drv_t indev_drv_2;
  lv_indev_drv_init(&indev_drv_2); /*Basic initialization*/
  indev_drv_2.type = LV_INDEV_TYPE_KEYPAD;
  indev_drv_2.read_cb = keyboard_read;
  lv_indev_t *kb_indev = lv_indev_drv_register(&indev_drv_2);
  lv_indev_set_group(kb_indev, g);
  mousewheel_init();
  static lv_indev_drv_t indev_drv_3;
  lv_indev_drv_init(&indev_drv_3); /*Basic initialization*/
  indev_drv_3.type = LV_INDEV_TYPE_ENCODER;
  indev_drv_3.read_cb = mousewheel_read;

  lv_indev_t * enc_indev = lv_indev_drv_register(&indev_drv_3);
  lv_indev_set_group(enc_indev, g);

  /*Set a cursor for the mouse*/
  /*
  LV_IMG_DECLARE(mouse_cursor_icon); 
  lv_obj_t * cursor_obj = lv_img_create(lv_scr_act()); 
  lv_img_set_src(cursor_obj, &mouse_cursor_icon);           
  lv_indev_set_cursor(mouse_indev, cursor_obj);
  */
}

/* Animation callback for width */
static void anim_width_cb(void *var, int32_t v) { 
    lv_obj_set_width((lv_obj_t *)var, v);
}

/* Animation callback for height */
static void anim_height_cb(void *var, int32_t v) {
    lv_obj_set_height((lv_obj_t *)var, v);
}

/* Animation callback for opacity */
static void anim_opa_cb(void *var, int32_t v) {
    lv_obj_set_style_opa((lv_obj_t *)var, v, 0);
}

/* Animation callback for padding gap */
static void anim_pad_gap_cb(void *var, int32_t v) {
    lv_obj_set_style_pad_gap((lv_obj_t *)var, v, 0);
}

static void anim_pad_all_cb(void *var, int32_t v) {
    lv_obj_set_style_pad_all((lv_obj_t *)var, v, 0);
}


static void run_test(lv_timer_t * timer)
{
    test_info_t * info = (test_info_t *)timer->user_data;
    bool is_checked = lv_obj_get_state(info->checkbox) & LV_STATE_CHECKED;
    bool is_success = !is_checked;

    if (!is_success) {
        overall_test_result = false;
    }

    lv_color_t end_color = is_success ? lv_color_hex(0x22c55e) : lv_color_hex(0xef4444);
    lv_obj_set_style_bg_color(info->test_item, end_color, 0);

    if (info->test_item == test_items[2]) { /* Last test item */
        add_log_entry(overall_test_result);
        show_popup(overall_test_result);
    }
}

static void popup_event_cb(lv_event_t * e)
{
    lv_event_code_t code = lv_event_get_code(e);
    if(code == LV_EVENT_CLICKED) {
        printf("popup_event_cb: Popup clicked, triggering reset animation.\n"); 
        if (popup_overlay) {
            lv_obj_del(popup_overlay);
            popup_overlay = NULL;
        }
        lv_timer_t * reset_timer = lv_timer_create(reset_ui_animation_cb, 0, NULL);
        if (reset_timer) {
            lv_timer_set_repeat_count(reset_timer, 1); 
        }
    }
}

static void show_popup(bool is_success)
{
    popup_overlay = lv_obj_create(lv_scr_act()); 
    lv_obj_set_size(popup_overlay, 300, 150);
    lv_obj_center(popup_overlay);
    lv_obj_set_style_bg_color(popup_overlay, lv_color_hex(0xffffff), 0);
    lv_obj_add_event_cb(popup_overlay, popup_event_cb, LV_EVENT_CLICKED, NULL);

    lv_obj_t * popup_label = lv_label_create(popup_overlay); 
    lv_label_set_text(popup_label, is_success ? "Test Complete!" : "Test Failed!");
    lv_obj_set_style_text_color(popup_label, lv_color_hex(0x000000), 0);
    lv_obj_center(popup_label);
}

static void add_log_entry(bool is_success)
{
    if (log_list) {
        char buf[64];
        snprintf(buf, sizeof(buf), "Test: %s - %s", is_success ? "PASS" : "FAIL", "report_12345.pdf");
        lv_obj_t * new_log_item = lv_list_add_text(log_list, buf);
        lv_obj_set_style_text_color(new_log_item, is_success ? lv_color_hex(0x22c55e) : lv_color_hex(0xef4444), 0);
    }
}

static void create_main_ui(void) {
    lv_obj_t *scr = lv_scr_act();
    lv_obj_set_style_bg_color(scr, lv_color_hex(0x111827), 0); 
    lv_obj_set_style_pad_all(scr, 32, 0); 

    /* Use a flex container for the columns */
    main_container = lv_obj_create(scr); 
    lv_obj_remove_style_all(main_container);
    lv_obj_set_size(main_container, lv_pct(100), lv_pct(100));
    lv_obj_set_flex_flow(main_container, LV_FLEX_FLOW_ROW);
    lv_obj_set_style_pad_gap(main_container, 32, 0); /* gap-8 */

    /* Left Column */
    left_column = lv_obj_create(main_container);
    lv_obj_remove_style_all(left_column);
    lv_obj_set_flex_grow(left_column, 1);
    lv_obj_set_height(left_column, lv_pct(100));
    lv_obj_set_flex_flow(left_column, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_flex_align(left_column, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START);
    lv_obj_set_style_pad_top(left_column, 32, 0);

    /* Right Column */
    right_column = lv_obj_create(main_container);
    lv_obj_remove_style_all(right_column);
    lv_obj_set_flex_grow(right_column, 2);
    lv_obj_set_height(right_column, lv_pct(100));
    lv_obj_set_flex_flow(right_column, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_flex_align(right_column, LV_FLEX_ALIGN_SPACE_BETWEEN, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
    lv_obj_set_style_pad_gap(right_column, 20, 0); /* gap-6 from mockup */

    /* --- Left Column Content: Logo Button --- */
    lv_obj_t *logo_button_wrapper = lv_obj_create(left_column); 
    lv_obj_remove_style_all(logo_button_wrapper);
    lv_obj_set_size(logo_button_wrapper, 176, 128); /* w-44 h-32 */
    lv_obj_set_style_pad_all(logo_button_wrapper, 0, 0);
    lv_obj_set_style_bg_opa(logo_button_wrapper, LV_OPA_TRANSP, 0);

    lv_obj_t *logo_button = lv_btn_create(logo_button_wrapper);
    lv_obj_set_size(logo_button, LV_PCT(100), LV_PCT(100));
    lv_obj_set_style_bg_color(logo_button, lv_color_hex(0x111827), 0);
    lv_obj_set_style_border_color(logo_button, lv_color_hex(0x3B82F6), 0);
    lv_obj_set_style_border_width(logo_button, 4, 0);
    lv_obj_set_style_radius(logo_button, 16, 0);
    lv_obj_add_event_cb(logo_button, start_test_animation_event_cb, LV_EVENT_CLICKED, NULL);

    lv_obj_t *logo_label = lv_label_create(logo_button);
    lv_label_set_text(logo_label, "Cable Tester:\nDB9 To BNC\n(Tap to begin test)");
    lv_obj_set_style_text_align(logo_label, LV_TEXT_ALIGN_CENTER, 0);
    lv_obj_set_style_text_color(logo_label, lv_color_white(), 0);
    lv_obj_center(logo_label);

    /* Controls container (checkboxes and log) */
    lv_obj_t *controls_container = lv_obj_create(left_column);
    lv_obj_remove_style_all(controls_container);
    lv_obj_set_width(controls_container, lv_pct(100));
    lv_obj_set_flex_grow(controls_container, 1);
    lv_obj_set_flex_flow(controls_container, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_style_pad_all(controls_container, 0, 0);
    lv_obj_set_style_pad_top(controls_container, 32, 0); /* mt-8 */

    /* Checkboxes */
    lv_obj_t *checkbox_group = lv_obj_create(controls_container);
    lv_obj_remove_style_all(checkbox_group);
    lv_obj_set_width(checkbox_group, LV_PCT(100));
    lv_obj_set_height(checkbox_group, LV_SIZE_CONTENT);
    lv_obj_set_flex_flow(checkbox_group, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_style_pad_gap(checkbox_group, 8, 0); /* gap-2 */

    for (int i = 0; i < 3; i++) {
        fail_checkboxes[i] = lv_checkbox_create(checkbox_group);
        char buf[32];
        snprintf(buf, sizeof(buf), "Simulate Fail (Test %d)", i + 1);
        lv_checkbox_set_text(fail_checkboxes[i], buf);
        lv_obj_set_style_text_color(fail_checkboxes[i], lv_color_hex(0x9CA3AF), 0); 
        lv_obj_set_style_bg_color(fail_checkboxes[i], lv_color_hex(0x111827), LV_PART_INDICATOR);
        lv_obj_set_style_border_color(fail_checkboxes[i], lv_color_hex(0x4B5563), LV_PART_INDICATOR);
        lv_obj_set_style_radius(fail_checkboxes[i], 4, LV_PART_INDICATOR);
        lv_obj_set_style_border_width(fail_checkboxes[i], 1, LV_PART_INDICATOR);
        lv_obj_set_style_text_color(fail_checkboxes[i], lv_color_hex(0xEF4444), LV_PART_INDICATOR | LV_STATE_CHECKED); 
    }

    /* Test log */
    lv_obj_t *log_container = lv_obj_create(controls_container);
    lv_obj_remove_style_all(log_container);
    lv_obj_set_width(log_container, lv_pct(100));
    lv_obj_set_flex_grow(log_container, 1);
    lv_obj_set_flex_flow(log_container, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_style_pad_top(log_container, 16, 0); /* mt-4 */

    lv_obj_t *log_label = lv_label_create(log_container);
    lv_label_set_text(log_label, "Test Log");
    lv_obj_set_style_text_color(log_label, lv_color_hex(0x9CA3AF), 0); 
    lv_obj_set_style_text_align(log_label, LV_TEXT_ALIGN_CENTER, 0);
    lv_obj_set_style_pad_bottom(log_label, 8, 0); /* mb-2 */

    log_list = lv_list_create(log_container);
    lv_obj_set_width(log_list, lv_pct(100));
    lv_obj_set_flex_grow(log_list, 1);
    lv_obj_set_style_bg_color(log_list, lv_color_hex(0x1F2937), 0); /* bg-gray-800 */
    lv_obj_set_style_radius(log_list, 8, 0);
    lv_obj_set_style_pad_all(log_list, 12, 0); /* p-3 */
    lv_obj_set_style_border_width(log_list, 0, 0);
    lv_obj_set_flex_flow(log_list, LV_FLEX_FLOW_COLUMN_REVERSE); /* Newest at top */

    /* --- Right Column Content: Test Items --- */
    lv_style_t style_test_col;
    lv_style_init(&style_test_col);
    lv_style_set_bg_color(&style_test_col, lv_color_hex(0x1F2937)); /* bg-gray-800 */
    lv_style_set_radius(&style_test_col, 8);
    
    /* Calculate initial height dynamically */
    lv_coord_t initial_item_h = (MONITOR_VER_RES - (2 * 32) - (2 * 20)) / 3; 
    lv_style_set_height(&style_test_col, initial_item_h); 
    
    lv_style_set_pad_all(&style_test_col, 24); /* p-6 */
    lv_style_set_text_color(&style_test_col, lv_color_hex(0x9CA3AF)); 

    for (int i = 0; i < 3; i++) {
        test_items[i] = lv_obj_create(right_column);
        lv_obj_add_style(test_items[i], &style_test_col, 0);
        lv_obj_set_width(test_items[i], lv_pct(100)); 
        lv_obj_t * label = lv_label_create(test_items[i]);
        lv_obj_center(label);
        lv_obj_set_style_text_font(label, &lv_font_montserrat_14, 0); 

        if (i == 0) {
            lv_label_set_text(label, "Continuity\nDB9-Pin-6 to BNC Center");
        } else if (i == 1) {
            lv_label_set_text(label, "Continuity\nDB9-Pin-5 to BNC Shield");
        } else {
            lv_label_set_text(label, "Resistance\nDB9-Pin-4 to DB9-Pin-6 (8.2K ohm)");
        }
    }
}

static void setup_animations(void) {
    /* --- FORWARD ANIMATION (Start Test) --- */
    lv_anim_init(&a_fade_out_f);
    lv_anim_set_var(&a_fade_out_f, left_column);
    lv_anim_set_exec_cb(&a_fade_out_f, anim_opa_cb);
    lv_anim_set_time(&a_fade_out_f, 350);
    lv_anim_set_path_cb(&a_fade_out_f, lv_anim_path_ease_in_out);
    lv_anim_set_ready_cb(&a_fade_out_f, start_test_animation_phase2_cb); 

    lv_anim_init(&a_left_w_f);
    lv_anim_set_var(&a_left_w_f, left_column);
    lv_anim_set_exec_cb(&a_left_w_f, anim_width_cb);
    lv_anim_set_time(&a_left_w_f, 350);
    lv_anim_set_path_cb(&a_left_w_f, lv_anim_path_ease_in_out);

    lv_anim_init(&a_right_w_f);
    lv_anim_set_var(&a_right_w_f, right_column);
    lv_anim_set_exec_cb(&a_right_w_f, anim_width_cb);
    lv_anim_set_time(&a_right_w_f, 350);
    lv_anim_set_path_cb(&a_right_w_f, lv_anim_path_ease_in_out);

    lv_anim_init(&a_gap_f);
    lv_anim_set_var(&a_gap_f, main_container);
    lv_anim_set_exec_cb(&a_gap_f, anim_pad_gap_cb);
    lv_anim_set_time(&a_gap_f, 350);
    lv_anim_set_path_cb(&a_gap_f, lv_anim_path_ease_in_out);

    lv_anim_init(&a_scr_pad_f);
    lv_anim_set_var(&a_scr_pad_f, lv_scr_act()); 
    lv_anim_set_exec_cb(&a_scr_pad_f, anim_pad_all_cb);
    lv_anim_set_time(&a_scr_pad_f, 350);
    lv_anim_set_path_cb(&a_scr_pad_f, lv_anim_path_ease_in_out);


    /* --- REVERSE ANIMATION (Reset UI) --- */
    lv_anim_init(&a_fade_in_r);
    lv_anim_set_var(&a_fade_in_r, left_column);
    lv_anim_set_exec_cb(&a_fade_in_r, anim_opa_cb);
    lv_anim_set_time(&a_fade_in_r, 350);
    lv_anim_set_path_cb(&a_fade_in_r, lv_anim_path_ease_in_out);
    lv_anim_set_ready_cb(&a_fade_in_r, reset_ui_finished_cb); 

    lv_anim_init(&a_left_w_r);
    lv_anim_set_var(&a_left_w_r, left_column);
    lv_anim_set_exec_cb(&a_left_w_r, anim_width_cb);
    lv_anim_set_time(&a_left_w_r, 350);
    lv_anim_set_path_cb(&a_left_w_r, lv_anim_path_ease_in_out);
    
    lv_anim_init(&a_right_w_r);
    lv_anim_set_var(&a_right_w_r, right_column);
    lv_anim_set_exec_cb(&a_right_w_r, anim_width_cb);
    lv_anim_set_time(&a_right_w_r, 350);
    lv_anim_set_path_cb(&a_right_w_r, lv_anim_path_ease_in_out);

    lv_anim_init(&a_gap_r);
    lv_anim_set_var(&a_gap_r, main_container);
    lv_anim_set_exec_cb(&a_gap_r, anim_pad_gap_cb);
    lv_anim_set_time(&a_gap_r, 350);
    lv_anim_set_path_cb(&a_gap_r, lv_anim_path_ease_in_out);

    lv_anim_init(&a_scr_pad_r);
    lv_anim_set_var(&a_scr_pad_r, lv_scr_act()); 
    lv_anim_set_exec_cb(&a_scr_pad_r, anim_pad_all_cb);
    lv_anim_set_time(&a_scr_pad_r, 350);
    lv_anim_set_path_cb(&a_scr_pad_r, lv_anim_path_ease_in_out);
}

/* --- Event Handlers --- */
static void start_test_animation_event_cb(lv_event_t * e) {
    if (!is_testing) {
        is_testing = true;
        overall_test_result = true; 

        /* Store current initial states */
        stored_initial_left_col_w = lv_obj_get_width(left_column); 
        stored_initial_right_col_w = lv_obj_get_width(right_column);
        stored_initial_flex_gap = 32; 
        stored_initial_left_col_opa = lv_obj_get_style_opa(left_column, 0);
        stored_initial_scr_pad = 32; 
        
        /* Disable flex-grow to allow manual width animation */
        lv_obj_set_flex_grow(left_column, 0);
        lv_obj_set_flex_grow(right_column, 0);

        /* Update animation values dynamically for forward animations */
        lv_anim_set_values(&a_fade_out_f, stored_initial_left_col_opa, 0);
        lv_anim_set_values(&a_left_w_f, stored_initial_left_col_w, 0); 
        lv_anim_set_values(&a_right_w_f, stored_initial_right_col_w, MONITOR_HOR_RES); 
        lv_anim_set_values(&a_gap_f, stored_initial_flex_gap, 0);
        
        lv_anim_set_values(&a_scr_pad_f, stored_initial_scr_pad, 0); 
        
        /* Start Phase 1 animations */
        lv_anim_start(&a_fade_out_f);
        lv_anim_start(&a_left_w_f); 
        lv_anim_start(&a_right_w_f); 
        lv_anim_start(&a_gap_f);
        
        lv_anim_start(&a_scr_pad_f);
    }
}

static void start_test_animation_phase2_cb(lv_anim_t * anim) {
    /* Start test logic */
    static test_info_t test_info[3];
    for (int i = 0; i < 3; i++) {
        test_info[i].test_item = test_items[i];
        test_info[i].checkbox = fail_checkboxes[i];
    }

    lv_timer_t * timer = lv_timer_create(run_test, 600, &test_info[0]);
    if (timer) lv_timer_set_repeat_count(timer, 1);
    timer = lv_timer_create(run_test, 800, &test_info[1]);
    if (timer) lv_timer_set_repeat_count(timer, 1);
    timer = lv_timer_create(run_test, 1000, &test_info[2]);
    if (timer) lv_timer_set_repeat_count(timer, 1);
}


static void reset_ui_animation_cb(lv_timer_t * timer) {
    printf("reset_ui_animation_cb: Starting reset animation.\n"); 
    if (is_testing) {
        
        printf("reset_ui_animation_cb: Starting phase 2 of reset animation.\n"); 
        
        /* Disable flex-grow to allow manual width animation */
        lv_obj_set_flex_grow(left_column, 0);
        lv_obj_set_flex_grow(right_column, 0);

        /* Phase 2: Expand left column, shrink right column, open gap */
        lv_anim_set_values(&a_fade_in_r, 0, stored_initial_left_col_opa);
        lv_anim_set_values(&a_left_w_r, 0, stored_initial_left_col_w); 
        lv_anim_set_values(&a_right_w_r, MONITOR_HOR_RES, stored_initial_right_col_w); 
        lv_anim_set_values(&a_gap_r, 0, stored_initial_flex_gap);
        
        lv_anim_set_values(&a_scr_pad_r, 0, stored_initial_scr_pad);

        lv_anim_start(&a_fade_in_r);
        lv_anim_start(&a_left_w_r); 
        lv_anim_start(&a_right_w_r); 
        lv_anim_start(&a_gap_r);

        lv_anim_start(&a_scr_pad_r);
    }
}

static void reset_ui_finished_cb(lv_anim_t * anim) {
    printf("reset_ui_finished_cb: Reset animation finished.\n"); 
    is_testing = false;
    
    /* Restore flex-grow properties for responsive layout */
    lv_obj_set_flex_grow(left_column, 1);
    lv_obj_set_flex_grow(right_column, 2);

    /* Reset background colors of test items */
    for (int i = 0; i < 3; i++) {
        lv_obj_set_style_bg_color(test_items[i], lv_color_hex(0x1F2937), 0);
    }
}

/*
 * MAIN FUNCTION
 */
int main(int argc, char **argv)
{
  (void)argc; /*Unused*/
  (void)argv; /*Unused*/

  /*Initialize LVGL*/
  lv_init();

  /*Initialize the HAL (display, input devices)*/
  hal_init();

  /*Create the UI*/
  create_main_ui();

  /*Initialize animations*/
  setup_animations();

  /*Handle LittelvGL tasks periodically*/
  while(1) {
    lv_timer_handler();
    usleep(5 * 1000);
  }

  return 0;
}