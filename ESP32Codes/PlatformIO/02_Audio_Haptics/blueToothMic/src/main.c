/**
 * ESP32 Bluetooth HFP Microphone
 * 
 * Streams INMP441 I2S mic audio over Bluetooth HFP (Hands-Free Profile).
 * The phone sees this as a Bluetooth headset microphone, enabling apps
 * like Google Live Transcript to use it for speech-to-text.
 *
 * Architecture follows the official ESP-IDF hfp_hf example:
 *  - Data callbacks registered ONLY when audio connects
 *  - esp_hf_client_outgoing_data_ready() called from incoming cb
 *  - Phone initiates SCO during calls; we just wait
 *
 * Wiring (ESP32 DevKit + INMP441):
 *   3V3 -> VCC     GND -> GND & L/R
 *   D15 -> WS      D2  -> (built-in LED, audio level)
 *   D4  -> SCK     D5  -> SD
 */

#include <stdio.h>
#include <string.h>
#include <inttypes.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/ringbuf.h"
#include "esp_log.h"
#include "nvs_flash.h"
#include "esp_bt.h"
#include "esp_bt_main.h"
#include "esp_bt_device.h"
#include "esp_gap_bt_api.h"
#include "esp_hf_client_api.h"
#include "driver/i2s.h"
#include "driver/gpio.h"
#include "driver/ledc.h"
#include "esp_timer.h"

static const char *TAG = "BT_MIC";

/* ── Pin Definitions ──────────────────────────────────────────── */
#define PIN_WS   15
#define PIN_SCK  4
#define PIN_SD   5
#define PIN_LED  2   /* built-in LED for audio level */

#define I2S_PORT       I2S_NUM_0
#define SCO_SAMPLE_RATE 8000

/* ── Ring buffer for I2S mic -> BT outgoing ───────────────────── */
#define MIC_RINGBUF_SIZE 4096
static RingbufHandle_t mic_ringbuf = NULL;

/* ── SCO audio ringbuf (created/destroyed on audio connect/disconnect) */
#define SCO_RINGBUF_SIZE 3600
static RingbufHandle_t sco_ringbuf = NULL;

/* ── Audio level for LED ──────────────────────────────────────── */
static volatile uint32_t audio_amplitude = 0;
static volatile uint32_t sample_count = 0;

/* ── State tracking ───────────────────────────────────────────── */
static esp_bd_addr_t remote_bda;
static bool slc_connected = false;
static bool audio_connected = false;
static esp_timer_handle_t audio_timer = NULL;

/* ── I2S mic reading task ─────────────────────────────────────── */
static void mic_task(void *arg)
{
    int32_t samples[32];
    size_t  bytes_read;

    while (1) {
        if (i2s_read(I2S_PORT, samples, sizeof(samples), &bytes_read, portMAX_DELAY) == ESP_OK
            && bytes_read > 0)
        {
            size_t num_samples = bytes_read / 4;
            for (size_t i = 0; i < num_samples; i++) {
                /* INMP441 outputs 32-bit; SCO needs 16-bit */
                /* Apply 4x digital gain (left shift by 2) */
                int16_t sample = (int16_t)((samples[i] >> 16) << 2);

                /* Feed mic data into BOTH ringbuffers:
                 * - mic_ringbuf: always active, for LED level
                 * - sco_ringbuf: only when audio is connected */
                if (mic_ringbuf) {
                    xRingbufferSend(mic_ringbuf, &sample, sizeof(sample), 0);
                }
                if (sco_ringbuf) {
                    xRingbufferSend(sco_ringbuf, &sample, sizeof(sample), 0);
                }

                /* Track amplitude for LED */
                int16_t abs_val = (sample < 0) ? -sample : sample;
                audio_amplitude += abs_val;
                sample_count++;
            }
        }
    }
}

/* ──────────────────────────────────────────────────────────────
 *  SCO Audio Data Callbacks
 *  
 *  IMPORTANT: Following the official ESP-IDF hfp_hf example,
 *  these callbacks are registered ONLY when audio connects,
 *  and the incoming callback triggers outgoing_data_ready().
 * ────────────────────────────────────────────────────────────── */

/* Called when the BT stack needs mic data to send to phone */
static uint32_t hf_outgoing_cb(uint8_t *p_buf, uint32_t sz)
{
    if (!sco_ringbuf) {
        return 0;
    }

    size_t item_size = 0;
    uint8_t *data = (uint8_t *)xRingbufferReceiveUpTo(sco_ringbuf, &item_size, 0, sz);
    
    if (item_size == sz) {
        /* Perfect - got exactly what was requested */
        memcpy(p_buf, data, item_size);
        vRingbufferReturnItem(sco_ringbuf, data);
        return sz;
    } else if (item_size > 0) {
        /* Not enough data - return 0 (official example pattern) */
        vRingbufferReturnItem(sco_ringbuf, data);
        return 0;
    } else {
        /* No data at all */
        return 0;
    }
}

