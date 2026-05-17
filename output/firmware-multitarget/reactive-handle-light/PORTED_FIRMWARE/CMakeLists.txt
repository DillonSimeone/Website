cmake_minimum_required(VERSION 3.16)
include($ENV{IDF_PATH}/tools/cmake/project.cmake)
project(reactive_handle_light)
idf_component_register(SRCS "main.c" INCLUDE_DIRS "." REQUIRES esp_wifi esp_event esp_netif nvs_flash esp_driver_i2c)
