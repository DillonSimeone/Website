cmake_minimum_required(VERSION 3.16)
include($ENV{IDF_PATH}/tools/cmake/project.cmake)
project(cymaspace_fft_proto2)
idf_component_register(SRCS "main.c" INCLUDE_DIRS "." REQUIRES esp_driver_i2s esp_driver_rmt esp-dsp)
