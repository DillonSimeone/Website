cmake_minimum_required(VERSION 3.16)
include($ENV{IDF_PATH}/tools/cmake/project.cmake)
project(doorbell_leader)
idf_component_register(SRCS "main.c" INCLUDE_DIRS "." REQUIRES esp_wifi esp_now esp_event nvs_flash esp_sleep driver)
