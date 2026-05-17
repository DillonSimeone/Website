cmake_minimum_required(VERSION 3.16)
include($ENV{IDF_PATH}/tools/cmake/project.cmake)
project(haptics_sound_reactive)
idf_component_register(SRCS "main.c" INCLUDE_DIRS "." REQUIRES esp_driver_i2s driver)
