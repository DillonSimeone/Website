#Requires AutoHotkey v2.0
#SingleInstance Force

; ==============================================================================
; Script: NumLockForwardToMiddle.ahk
; Description: Maps the Mouse Forward Button (XButton2) to Middle Mouse Button 
;              (Wheel Click) only when NumLock is ON.
; ==============================================================================

; The 'T' indicates it checks if the key is Toggled (ON)
#HotIf GetKeyState("NumLock", "T")

XButton2::MButton

; Reset HotIf Context
#HotIf
