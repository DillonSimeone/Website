cmake_minimum_required(VERSION 3.16)
include($ENV{IDF_PATH}/tools/cmake/project.cmake)
project(led_brace)
idf_component_register(SRCS "main.c" INCLUDE_DIRS "." REQUIRES bt nvs_flash esp_driver_i2c esp_driver_rmt esp_driver_i2s esp_driver_ledc)
