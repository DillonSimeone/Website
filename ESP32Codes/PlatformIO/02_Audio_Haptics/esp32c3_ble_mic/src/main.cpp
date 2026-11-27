#include <Arduino.h>
#include <NimBLEDevice.h>
#include <driver/adc.h>

// --- Hardware Pinout ---
static constexpr int PIN_MIC_SOFT_GND = 4;              // MAX4466 GND -> GPIO 4 (driven LOW)
static constexpr uint8_t MIC_ADC_CH   = ADC1_CHANNEL_3; // GPIO 3 -> ADC1_CHANNEL_3

// --- Audio & IMA-ADPCM Packet Config ---
static constexpr uint32_t SAMPLE_RATE_HZ   = 16000;
static constexpr uint32_t ADC_OVERSAMPLE   = 2;     // 32 kHz DMA -> average 2 -> 16 kHz
static constexpr size_t   SAMPLES_PER_PKT  = 480;   // 30 ms of audio per packet (33.33 pkts/s)
static constexpr size_t   ADPCM_DATA_BYTES = SAMPLES_PER_PKT / 2; // 240 bytes
static constexpr size_t   PKT_QUEUE_LEN    = 24;    // ~720 ms jitter buffer
static constexpr float    MIC_DIGITAL_GAIN = 32.0f;

// --- BLE UUIDs ---
static constexpr const char* BLE_DEVICE_NAME = "C3-BLE-MIC";
static constexpr const char* SERVICE_UUID    = "12345678-1234-5678-1234-56789abcdef0";
static constexpr const char* AUDIO_CHAR_UUID = "12345678-1234-5678-1234-56789abcdef1";

struct __attribute__((packed)) AdpcmPacket {
    uint16_t seq;
    int16_t  pred;
    uint8_t  index;
    uint8_t  reserved;
    uint8_t  data[ADPCM_DATA_BYTES];
};

static QueueHandle_t         s_pktQueue      = nullptr;
static NimBLEServer*         s_server        = nullptr;
static NimBLECharacteristic* s_audioChar     = nullptr;
static volatile bool         s_bleConnected  = false;
static volatile bool         s_notifyEnabled = false;

// --- Standard IMA-ADPCM Tables ---
static const int8_t kImaIndexTable[16] = {
    -1, -1, -1, -1, 2, 4, 6, 8,
    -1, -1, -1, -1, 2, 4, 6, 8
};

static const int16_t kImaStepTable[89] = {
    7, 8, 9, 10, 11, 12, 13, 14, 16, 17,
    19, 21, 23, 25, 28, 31, 34, 37, 41, 45,
    50, 55, 60, 66, 73, 80, 88, 97, 107, 118,
    130, 143, 157, 173, 190, 209, 230, 253, 279, 307,
    337, 371, 408, 449, 494, 544, 598, 658, 724, 796,
    876, 963, 1060, 1166, 1282, 1411, 1552, 1707, 1878, 2066,
    2272, 2499, 2749, 3024, 3327, 3660, 4026, 4428, 4871, 5358,
    5894, 6484, 7132, 7845, 8630, 9493, 10442, 11487, 12635, 13899,
    15289, 16818, 18500, 20350, 22385, 24623, 27086, 29794, 32767
};

static inline uint8_t imaEncodeSample(int16_t sample, int32_t& pred, int32_t& index) {
    int32_t step = kImaStepTable[index];
    int32_t diff = static_cast<int32_t>(sample) - pred;
    uint8_t nibble = 0;

    if (diff < 0) {
        nibble = 8;
        diff = -diff;
    }

    int32_t delta = step >> 3;
    if (diff >= step) {
        nibble |= 4;
        diff -= step;
        delta += step;
    }
    if (diff >= (step >> 1)) {
        nibble |= 2;
        diff -= (step >> 1);
        delta += (step >> 1);
    }
    if (diff >= (step >> 2)) {
        nibble |= 1;
        delta += (step >> 2);
    }

    if (nibble & 8) {
        pred -= delta;
    } else {
        pred += delta;
    }
    if (pred > 32767)  pred = 32767;
    if (pred < -32768) pred = -32768;

    index += kImaIndexTable[nibble];
    if (index < 0)  index = 0;
    if (index > 88) index = 88;

    return nibble & 0x0F;
}

// --- BLE Callbacks ---
class ServerCallbacks : public NimBLEServerCallbacks {
    void onConnect(NimBLEServer* pServer, ble_gap_conn_desc* desc) override {
        s_bleConnected = true;
        // Request fast connection interval: 7.5 ms - 15 ms (units of 1.25 ms)
        pServer->updateConnParams(desc->conn_handle, 6, 12, 0, 100);
        Serial.printf("BLE connected, handle=%d\n", desc->conn_handle);
    }

