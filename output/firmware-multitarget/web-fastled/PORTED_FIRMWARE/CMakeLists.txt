cmake_minimum_required(VERSION 3.16)
include($ENV{IDF_PATH}/tools/cmake/project.cmake)
project(web_fastled)
idf_component_register(SRCS "main.c" INCLUDE_DIRS "." REQUIRES esp_wifi esp_event esp_netif esp_http_server nvs_flash)
