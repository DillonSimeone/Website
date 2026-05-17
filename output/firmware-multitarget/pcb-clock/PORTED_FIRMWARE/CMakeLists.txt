cmake_minimum_required(VERSION 3.16)
include($ENV{IDF_PATH}/tools/cmake/project.cmake)
project(pcb_clock)
idf_component_register(SRCS "main.c" INCLUDE_DIRS "."
    REQUIRES driver esp_wifi esp_netif esp_event nvs_flash esp_driver_spi)