    void onDisconnect(NimBLEServer* pServer) override {
        s_bleConnected = false;
        s_notifyEnabled = false;
        Serial.println("BLE disconnected, restarting advertising");
        NimBLEDevice::startAdvertising();
    }
};

class CharCallbacks : public NimBLECharacteristicCallbacks {
    void onSubscribe(NimBLECharacteristic* pCharacteristic, ble_gap_conn_desc* desc, uint16_t subValue) override {
        s_notifyEnabled = (subValue & 0x0001) != 0;
        Serial.printf("BLE subscribe: subValue=%u, notifyEnabled=%d\n", subValue, s_notifyEnabled ? 1 : 0);
    }
};

// --- Continuous DMA ADC + DSP + IMA-ADPCM Task ---
static volatile int32_t s_diagRawMin = 4095;
static volatile int32_t s_diagRawMax = 0;
static volatile float   s_diagDcEst  = 2048.0f;

static void adcDmaTask(void* arg) {
    static constexpr size_t DMA_CHUNK_SAMPLES = 120 * ADC_OVERSAMPLE;
    static constexpr size_t DMA_READ_BYTES    = DMA_CHUNK_SAMPLES * sizeof(adc_digi_output_data_t);
    uint8_t dmaBuf[DMA_READ_BYTES];

    // Float DC tracker & 80 Hz single-pole HPF (zero fixed-point DC bias)
    float dcEst = 2048.0f;
    float prevX = 0.0f;
    float hpY   = 0.0f;
    // alpha = 1 / (1 + 2*pi*80/16000) = 0.96954
    static constexpr float HPF_ALPHA = 0.96954f;
    static constexpr float DC_ALPHA  = 0.001f;

    int32_t adpcmPred  = 0;
    int32_t adpcmIndex = 0;

    AdpcmPacket pkt;
    size_t sampleIdx = 0;
    uint16_t seq = 0;

    uint32_t osAcc = 0;
    uint32_t osCnt = 0;

    while (true) {
        uint32_t outLen = 0;
        esp_err_t ret = adc_digi_read_bytes(dmaBuf, DMA_READ_BYTES, &outLen, portMAX_DELAY);
        if (ret != ESP_OK && ret != ESP_ERR_INVALID_STATE) {
            vTaskDelay(1);
            continue;
        }

        size_t count = outLen / sizeof(adc_digi_output_data_t);
        auto* items = reinterpret_cast<adc_digi_output_data_t*>(dmaBuf);

        for (size_t i = 0; i < count; ++i) {
            if (items[i].type2.unit != 0 || items[i].type2.channel != MIC_ADC_CH) {
                continue;
            }
            int32_t rawSample = static_cast<int32_t>(items[i].type2.data);
            if (rawSample < s_diagRawMin) s_diagRawMin = rawSample;
            if (rawSample > s_diagRawMax) s_diagRawMax = rawSample;

            osAcc += static_cast<uint32_t>(rawSample);
            osCnt++;
            if (osCnt < ADC_OVERSAMPLE) {
                continue;
            }
            float raw = static_cast<float>(osAcc) / static_cast<float>(ADC_OVERSAMPLE);
            osAcc = 0;
            osCnt = 0;

            // Slow DC bias tracking
            dcEst += DC_ALPHA * (raw - dcEst);
            s_diagDcEst = dcEst;
            float x = raw - dcEst;

            // Single-pole 80 Hz high-pass filter
            hpY = HPF_ALPHA * (hpY + x - prevX);
            prevX = x;

            // Scale to 16-bit PCM with saturation
            int32_t pcm32 = static_cast<int32_t>(hpY * MIC_DIGITAL_GAIN);
            if (pcm32 > 32767)  pcm32 = 32767;
            if (pcm32 < -32768) pcm32 = -32768;
            int16_t pcm16 = static_cast<int16_t>(pcm32);

            if (sampleIdx == 0) {
                pkt.pred     = static_cast<int16_t>(adpcmPred);
                pkt.index    = static_cast<uint8_t>(adpcmIndex);
                pkt.reserved = 0;
            }

            uint8_t nib = imaEncodeSample(pcm16, adpcmPred, adpcmIndex);
            if ((sampleIdx & 1) == 0) {
                pkt.data[sampleIdx >> 1] = nib;
            } else {
                pkt.data[sampleIdx >> 1] |= static_cast<uint8_t>(nib << 4);
            }
            sampleIdx++;

            if (sampleIdx >= SAMPLES_PER_PKT) {
                sampleIdx = 0;
                if (s_bleConnected && s_notifyEnabled) {
                    pkt.seq = seq++;
                    xQueueSend(s_pktQueue, &pkt, 0);
                } else {
                    seq = 0;
                    adpcmPred  = 0;
                    adpcmIndex = 0;
                }
            }
        }
    }
}

