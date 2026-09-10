cmake_minimum_required(VERSION 3.22.1)
project(anivault_presence)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

find_package(discord_partner_sdk REQUIRED CONFIG)

add_library(anivault_presence SHARED presence.cpp)

target_link_libraries(anivault_presence
    android
    log
    discord_partner_sdk::discord_partner_sdk
)
