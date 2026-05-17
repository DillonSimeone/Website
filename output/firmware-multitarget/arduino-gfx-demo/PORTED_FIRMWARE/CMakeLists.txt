cmake_minimum_required(VERSION 3.16)
include($ENV{IDF_PATH}/tools/cmake/project.cmake)
project(arduino_gfx_demo)
idf_component_register(SRCS "main.c" INCLUDE_DIRS "." REQUIRES esp_lcd)
