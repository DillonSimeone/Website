cmake_minimum_required(VERSION 3.16)
include($ENV{IDF_PATH}/tools/cmake/project.cmake)
project(bluetooth_mic)
idf_component_register(SRCS "main.c" INCLUDE_DIRS "." REQUIRES bt nvs_flash)