/* Called when phone sends audio to us (speaker path).
 * We don't need speaker output, but we MUST call 
 * esp_hf_client_outgoing_data_ready() here to pump the
 * bidirectional SCO channel. This is the official pattern. */
static void hf_incoming_cb(const uint8_t *buf, uint32_t sz)
{
    /* Trigger the stack to pull our outgoing (mic) data */
    esp_hf_client_outgoing_data_ready();
}

/* ──────────────────────────────────────────────────────────────
 *  SCO Audio Open / Close (official pattern)
 * ────────────────────────────────────────────────────────────── */
static void sco_audio_open(void)
{
    if (sco_ringbuf) {
        vRingbufferDelete(sco_ringbuf);
    }
    sco_ringbuf = xRingbufferCreate(SCO_RINGBUF_SIZE, RINGBUF_TYPE_BYTEBUF);
    ESP_LOGI(TAG, "SCO ringbuf created (%d bytes)", SCO_RINGBUF_SIZE);
}

static void sco_audio_close(void)
{
    if (sco_ringbuf) {
        vRingbufferDelete(sco_ringbuf);
        sco_ringbuf = NULL;
    }
    ESP_LOGI(TAG, "SCO ringbuf destroyed");
}

/* ── Audio connect timer (gentle, single-shot) ────────────────── */
static void audio_connect_timer_cb(void *arg)
{
    if (!slc_connected || audio_connected) return;

    /* Just try a single direct SCO connect request.
     * If the phone wants to route audio to us, it will accept.
     * If not, we wait for a phone call to trigger it naturally. */
    ESP_LOGI(TAG, "Requesting SCO audio connection...");
    esp_hf_client_connect_audio(remote_bda);
}

/* ── HFP event handler ────────────────────────────────────────── */
static void hf_event_cb(esp_hf_client_cb_event_t event,
                         esp_hf_client_cb_param_t *param)
{
    switch (event) {

    case ESP_HF_CLIENT_CONNECTION_STATE_EVT:
        switch (param->conn_stat.state) {
        case ESP_HF_CLIENT_CONNECTION_STATE_CONNECTED:
            ESP_LOGI(TAG, "HFP connected (RFCOMM)");
            break;
        case ESP_HF_CLIENT_CONNECTION_STATE_SLC_CONNECTED:
            ESP_LOGI(TAG, "SLC connected -- peer_feat: 0x%" PRIx32, param->conn_stat.peer_feat);
            memcpy(remote_bda, param->conn_stat.remote_bda, sizeof(esp_bd_addr_t));
            slc_connected = true;
            audio_connected = false;
            /* Try SCO after 5 seconds. If phone rejects, that's fine -
             * it will initiate SCO itself when a call starts. */
            esp_timer_start_once(audio_timer, 5000000);
            break;
        case ESP_HF_CLIENT_CONNECTION_STATE_DISCONNECTED:
            ESP_LOGW(TAG, "HFP disconnected");
            slc_connected = false;
            audio_connected = false;
            esp_timer_stop(audio_timer);
            sco_audio_close();
            break;
        default: break;
        }
        break;

    case ESP_HF_CLIENT_AUDIO_STATE_EVT:
        ESP_LOGI(TAG, "Audio state: %d", param->audio_stat.state);
        switch (param->audio_stat.state) {
        case ESP_HF_CLIENT_AUDIO_STATE_DISCONNECTED:
            ESP_LOGW(TAG, "Audio DISCONNECTED");
            audio_connected = false;
            sco_audio_close();
            break;
        case ESP_HF_CLIENT_AUDIO_STATE_CONNECTING:
            ESP_LOGI(TAG, "Audio CONNECTING...");
            break;
        case ESP_HF_CLIENT_AUDIO_STATE_CONNECTED:
            ESP_LOGI(TAG, "*** AUDIO CONNECTED (CVSD) -- mic is LIVE! ***");
            audio_connected = true;
            esp_timer_stop(audio_timer);
            /* Official pattern: register data callbacks NOW */
            esp_hf_client_register_data_callback(hf_incoming_cb, hf_outgoing_cb);
            sco_audio_open();
            break;
        case ESP_HF_CLIENT_AUDIO_STATE_CONNECTED_MSBC:
            ESP_LOGI(TAG, "*** AUDIO CONNECTED (mSBC) -- mic is LIVE! ***");
            audio_connected = true;
            esp_timer_stop(audio_timer);
            /* Official pattern: register data callbacks NOW */
            esp_hf_client_register_data_callback(hf_incoming_cb, hf_outgoing_cb);
            sco_audio_open();
            break;
        }
        break;

    case ESP_HF_CLIENT_CIND_CALL_EVT:
        ESP_LOGI(TAG, "Call indicator: %d (0=no call, 1=call active)", param->call.status);
        break;

    case ESP_HF_CLIENT_CIND_CALL_SETUP_EVT:
        ESP_LOGI(TAG, "Call setup: %d (0=none, 1=incoming, 2=outgoing_dial, 3=outgoing_alert)",
                 param->call_setup.status);
        break;

    case ESP_HF_CLIENT_BVRA_EVT:
        ESP_LOGI(TAG, "Voice recognition: %d", param->bvra.value);
        break;

    case ESP_HF_CLIENT_VOLUME_CONTROL_EVT:
        ESP_LOGI(TAG, "Volume ctrl type=%d val=%d",
                 param->volume_control.type, param->volume_control.volume);
        break;

    case ESP_HF_CLIENT_AT_RESPONSE_EVT:
        ESP_LOGI(TAG, "AT response: code=%d cme=%d",
                 param->at_response.code, param->at_response.cme);
        break;

    case ESP_HF_CLIENT_BSIR_EVT:
        ESP_LOGI(TAG, "In-band ring setting: %d", param->bsir.state);
        break;

    case ESP_HF_CLIENT_RING_IND_EVT:
        ESP_LOGI(TAG, "*** RING! Incoming call ***");
        break;

    default:
        ESP_LOGI(TAG, "HFP event: %d", event);
        break;
    }
}