// --- BLE Notification TX Task ---
static void bleTxTask(void* arg) {
    AdpcmPacket pkt;
    while (true) {
        if (xQueueReceive(s_pktQueue, &pkt, portMAX_DELAY) == pdTRUE) {
            if (s_bleConnected && s_notifyEnabled && s_audioChar != nullptr) {
                s_audioChar->setValue(reinterpret_cast<uint8_t*>(&pkt), sizeof(AdpcmPacket));
                s_audioChar->notify();
            }
        }
    }
}

static bool initAdcDma() {
    adc_digi_init_config_t initCfg = {
        .max_store_buf_size = 120 * ADC_OVERSAMPLE * sizeof(adc_digi_output_data_t) * 4,
        .conv_num_each_intr = 120 * ADC_OVERSAMPLE * sizeof(adc_digi_output_data_t),
        .adc1_chan_mask     = BIT(MIC_ADC_CH),
        .adc2_chan_mask     = 0,
    };
    esp_err_t e1 = adc_digi_initialize(&initCfg);
    if (e1 != ESP_OK) {
        Serial.printf("adc_digi_initialize failed: %d\n", e1);
        return false;
    }

    static adc_digi_pattern_config_t pattern = {
        .atten     = ADC_ATTEN_DB_11,
        .channel   = MIC_ADC_CH,
        .unit      = 0,
        .bit_width = SOC_ADC_DIGI_MAX_BITWIDTH,
    };

    adc_digi_configuration_t digiCfg = {
        .conv_limit_en  = false,
        .conv_limit_num = 250,
        .pattern_num    = 1,
        .adc_pattern    = &pattern,
        .sample_freq_hz = SAMPLE_RATE_HZ * ADC_OVERSAMPLE,
        .conv_mode      = ADC_CONV_SINGLE_UNIT_1,
        .format         = ADC_DIGI_OUTPUT_FORMAT_TYPE2,
    };
    esp_err_t e2 = adc_digi_controller_configure(&digiCfg);
    if (e2 != ESP_OK) {
        Serial.printf("adc_digi_controller_configure failed: %d\n", e2);
        return false;
    }
    esp_err_t e3 = adc_digi_start();
    if (e3 != ESP_OK) {
        Serial.printf("adc_digi_start failed: %d\n", e3);
        return false;
    }
    Serial.println("ADC DMA started OK");
    return true;
}

void setup() {
    // CRITICAL: Configure GPIO 4 as Soft Ground (OUTPUT LOW) BEFORE ADC or radio init
    pinMode(PIN_MIC_SOFT_GND, OUTPUT);
    digitalWrite(PIN_MIC_SOFT_GND, LOW);

    Serial.begin(115200);
    delay(500);
    Serial.println("Starting ESP32-C3 BLE Mic (DMA + IMA-ADPCM)...");

    s_pktQueue = xQueueCreate(PKT_QUEUE_LEN, sizeof(AdpcmPacket));

    // Switch GPIO 3 to Analog / ADC1_CHANNEL_3 before starting DMA
    pinMode(3, ANALOG);
    adc1_config_width(ADC_WIDTH_BIT_12);
    adc1_config_channel_atten(ADC1_CHANNEL_3, ADC_ATTEN_DB_11);
    Serial.printf("Pre-DMA analogRead(3) = %d\n", analogRead(3));

    bool adcOk = initAdcDma();

    NimBLEDevice::init(BLE_DEVICE_NAME);
    NimBLEDevice::setMTU(255);
    NimBLEDevice::setPower(ESP_PWR_LVL_P9);

    s_server = NimBLEDevice::createServer();
    s_server->setCallbacks(new ServerCallbacks());

    NimBLEService* pService = s_server->createService(SERVICE_UUID);
    s_audioChar = pService->createCharacteristic(
        AUDIO_CHAR_UUID,
        NIMBLE_PROPERTY::NOTIFY
    );
    s_audioChar->setCallbacks(new CharCallbacks());
    pService->start();

    NimBLEAdvertising* pAdv = NimBLEDevice::getAdvertising();
    pAdv->addServiceUUID(SERVICE_UUID);
    pAdv->setScanResponse(true);
    pAdv->setMinPreferred(0x06);
    pAdv->setMaxPreferred(0x0C);
    pAdv->start();

    Serial.printf("BLE advertising started as %s (MAC=%s)\n",
                  BLE_DEVICE_NAME, NimBLEDevice::getAddress().toString().c_str());

    if (adcOk) {
        xTaskCreate(adcDmaTask, "adc_dma", 4096, nullptr, 3, nullptr);
    }
    xTaskCreate(bleTxTask, "ble_tx", 4096, nullptr, 3, nullptr);
}

void loop() {
    vTaskDelay(pdMS_TO_TICKS(1000));
}
