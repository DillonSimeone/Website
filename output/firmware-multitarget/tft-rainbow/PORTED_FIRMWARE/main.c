// tft-rainbow — ESP-IDF (C3) — SPI TFT animated rainbow fill.
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/spi_master.h"
#include "driver/gpio.h"
#define DC 4
#define CS 5
#define MOSI 7
#define SCLK 6
static spi_device_handle_t tft;
static void cmd(uint8_t c){gpio_set_level(DC,0);spi_transaction_t t={.length=8,.tx_buffer=&c};spi_device_polling_transmit(tft,&t);}
static void dat(const uint8_t*d,int n){gpio_set_level(DC,1);spi_transaction_t t={.length=n*8,.tx_buffer=d};spi_device_polling_transmit(tft,&t);}
void app_main(void){
    gpio_set_direction(DC,GPIO_MODE_OUTPUT);
    spi_bus_config_t bc={.mosi_io_num=MOSI,.miso_io_num=-1,.sclk_io_num=SCLK,.quadwp_io_num=-1,.quadhd_io_num=-1,.max_transfer_sz=8192};
    spi_bus_initialize(SPI2_HOST,&bc,SPI_DMA_CH_AUTO);
    spi_device_interface_config_t dc2={.clock_speed_hz=40*1000*1000,.mode=0,.spics_io_num=CS,.queue_size=4};
    spi_bus_add_device(SPI2_HOST,&dc2,&tft);
    cmd(0x11); vTaskDelay(pdMS_TO_TICKS(120));
    cmd(0x3A); uint8_t b=0x05; dat(&b,1);
    cmd(0x29);
    uint16_t row[170]; uint8_t hue=0;
    while(1){
        for(int i=0;i<170;i++) row[i] = ((hue+i)&0xFF) << 8;
        cmd(0x2C); dat((uint8_t*)row, sizeof(row));
        hue++;
    }
}
