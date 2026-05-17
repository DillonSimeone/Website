cmake_minimum_required(VERSION 3.16)
include($ENV{IDF_PATH}/tools/cmake/project.cmake)
project(esp32c6_hw)
idf_component_register(SRCS "main.c" INCLUDE_DIRS "." REQUIRES driver esp_driver_i2c esp_timer)
