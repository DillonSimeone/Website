cmake_minimum_required(VERSION 3.16)
include($ENV{IDF_PATH}/tools/cmake/project.cmake)
project(haptic_inmp441)
idf_component_register(SRCS "main.c" INCLUDE_DIRS "." REQUIRES esp_driver_i2s esp_driver_ledc esp_wifi nvs_flash esp-dsp)
