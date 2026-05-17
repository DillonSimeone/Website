cmake_minimum_required(VERSION 3.16)
include($ENV{IDF_PATH}/tools/cmake/project.cmake)
project(cogworks_mini_c3)
idf_component_register(SRCS "main.c" INCLUDE_DIRS "."
    REQUIRES driver esp_wifi esp_event esp_netif esp_http_server nvs_flash esp_driver_i2s esp-dsp)
