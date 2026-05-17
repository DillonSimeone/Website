cmake_minimum_required(VERSION 3.16)
include($ENV{IDF_PATH}/tools/cmake/project.cmake)
project(robotics_final)
idf_component_register(SRCS "main.c" INCLUDE_DIRS "." REQUIRES driver esp_wifi esp_netif esp_event esp_http_server nvs_flash esp_driver_ledc)