/* ── GAP event handler (for SSP pairing) ──────────────────────── */
static void gap_event_cb(esp_bt_gap_cb_event_t event,
                          esp_bt_gap_cb_param_t *param)
{
    switch (event) {
    case ESP_BT_GAP_AUTH_CMPL_EVT:
        if (param->auth_cmpl.stat == ESP_BT_STATUS_SUCCESS) {
            ESP_LOGI(TAG, "Authentication success: %s",
                     param->auth_cmpl.device_name);
        } else {
            ESP_LOGE(TAG, "Authentication failed, status %d",
                     param->auth_cmpl.stat);
        }
        break;

    case ESP_BT_GAP_CFM_REQ_EVT:
        ESP_LOGI(TAG, "SSP confirm request -- auto-accepting");
        esp_bt_gap_ssp_confirm_reply(param->cfm_req.bda, true);
        break;

    case ESP_BT_GAP_KEY_NOTIF_EVT:
        ESP_LOGI(TAG, "SSP passkey: %06" PRIu32, param->key_notif.passkey);
        break;

    case ESP_BT_GAP_MODE_CHG_EVT:
        ESP_LOGI(TAG, "Power mode change: mode=%d", param->mode_chg.mode);
        break;

    default: break;
    }
}

/* ── Hardware init ────────────────────────────────────────────── */
static void init_led(void)
{
    ledc_timer_config_t timer = {
        .speed_mode      = LEDC_LOW_SPEED_MODE,
        .duty_resolution = LEDC_TIMER_8_BIT,
        .timer_num       = LEDC_TIMER_0,
        .freq_hz         = 5000,
        .clk_cfg         = LEDC_AUTO_CLK,
    };
    ledc_timer_config(&timer);

    ledc_channel_config_t channel = {
        .gpio_num   = PIN_LED,
        .speed_mode = LEDC_LOW_SPEED_MODE,
        .channel    = LEDC_CHANNEL_0,
        .timer_sel  = LEDC_TIMER_0,
        .duty       = 0,
        .hpoint     = 0,
    };
    ledc_channel_config(&channel);
}

static void led_task(void *arg)
{
    while (1) {
        vTaskDelay(pdMS_TO_TICKS(50)); /* update ~20 Hz */

        uint32_t amp = audio_amplitude;
        uint32_t cnt = sample_count;
        audio_amplitude = 0;
        sample_count = 0;

        uint32_t avg = (cnt > 0) ? (amp / cnt) : 0;

        /* Scale: INMP441 16-bit values typically 0-2000 for speech */
        uint32_t duty = avg / 8;  /* rough scale to 0-255 */
        if (duty > 255) duty = 255;

        ledc_set_duty(LEDC_LOW_SPEED_MODE, LEDC_CHANNEL_0, duty);
        ledc_update_duty(LEDC_LOW_SPEED_MODE, LEDC_CHANNEL_0);
    }
}

static void init_i2s(void)
{

    i2s_config_t cfg = {
        .mode                 = I2S_MODE_MASTER | I2S_MODE_RX,
        .sample_rate          = SCO_SAMPLE_RATE,
        .bits_per_sample      = I2S_BITS_PER_SAMPLE_32BIT,
        .channel_format       = I2S_CHANNEL_FMT_ONLY_LEFT,
        .communication_format = I2S_COMM_FORMAT_STAND_I2S,
        .intr_alloc_flags     = ESP_INTR_FLAG_LEVEL1,
        .dma_buf_count        = 4,
        .dma_buf_len          = 64,
        .use_apll             = false,
        .tx_desc_auto_clear   = false,
    };

    i2s_pin_config_t pins = {
        .bck_io_num   = PIN_SCK,
        .ws_io_num    = PIN_WS,
        .data_out_num = I2S_PIN_NO_CHANGE,
        .data_in_num  = PIN_SD,
    };

    ESP_ERROR_CHECK(i2s_driver_install(I2S_PORT, &cfg, 0, NULL));
    ESP_ERROR_CHECK(i2s_set_pin(I2S_PORT, &pins));
}

static void init_bluetooth(void)
{
    ESP_ERROR_CHECK(esp_bt_controller_mem_release(ESP_BT_MODE_BLE));

    esp_bt_controller_config_t bt_cfg = BT_CONTROLLER_INIT_CONFIG_DEFAULT();
    ESP_ERROR_CHECK(esp_bt_controller_init(&bt_cfg));
    ESP_ERROR_CHECK(esp_bt_controller_enable(ESP_BT_MODE_CLASSIC_BT));

    /* Route SCO audio through HCI (software) instead of PCM pins */
    esp_err_t sco_err = esp_bredr_sco_datapath_set(ESP_SCO_DATA_PATH_HCI);
    ESP_LOGI(TAG, "SCO datapath set to HCI: %s (0x%x)", esp_err_to_name(sco_err), sco_err);

    ESP_ERROR_CHECK(esp_bluedroid_init());
    ESP_ERROR_CHECK(esp_bluedroid_enable());

    /* Device name visible during pairing */
    esp_bt_dev_set_device_name("ESP32-Mic");

    /* GAP: discoverable + connectable */
    esp_bt_gap_register_callback(gap_event_cb);
    esp_bt_gap_set_scan_mode(ESP_BT_CONNECTABLE, ESP_BT_GENERAL_DISCOVERABLE);

    /* Set Class of Device: Audio + Headset (minor=0x01 in AV major) */
    esp_bt_cod_t cod;
    cod.reserved_2 = 0;
    cod.minor = 0x01;                                         // Headset
    cod.major = ESP_BT_COD_MAJOR_DEV_AV;                     // Audio/Video
    cod.service = ESP_BT_COD_SRVC_AUDIO;                     // Audio service
    cod.reserved_8 = 0;
    esp_bt_gap_set_cod(cod, ESP_BT_INIT_COD);

    /* Enable Secure Simple Pairing (no PIN needed) */
    esp_bt_sp_param_t param_type = ESP_BT_SP_IOCAP_MODE;
    esp_bt_io_cap_t   iocap      = ESP_BT_IO_CAP_NONE;
    esp_bt_gap_set_security_param(param_type, &iocap, sizeof(iocap));

    /* HFP client -- register event callback, init profile.
     * Data callbacks are registered LATER, only when audio connects. */
    ESP_ERROR_CHECK(esp_hf_client_register_callback(hf_event_cb));
    ESP_ERROR_CHECK(esp_hf_client_init());

    ESP_LOGI(TAG, "Bluetooth ready -- pair with 'ESP32-Mic' on your phone");
}

/* ── Entry point ──────────────────────────────────────────────── */
void app_main(void)
{
    esp_err_t ret = nvs_flash_init();
    if (ret == ESP_ERR_NVS_NO_FREE_PAGES ||
        ret == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_ERROR_CHECK(nvs_flash_erase());
        ESP_ERROR_CHECK(nvs_flash_init());
    }

    mic_ringbuf = xRingbufferCreate(MIC_RINGBUF_SIZE, RINGBUF_TYPE_BYTEBUF);
    assert(mic_ringbuf);

    init_led();
    init_i2s();
    xTaskCreate(mic_task, "mic", 4096, NULL, 5, NULL);
    xTaskCreate(led_task, "led", 2048, NULL, 3, NULL);

    /* Create audio connection timer (single-shot, gentle) */
    esp_timer_create_args_t timer_args = {
        .callback = audio_connect_timer_cb,
        .name = "audio_conn"
    };
    esp_timer_create(&timer_args, &audio_timer);

    init_bluetooth();
}
